import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  Eye,
  EyeOff,
  Factory,
  Hexagon,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { loginPayload } from "../lib/validate";

const demos = [
  { email: "superadmin@mte.local", role: "Super Admin" },
  { email: "admin@mte.local", role: "Admin" },
  { email: "sales@mte.local", role: "Sales" },
  { email: "warehouse@mte.local", role: "Warehouse" },
  { email: "finance@mte.local", role: "Finance" },
] as const;

const features = [
  { icon: Factory, title: "Procurement & vendors", text: "Purchase orders, receipts & supplier bills" },
  { icon: Boxes, title: "Inventory control", text: "Real-time stock across warehouse locations" },
  { icon: ShoppingCart, title: "Sales & delivery", text: "Quotations, orders, invoices & dispatch" },
  { icon: Wallet, title: "Finance & reports", text: "AR/AP ledgers, M-Pesa & dashboards" },
];

type Mode = "login" | "mfa" | "forgot" | "reset";

export function Login() {
  const { user, login, finishMfa } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("superadmin@mte.local");
  const [password, setPassword] = useState("Mte@2026");
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "forgot") {
        const res = await api<{ message: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
        setInfo(res.message);
        setMode("reset");
        return;
      }
      if (mode === "reset") {
        await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ email, code, newPassword }) });
        setInfo("Password updated. Sign in with the new password.");
        setMode("login");
        setPassword("");
        return;
      }
      if (mode === "mfa") {
        if (!/^\d{6,8}$/.test(code.trim())) {
          setError("Enter a valid 6-digit code");
          return;
        }
        await finishMfa(ticket, code.trim());
        nav("/");
        return;
      }
      if (mode === "login") {
        const check = loginPayload({ email, password });
        if ("error" in check) {
          setError(check.error);
          return;
        }
      }
      const result = await login(email.trim().toLowerCase(), password.slice(0, 128));
      if (result?.mfaRequired && result.ticket) {
        setTicket(result.ticket);
        setCode("");
        setMode("mfa");
        return;
      }
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Sign in",
    mfa: "Verification",
    forgot: "Reset password",
    reset: "New password",
  };

  const subtitles: Record<Mode, string> = {
    login: "Access your MTE ERP workspace",
    mfa: "Enter the 6-digit code from your authenticator app",
    forgot: "We will notify Super Admin to issue a reset code",
    reset: "Enter the code you received and set a new password",
  };

  return (
    <div className="login-page">
      <aside className="login-brand">
        <div className="login-brand-glow" aria-hidden />
        <div className="login-brand-grid" aria-hidden />

        <div className="login-brand-inner">
          <div className="login-brand-hero">
            <span className="login-logo">
              <Hexagon size={28} strokeWidth={1.5} />
            </span>
            <h1 className="login-brand-title">MTE ERP</h1>
            <p className="login-brand-desc">
              Complete enterprise resource planning for parts procurement, inventory, sales, dispatch, and finance.
            </p>
          </div>

          <div className="login-feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="login-feature-card">
                <span className="login-feature-icon"><Icon size={18} strokeWidth={1.75} /></span>
                <div>
                  <div className="login-feature-title">{title}</div>
                  <div className="login-feature-text">{text}</div>
                </div>
              </div>
            ))}
          </div>

          <a className="login-brand-link" href="/" onClick={(e) => e.preventDefault()}>
            <BarChart3 size={14} />
            Unified dashboard for parts &amp; operations
            <ChevronRight size={14} />
          </a>
        </div>

        <p className="login-brand-powered">Powered by MTE ERP</p>
      </aside>

      <main className="login-main">
        <div className="login-card">
          <div className="login-card-icon">
            <ShieldCheck size={22} strokeWidth={1.75} />
          </div>

          <div className="login-card-head">
            <h2>{titles[mode]}</h2>
            <p>{subtitles[mode]}</p>
          </div>

          {Boolean((loc.state as { idle?: boolean } | null)?.idle) && (
            <div className="login-alert login-alert-warn">Signed out after 15 minutes of inactivity.</div>
          )}
          {error && <div className="login-alert login-alert-error">{error}</div>}
          {info && <div className="login-alert login-alert-ok">{info}</div>}

          <form onSubmit={onSubmit} className="login-form">
            {mode !== "mfa" && (
              <label className="login-field">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                  type="email"
                  autoComplete="username"
                  placeholder="you@mte.local"
                  required
                  maxLength={120}
                  className="login-input login-input-fill"
                />
              </label>
            )}

            {mode === "login" && (
              <label className="login-field">
                <span>Password</span>
                <span className="login-pass-wrap">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value.slice(0, 128))}
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    maxLength={128}
                    className="login-input login-input-fill"
                  />
                  <button
                    type="button"
                    className="login-input-action"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
            )}

            {(mode === "mfa" || mode === "reset") && (
              <label className="login-field">
                <span>6-digit code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="000000"
                  required
                  minLength={6}
                  maxLength={8}
                  className="login-input login-input-fill login-code"
                />
              </label>
            )}

            {mode === "reset" && (
              <label className="login-field">
                <span>New password</span>
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="login-input login-input-fill"
                />
              </label>
            )}

            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "mfa" ? "Verify" : mode === "forgot" ? "Send request" : "Update password"}
            </button>

            <div className="login-links">
              {mode === "login" ? (
                <button type="button" onClick={() => { setMode("forgot"); setError(""); }}>
                  Forgot password?
                </button>
              ) : (
                <button type="button" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>
                  Back to sign in
                </button>
              )}
            </div>
          </form>

          {mode === "login" && (
            <div className="login-demo">
              <div className="login-demo-grid">
                {demos.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    title={`${d.email} · Mte@2026`}
                    className={`login-demo-chip ${email === d.email ? "is-active" : ""}`}
                    onClick={() => { setEmail(d.email); setPassword("Mte@2026"); }}
                  >
                    {d.role}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="login-card-foot">Secure enterprise access</p>
        </div>
      </main>
    </div>
  );
}
