import { prisma } from "@/lib/prisma";

/**
 * Reusable SMS sender (Twilio). Mirrors the env contract already used by
 * /api/shifts/handoff/send: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 *
 * Never throws — returns a result object so callers can fire-and-forget guest
 * texts without breaking the surrounding request when SMS isn't configured.
 */

const RESTAURANT_FALLBACK = "our restaurant";

export function normalizePhone(to: string): string {
  return to.trim().replace(/[^\d+]/g, "").replace(/^([^+])/, "+1$1");
}

export type SmsResult =
  | { sent: true; sid: string }
  | { sent: false; reason: "no_phone" | "not_configured" | "send_failed"; detail?: string };

export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms(to: string | null | undefined, body: string): Promise<SmsResult> {
  if (!to || !to.trim()) return { sent: false, reason: "no_phone" };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return { sent: false, reason: "not_configured" };

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    const msg = await client.messages.create({ body, from: fromNumber, to: normalizePhone(to) });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    const detail = (err as Error)?.message ?? String(err);
    console.error("[sms] send failed:", detail);
    return { sent: false, reason: "send_failed", detail };
  }
}

export async function getRestaurantName(): Promise<string> {
  try {
    const row = await prisma.restaurantSettings.findUnique({ where: { key: "restaurantName" } });
    return row?.value?.trim() || RESTAURANT_FALLBACK;
  } catch {
    return RESTAURANT_FALLBACK;
  }
}

// ── Message templates ───────────────────────────────────────────────────────

function fmtTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function tableReadyMessage(name: string, restaurant: string): string {
  return `Hi ${name.split(" ")[0]}, your table at ${restaurant} is ready! Please see the host stand. Thanks for waiting.`;
}

export function reservationConfirmationMessage(r: { name: string; date: string; time: string; partySize: number }, restaurant: string): string {
  const d = new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${restaurant}: your reservation for ${r.partySize} is confirmed on ${d} at ${fmtTime12(r.time)}. Reply to this number with questions. See you soon!`;
}

export function reservationReminderMessage(r: { name: string; time: string; partySize: number }, restaurant: string): string {
  return `Reminder from ${restaurant}: we look forward to seeing you today at ${fmtTime12(r.time)} for your party of ${r.partySize}. Reply CANCEL if your plans changed.`;
}
