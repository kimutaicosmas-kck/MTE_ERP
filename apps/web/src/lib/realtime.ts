import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "./api";

const REFRESH_KEYS: Record<string, string[][]> = {
  "order.": [["orders"], ["dashboard"], ["dispatch"]],
  "payment.": [["orders"], ["finance"], ["dashboard"]],
  "stock.": [["parts"], ["inventory"], ["inv-report"], ["dashboard"]],
  "approval.": [["approvals"], ["dashboard"]],
  "incoming.mpesa": [["mpesa-txns"], ["finance"], ["dashboard"]],
};

export function useRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let retryMs = 3000;
    let timer = 0;
    let stopped = false;

    async function probeAuth(token: string) {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("mte-session-expired"));
          return false;
        }
        return res.ok;
      } catch {
        return true;
      }
    }

    async function connect() {
      if (stopped) return;
      const token = getToken();
      if (!token) return;

      const ok = await probeAuth(token);
      if (!ok || stopped) {
        stopped = true;
        return;
      }

      es?.close();
      es = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);
      es.onopen = () => {
        retryMs = 3000;
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void connect();
        }, retryMs);
        retryMs = Math.min(retryMs * 2, 60_000);
      };
      es.onmessage = onMessage;
    }

    function onMessage(ev: MessageEvent) {
      try {
        const msg = JSON.parse(ev.data) as { event?: string };
        if (!msg.event || msg.event === "connected") return;
        for (const [prefix, keys] of Object.entries(REFRESH_KEYS)) {
          if (msg.event.startsWith(prefix)) {
            for (const key of keys) qc.invalidateQueries({ queryKey: key });
            return;
          }
        }
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } catch {
        /* ignore */
      }
    }

    void connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      es?.close();
    };
  }, [qc]);
}
