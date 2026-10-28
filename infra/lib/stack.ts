import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CfnStage, CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import * as path from "node:path";

export interface TrainingProps extends StackProps {
  ownerEmail: string;
  appOrigins: string[];
}

/**
 * The training log's backend: one account (Cognito), an API (API Gateway + one
 * Lambda) and the data (DynamoDB). The data is kept if the stack is ever deleted.
 */
export class TrainingStack extends Stack {
  constructor(scope: Construct, id: string, props: TrainingProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, "Data", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const lambdaDefaults = {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logRetention: RetentionDays.ONE_MONTH,
      bundling: { minify: true, sourceMap: true },
    };

    const preSignUp = new NodejsFunction(this, "PreSignUp", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "../lambda/preSignUp.ts"),
      environment: { OWNER_EMAIL: props.ownerEmail },
    });

    const users = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: { preSignUp },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const client = users.addClient("Web", {
      authFlows: { userPassword: true },
      preventUserExistenceErrors: true,
      // Stay signed in for a year on each device.
      refreshTokenValidity: Duration.days(365),
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
    });

    const api = new NodejsFunction(this, "Api", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "../lambda/api.ts"),
      environment: { TABLE_NAME: table.tableName, OWNER_EMAIL: props.ownerEmail },
    });
    table.grantReadWriteData(api);

    const httpApi = new HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: props.appOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
        maxAge: Duration.days(1),
      },
    });
    // Cap the whole API far above what one person needs, so a runaway script
    // can't run up much of a bill (AWS's default allows thousands per second).
    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 10, throttlingBurstLimit: 25 };

    // API Gateway verifies sign-in tokens before the Lambda runs; every route needs one.
    const authorizer = new HttpJwtAuthorizer(
      "Jwt",
      `https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`,
      {
        jwtAudience: [client.userPoolClientId],
      },
    );
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new HttpLambdaIntegration("ApiIntegration", api),
      authorizer,
    });

    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: users.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "Region", { value: this.region });
  }
}
