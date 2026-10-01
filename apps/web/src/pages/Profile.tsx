import { Bell, Camera, Download, KeyRound, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MODULES, canModule } from "../lib/access";
import { api, pendingCount, syncOfflineQueue } from "../lib/api";
import { useAuth, type User } from "../lib/auth";
import { enablePush, pushEnabled } from "../lib/push";
import { useTheme, type ThemeMode } from "../lib/theme";

const MODULE_PATHS: Record<string, string> = {
  dashboard: "/",
  sales: "/sales",
  dispatch: "/dispatch",
  inventory: "/inventory",
  procurement: "/procurement",
  customers: "/customers",
  vendors: "/vendors",
  reports: "/reports",
  finance: "/finance",
  approvals: "/approvals",
  audit: "/audit",
  staff: "/hr",
  hr: "/hr",
  settings: "/settings",
};

export function Profile() {
  return <AccountPanel />;
}

export function AccountPanel() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const { mode, setMode } = useTheme();
  const [pending, setPending] = useState(0);
  const [push, setPush] = useState(pushEnabled());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { pendingCount().then(setPending); }, []);

  const roleLabel = (user?.role || "").replace(/_/g, " ");
  const initials = (user?.name || "MTE").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const shortcuts = useMemo(() => {
    return MODULES.filter((m) => m.id !== "dashboard" && m.id !== "settings" && canModule(user, m.id)).map((m) => ({
      id: m.id,
      label: m.label,
      to: MODULE_PATHS[m.id] || "/",
    }));
  }, [user]);

  function note(text: string, isError = false) {
    setErr(isError ? text : "");
    setMsg(isError ? "" : text);
  }

  return (
    <div className="space-y-5">
      <div className="card flex items-center gap-4">
        <label className="relative shrink-0 cursor-pointer">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-gold/40" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-full bg-gold text-xl font-bold text-ink">{initials}</div>
          )}
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow">
            <Camera size={14} />
          </span>
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const next = await api<User>("/api/auth/avatar", {
                    method: "POST",
                    body: JSON.stringify({ name: file.name, mime: file.type || "image/jpeg", data: String(reader.result) }),
                  });
                  setUser(next);
                  note("Photo updated");
                } catch (e) {
                  note((e as Error).message, true);
                }
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        <div className="min-w-0">
          <div className="font-serif text-2xl leading-tight">{user?.name}</div>
          <div className="text-sm text-stone-500">{user?.email}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-stone-400">
            {user?.department || "Operations"} · {roleLabel}
            {user?.jobTitle ? ` · ${user.jobTitle}` : ""}
          </div>
        </div>
      </div>

      <ContactCard user={user} onSaved={(next) => { setUser(next); note("Details saved"); }} onError={(m) => note(m, true)} />
      <PasswordCard onSaved={() => note("Password changed")} onError={(m) => note(m, true)} />

      <div className="card space-y-3">
        <h2 className="font-semibold">Your access</h2>
        <div className="flex flex-wrap gap-1.5">
          {(user?.modules || []).map((id) => (
            <span key={id} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium capitalize text-stone-600 dark:bg-white/10 dark:text-stone-200">
              {id === "hr" ? "HR admin" : id}
            </span>
          ))}
        </div>
        {!!user?.monthlyTarget && (user.role === "SALES" || canModule(user, "sales")) && (
          <p className="text-sm text-stone-500">Monthly target Ksh {Math.round(user.monthlyTarget).toLocaleString("en-KE")}</p>
        )}
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Shortcuts</h2>
        <Link to="/hr" className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm hover:bg-stone-50 dark:hover:bg-white/5">
          Leave & salary advance
          <span className="text-stone-400">HR</span>
        </Link>
        {shortcuts.map((s) => (
          <Link key={s.id} to={s.to} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm hover:bg-stone-50 dark:hover:bg-white/5">
            {s.label}
            <span className="text-stone-400 capitalize">{s.id === "hr" ? "admin" : "open"}</span>
          </Link>
        ))}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Appearance</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "Auto", Monitor],
          ] as [ThemeMode, string, typeof Sun][]).map(([id, label, Icon]) => (
            <button key={id} className={`rounded-xl border px-3 py-3 text-sm ${mode === id ? "border-gold bg-gold/10" : "border-stone-200 dark:border-white/10"}`} onClick={() => setMode(id)}>
              <Icon size={16} className="mx-auto mb-1" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Notifications</h2>
        <button
          className="btn-gold"
          onClick={async () => {
            try {
              await enablePush();
              setPush(true);
              note("Notifications on");
            } catch (e) {
              note((e as Error).message, true);
            }
          }}
        >
          <Bell size={16} /> {push ? "Notifications enabled" : "Enable push notifications"}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Install & offline</h2>
        {pending > 0 && <p className="text-sm text-stone-500">{pending} change(s) waiting to upload.</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={async () => { await syncOfflineQueue(); setPending(await pendingCount()); note("Synced"); }}>Sync now</button>
          <button
            className="btn-ghost"
            onClick={async () => {
              const ev = (window as any).deferredPrompt;
              if (ev) await ev.prompt();
              else note("Use Chrome or Edge · Install app from the browser menu");
            }}
          >
            <Download size={16} /> Install like an app
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      <button className="btn-danger w-full" onClick={() => { logout(); nav("/login"); }}>Sign out</button>
    </div>
  );
}

function ContactCard({
  user,
  onSaved,
  onError,
}: {
  user: User | null;
  onSaved: (user: User) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user?.name, user?.phone]);

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const next = await api<User>("/api/auth/me", {
            method: "PATCH",
            body: JSON.stringify({ name, phone }),
          });
          onSaved(next);
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">My details</h2>
      <div>
        <label>Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07…" />
      </div>
      <div>
        <label>Email</label>
        <input value={user?.email || ""} disabled />
      </div>
      <button className="btn-gold" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
    </form>
  );
}

function PasswordCard({ onSaved, onError }: { onSaved: () => void; onError: (message: string) => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (newPassword !== confirm) return onError("New passwords do not match");
        setBusy(true);
        try {
          await api("/api/auth/password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          setCurrent("");
          setNext("");
          setConfirm("");
          onSaved();
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Password</h2>
      <div>
        <label>Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </div>
      <div>
        <label>New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <label>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      <button className="btn-gold" disabled={busy}>
        <KeyRound size={16} /> {busy ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
