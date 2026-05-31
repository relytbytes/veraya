"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface EventInquiryFormProps {
  eventId: string;
  eventName: string;
  guestCount?: number;
}

export function EventInquiryForm({ eventId, eventName, guestCount }: EventInquiryFormProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    partySize: 2,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function set(field: string, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) { setError("Please enter your name."); return; }
    if (!form.email.trim()) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/events/${eventId}/inquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: "#0f0a04",
    border: "1px solid #3a2e1a",
    color: "#f5f0e8",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "15px",
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s",
  } as const;

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    marginBottom: "6px",
    color: "#c4b89a",
  } as const;

  if (submitted) {
    return (
      <div
        className="rounded-xl border p-8 text-center"
        style={{ backgroundColor: "#231809", borderColor: "#3a2e1a" }}
      >
        <div
          className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "rgba(212,168,83,0.15)" }}
        >
          <CheckCircle2 size={28} style={{ color: "#d4a853" }} />
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: "#f5f0e8" }}>
          Inquiry Received!
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "#c4b89a" }}>
          Thank you for your interest in <strong style={{ color: "#f5f0e8" }}>{eventName}</strong>.
          Our team will reach out to you within 24 hours to confirm your spot and answer any questions.
        </p>
        <p className="text-xs mt-4" style={{ color: "#8a7a60" }}>
          Please check your email ({form.email}) for a follow-up.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-6"
      style={{
        backgroundColor: "#231809",
        borderColor: "#3a2e1a",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <h3 className="text-lg font-bold mb-1" style={{ color: "#f5f0e8" }}>
        Request to Attend
      </h3>
      <p className="text-sm mb-6" style={{ color: "#8a7a60" }}>
        Submit your inquiry and we&apos;ll get back to you within 24 hours.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label style={labelStyle}>
            Full Name <span style={{ color: "#d4a853" }}>*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#d4a853")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#3a2e1a")}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>
            Email Address <span style={{ color: "#d4a853" }}>*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jane@example.com"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#d4a853")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#3a2e1a")}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Phone Number</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="(555) 000-0000"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#d4a853")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#3a2e1a")}
          />
        </div>

        <div>
          <label style={labelStyle}>Party Size</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => set("partySize", Math.max(1, form.partySize - 1))}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold transition-colors"
              style={{
                backgroundColor: "#0f0a04",
                border: "1px solid #3a2e1a",
                color: "#d4a853",
              }}
            >
              −
            </button>
            <span
              className="text-xl font-bold min-w-[2.5rem] text-center"
              style={{ color: "#f5f0e8" }}
            >
              {form.partySize}
            </span>
            <button
              type="button"
              onClick={() =>
                set("partySize", guestCount ? Math.min(guestCount, form.partySize + 1) : form.partySize + 1)
              }
              className="flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold transition-colors"
              style={{
                backgroundColor: "#0f0a04",
                border: "1px solid #3a2e1a",
                color: "#d4a853",
              }}
            >
              +
            </button>
            {guestCount && (
              <span className="text-xs ml-1" style={{ color: "#8a7a60" }}>
                (max {guestCount})
              </span>
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Special Requests or Questions</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Dietary restrictions, allergies, seating preferences, questions…"
            rows={3}
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#d4a853")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#3a2e1a")}
          />
        </div>

        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "rgba(220,38,38,0.1)",
              border: "1px solid rgba(220,38,38,0.3)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all"
          style={{
            backgroundColor: loading ? "#8a6a2e" : "#d4a853",
            color: "#1a1208",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? "Submitting…" : "Submit Inquiry"}
        </button>

        <p className="text-xs text-center" style={{ color: "#8a7a60" }}>
          We&apos;ll respond within 24 hours. No payment required to inquire.
        </p>
      </form>
    </div>
  );
}
