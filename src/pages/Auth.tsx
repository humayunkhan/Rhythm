import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, useSession } from "../lib";

const ERRORS: Record<string, string> = {
  oauth: "That sign-in didn't complete. Please try again.",
  provider: "That sign-in method isn't available yet.",
  disabled: "This account has been disabled.",
};

export default function Auth() {
  const { user, setUser, config } = useSession();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const resetToken = params.get("reset");
  const rawNext = params.get("next") ?? "/create";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/create";
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState(ERRORS[params.get("error") ?? ""] ?? "");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user && !resetToken) nav(next, { replace: true }); }, [user, nav, next, resetToken]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      if (resetToken) {
        await api("/auth/reset", { body: { token: resetToken, password } });
        setInfo("Password updated. You can sign in now.");
        nav("/login", { replace: true });
      } else if (mode === "forgot") {
        const r = await api("/auth/forgot", { body: { email } });
        setInfo(r.delivery ? "If that account exists, a reset link is on its way." : "Email delivery isn't set up yet. Please ask the Rhythm administrator for a reset link.");
      } else {
        const r = mode === "login"
          ? await api("/auth/login", { body: { email, password } })
          : await api("/auth/register", { body: { email, password, name, acceptTerms: accept, adminCode: adminCode || undefined } });
        setUser(r.user);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "admin_code_required") setNeedsCode(true);
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  const title = resetToken ? "Choose a new password" : mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password";
  return (
    <div className="auth">
      <form className="panel auth-card" onSubmit={submit}>
        <h1>{title}</h1>
        {!resetToken && mode !== "forgot" && next.startsWith("/create") && <p className="muted">Sign in or create a free account to compose, refine and save your fragrances. Any draft you started is kept.</p>}
        {!resetToken && mode !== "forgot" && (config.google || config.apple) && (
          <>
            <div className="sso">
              {config.google && <a className="btn sso-btn" href="/api/auth/google/start">Continue with Google</a>}
              {config.apple && <a className="btn sso-btn" href="/api/auth/apple/start">Continue with Apple</a>}
            </div>
            <p className="or"><span>or use email</span></p>
          </>
        )}
        {mode === "register" && !resetToken && <label className="field"><span>Name</span><input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>}
        {!resetToken && <label className="field"><span>Email</span><input type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} /></label>}
        {mode !== "forgot" && (
          <label className="field"><span>{resetToken ? "New password" : "Password"}</span>
            <input type="password" required minLength={mode === "login" && !resetToken ? undefined : 10} value={password} autoComplete={mode === "login" && !resetToken ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
            {(mode === "register" || resetToken) && <small className="muted">At least 10 characters</small>}
          </label>
        )}
        {mode === "register" && !resetToken && needsCode && <label className="field"><span>Admin setup code</span><input type="password" value={adminCode} autoComplete="off" onChange={(e) => setAdminCode(e.target.value)} /></label>}
        {mode === "register" && !resetToken && (
          <label className="check">
            <input type="checkbox" required checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>I agree to the <Link to="/terms" target="_blank">terms and disclaimer</Link>, including that all formulas I create on Rhythm are fully owned by Rhythm and its owners, and that I can claim no trademark, copyright or other right in them.</span>
          </label>
        )}
        {error && <p className="warn-text" role="alert">{error}</p>}
        {info && <p className="good-text" role="status">{info}</p>}
        <button className="btn primary full" disabled={busy}>{busy ? "One moment…" : resetToken ? "Update password" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}</button>
        {!resetToken && (
          <p className="auth-switch">
            {mode === "login" && <><button type="button" className="link-btn" onClick={() => { setMode("register"); setError(""); }}>Create an account</button> · <button type="button" className="link-btn" onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button></>}
            {mode !== "login" && <button type="button" className="link-btn" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button>}
          </p>
        )}
      </form>
    </div>
  );
}
