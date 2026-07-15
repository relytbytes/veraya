import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import twilio from "twilio";

// POST /api/sms/inbound — Twilio inbound-message webhook (2-way SMS).
//
// Matches the sender's phone to their most recent active reservation/waitlist
// today and acts on CONFIRM / CANCEL replies, responding with TwiML.
//
// SETUP: in the Twilio console, set this URL as the messaging webhook for your
// number and set TWILIO_AUTH_TOKEN in your environment.

async function verifyTwilioSignature(req: NextRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false; // no token configured → reject
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = req.url;
  const formData = await req.clone().formData();
  const params: Record<string, string> = {};
  formData.forEach((val, key) => { params[key] = String(val); });
  return twilio.validateRequest(authToken, signature, url, params);
}

function twiml(message: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}

/** Last 10 digits, for loose matching between stored phones and E.164 From. */
function digits10(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "").slice(-10);
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function POST(req: NextRequest) {
  const valid = await verifyTwilioSignature(req);
  if (!valid) return new Response("Forbidden", { status: 403 });

  let from = "", body = "";
  try {
    const form = await req.formData();
    from = String(form.get("From") ?? "");
    body = String(form.get("Body") ?? "").trim().toLowerCase();
  } catch {
    return twiml("");
  }
  const fromDigits = digits10(from);
  if (!fromDigits) return twiml("");

  const isCancel = /\b(cancel|leave|remove|no)\b/.test(body) || body === "c" || body === "n";
  const isConfirm = /\b(confirm|yes|here)\b/.test(body) || body === "y";

  // 1) Try today's active reservation for this number.
  const reservations = await prisma.reservation.findMany({
    where: { date: localToday(), status: { in: ["PENDING", "CONFIRMED"] }, phone: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, time: true, phone: true, tableId: true },
  });
  const res = reservations.find((r) => digits10(r.phone) === fromDigits);

  if (res) {
    if (isCancel) {
      await prisma.reservation.update({ where: { id: res.id }, data: { status: "CANCELLED", tableId: null } });
      publish({ scope: "floor", type: "reservation.updated", ids: [res.id] });
      return twiml(`Your reservation has been cancelled. We hope to see you another time, ${res.name.split(" ")[0]}.`);
    }
    if (isConfirm) {
      await prisma.reservation.update({ where: { id: res.id }, data: { status: "CONFIRMED" } });
      publish({ scope: "floor", type: "reservation.updated", ids: [res.id] });
      return twiml(`You're confirmed for ${res.time}. See you soon!`);
    }
    return twiml(`Reply CONFIRM to confirm your reservation, or CANCEL to release it.`);
  }

  // 2) Otherwise try an active waitlist entry (they may reply to "table ready").
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const waiting = await prisma.waitlist.findMany({
    where: { status: "WAITING", addedAt: { gte: today }, phone: { not: null } },
    orderBy: { addedAt: "desc" },
    select: { id: true, name: true, phone: true },
  });
  const w = waiting.find((e) => digits10(e.phone) === fromDigits);
  if (w && isCancel) {
    await prisma.waitlist.update({ where: { id: w.id }, data: { status: "LEFT" } });
    publish({ scope: "floor", type: "waitlist.updated", ids: [w.id] });
    return twiml(`You've been removed from the waitlist. Thanks for letting us know!`);
  }

  return twiml(`Thanks for your message! For help, please call the restaurant.`);
}
