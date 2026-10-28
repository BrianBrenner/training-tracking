import type { PreSignUpTriggerEvent } from "aws-lambda";

/**
 * Cognito pre sign-up hook: only the owner's email can make an account. It's
 * confirmed on the spot (no verification email), since nobody else gets this far.
 */
export async function handler(event: PreSignUpTriggerEvent) {
  if (event.triggerSource === "PreSignUp_AdminCreateUser") return event;
  const email = (event.request.userAttributes.email ?? "").trim().toLowerCase();
  const owner = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!owner || email !== owner) throw new Error("This training log is private.");
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  return event;
}
