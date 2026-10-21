import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
  Trophy,
  ScrollText,
  Truck,
  BarChart3,
  Factory,
  ShoppingCart,
  Settings,
  Contact,
  X,
  Home,
  UserRound,
  Download,
  ArrowLeft,
  Search,
  Hexagon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { canModule } from "../lib/access";
import { useRealtimeSync } from "../lib/realtime";
import { useIdleTimeout } from "../lib/idle";
import { pendingCount, syncOfflineQueue } from "../lib/api";
import { isOnline } from "../lib/offline";
import { useTheme } from "../lib/theme";
import { usePageTitle } from "../lib/page-title";
import { NotificationBell } from "./NotificationBell";
import { AssistantGlobalListener, AssistantProvider } from "./AiAssistant";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/sales", label: "Sales", icon: Trophy, module: "sales" },
  { to: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { to: "/procurement", label: "Procurement", icon: ShoppingCart, module: "procurement" },
  { to: "/customers", label: "Customers", icon: Users, module: "customers" },
  { to: "/vendors", label: "Vendors", icon: Factory, module: "vendors" },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3, module: "reports" },
  { to: "/finance", label: "Finance", icon: Wallet, module: "finance" },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, module: "approvals" },
  { to: "/audit", label: "Audit", icon: ScrollText, module: "audit" },
  { to: "/hr", label: "HR", icon: Contact, module: "hr" },
  { to: "/settings", label: "Settings", icon: Settings, module: "settings" },
];

