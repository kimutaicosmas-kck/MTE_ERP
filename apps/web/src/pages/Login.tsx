import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Scale } from "lucide-react";

const demos = [
  ["superadmin@mte.local", "Super Admin"],
  ["admin@mte.local", "Admin"],
  ["sales@mte.local", "Sales"],
  ["warehouse@mte.local", "Warehouse"],
  ["finance@mte.local", "Finance"],
];

export function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("superadmin@mte.local");
  const [password, setPassword] = useState("Mte@2026");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-ink p-12 text-white lg:flex lg:flex-col justify-between">
        <div className="absolute left-0 top-0 h-full w-2 bg-gold" />
        <div>
          <div className="flex items-center gap-2 text-gold">
            <Scale size={18} />
            <span className="text-xs uppercase tracking-[0.3em]">Confidential</span>
          </div>
          <h1 className="mt-16 font-serif text-6xl">ERP</h1>
          <p className="mt-4 max-w-md text-stone-400">
            Earth-moving parts. Field or shop. Pick, pay, dispatch — with a Super Admin lock on every amendment.
          </p>
        </div>
        <p className="text-xs uppercase tracking-widest text-stone-500">MTE · operations system</p>
      </div>
      <div className="grid place-items-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <h2 className="font-serif text-3xl">Sign in</h2>
          <p className="text-sm text-stone-500">Use a demo account. Password for all: <strong>Mte@2026</strong></p>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div>
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </div>
          <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Enter the system"}</button>
          <div className="flex flex-wrap gap-2 pt-2">
            {demos.map(([em, role]) => (
              <button key={em} type="button" className="btn-ghost text-xs" onClick={() => setEmail(em)}>
                {role}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
