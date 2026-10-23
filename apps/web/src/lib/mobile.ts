import { useEffect, useState } from "react";

export const MOBILE_BP = 640;
/** Match Tailwind `lg` — phone/PWA layout vs desktop chrome */
export const PWA_LAYOUT_BP = 1024;

export function isIosBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

export function isPwaLayoutViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < PWA_LAYOUT_BP || isStandaloneDisplayMode();
}

export function useIsMobile(bp = MOBILE_BP) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [bp]);
  return mobile;
}

/** Mobile app shell: narrow viewport or installed PWA (even on tablet width). */
export function usePwaLayout() {
  const [active, setActive] = useState(() => isPwaLayoutViewport());
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${PWA_LAYOUT_BP - 1}px)`);
    const sync = () => setActive(mq.matches || isStandaloneDisplayMode());
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return active;
}

export function usePwaLayoutDocumentClass() {
  const pwaLayout = usePwaLayout();
  useEffect(() => {
    document.documentElement.classList.toggle("pwa-layout", pwaLayout);
    document.documentElement.dataset.mteShell = pwaLayout ? "mobile" : "desktop";
    return () => {
      document.documentElement.classList.remove("pwa-layout");
      delete document.documentElement.dataset.mteShell;
    };
  }, [pwaLayout]);
  return pwaLayout;
}
