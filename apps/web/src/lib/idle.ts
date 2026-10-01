import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

const KEY = "mte_last_active";
const IDLE_MS = 15 * 60 * 1000;

export function markActive() {
  localStorage.setItem(KEY, String(Date.now()));
}

export function useIdleTimeout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    markActive();
    const bump = () => markActive();
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const tick = () => {
      const last = Number(localStorage.getItem(KEY) || 0);
      if (Date.now() - last >= IDLE_MS) {
        logout();
        nav("/login", { replace: true, state: { idle: true } });
      }
    };
    const id = window.setInterval(tick, 10_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, logout, nav]);
}
