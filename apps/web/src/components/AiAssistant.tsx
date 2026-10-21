import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageSquare, Send, Trash2, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type Turn = { id: string; role: string; content: string; createdAt: string };

type AssistantCtx = {
  open: boolean;
  toggle: () => void;
  openPanel: () => void;
  close: () => void;
};

const AssistantContext = createContext<AssistantCtx | null>(null);

function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("AssistantProvider required");
  return ctx;
}

function renderLine(line: string, key: number) {
  const parts = line.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p key={key} className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          const to = m[2].startsWith("/") ? m[2] : m[2];
          if (to.startsWith("/")) {
            return (
              <Link key={i} to={to} className="font-medium text-gold underline underline-offset-2">
                {m[1]}
              </Link>
            );
          }
          return (
            <a key={i} href={to} className="font-medium text-gold underline underline-offset-2">
              {m[1]}
            </a>
          );
        }
        const bold = part.split(/(\*\*[^*]+\*\*)/g);
        return bold.map((b, j) => {
          const bm = b.match(/^\*\*([^*]+)\*\*$/);
          if (bm) return <strong key={`${i}-${j}`}>{bm[1]}</strong>;
          return <span key={`${i}-${j}`}>{b}</span>;
        });
      })}
    </p>
  );
}

function renderContent(text: string) {
  return text.split("\n").map((line, i) => (line ? renderLine(line, i) : <br key={i} />));
}

export function AiAssistantPanel({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const history = useQuery({
    queryKey: ["assistant-history"],
    queryFn: () => api<Turn[]>("/api/assistant/history"),
  });
  const chat = useMutation({
    mutationFn: (message: string) => api<{ reply: string; mode: string }>("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant-history"] }),
  });
  const clear = useMutation({
    mutationFn: () => api("/api/assistant/history", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant-history"] }),
  });

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [history.data, chat.isPending]);

  function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || chat.isPending) return;
    setInput("");
    chat.mutate(msg);
  }

  const turns = history.data || [];

  return (
    <div className={`assistant-panel ${compact ? "assistant-panel-compact" : ""}`}>
      <div className="assistant-panel-head">
        <div className="flex items-center gap-2">
          <span className="assistant-icon-ring">
            <Bot size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink dark:text-white">MTE AI assistant</div>
          </div>
        </div>
        {!compact && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => clear.mutate()} disabled={clear.isPending}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>
      <div ref={scroll} className="assistant-panel-body">
        {turns.map((t) => (
          <div key={t.id} className={t.role === "user" ? "assistant-bubble assistant-bubble-user" : "assistant-bubble assistant-bubble-bot"}>
            {renderContent(t.content)}
          </div>
        ))}
        {chat.isPending && <div className="assistant-bubble assistant-bubble-bot text-sm text-slate-500">Thinking…</div>}
        {chat.error && <p className="text-sm text-red-600">{(chat.error as Error).message}</p>}
      </div>
      <form
        className="assistant-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about MTE ERP…"
          aria-label="Message assistant"
        />
        <button type="submit" className="btn-gold px-3" disabled={chat.isPending || !input.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function AssistantOverlay() {
  const { open, close } = useAssistant();
  if (!open) return null;
  return (
    <>
      <button type="button" className="assistant-backdrop" aria-label="Close assistant" onClick={close} />
      <div className="assistant-drawer" role="dialog" aria-label="AI assistant">
        <button type="button" className="assistant-drawer-close" aria-label="Close" onClick={close}>
          <X size={18} />
        </button>
        <AiAssistantPanel />
      </div>
    </>
  );
}

export function AiAssistantFab() {
  const { toggle, open } = useAssistant();
  return (
    <button
      type="button"
      className={`assistant-fab ${open ? "assistant-fab-open" : ""}`}
      aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      onClick={toggle}
    >
      {open ? <X size={22} /> : <MessageSquare size={22} />}
      {!open && <span className="assistant-fab-label">AI</span>}
    </button>
  );
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo<AssistantCtx>(
    () => ({
      open,
      toggle: () => setOpen((v) => !v),
      openPanel: () => setOpen(true),
      close: () => setOpen(false),
    }),
    [open],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantOverlay />
      <AiAssistantFab />
    </AssistantContext.Provider>
  );
}

/** Open assistant from dashboard quick action */
export function openAssistantFromLink() {
  window.dispatchEvent(new CustomEvent("mte-open-assistant"));
}

export function AssistantGlobalListener() {
  const { openPanel } = useAssistant();
  useEffect(() => {
    const fn = () => openPanel();
    window.addEventListener("mte-open-assistant", fn);
    return () => window.removeEventListener("mte-open-assistant", fn);
  }, [openPanel]);
  return null;
}
