import { useEffect, useState } from "react";

export const MOBILE_BP = 640;
/** Match Tailwind `lg` — phone/PWA layout vs desktop chrome */
export const PWA_LAYOUT_BP = 1024;

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
