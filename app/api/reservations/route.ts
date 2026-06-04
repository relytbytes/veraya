import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { bookReservation } from "@/lib/reservations";
import { sendSms, getRestaurantName, reservationConfirmationMessage } from "@/lib/sms";
import { publish } from "@/lib/realtime";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const customerId = searchParams.get("customerId");
  const q = searchParams.get("q")?.trim();

  // Search mode: find reservations by guest name / phone / email across dates.
  if (q) {
    // Phone numbers are stored unformatted, so "602-569" must match on digits
    // only — otherwise punctuation makes phone search silently return nothing.
    const digits = q.replace(/\D/g, "");
    const phoneOr = digits.length >= 3
      ? [{ phone: { contains: digits } }, { customer: { is: { phone: { contains: digits } } } }]
      : [];
    const reservations = await prisma.reservation.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { customer: { is: { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] } } },
          ...phoneOr,
        ],
      },
      orderBy: [{ date: "desc" }, { time: "desc" }],
      take: 50,
      include: { table: true, customer: { select: { id: true, name: true, phone: true, email: true, birthday: true, notes: true, tags: true, visitCount: true, lastVisitAt: true, loyaltyPoints: true } } },
    });
    return Response.json(reservations);
  }

  // Customer history mode: return all reservations for a specific customer
  if (customerId) {
    const reservations = await prisma.reservation.findMany({
      where: { customerId },
      orderBy: [{ date: "desc" }, { time: "desc" }],
      include: { table: true, customer: { select: { id: true, name: true, phone: true, email: true, birthday: true, notes: true, tags: true, visitCount: true, lastVisitAt: true, loyaltyPoints: true } } },
    });
    return Response.json(reservations);
  }

  let where: { date: string } | { date: { gte: string; lte: string } };
  if (from && to) {
    where = { date: { gte: from, lte: to } };
  } else {
    const nd = new Date();
    const localToday = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
    const date = searchParams.get("date") ?? localToday;
    where = { date };
  }

  const reservations = await prisma.reservation.findMany({
    where,
    orderBy: [{ date: "asc" }, { time: "asc" }],
    include: { table: true, customer: { select: { id: true, name: true, phone: true, email: true, birthday: true, notes: true, tags: true, visitCount: true, lastVisitAt: true, loyaltyPoints: true } } },
  });

  return Response.json(reservations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, time, partySize, name, phone, email, tableId, notes, customerId,
          stripePaymentIntentId, cardLast4, cardBrand } = body as {
    date?: string; time?: string; partySize?: number; name?: string;
    phone?: string; email?: string; tableId?: string; notes?: string; customerId?: string;
    stripePaymentIntentId?: string; cardLast4?: string; cardBrand?: string;
  };

  if (!date || !time || !partySize || !name || !phone) {
    return Response.json(
      { error: "date, time, partySize, name and phone are required" },
      { status: 400 }
    );
  }

  // Check reservationCardPolicy setting
  const cardPolicySetting = await prisma.restaurantSettings.findUnique({
    where: { key: "reservationCardPolicy" },
  });
  let cardPolicy: { enabled: boolean; holdAmountCents: number; chargeOnNoShow: boolean; refundOnCancel: boolean; cancelHours: number } | null = null;
  if (cardPolicySetting) {
    try { cardPolicy = JSON.parse(cardPolicySetting.value); } catch { /* ignore */ }
  }

  const policyEnabled = cardPolicy?.enabled === true;
  const holdAmountCents = cardPolicy?.holdAmountCents ?? 2500;

  // If card policy is enabled and no payment intent provided, require card
  if (policyEnabled && !stripePaymentIntentId) {
    return Response.json(
      { error: "card_required", holdAmountCents },
      { status: 402 }
    );
  }

  // Atomic create with overlap/block conflict checks. When tableId is omitted the
  // reservation is created unassigned (staff assign a table later from the host stand).
  const result = await bookReservation({
    date, time, partySize, name, phone, email, notes,
    status: "PENDING",
    tableId: tableId || null,
    customerId: customerId || null,
    requiresCard: policyEnabled,
    cardHoldAmount: policyEnabled ? holdAmountCents / 100 : null,
    stripePaymentIntentId, cardLast4, cardBrand,
  });

  if (!result.ok) {
    const msg = result.reason === "blocked"
      ? "Table is blocked for that period"
      : result.reason === "pacing"
      ? "Cover limit reached for that time — booking would exceed the pacing cap."
      : "That table is already booked for an overlapping time. Pick another table or time.";
    return Response.json({ error: msg }, { status: 409 });
  }

  publish({ scope: "floor", type: "reservation.created", ids: [result.reservation.id] });

  // Best-effort confirmation text (no-ops gracefully if SMS isn't configured).
  if (result.reservation.phone) {
    const restaurant = await getRestaurantName();
    await sendSms(result.reservation.phone, reservationConfirmationMessage(result.reservation, restaurant));
  }

  return Response.json(result.reservation, { status: 201 });
}
