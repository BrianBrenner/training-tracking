import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/ui";
import { requestPasswordReset, resetPassword, signIn, signOut, signUp, useSession } from "../lib/auth";

type Mode = "signIn" | "signUp" | "forgot" | "reset";

const TITLES: Record<Mode, string> = {
  signIn: "Sign in",
  signUp: "Create account",
  forgot: "Reset password",
  reset: "Reset password",
};

export function AccountPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) {
    return (
      <div className="page">
        <PageHeader title="Account" back />
        <div className="card">
          <p>
            Signed in as <strong>{session.email}</strong>.
          </p>
          <p className="hint">Your log syncs with the server. Signing out leaves this device’s copy in place.</p>
        </div>
        <button type="button" className="btn block" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signIn") await signIn(email, password);
      else if (mode === "signUp") await signUp(email, password);
      else if (mode === "forgot") {
        await requestPasswordReset(email);
        setMode("reset");
        return;
      } else await resetPassword(email, code, password);
      navigate("/settings", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={TITLES[mode]} back />
      <form className="auth-form" onSubmit={submit}>
        {mode === "signUp" && (
          <p className="hint">
            One-time setup: use the owner email the server was deployed with. Nobody else can sign up.
          </p>
        )}
        {mode === "reset" && <p className="hint">Enter the code we emailed you and a new password.</p>}
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === "reset" && (
          <label className="field">
            <span className="field-label">Code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="field">
            <span className="field-label">{mode === "reset" ? "New password" : "Password"}</span>
            <input
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? "One moment…" : mode === "forgot" ? "Email me a code" : TITLES[mode]}
        </button>
      </form>
      <div className="auth-links">
        {mode !== "signIn" && (
          <button type="button" className="link" onClick={() => setMode("signIn")}>
            Sign in instead
          </button>
        )}
        {mode === "signIn" && (
          <>
            <button type="button" className="link" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
            <button type="button" className="link" onClick={() => setMode("signUp")}>
              First time? Create the account
            </button>
          </>
        )}
      </div>
    </div>
  );
}
