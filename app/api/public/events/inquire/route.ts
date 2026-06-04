import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// POST /api/public/events/inquire — a prospect asks to host / attend a private
// event. Creates an Event in INQUIRY status so it lands in the dashboard's
// Inquiries tab (no lead-chasing). Body:
//   { name, email, phone?, eventType?, date?, partySize?, message? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    name?: string; email?: string; phone?: string;
    eventType?: string; date?: string; partySize?: number; message?: string;
  };
  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!name || !email) {
    return Response.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const type = body.eventType?.trim() || "Private event";
  const today = new Date().toISOString().split("T")[0];
  const noteLines = [
    `Inbound inquiry via website.`,
    body.partySize ? `Party size: ~${body.partySize}` : null,
    body.date ? `Preferred date: ${body.date}` : null,
    body.message?.trim() ? `\n${body.message.trim()}` : null,
  ].filter(Boolean);

  const event = await prisma.event.create({
    data: {
      name: `${type} — ${name}`,
      date: body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today,
      startTime: "18:00",
      status: "INQUIRY",
      contactName: name,
      contactEmail: email,
      contactPhone: body.phone?.trim() || null,
      guestCount: body.partySize && body.partySize > 0 ? Math.round(body.partySize) : null,
      notes: noteLines.join("\n"),
    },
  });

  // Text the team so leads don't sit unseen. No-op until leadNotifyPhone is set
  // and Twilio is configured.
  const notify = await prisma.restaurantSettings.findUnique({ where: { key: "leadNotifyPhone" } });
  if (notify?.value?.trim()) {
    const who = body.partySize ? ` · ~${body.partySize} guests` : "";
    await sendSms(notify.value.trim(), `New event inquiry: ${type} from ${name}${who}. See it in Events → Inquiries.`).catch(() => {});
  }

  return Response.json({ ok: true, id: event.id }, { status: 201 });
}
