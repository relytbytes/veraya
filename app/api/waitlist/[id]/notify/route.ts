import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendSms, getRestaurantName, tableReadyMessage } from "@/lib/sms";

// POST /api/waitlist/[id]/notify — text a waiting guest that their table is ready.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.waitlist.findUnique({ where: { id } });
  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
  if (!entry.phone) return Response.json({ error: "No phone number on file" }, { status: 400 });

  const restaurant = await getRestaurantName();
  const result = await sendSms(entry.phone, tableReadyMessage(entry.name, restaurant));

  if (!result.sent) {
    const msg = result.reason === "not_configured"
      ? "SMS not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to .env.local."
      : "Could not send the text. Check the phone number.";
    return Response.json({ error: msg, reason: result.reason }, { status: 503 });
  }

  // Keep the guest on the WAITING list — they've been texted, not seated yet.
  return Response.json({ ok: true, sid: result.sid });
}
