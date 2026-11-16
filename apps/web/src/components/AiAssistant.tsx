import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Sparkles, Trash2, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

type Turn = { id: string; role: string; content: string; createdAt?: string };

type AssistantCtx = {
  open: boolean;
  toggle: () => void;
  openPanel: () => void;
  close: () => void;
};

const STARTERS = [
  "What needs attention?",
  "How much are today's sales?",
  "Who is the best salesperson this year?",
  "Which products are out of stock?",
];

const AssistantContext = createContext<AssistantCtx | null>(null);

function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("AssistantProvider required");
  return ctx;
}

function renderLine(line: string, key: number) {
  const parts = line.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p key={key} className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          const to = m[2];
          if (to.startsWith("/")) {
            return (
              <Link key={i} to={to} className="font-medium underline underline-offset-2">
                {m[1]}
              </Link>
            );
          }
          return (
            <a key={i} href={to} className="font-medium underline underline-offset-2">
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

export function AiAssistantPanel({ compact, onClose }: { compact?: boolean; onClose?: () => void }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const history = useQuery({
    queryKey: ["assistant-history"],
    queryFn: () => api<Turn[]>("/api/assistant/history"),
  });
  const chat = useMutation({
    mutationFn: (message: string) => api<{ reply: string; mode: string }>("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant-history"] }),
    onSettled: () => setPendingText(null),
  });
  const clear = useMutation({
    mutationFn: () => api("/api/assistant/history", { method: "DELETE" }),
    onSuccess: () => {
      setPendingText(null);
      qc.invalidateQueries({ queryKey: ["assistant-history"] });
    },
  });

  const turns = history.data || [];
  const visible = pendingText && !turns.some((t) => t.role === "user" && t.content === pendingText)
    ? [...turns, { id: "pending-user", role: "user", content: pendingText }]
    : turns;

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" });
  }, [visible.length, chat.isPending]);

  function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || chat.isPending) return;
    setInput("");
    setPendingText(msg);
    if (box.current) box.current.style.height = "auto";
    chat.mutate(msg);
  }

  function onInput(value: string) {
    setInput(value);
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  return (
    <div className={`assistant-panel ${compact ? "assistant-panel-compact" : ""}`}>
      <div className="assistant-panel-head">
        <div className="flex items-center gap-2">
          <span className="assistant-icon-ring">
            <Sparkles size={15} />
          </span>
          <div className="text-sm font-semibold text-ink dark:text-white">MTE assistant</div>
        </div>
        <div className="assistant-head-actions">
          <button type="button" className="assistant-icon-btn" aria-label="Clear chat" onClick={() => clear.mutate()} disabled={clear.isPending || !turns.length}>
            <Trash2 size={15} />
          </button>
          {onClose && (
            <button type="button" className="assistant-icon-btn" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div ref={scroll} className="assistant-panel-body">
        {visible.length === 0 && !chat.isPending && (
          <div className="assistant-empty">
            <h3>MTE assistant</h3>
            <p>Ask anything about your work in MTE — steps, live numbers, customers, SKUs.</p>
            <div className="assistant-suggestions">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="assistant-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {visible.map((t) => (
          <div key={t.id} className={t.role === "user" ? "assistant-bubble assistant-bubble-user" : "assistant-bubble assistant-bubble-bot"}>
            {renderContent(t.content)}
          </div>
        ))}
        {chat.isPending && (
          <div className="assistant-bubble assistant-bubble-bot" aria-label="Thinking">
            <span className="assistant-typing"><span /><span /><span /></span>
          </div>
        )}
        {chat.error && <p className="text-sm text-red-600">{(chat.error as Error).message}</p>}
      </div>
      <form
        className="assistant-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about MTE ERP…"
          aria-label="Message assistant"
        />
        <button type="submit" className="assistant-send" disabled={chat.isPending || !input.trim()} aria-label="Send">
          <ArrowUp size={16} />
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
      <div className="assistant-drawer" role="dialog" aria-label="Assistant">
        <AiAssistantPanel onClose={close} />
      </div>
    </>
  );
}

export function AiAssistantFab() {
  const { toggle, open } = useAssistant();
  if (open) return null;
  return (
    <button
      type="button"
      className="assistant-fab"
      aria-label="Open assistant"
      onClick={toggle}
    >
      <Sparkles size={18} />
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
