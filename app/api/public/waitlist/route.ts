import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { sendSms, getRestaurantName } from "@/lib/sms";

const AVG_TURN_MINS = 45;

// GET /api/public/waitlist — whether public self-add is currently open (#6).
export async function GET() {
  const row = await prisma.restaurantSettings.findUnique({ where: { key: "publicWaitlistEnabled" } });
  return Response.json({ enabled: row?.value === "true" });
}

// POST /api/public/waitlist — guest self-add (no auth; reached via QR/link).
export async function POST(req: NextRequest) {
  try {
    // Public self-serve waitlisting is manager-gated (#6).
    const toggle = await prisma.restaurantSettings.findUnique({ where: { key: "publicWaitlistEnabled" } });
    if (toggle?.value !== "true") {
      return Response.json({ error: "Online waitlist is closed right now. Please see the host." }, { status: 403 });
    }

    const { name, partySize, phone } = (await req.json()) as {
      name?: string; partySize?: number; phone?: string;
    };
    if (!name?.trim() || !partySize || !phone?.trim()) {
      return Response.json({ error: "name, partySize and phone are required" }, { status: 400 });
    }
    const size = Number(partySize);

    // Link to a customer for CRM continuity (find-or-create by phone).
    let customerId: string | null = null;
    if (phone?.trim()) {
      const p = phone.trim();
      const existing = await prisma.customer.findUnique({ where: { phone: p } });
      customerId = existing ? existing.id : (await prisma.customer.create({ data: { name: name.trim(), phone: p } })).id;
    }

    const entry = await prisma.waitlist.create({
      data: { name: name.trim(), partySize: size, phone: phone?.trim() || null, customerId },
    });

    publish({ scope: "floor", type: "waitlist.created", ids: [entry.id] });

    // Position = how many WAITING parties are ahead (incl. this one), today.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ahead = await prisma.waitlist.count({
      where: { status: "WAITING", addedAt: { gte: today, lte: entry.addedAt } },
    });
    const fitting = await prisma.table.count({ where: { capacity: { gte: size } } });
    const estWaitMins = Math.ceil(ahead / Math.max(1, fitting)) * AVG_TURN_MINS;

    // Best-effort "you're on the list" text.
    if (entry.phone) {
      const restaurant = await getRestaurantName();
      await sendSms(
        entry.phone,
        `${restaurant}: you're on the waitlist, party of ${size}. You're #${ahead} in line (~${estWaitMins} min). We'll text when your table's ready.`,
      );
    }

    return Response.json({ id: entry.id, position: ahead, estWaitMins }, { status: 201 });
  } catch (err) {
    console.error("POST /api/public/waitlist:", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
