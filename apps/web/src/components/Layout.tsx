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
  Plus,
  Home,
  UserRound,
  Download,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { canModule } from "../lib/access";
import { useIdleTimeout } from "../lib/idle";
import { pendingCount, syncOfflineQueue } from "../lib/api";
import { isOnline } from "../lib/offline";
import { useTheme } from "../lib/theme";
import { usePageTitle } from "../lib/page-title";
import { NotificationBell } from "./NotificationBell";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/sales", label: "Sales", icon: Trophy, module: "sales" },
  { to: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { to: "/procurement", label: "Procurement", icon: ShoppingCart, module: "procurement" },
  { to: "/customers", label: "Customers", icon: Users, module: "customers" },
  { to: "/vendors", label: "Vendors", icon: Factory, module: "vendors" },
  { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
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
  else if (path === "/") sessionStorage.setItem("tab:home", "/");
  else if (path.startsWith("/dispatch")) sessionStorage.setItem("tab:home", "/dispatch");
  else if (path.startsWith("/settings") || path.startsWith("/profile") || path.startsWith("/more")) sessionStorage.setItem("tab:profile", "/settings");
}

function tabPath(key: string, fallback: string) {
  return sessionStorage.getItem(`tab:${key}`) || fallback;
}

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  useIdleTimeout();
  const location = useLocation();
  const qc = useQueryClient();
  useTheme();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const pull = useRef({ y: 0, active: false });

  useEffect(() => { setOpen(false); setSheet(false); rememberTab(location.pathname); }, [location.pathname]);
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
    document.body.style.overflow = open || sheet ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open, sheet]);

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
    const ready: any = (e: any) => { e.preventDefault(); setInstall(e); };
    window.addEventListener("beforeinstallprompt", ready);
    return () => {
      window.removeEventListener("online", onStatus);
      window.removeEventListener("offline", onStatus);
      window.removeEventListener("online", sync);
      window.removeEventListener("mte-offline-change", onQueue);
      window.removeEventListener("beforeinstallprompt", ready);
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
  const onDashboard = location.pathname === "/";
  const visible = links.filter((l) => l.to === "/" || l.to === "/hr" || canModule(user, l.module));
  const page = visible.find((l) => (l.to === "/" ? location.pathname === "/" : location.pathname.startsWith(l.to)))?.label || "ERP";
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] || "";
  const roleLabel = (user?.role || "").replace(/_/g, " ");
  const initials = (user?.name || "MTE").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const heading = onDashboard
    ? { eyebrow: "Dashboard", title: `${hello}, ${firstName} 👋`, sub: `${user?.department || "Operations"} · ${roleLabel}`, backTo: undefined as string | undefined }
    : { eyebrow: meta?.eyebrow || "MTE ERP", title: meta?.title || page, sub: "", backTo: meta?.backTo };
  const tabs = useMemo(() => {
    const items = [
      { key: "home", to: tabPath("home", "/"), label: "Home", icon: Home },
    ];
    if (canModule(user, "inventory")) items.push({ key: "inventory", to: "/inventory", label: "Inventory", icon: Boxes });
    if (canModule(user, "sales")) items.push({ key: "sales", to: "/sales", label: "Sales", icon: Trophy });
    else if (canModule(user, "dispatch")) items.push({ key: "sales", to: "/dispatch", label: "Dispatch", icon: Truck });
    if (canModule(user, "reports")) items.push({ key: "reports", to: "/reports", label: "Reports", icon: BarChart3 });
    items.push({ key: "profile", to: "/settings", label: "Profile", icon: UserRound });
    return items;
  }, [user, location.pathname]);

  const fabActions = [
    { label: "New sales order", to: "/sales/new", module: "sales" },
    { label: "Add product", to: "/inventory?new=1", module: "inventory" },
    { label: "New customer", to: "/customers?new=1", module: "customers" },
    { label: "New vendor", to: "/vendors?new=1", module: "vendors" },
    { label: "New purchase", to: "/procurement/new", module: "procurement" },
    { label: "New staff", to: "/hr?new=1", module: "hr" },
  ].filter((a) => canModule(user, a.module));
  const hideFab =
    location.pathname.endsWith("/new") ||
    /^\/sales\/[^/]+$/.test(location.pathname) ||
    /^\/procurement\/[^/]+$/.test(location.pathname);
  const primaryFab = (() => {
    const p = location.pathname;
    if (p.startsWith("/inventory")) return fabActions.find((a) => a.module === "inventory");
    if (p.startsWith("/customers")) return fabActions.find((a) => a.module === "customers");
    if (p.startsWith("/vendors")) return fabActions.find((a) => a.module === "vendors");
    if (p.startsWith("/procurement")) return fabActions.find((a) => a.module === "procurement");
    if (p.startsWith("/hr")) return fabActions.find((a) => a.module === "hr" && a.to.includes("new"));
    return fabActions.find((a) => a.module === "sales") || fabActions[0];
  })();
  function goFab(to: string) {
    nav(to);
    window.setTimeout(() => setSheet(false), 280);
  }

  return (
    <div className="min-h-svh bg-paper text-ink dark:bg-night dark:text-stone-100">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-paper/95 px-3 py-2.5 backdrop-blur dark:border-white/10 dark:bg-night/95 lg:hidden" style={{ paddingTop: "max(0.6rem, env(safe-area-inset-top))" }}>
        {heading.backTo ? (
          <button type="button" className="btn-ghost px-2 py-2" aria-label="Go back" onClick={() => nav(heading.backTo!)}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button type="button" className="btn-ghost px-2 py-2" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold">{heading.eyebrow}</div>
          <div className="truncate font-serif text-lg leading-tight">{heading.title}</div>
        </div>
        <NotificationBell />
        <button type="button" className="rounded-full p-2 hover:bg-stone-100 dark:hover:bg-white/10" aria-label="Sign out" onClick={() => { logout(); nav("/login"); }}>
          <LogOut size={20} />
        </button>
        {install && (
          <button className="btn-ghost px-2 py-2" onClick={async () => { await install.prompt(); setInstall(null); }}>
            <Download size={16} />
          </button>
        )}
      </header>

      {(!online || pending > 0 || syncing) && (
        <div className={`px-3 py-2 text-center text-xs font-semibold lg:ml-72 ${online ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-stone-800 text-white"}`}>
          {!online && "No internet · showing offline data"}
          {online && syncing && "Syncing saved work…"}
          {online && !syncing && pending > 0 && `${pending} change(s) waiting to sync`}
        </div>
      )}

      {open && <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-svh w-[min(18rem,88vw)] flex-col overflow-hidden bg-ink text-stone-200 transition-transform duration-200 lg:w-72 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 py-5">
          <div>
            <div className="font-serif text-3xl tracking-wide text-white">ERP</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-gold">MTE operations</div>
          </div>
          <button type="button" className="rounded-md p-1 text-stone-400 hover:text-white lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-nav min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
          {visible.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-3 text-sm lg:py-2.5 ${isActive ? "bg-gold font-semibold text-ink" : "hover:bg-white/5"}`}>
              <l.icon size={16} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 p-4">
          <button className="flex items-center gap-2 text-sm text-stone-400 hover:text-white" onClick={() => { logout(); nav("/login"); }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-20 hidden items-center justify-between gap-6 border-b border-stone-200 bg-paper/95 px-10 py-3 backdrop-blur dark:border-white/10 dark:bg-night/95 lg:ml-72 lg:flex">
        <div className="flex min-w-0 items-center gap-3">
          {heading.backTo && (
            <button type="button" className="btn-ghost shrink-0 px-2 py-2" aria-label="Go back" onClick={() => nav(heading.backTo!)}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{heading.eyebrow}</div>
            <div className="truncate font-serif text-2xl leading-tight">{heading.title}</div>
            {heading.sub ? <div className="mt-0.5 truncate text-sm text-stone-500">{heading.sub}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {install && (
            <button className="btn-ghost px-2 py-2" onClick={async () => { await install.prompt(); setInstall(null); }}>
              <Download size={16} />
            </button>
          )}
          <NotificationBell />
          <div className="hidden text-right xl:block">
            <div className="text-sm font-semibold leading-tight">{user?.name}</div>
            <div className="text-[11px] uppercase tracking-wide text-stone-400">{roleLabel}</div>
          </div>
          <NavLink to="/settings" className="shrink-0" title="Settings">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-stone-200 dark:ring-white/10" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gold text-sm font-bold text-ink">{initials}</div>
            )}
          </NavLink>
        </div>
      </div>
      <main
        className="min-w-0 p-3 pb-28 sm:p-5 lg:ml-72 lg:px-10 lg:py-8"
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
          <motion.div key={location.pathname} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!hideFab && fabActions.length > 0 && (
        <button
          className="fab lg:hidden"
          aria-label={primaryFab?.label || "Quick actions"}
          onClick={() => { if (primaryFab) nav(primaryFab.to); else setSheet(true); }}
          onContextMenu={(e) => { e.preventDefault(); setSheet(true); }}
        >
          <Plus size={26} />
        </button>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[80] bg-black/40 lg:hidden" onClick={() => setSheet(false)}>
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper p-4 pb-8 dark:bg-night" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-600" />
            {fabActions.map((a) => (
              <button key={a.to} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-stone-100 dark:hover:bg-white/5" onClick={() => goFab(a.to)}>
                {a.label}
              </button>
            ))}
            <button className="mt-2 w-full py-3 text-stone-500" onClick={() => setSheet(false)}>Cancel</button>
          </motion.div>
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
            <NavLink key={t.key} to={t.to} className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px] ${active ? "text-gold" : "text-stone-500"}`}>
              <t.icon size={20} />
              {t.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
