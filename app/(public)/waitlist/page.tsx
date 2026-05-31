"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Users, Clock } from "lucide-react";

export default function WaitlistJoinPage() {
  const [form, setForm] = useState({ name: "", phone: "", partySize: 2 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ position: number; estWaitMins: number } | null>(null);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  if (joined) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">You&apos;re on the list!</h2>
          <p className="text-gray-500 mb-6">Hang tight{form.phone ? " — we'll text you when your table's ready" : ""}.</p>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-3xl font-bold text-amber-700">#{joined.position}</p>
              <p className="text-xs text-amber-800 mt-1">in line</p>
            </div>
            <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-3xl font-bold text-gray-900">~{joined.estWaitMins}</p>
              <p className="text-xs text-gray-500 mt-1">min estimated</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500";

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Join the Waitlist</h2>
        <p className="text-gray-500 mt-1 text-sm">Add yourself and we&apos;ll text you the moment a table opens up.</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6 space-y-5">
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2"><Users className="h-3.5 w-3.5" />Party size</label>
          <div className="grid grid-cols-8 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} type="button" onClick={() => set("partySize", n)}
                className={`py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.partySize === n ? "bg-amber-600 border-amber-600 text-white" : "border-gray-300 text-gray-700 hover:border-amber-400"}`}>
                {n}{n === 8 ? "+" : ""}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" className={input} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Mobile number</label>
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 000-0000" className={input} />
          <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><Clock className="h-3 w-3" />We&apos;ll text you when your table&apos;s ready.</p>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}
        <button type="button" disabled={loading || !form.name.trim()} onClick={submit}
          className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Adding you…" : "Join the list"}
        </button>
      </div>
    </div>
  );
}