function rememberTab(path: string) {
  if (path === "/inventory" || path.startsWith("/inventory/")) sessionStorage.setItem("tab:inventory", "/inventory");
  else if (path === "/sales" || path.startsWith("/sales/")) sessionStorage.setItem("tab:sales", "/sales");
  else if (path === "/reports" || path.startsWith("/reports/")) sessionStorage.setItem("tab:reports", "/reports");
  else if (path.startsWith("/settings") || path.startsWith("/profile") || path.startsWith("/more")) sessionStorage.setItem("tab:profile", "/settings");
}

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  useIdleTimeout();
  const location = useLocation();
  const qc = useQueryClient();
  useTheme();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const pull = useRef({ y: 0, active: false });
  const goRef = useRef<(to: string) => void>(() => undefined);

  useEffect(() => {
    sessionStorage.removeItem("tab:home");
    setOpen(false);
    rememberTab(location.pathname);
  }, [location.pathname]);
  useEffect(() => {
    const labelTables = () => {
      document.querySelectorAll(".table-wrap table").forEach((table) => {
        const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() || "");
        table.querySelectorAll("tbody tr").forEach((tr) => {
          [...tr.children].forEach((cell, i) => {
            if (cell instanceof HTMLElement && cell.tagName === "TD" && !cell.colSpan) {
              cell.setAttribute("data-label", headers[i] || "");
            }
          });
        });
      });
    };
    labelTables();
    const mo = new MutationObserver(labelTables);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const onStatus = () => setOnline(isOnline());
    const onQueue = async () => setPending(await pendingCount());
    const sync = async () => {
      if (!isOnline()) return;
      setSyncing(true);
      try {
        await syncOfflineQueue();
        await qc.invalidateQueries();
      } catch { /* keep queue */ }
      setSyncing(false);
      setPending(await pendingCount());
    };
    onQueue();
    window.addEventListener("online", onStatus);
    window.addEventListener("offline", onStatus);
    window.addEventListener("online", sync);
    window.addEventListener("mte-offline-change", onQueue);
    navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "SYNC") sync(); });
    const ready: any = (e: any) => {
      e.preventDefault();
      (window as Window & { deferredPrompt?: Event }).deferredPrompt = e;
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", ready);
    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
      window.removeEventListener("online", sync);
      window.removeEventListener("mte-offline-change", onQueue);
      window.removeEventListener("beforeinstallprompt", ready);
      delete (window as Window & { deferredPrompt?: Event }).deferredPrompt;
    };
  }, [qc]);

  useEffect(() => {
    let start = 0;
    const down = (e: TouchEvent) => { start = e.touches[0].clientX; };
    const up = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start;
      if (start < 28 && dx > 70) {
        const path = window.location.pathname;
        if (path.startsWith("/sales/") ) nav("/sales");
        else if (path.startsWith("/procurement/")) nav("/procurement");
        else setOpen(true);
      }
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [nav]);

  const { meta } = usePageTitle();
  useRealtimeSync();
  const visible = links.filter((l) => {
    if (l.to === "/" || l.to === "/hr") return true;
    return canModule(user, l.module);
  });
  const page =
    [...links]
      .filter((l) => (l.to === "/" ? location.pathname === "/" : location.pathname.startsWith(l.to)))
      .sort((a, b) => b.to.length - a.to.length)[0]?.label || "MTE ERP";
  const initials = (user?.name || "MTE").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const navTitle = (meta?.title?.trim() || page).trim() || "MTE ERP";
  const navEyebrow = meta?.eyebrow?.trim() || page;
  const heading = { eyebrow: navEyebrow, title: navTitle, sub: "", backTo: meta?.backTo };
  const onDashboard = location.pathname === "/";
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const tabs = useMemo(() => {
    const items = [
      { key: "home", to: "/", label: "Home", icon: Home },
    ];
    if (canModule(user, "inventory")) items.push({ key: "inventory", to: "/inventory", label: "Inventory", icon: Boxes });
    if (canModule(user, "sales")) items.push({ key: "sales", to: "/sales", label: "Sales", icon: Trophy });
    else if (canModule(user, "dispatch")) items.push({ key: "sales", to: "/dispatch", label: "Dispatch", icon: Truck });
    if (canModule(user, "customers")) items.push({ key: "customers", to: "/customers", label: "Customers", icon: Users });
    items.push({ key: "profile", to: "/settings", label: "Profile", icon: UserRound });
    return items;
  }, [user, location.pathname]);

  goRef.current = (to: string) => nav(to);

  useEffect(() => {
    let chord = false;
    const timer = { id: 0 };
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (typing) {
        if (e.key === "Escape") el.blur();
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") setHelp(false);
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("main input:not([type=hidden]), .toolbar input")?.focus();
        return;
      }
      if (e.key === "g") {
        chord = true;
        window.clearTimeout(timer.id);
        timer.id = window.setTimeout(() => { chord = false; }, 700);
        return;
      }
      if (!chord) return;
      chord = false;
      const map: Record<string, string> = { d: "/", s: "/sales", i: "/inventory", f: "/finance", h: "/hr", c: "/customers", a: "/audit", p: "/settings" };
      if (map[e.key]) goRef.current(map[e.key]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AssistantProvider>
      <AssistantGlobalListener />
    <div className="min-h-svh bg-paper text-ink dark:bg-night dark:text-slate-100">
      <header
        className="mobile-topbar sticky top-0 z-30 border-b border-slate-200 bg-white px-1 py-2 dark:border-white/10 dark:bg-[#121a26] lg:hidden"
        style={{ paddingTop: "max(0.6rem, env(safe-area-inset-top))" }}
      >
        {heading.backTo ? (
          <button type="button" className="mobile-topbar-menu" aria-label="Go back" onClick={() => nav(heading.backTo!)}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button type="button" className="mobile-topbar-menu" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
        )}
        {onDashboard ? (
          <div className="mobile-topbar-title-block">
            <h1 className="mobile-topbar-title">Dashboard</h1>
            <p className="mobile-topbar-greeting">
              {hello}, {firstName}
            </p>
          </div>
        ) : (
          <h1 className="mobile-topbar-title">{heading.title}</h1>
        )}
        <div className="mobile-topbar-actions">
          <NotificationBell />
          <span className="mobile-topbar-divider" aria-hidden />
          <NavLink
            to="/settings"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2563eb] text-[11px] font-bold text-white"
            title="Profile"
          >
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : initials}
          </NavLink>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-600 dark:text-slate-300"
            aria-label="Sign out"
            onClick={() => {
              logout();
              nav("/login");
            }}
          >
            <LogOut size={20} />
          </button>
          {install && (
            <button type="button" className="shrink-0 rounded-lg p-2 text-slate-500" aria-label="Install app" onClick={async () => { await install.prompt(); setInstall(null); }}>
              <Download size={16} />
            </button>
          )}
        </div>
      </header>

      {(!online || pending > 0 || syncing) && (
        <div className={`px-3 py-2 text-center text-xs font-semibold lg:ml-60 ${online ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-stone-800 text-white"}`}>
          {!online && "No internet · showing offline data"}
          {online && syncing && "Syncing saved work…"}
          {online && !syncing && pending > 0 && `${pending} change(s) waiting to sync`}
        </div>
      )}

      {open && <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-svh w-[min(15.5rem,88vw)] flex-col overflow-hidden bg-ink text-slate-300 transition-transform duration-200 lg:w-60 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex shrink-0 items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold text-ink">
              <Hexagon size={18} fill="currentColor" />
            </span>
            <div>
              <div className="text-sm font-bold tracking-wide">MTE ERP</div>
              <div className="text-[9px] font-semibold uppercase leading-tight tracking-[0.12em] text-slate-400">
                Heavy machinery &amp; spare parts
              </div>
            </div>
          </div>
          <button type="button" className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-nav min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-3">
          <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Main menu</div>
          {visible.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-on" : ""}`}>
              <l.icon size={17} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot shrink-0 border-t border-white/10 p-4">
          <p className="mb-3 text-[10px] leading-snug text-slate-500">Powering construction &amp; earthworks operations across Kenya.</p>
          <button className="flex items-center gap-2 text-sm font-medium text-slate-100 hover:text-white" onClick={() => { logout(); nav("/login"); }}>
            <LogOut size={14} /> Sign out
          </button>
          <p className="mt-2 text-[10px] text-slate-600">v1.0 · MTE ERP</p>
        </div>
      </aside>

      <div className="sticky top-0 z-20 hidden min-h-14 items-center gap-4 border-b border-slate-200 bg-white px-6 py-2 dark:border-white/10 dark:bg-[#121a26] lg:ml-60 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,36rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          {heading.backTo ? (
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Go back" onClick={() => nav(heading.backTo!)}>
              <ArrowLeft size={18} />
            </button>
          ) : (
            <Menu size={18} className="shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              {onDashboard ? (
                <>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">Dashboard</span>
                  <span className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">{hello}, {firstName}</span>
                </>
              ) : (
                <>
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{heading.title}</span>
                  {heading.eyebrow && heading.eyebrow.toLowerCase() !== heading.title.toLowerCase() ? (
                    <span className="truncate text-sm text-slate-400">{heading.eyebrow}</span>
                  ) : null}
                </>
              )}
            </div>
            {onDashboard ? (
              <div className="truncate text-[11px] text-slate-400">{today}</div>
            ) : null}
          </div>
        </div>
        <form
          className="header-search-wrap relative"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            const lower = q.toLowerCase();
            if (/^cust-\d+/i.test(q) || lower.includes("customer") || /^\+?\d{9,12}$/.test(q.replace(/\s/g, ""))) {
              nav(`/customers?q=${encodeURIComponent(q)}`);
            } else if (/^so-|^inv-|^ord-/i.test(q)) {
              nav(`/sales?q=${encodeURIComponent(q)}`);
            } else {
              nav(`/customers?q=${encodeURIComponent(q)}`);
            }
            setQuery("");
          }}
        >
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders, customers, products, invoices…" className="header-search text-sm" />
        </form>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {install && (
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={async () => { await install.prompt(); setInstall(null); }}>
              <Download size={16} />
            </button>
          )}
          <NotificationBell />
          <NavLink to="/settings" className="ml-0.5 grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-white" title="Profile">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : initials}
          </NavLink>
        </div>
      </div>
      <main
        className="app-main min-w-0 p-3 pb-28 sm:p-4 lg:ml-60 lg:px-6 lg:py-5"
        onTouchStart={(e) => { if (window.scrollY <= 0) { pull.current = { y: e.touches[0].clientY, active: true }; } }}
        onTouchEnd={async (e) => {
          if (!pull.current.active) return;
          const dy = e.changedTouches[0].clientY - pull.current.y;
          pull.current.active = false;
          if (dy > 80) {
            await qc.invalidateQueries();
            if (isOnline()) await syncOfflineQueue();
          }
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} className="page-module w-full min-w-0 max-w-full" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {help && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onClick={() => setHelp(false)}>
          <div className="card w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold tracking-tight">Keyboard shortcuts</h2>
            <ul className="space-y-1 text-sm">
              <li><kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">/</kbd> Focus search</li>
              <li><kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">g</kbd> then <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">d</kbd> Dashboard</li>
              <li><kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">g</kbd> <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">s</kbd> Sales · <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">i</kbd> Inventory · <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">f</kbd> Finance</li>
              <li><kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">g</kbd> <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">h</kbd> HR · <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">c</kbd> Customers · <kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">a</kbd> Audit</li>
              <li><kbd className="rounded bg-stone-100 px-1.5 dark:bg-white/10">?</kbd> This help</li>
            </ul>
            <button className="btn-ghost w-full" onClick={() => setHelp(false)}>Close</button>
          </div>
        </div>
      )}

      <nav className="bottom-nav lg:hidden">
        {tabs.map((t) => {
          const active = t.key === "home"
            ? location.pathname === "/"
            : t.key === "profile"
              ? location.pathname.startsWith("/settings") || location.pathname.startsWith("/profile") || location.pathname.startsWith("/more")
              : location.pathname.startsWith(`/${t.key}`) || (t.key === "sales" && location.pathname.startsWith("/dispatch"));
          return (
            <NavLink key={t.key} to={t.to} end={t.key === "home"} className={active ? "bn-on" : ""}>
              <t.icon size={18} />
              {t.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
    </AssistantProvider>
  );
}
