import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendSms, smsConfigured, getRestaurantName, reservationReminderMessage } from "@/lib/sms";
import { sendEmail, emailConfigured, reservationReminderEmail } from "@/lib/email";
import { localDateStr } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

// POST (or GET) /api/cron/reservation-reminders
//
// Texts a day-of reminder to every active reservation for TODAY that has a phone
// and hasn't been reminded yet. Idempotent via reminderSentAt, so it's safe to
// run repeatedly (e.g. a scheduler hitting it once each morning).
//
// Auth: a CRON_SECRET (via `?secret=` or `Authorization: Bearer`) OR a logged-in
// session (so it can be triggered manually for testing).
async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret")
    ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorized = (secret && provided === secret) || !!(await auth());
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const today = localDateStr(new Date(), await getRestaurantTz());

  const due = await prisma.reservation.findMany({
    where: {
      date: today,
      status: { in: ["PENDING", "CONFIRMED"] },
      reminderSentAt: null,
      OR: [{ phone: { not: null } }, { email: { not: null } }],
    },
    select: { id: true, name: true, time: true, partySize: true, phone: true, email: true },
  });

  // Nothing to send through — bail before touching any reservations.
  if (!smsConfigured() && !emailConfigured()) {
    return Response.json({ ok: false, reason: "not_configured", candidates: due.length });
  }

  const restaurant = await getRestaurantName();
  let sent = 0, skipped = 0;
  for (const r of due) {
    let delivered = false;
    if (r.phone && smsConfigured()) {
      const res = await sendSms(r.phone, reservationReminderMessage(r, restaurant));
      if (res.sent) delivered = true;
    }
    if (r.email && emailConfigured()) {
      const { subject, html } = await reservationReminderEmail(r);
      const res = await sendEmail({ to: r.email, subject, html });
      if (res.sent) delivered = true;
    }
    if (delivered) {
      await prisma.reservation.update({ where: { id: r.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } else {
      skipped++;
    }
  }

  return Response.json({ ok: true, sent, skipped, candidates: due.length });
}

export const POST = handle;
export const GET = handle;
