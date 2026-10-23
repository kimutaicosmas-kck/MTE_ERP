import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isIosBrowser, isStandaloneDisplayMode } from "../lib/mobile";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/** Install app: native prompt on Android Chrome, manual steps on iOS / other browsers. */
export function PwaInstallHelp({ className = "header-icon-btn shrink-0 text-slate-600 dark:text-slate-200" }: { className?: string }) {
  const [installed] = useState(() => isStandaloneDisplayMode());
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (installed) return;
    const onReady = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onReady);
    return () => window.removeEventListener("beforeinstallprompt", onReady);
  }, [installed]);

  if (installed) return null;

  const ios = isIosBrowser();

  async function install() {
    if (prompt) {
      await prompt.prompt();
      setPrompt(null);
      return;
    }
    setSheet(true);
  }

  return (
    <>
      <button type="button" className={className} aria-label="Install app" title="Install app" onClick={() => void install()}>
        <Download size={20} />
      </button>
      {sheet && (
        <div className="mobile-shell-chrome fixed inset-0 z-[80] flex items-end bg-black/40 p-4 sm:items-center sm:justify-center" role="dialog" aria-label="Install MTE ERP">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-[#121a26]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Install MTE ERP on your phone</h2>
              <button type="button" className="rounded-lg p-1 text-slate-500" aria-label="Close" onClick={() => setSheet(false)}>
                <X size={18} />
              </button>
            </div>
            {ios ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
                <li>Open this site in <strong>Safari</strong> (not Chrome).</li>
                <li>Tap the <strong>Share</strong> button (square with arrow).</li>
                <li>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
                <li>Use <strong>Chrome</strong> on Android (recommended).</li>
                <li>Tap the menu (⋮) in the top right.</li>
                <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>If you do not see it, visit the dashboard once while signed in, then try again.</li>
              </ol>
            )}
            <p className="mt-4 text-xs text-slate-400">Requires HTTPS — use https://demo.abexcore.co.ke</p>
          </div>
        </div>
      )}
    </>
  );
}
