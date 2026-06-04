import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookReservation, getDayAvailability } from "@/lib/reservations";
import { sendSms, getRestaurantName, reservationConfirmationMessage } from "@/lib/sms";
import { sendEmail, reservationEmail } from "@/lib/email";

// POST /api/public/reservations — public instant booking (auto-assigns a table)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, time, partySize, name, phone, email, notes, stripePaymentIntentId, cardLast4, cardBrand } = body as {
      date?: string;
      time?: string;
      partySize?: number;
      name?: string;
      phone?: string;
      email?: string;
      notes?: string;
      stripePaymentIntentId?: string;
      cardLast4?: string;
      cardBrand?: string;
    };

    if (!date || !time || !partySize || !name || !phone) {
      return Response.json(
        { error: "date, time, partySize, name and phone are required" },
        { status: 400 },
      );
    }

    // Card-on-file policy: if active, a card hold (PaymentIntent) is required.
    const policyRow = await prisma.restaurantSettings.findUnique({ where: { key: "reservationCardPolicy" } });
    let cardPolicy: { enabled: boolean; holdAmountCents: number } | null = null;
    if (policyRow) { try { cardPolicy = JSON.parse(policyRow.value); } catch {} }
    const cardRequired = cardPolicy?.enabled === true && !!process.env.STRIPE_SECRET_KEY;
    if (cardRequired && !stripePaymentIntentId) {
      return Response.json(
        { error: "card_required", holdAmountCents: cardPolicy?.holdAmountCents ?? 2500 },
        { status: 402 },
      );
    }

    const result = await bookReservation({
      date,
      time,
      partySize: Number(partySize),
      name,
      phone,
      email,
      notes,
      status: "CONFIRMED",
      autoAssign: true,
      requiresCard: cardRequired,
      cardHoldAmount: cardRequired ? (cardPolicy?.holdAmountCents ?? 2500) / 100 : null,
      stripePaymentIntentId,
      cardLast4,
      cardBrand,
    });

    if (!result.ok) {
      const msg =
        result.reason === "blocked"
          ? "That table is unavailable for the selected time. Please choose a different time."
          : result.reason === "pacing"
          ? "We're fully committed for that time. Please choose a different time."
          : "No tables available for that party size at this time. Please choose a different time.";
      return Response.json({ error: msg }, { status: 409 });
    }

    if (result.reservation.phone) {
      const restaurant = await getRestaurantName();
      await sendSms(result.reservation.phone, reservationConfirmationMessage(result.reservation, restaurant));
    }
    if (result.reservation.email) {
      const { subject, html } = await reservationEmail(result.reservation);
      await sendEmail({ to: result.reservation.email, subject, html });
    }

    return Response.json(result.reservation, { status: 201 });
  } catch (err) {
    console.error("POST /api/public/reservations:", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// GET /api/public/reservations?date=YYYY-MM-DD&partySize=N — per-slot availability
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const partySizeParam = searchParams.get("partySize");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  const partySize = partySizeParam ? Math.max(1, Number(partySizeParam)) : 1;
  const { slots } = await getDayAvailability(date, partySize);

  // Preserve the existing public contract: { time, available }
  return Response.json({
    date,
    partySize,
    slots: slots.map((s) => ({ time: s.time, available: s.available })),
  });
}
