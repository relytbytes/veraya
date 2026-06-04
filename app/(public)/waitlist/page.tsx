"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Users, Clock } from "lucide-react";

interface Brand { name: string; color: string; logoUrl: string }

export default function WaitlistJoinPage() {
  const [form, setForm] = useState({ name: "", phone: "", partySize: 2 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ position: number; estWaitMins: number } | null>(null);
  const [brand, setBrand] = useState<Brand>({ name: "Tyler's Test Kitchen", color: "#21A090", logoUrl: "/veraya-icon.png" });

  useEffect(() => {
    fetch("/api/public/brand").then((r) => r.ok ? r.json() : null).then((b) => b && setBrand(b)).catch(() => {});
  }, []);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const accent = brand.color;

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Couldn't add you to the list.");
      }
      setJoined(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Branded header shown above either state.
  const BrandHead = (
    <div className="flex flex-col items-center text-center mb-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand.logoUrl} alt={brand.name} className="h-16 w-16 rounded-full object-cover shadow-sm mb-3" />
      <h1 className="text-xl font-bold text-gray-900 leading-tight">{brand.name}</h1>
    </div>
  );

  if (joined) {
    return (
      <div className="max-w-sm mx-auto px-1">
        {BrandHead}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: `${accent}1A` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: accent }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">You&apos;re on the list!</h2>
          <p className="text-gray-500 mb-6 text-sm">Hang tight{form.phone ? " — we'll text you the moment your table's ready" : ""}.</p>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border p-4" style={{ background: `${accent}12`, borderColor: `${accent}40` }}>
              <p className="text-3xl font-bold" style={{ color: accent }}>#{joined.position}</p>
              <p className="text-xs text-gray-600 mt-1">in line</p>
            </div>
            <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-3xl font-bold text-gray-900">{joined.estWaitMins}</p>
              <p className="text-xs text-gray-500 mt-1">min estimated</p>
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Powered by Veraya</p>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2";

  return (
    <div className="max-w-sm mx-auto px-1">
      {BrandHead}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6 space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-900">Join the Waitlist</h2>
          <p className="text-gray-500 mt-0.5 text-sm">We&apos;ll text you the moment a table opens.</p>
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2"><Users className="h-3.5 w-3.5" />Party size</label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
              const active = form.partySize === n;
              return (
                <button key={n} type="button" onClick={() => set("partySize", n)}
                  className="py-2.5 rounded-lg text-sm font-semibold border transition-colors"
                  style={active
                    ? { background: accent, borderColor: accent, color: "#fff" }
                    : { borderColor: "#d1d5db", color: "#374151" }}>
                  {n}{n === 8 ? "+" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" className={input} style={{ ["--tw-ring-color" as string]: accent }} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Mobile number</label>
          <input type="tel" inputMode="tel" required value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 000-0000" className={input} style={{ ["--tw-ring-color" as string]: accent }} />
          <p className="flex items-center gap-1 text-xs text-gray-400 mt-1.5"><Clock className="h-3 w-3" />We&apos;ll text you when your table&apos;s ready.</p>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}
        <button type="button" disabled={loading || !form.name.trim() || !form.phone.trim()} onClick={submit}
          className="w-full py-3.5 rounded-xl disabled:opacity-50 text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity"
          style={{ background: accent }}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Adding you…" : "Join the list"}
        </button>
      </div>
      <p className="text-center text-[11px] text-gray-400 mt-4">Powered by Veraya</p>
    </div>
  );
}
