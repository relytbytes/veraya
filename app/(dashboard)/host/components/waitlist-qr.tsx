"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, X } from "lucide-react";

/** Shows a QR + link to the public /waitlist join page for guests to scan.
 *  The QR is generated locally (no third-party image host) so it always
 *  renders, even offline or on locked-down networks. */
export function WaitlistQR() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("/waitlist");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setUrl(`${window.location.origin}/waitlist`);
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setErr(false);
    QRCode.toDataURL(url, { width: 520, margin: 2, errorCorrectionLevel: "M" })
      .then((d) => { if (alive) setQrDataUrl(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [open, url]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Show waitlist QR for guests"
        className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
      >
        <QrCode className="h-3.5 w-3.5" /> QR
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-lg font-bold text-gray-900">Join the Waitlist</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Scan to add yourself — we&apos;ll text you when your table&apos;s ready.</p>
            {err ? (
              <p className="text-sm text-red-600 py-12">Could not render the QR. Open this link on a phone instead.</p>
            ) : qrDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrDataUrl} alt="Waitlist QR code" width={260} height={260} className="mx-auto rounded-lg border border-gray-200" />
            ) : (
              <div className="mx-auto h-[260px] w-[260px] animate-pulse rounded-lg bg-gray-100" />
            )}
            <p className="mt-3 text-xs text-gray-400 break-all">{url}</p>
          </div>
        </div>
      )}
    </>
  );
}
