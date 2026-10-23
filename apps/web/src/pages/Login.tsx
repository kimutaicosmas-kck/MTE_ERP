import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Eye,
  EyeOff,
  Factory,
  Lock,
  Mail,
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
  { icon: Factory, title: "Procurement", text: "POs, receipts & supplier bills" },
  { icon: Boxes, title: "Inventory", text: "Live stock & warehouse bins" },
  { icon: ShoppingCart, title: "Sales", text: "Quotes, orders & dispatch" },
  { icon: Wallet, title: "Finance", text: "Invoices, M-Pesa & reports" },
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
    login: "Welcome back",
    mfa: "Verify it’s you",
    forgot: "Reset password",
    reset: "Choose a new password",
  };

  const subtitles: Record<Mode, string> = {
    login: "Sign in to manage sales, stock, and finance in one place.",
    mfa: "Enter the 6-digit code from your authenticator app.",
    forgot: "We’ll notify your Super Admin to issue a reset code.",
    reset: "Use the code you received and set a strong new password.",
  };

  return (
    <div className="login-page">
      <div className="login-ambient" aria-hidden>
        <span className="login-orb login-orb-a" />
        <span className="login-orb login-orb-b" />
        <span className="login-orb login-orb-c" />
      </div>

      <aside className="login-brand">
        <div className="login-brand-grid" aria-hidden />
        <div className="login-brand-inner">
          <div className="login-brand-mark">
            <span className="login-logo" aria-hidden>
              <BarChart3 size={26} strokeWidth={1.75} />
            </span>
            <div className="login-brand-text">
              <h1 className="login-brand-title">MTE ERP</h1>
              <p className="login-brand-tag">Enterprise operations platform</p>
            </div>
          </div>

          <p className="login-brand-desc">
            Run procurement, inventory, sales, dispatch, and finance from a single workspace built for parts and equipment businesses.
          </p>

          <div className="login-feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="login-feature-card">
                <span className="login-feature-icon">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <div>
                  <div className="login-feature-title">{title}</div>
                  <div className="login-feature-text">{text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="login-brand-stats">
            <div>
              <strong>Real-time</strong>
              <span>Stock &amp; orders</span>
            </div>
            <div>
              <strong>Secure</strong>
              <span>Role-based access</span>
            </div>
            <div>
              <strong>Mobile</strong>
              <span>Works offline</span>
            </div>
          </div>
        </div>

        <p className="login-brand-powered">
          Powered by <strong>AbexCore Technologies</strong>
        </p>
      </aside>

      <main className="login-main">
        <motion.div
          className="login-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="login-mobile-mark">
            <span className="login-logo login-logo-sm" aria-hidden>
              <BarChart3 size={22} strokeWidth={1.75} />
            </span>
            <span className="login-mobile-title">MTE ERP</span>
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
                <span>Email address</span>
                <span className="login-input-wrap">
                  <Mail size={17} className="login-input-icon" aria-hidden />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    required
                    maxLength={120}
                    className="login-input"
                  />
                </span>
              </label>
            )}

            {mode === "login" && (
              <label className="login-field">
                <span>Password</span>
                <span className="login-input-wrap login-pass-wrap">
                  <Lock size={17} className="login-input-icon" aria-hidden />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value.slice(0, 128))}
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    maxLength={128}
                    className="login-input"
                  />
                  <button
                    type="button"
                    className="login-input-action"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
            )}

            {(mode === "mfa" || mode === "reset") && (
              <label className="login-field">
                <span>6-digit code</span>
                <span className="login-input-wrap">
                  <ShieldCheck size={17} className="login-input-icon" aria-hidden />
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="000000"
                    required
                    minLength={6}
                    maxLength={8}
                    className="login-input login-code"
                  />
                </span>
              </label>
            )}

            {mode === "reset" && (
              <label className="login-field">
                <span>New password</span>
                <span className="login-input-wrap">
                  <Lock size={17} className="login-input-icon" aria-hidden />
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="login-input"
                  />
                </span>
              </label>
            )}

            <button type="submit" className="login-submit" disabled={busy}>
              <span>
                {busy
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign in"
                    : mode === "mfa"
                      ? "Verify"
                      : mode === "forgot"
                        ? "Send request"
                        : "Update password"}
              </span>
              {!busy && <ArrowRight size={18} aria-hidden />}
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
              <p className="login-demo-label">Quick access · demo accounts</p>
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

          <p className="login-card-foot">
            <ShieldCheck size={13} aria-hidden />
            Encrypted sign-in · role-based permissions
          </p>
          <p className="login-powered-abex">
            Powered by <strong>AbexCore Technologies</strong>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
