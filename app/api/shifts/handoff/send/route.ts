import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import type { HandoffDigest } from "../route";

// POST /api/shifts/handoff/send
// Body: { to: string; digest: HandoffDigest }
//
// Formats the handoff digest as an SMS and sends it via Twilio.
// Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return Response.json(
        { error: "SMS not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to your .env.local." },
        { status: 503 }
      );
    }

    const body = await req.json() as { to?: string; digest?: HandoffDigest };
    const { to, digest } = body;

    if (!to || !digest) {
      return Response.json({ error: "Missing `to` or `digest`" }, { status: 400 });
    }

    // Normalize phone — strip everything but digits and leading +
    const phone = to.trim().replace(/[^\d+]/g, "").replace(/^([^+])/, "+1$1");

    const text = formatSMS(digest);

    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    const message = await client.messages.create({
      body: text,
      from: fromNumber,
      to: phone,
    });

    return Response.json({ ok: true, sid: message.sid });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[/api/shifts/handoff/send]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ── SMS formatter ──────────────────────────────────────────────────────────

function formatSMS(d: HandoffDigest): string {
  const lines: string[] = [];

  const from = new Date(d.period.from).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const to   = new Date(d.period.to).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  lines.push(`🍽️ SHIFT HANDOFF (${from}–${to})`);
  lines.push("");

  // Narrative (truncated to keep SMS reasonable)
  const narrative = d.narrative.length > 300
    ? d.narrative.slice(0, 297) + "..."
    : d.narrative;
  lines.push(narrative);

  // Watch-for items
  if (d.watchFor.length > 0) {
    lines.push("");
    lines.push("⚡ WATCH FOR:");
    for (const w of d.watchFor) {
      lines.push(`• ${w}`);
    }
  }

  // Sales snapshot
  lines.push("");
  lines.push(`💰 Revenue: $${d.sales.total.toFixed(2)} | ${d.sales.orderCount} orders | avg $${d.sales.avgCheck.toFixed(2)}`);

  // Staff on floor
  if (d.labor.clockedIn.length > 0) {
    lines.push(`👥 On floor: ${d.labor.clockedIn.map(c => c.name).join(", ")}`);
  }

  // 86'd
  if (d.kitchen.eightySixed.length > 0) {
    lines.push(`🚫 86'd: ${d.kitchen.eightySixed.map(e => e.item).join(", ")}`);
  }

  // Upcoming reservations
  if (d.reservations.upcoming.length > 0) {
    lines.push(`📅 Upcoming: ${d.reservations.upcoming.map(r => `${r.time} ${r.name} (${r.partySize})`).join(" | ")}`);
  }

  return lines.join("\n");
}
