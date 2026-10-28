import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { handle, type Claims, type Deps } from "./core";
import { dynamoRepo } from "./dynamo";

const env = process.env as Record<string, string>;

const deps: Deps = {
  repo: dynamoRepo(env.TABLE_NAME),
  ownerEmail: env.OWNER_EMAIL,
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  let body: unknown;
  try {
    body = event.body
      ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body)
      : undefined;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON." }) };
  }
  const claims = event.requestContext.authorizer?.jwt?.claims as unknown as Claims | undefined;
  const res = await handle({ method: event.requestContext.http.method, path: event.rawPath, body, claims }, deps);
  return {
    statusCode: res.status,
    headers: { "content-type": "application/json" },
    body: res.body === undefined ? "" : JSON.stringify(res.body),
  };
}
