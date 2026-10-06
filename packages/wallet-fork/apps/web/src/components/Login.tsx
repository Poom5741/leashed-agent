import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { useTheme, logoFor } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

/** Friendly messages for errors that come back from the LINE callback. */
const LOGIN_ERRORS: Record<string, string> = {
  invalid_state: "Sign-in session expired or invalid — please try again.",
  line_login_failed: "LINE sign-in failed. Please try again.",
  line_not_configured: "LINE sign-in is not available right now.",
  "LINE login was cancelled": "LINE sign-in was cancelled.",
};

/**
 * Mandatory sign-in gate: LINE Login or Email OTP (code sent from
 * noreply@thaifi.com). After sign-in the passkey wallet flow takes over.
 */
export function Login() {
  const { lineEnabled, refresh } = useAuth();
  const [theme] = useTheme();
  const [mode, setMode] = useState<"choose" | "email-code">("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const reason = new URLSearchParams(window.location.search).get("loginError");
    if (!reason) return null;
    return LOGIN_ERRORS[reason] ?? decodeURIComponent(reason);
  });

  // Clean the ?loginError=... from the address bar after showing it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("loginError")) {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const handleLine = () => {
    setError(null);
    api.lineStart();
  };

  const handleRequest = async () => {
    try {
      setError(null);
      setBusy(true);
      await api.requestOtp(email);
      setMode("email-code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    try {
      setError(null);
      setBusy(true);
      await api.verifyOtp(email, code);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <div className="card auth-card">
        <img src={logoFor(theme)} alt="ThaiFi" className="auth-logo" />
        <h1>Sign in to ThaiFi Wallet</h1>
      <p className="subtitle">
        Sign in with LINE or an email code. Your keys stay on this device — the
        account is used to sync your encrypted backup to the cloud.
      </p>

      {mode === "choose" && (
        <>
          {lineEnabled && (
            <button className="btn-line" onClick={handleLine} disabled={busy}>
              <span className="line-bubble">LINE</span> Sign in with LINE
            </button>
          )}
          {lineEnabled && <div className="divider"><span>or</span></div>}
          <label className="field-label" htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && email && handleRequest()}
          />
          <button className="btn-primary" onClick={handleRequest} disabled={busy || !email}>
            {busy ? "Sending…" : "Send sign-in code"}
          </button>
        </>
      )}

      {mode === "email-code" && (
        <>
          <p className="muted">
            6-digit code sent to <strong>{email}</strong> — check your inbox
            (sender: noreply@thaifi.com).
          </p>
          <label className="field-label" htmlFor="login-code">Sign-in code</label>
          <input
            id="login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
            style={{ textAlign: "center", fontSize: "20px", letterSpacing: "8px" }}
          />
          <button className="btn-primary" onClick={handleVerify} disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify & Sign in"}
          </button>
          <button className="btn-text" onClick={() => setMode("choose")} disabled={busy} style={{ marginTop: 8 }}>
            ← Use a different email
          </button>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="legal-links">
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
        <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a>
      </div>
      </div>
    </div>
  );
}
