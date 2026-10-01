import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Notice = { id: string; title: string; body: string; url?: string | null; read: boolean; createdAt: string };

export function NotificationBell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const notices = useQuery({
    queryKey: ["notices"],
    queryFn: () => api<{ unread: number; items: Notice[] }>("/api/notices"),
    refetchInterval: 30000,
  });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api("/api/notices/read", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notices"] }),
  });
  const unread = notices.data?.unread || 0;

  return (
    <div className="relative">
      <button type="button" className="relative rounded-full p-2 hover:bg-stone-100 dark:hover:bg-white/10" aria-label="Notifications" onClick={() => setOpen((v) => !v)}>
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#171c22]">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-white/10">
              <h3 className="font-semibold">Notifications</h3>
              {unread > 0 && (
                <button className="text-xs text-gold" onClick={() => read.mutate(undefined)}>Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(notices.data?.items || []).length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-500">No notifications yet.</p>}
              {(notices.data?.items || []).map((n) => (
                <button
                  key={n.id}
                  className={`block w-full border-b border-stone-50 px-4 py-3 text-left hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5 ${n.read ? "opacity-70" : ""}`}
                  onClick={() => {
                    if (!n.read) read.mutate([n.id]);
                    setOpen(false);
                    if (n.url) nav(n.url);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />}
                  </div>
                  <p className="text-xs text-stone-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-stone-400">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
