import { ChevronDown, Copy, Mail, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shareMessage, sharePdfUrl, shareUrl, type DocKind } from "../lib/doc-style";

export function ShareMenu({
  token,
  kind,
  number,
  customerName,
  phone,
  email,
}: {
  token?: string | null;
  kind: DocKind;
  number: string;
  customerName?: string;
  phone?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!token) return null;
  const url = shareUrl(token);
  const pdf = sharePdfUrl(token);
  const text = shareMessage({ kind, number, customerName }, url);
  const mailTo = email || "";
  const mail = `mailto:${mailTo}?subject=${encodeURIComponent(`${number} ${kind === "quotation" ? "quotation" : "sales order"}`)}&body=${encodeURIComponent(`${text}\n\nPDF: ${pdf}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied");
    } catch {
      setCopied("Could not copy");
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: number, text, url });
        setOpen(false);
        return;
      } catch {
        /* cancelled */
      }
    }
    copy();
  }

  return (
    <div className="share-dd" ref={box}>
      <button type="button" className="btn-ghost" onClick={() => setOpen((v) => !v)}>
        <Share2 size={16} /> Share <ChevronDown size={14} />
      </button>
      {open && (
        <div className="share-dd-menu" role="menu">
          <a href={mail} role="menuitem" onClick={() => setOpen(false)}>
            <Mail size={16} /> Email
          </a>
          <button type="button" role="menuitem" onClick={copy}>
            <Copy size={16} /> Copy link
          </button>
          <a href={pdf} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setOpen(false)}>
            Open PDF
          </a>
          <button type="button" role="menuitem" onClick={nativeShare}>
            More…
          </button>
          {copied && <p className="share-dd-note">{copied}</p>}
        </div>
      )}
    </div>
  );
}
