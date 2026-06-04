import { getRestaurantName } from "@/lib/sms";

/**
 * Reusable transactional email sender (Resend REST API — no SDK dependency).
 *
 * Never throws — returns a result object so callers can fire-and-forget guest
 * emails without breaking the surrounding request when email isn't configured.
 *
 * Env contract:
 *   RESEND_API_KEY  — required to actually send (no-ops without it)
 *   EMAIL_FROM      — optional "Name <addr@your-domain>"; must be a Resend-verified
 *                     domain in production. Defaults to Resend's shared sender,
 *                     which only delivers to your own account email (fine for tests).
 */

const DEFAULT_FROM = "Veraya <onboarding@resend.dev>";
const ACCENT = "#21A090";

export type EmailAttachment = { filename: string; content: string /* base64 */ };

export type EmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "no_recipient" | "not_configured" | "send_failed"; detail?: string };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(opts: {
  to: string | null | undefined;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}): Promise<EmailResult> {
  if (!opts.to || !opts.to.trim()) return { sent: false, reason: "no_recipient" };

  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not_configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [opts.to.trim()],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `${res.status}`);
      console.error("[email] send failed:", detail);
      return { sent: false, reason: "send_failed", detail };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id ?? "" };
  } catch (err) {
    const detail = (err as Error)?.message ?? String(err);
    console.error("[email] send failed:", detail);
    return { sent: false, reason: "send_failed", detail };
  }
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function fmtTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}
function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

function shell(restaurant: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
    <div style="max-width:480px;margin:0 auto;padding:24px 16px">
      <div style="text-align:center;margin-bottom:16px">
        <span style="font-size:20px;font-weight:800;color:#1c1917">${esc(restaurant)}</span>
      </div>
      <div style="background:#fff;border:1px solid #e7e5e4;border-radius:16px;padding:24px">
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#a8a29e;font-size:11px;margin-top:16px">Powered by Veraya</p>
    </div>
  </body></html>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function eventTicketEmail(order: {
  name: string;
  confirmationCode: string;
  amountPaidCents: number;
  items: { tierName: string; quantity: number; unitPriceCents: number }[];
  event: { name: string; date: string; startTime: string; endTime?: string | null; venue?: string | null; ticketMode: string };
}, ticketUrl: string): Promise<{ subject: string; html: string }> {
  const restaurant = await getRestaurantName();
  const deposit = order.event.ticketMode === "DEPOSIT";
  const rows = order.items.map((it) =>
    `<tr><td style="padding:4px 0;color:#78716c">${it.quantity} × ${esc(it.tierName)}</td><td style="padding:4px 0;text-align:right">${money(it.quantity * it.unitPriceCents)}</td></tr>`
  ).join("");
  const when = `${fmtDate(order.event.date)} · ${fmtTime12(order.event.startTime)}${order.event.endTime ? ` – ${fmtTime12(order.event.endTime)}` : ""}`;

  const html = shell(restaurant, `
    <h1 style="font-size:22px;margin:0 0 4px">You're confirmed${order.name ? `, ${esc(order.name.split(" ")[0])}` : ""}!</h1>
    <p style="color:#78716c;font-size:14px;margin:0 0 16px">${esc(order.event.name)}</p>
    <p style="font-size:14px;margin:0 0 4px">${esc(when)}</p>
    ${order.event.venue ? `<p style="font-size:14px;color:#78716c;margin:0 0 16px">${esc(order.event.venue)}</p>` : ""}
    <table style="width:100%;border-top:1px solid #f0eeec;border-bottom:1px solid #f0eeec;font-size:14px;margin:12px 0">
      ${rows}
      <tr><td style="padding:8px 0 0;font-weight:700">${deposit ? "Deposit paid" : "Total paid"}</td><td style="padding:8px 0 0;text-align:right;font-weight:700;color:${ACCENT}">${money(order.amountPaidCents)}</td></tr>
    </table>
    <div style="text-align:center;margin:20px 0 8px">
      <p style="font-size:12px;color:#78716c;margin:0 0 4px">Your entry code</p>
      <p style="font-size:30px;letter-spacing:6px;font-weight:800;margin:0">${esc(order.confirmationCode)}</p>
    </div>
    <div style="text-align:center;margin-top:16px">
      <a href="${ticketUrl}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px">View your ticket &amp; QR</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#a8a29e;margin-top:14px">Show your QR or entry code at check-in. Your QR is also attached.</p>
  `);

  return { subject: `Your tickets for ${order.event.name}`, html };
}

export async function reservationEmail(r: {
  name: string;
  date: string;
  time: string;
  partySize: number;
  confirmationCode?: string | null;
}): Promise<{ subject: string; html: string }> {
  const restaurant = await getRestaurantName();
  const html = shell(restaurant, `
    <h1 style="font-size:22px;margin:0 0 4px">Reservation confirmed${r.name ? `, ${esc(r.name.split(" ")[0])}` : ""}!</h1>
    <p style="color:#78716c;font-size:14px;margin:0 0 16px">We look forward to seeing you.</p>
    <table style="width:100%;border-top:1px solid #f0eeec;border-bottom:1px solid #f0eeec;font-size:14px;margin:12px 0">
      <tr><td style="padding:6px 0;color:#78716c">Date</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(fmtDate(r.date))}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Time</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(fmtTime12(r.time))}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Party</td><td style="padding:6px 0;text-align:right;font-weight:600">${r.partySize} ${r.partySize === 1 ? "guest" : "guests"}</td></tr>
    </table>
    ${r.confirmationCode ? `<p style="text-align:center;font-size:12px;color:#78716c;margin:16px 0 2px">Confirmation</p><p style="text-align:center;font-size:22px;letter-spacing:4px;font-weight:800;margin:0">${esc(r.confirmationCode)}</p>` : ""}
    <p style="text-align:center;font-size:12px;color:#a8a29e;margin-top:16px">Need to make a change? Just reply to this email or give us a call.</p>
  `);
  return { subject: `Your reservation at ${restaurant}`, html };
}

export async function reservationReminderEmail(r: {
  name: string;
  time: string;
  partySize: number;
}): Promise<{ subject: string; html: string }> {
  const restaurant = await getRestaurantName();
  const html = shell(restaurant, `
    <h1 style="font-size:22px;margin:0 0 4px">See you today${r.name ? `, ${esc(r.name.split(" ")[0])}` : ""}!</h1>
    <p style="color:#78716c;font-size:14px;margin:0 0 16px">A quick reminder about your reservation.</p>
    <table style="width:100%;border-top:1px solid #f0eeec;border-bottom:1px solid #f0eeec;font-size:14px;margin:12px 0">
      <tr><td style="padding:6px 0;color:#78716c">Time</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(fmtTime12(r.time))}</td></tr>
      <tr><td style="padding:6px 0;color:#78716c">Party</td><td style="padding:6px 0;text-align:right;font-weight:600">${r.partySize} ${r.partySize === 1 ? "guest" : "guests"}</td></tr>
    </table>
    <p style="text-align:center;font-size:12px;color:#a8a29e;margin-top:16px">Plans changed? Reply to this email or give us a call.</p>
  `);
  return { subject: `Reminder: your reservation at ${restaurant} today`, html };
}
