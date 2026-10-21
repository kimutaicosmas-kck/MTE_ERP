import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ActionAlertList, type ActionAlert } from "./ActionAlerts";
import { api } from "../lib/api";

type Notice = { id: string; title: string; body: string; url?: string | null; read: boolean; createdAt: string };

export function NotificationBell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const notices = useQuery({
    queryKey: ["notices"],
    queryFn: () => api<{ unread: number; items: Notice[] }>("/api/notices"),
    refetchInterval: 30000,
  });
  const actions = useQuery({
    queryKey: ["dashboard-alerts"],
    queryFn: () => api<{ alerts: ActionAlert[] }>("/api/dashboard/alerts"),
    refetchInterval: 60000,
  });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api("/api/notices/read", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
  const unread = notices.data?.unread || 0;
  const actionCount = actions.data?.alerts?.length || 0;
  const badge = unread + actionCount;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const panel = open ? createPortal(
    <>
      <button type="button" className="notice-backdrop lg:hidden" aria-label="Close notifications" onClick={() => setOpen(false)} />
      <div ref={panelRef} className="notice-sheet" role="dialog" aria-label="Notifications">
        <div className="notice-sheet-head">
          <div>
            <h3 className="notice-sheet-title">Notifications</h3>
            {badge > 0 && <p className="notice-sheet-sub">{badge} item{badge === 1 ? "" : "s"} need attention</p>}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button type="button" className="notice-mark-read" onClick={() => read.mutate(undefined)}>Mark all read</button>
            )}
            <button type="button" className="notice-close" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="notice-list">
          {actionCount > 0 && (
            <section className="action-alert-section">
              <h4 className="action-alert-heading">Needs attention</h4>
              <ActionAlertList alerts={actions.data?.alerts || []} compact onSelect={() => setOpen(false)} />
            </section>
          )}
          {(notices.data?.items || []).length === 0 && actionCount === 0 && (
            <p className="notice-empty">No notifications yet.</p>
          )}
          {(notices.data?.items || []).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notice-item ${n.read ? "is-read" : ""}`}
              onClick={() => {
                if (!n.read) read.mutate([n.id]);
                setOpen(false);
                if (n.url) nav(n.url);
              }}
            >
              <div className="notice-item-top">
                <p className="notice-item-title">{n.title || "Notification"}</p>
                {!n.read && <span className="notice-unread-dot" aria-hidden />}
              </div>
              {n.body ? <p className="notice-item-body">{n.body}</p> : null}
              <p className="notice-item-time">{new Date(n.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative rounded-full p-2 text-slate-600 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-white/10"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={20} />
        {badge > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
