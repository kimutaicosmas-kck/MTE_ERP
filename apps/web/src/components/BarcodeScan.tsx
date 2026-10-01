import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function BarcodeScan({ onDetect }: { onDetect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Detector = (window as any).BarcodeDetector;
        if (!Detector) {
          setErr("This browser cannot scan barcodes. Type the SKU instead.");
          return;
        }
        const detector = new Detector({ formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "upc_e"] });
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) {
              onDetect(String(codes[0].rawValue));
              setOpen(false);
              return;
            }
          } catch {
            /* keep scanning */
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setErr("Camera permission is required to scan.");
      }
    })();
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetect]);

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => { setErr(""); setOpen(true); }}>
        <ScanLine size={16} /> Scan
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-paper p-4 dark:bg-night sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-semibold">Point the camera at a barcode</h3>
            <video ref={video} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <button className="btn-ghost mt-3 w-full" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
