/**
 * Local stand-in for the AWS backend: the real API logic (lambda/core.ts) with
 * in-memory data and a fake Cognito (same JSON API, unsigned tokens). For trying
 * sync end to end without an AWS account.
 *
 *   cd infra && npm run dev      → http://localhost:8787
 *   Sign up as owner@example.com (any password of 8+ characters).
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handle, memoryRepo, type Claims, type Deps } from "../lambda/core";

const PORT = Number(process.env.PORT ?? 8787);
const BASE = `http://localhost:${PORT}`;
const OWNER_EMAIL = process.env.DEV_OWNER ?? "owner@example.com";

const deps: Deps = { repo: memoryRepo(), ownerEmail: OWNER_EMAIL };
const users = new Map<string, { sub: string; email: string; password: string }>();
const refreshTokens = new Map<string, string>(); // token → email

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tokensFor(email: string) {
  const u = users.get(email)!;
  const claims: Claims & { exp: number } = {
    sub: u.sub,
    email: u.email,
    email_verified: "true",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const idToken = `${b64({ alg: "none" })}.${b64(claims)}.dev`;
  return { IdToken: idToken, AccessToken: idToken, ExpiresIn: 3600, TokenType: "Bearer" };
}

class CognitoError extends Error {
  type: string;
  constructor(type: string, message: string) {
    super(message);
    this.type = type;
  }
}

/** The handful of Cognito actions the app uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cognito(target: string, body: Record<string, any>) {
  const params = body.AuthParameters ?? {};
  switch (target) {
    case "SignUp": {
      const email = String(body.Username).toLowerCase();
      if (users.has(email))
        throw new CognitoError("UsernameExistsException", "An account with the given email already exists.");
      if (email !== OWNER_EMAIL)
        throw new CognitoError(
          "UserLambdaValidationException",
          "PreSignUp failed with error This training log is private..",
        );
      if (String(body.Password).length < 8)
        throw new CognitoError("InvalidPasswordException", "Password must be at least 8 characters.");
      const sub = randomUUID();
      users.set(email, { sub, email, password: body.Password });
      return { UserConfirmed: true, UserSub: sub };
    }
    case "InitiateAuth": {
      if (body.AuthFlow === "REFRESH_TOKEN_AUTH") {
        const email = refreshTokens.get(params.REFRESH_TOKEN);
        if (!email || !users.has(email))
          throw new CognitoError("NotAuthorizedException", "Refresh token has been revoked");
        return { AuthenticationResult: tokensFor(email) };
      }
      const email = String(params.USERNAME).toLowerCase();
      const u = users.get(email);
      if (!u || u.password !== params.PASSWORD)
        throw new CognitoError("NotAuthorizedException", "Incorrect username or password.");
      const refresh = randomUUID();
      refreshTokens.set(refresh, email);
      return { AuthenticationResult: { ...tokensFor(email), RefreshToken: refresh } };
    }
    case "ForgotPassword":
      console.log(`[dev] password reset code for ${body.Username}: 123456`);
      return { CodeDeliveryDetails: { Destination: body.Username, DeliveryMedium: "EMAIL" } };
    case "ConfirmForgotPassword": {
      const u = users.get(String(body.Username).toLowerCase());
      if (!u || body.ConfirmationCode !== "123456")
        throw new CognitoError("CodeMismatchException", "Invalid verification code provided.");
      u.password = body.Password;
      return {};
    }
    default:
      throw new CognitoError("InvalidAction", `Dev server doesn't support ${target}`);
  }
}

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

function send(res: ServerResponse, status: number, body?: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type, x-amz-target, x-amz-user-agent");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url ?? "/", BASE);
  const raw = await readBody(req);

  if (url.pathname === "/cognito") {
    try {
      const target = String(req.headers["x-amz-target"] ?? "")
        .split(".")
        .pop()!;
      return send(res, 200, cognito(target, JSON.parse(raw.toString() || "{}")), "application/x-amz-json-1.1");
    } catch (e) {
      const err = e as CognitoError;
      return send(res, 400, { __type: err.type, message: err.message }, "application/x-amz-json-1.1");
    }
  }

  // API: the same rules as production. Tokens aren't verified here (production's API Gateway does that).
  const auth = req.headers.authorization?.replace(/^Bearer /, "");
  if (!auth) return send(res, 401, { message: "Unauthorized" });
  let claims: Claims;
  let body: unknown;
  try {
    claims = JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString());
    body = raw.length ? JSON.parse(raw.toString()) : undefined;
  } catch {
    return send(res, 400, { error: "Invalid request." });
  }
  const out = await handle({ method: req.method ?? "GET", path: url.pathname, body, claims }, deps);
  send(res, out.status, out.body);
}).listen(PORT, () => {
  console.log(`Training log dev backend on ${BASE} (owner: ${OWNER_EMAIL})`);
});
