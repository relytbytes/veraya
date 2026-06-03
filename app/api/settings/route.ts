import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DEFAULT_BONUS_CONFIG } from "@/lib/bonus";

const SETTING_DEFAULTS: Record<string, string> = {
  reservationCardPolicy: JSON.stringify({
    enabled: false,
    holdAmountCents: 2500,
    chargeOnNoShow: true,
    refundOnCancel: true,
    cancelHours: 24,
  }),
  managerBonus: JSON.stringify(DEFAULT_BONUS_CONFIG),
};

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.restaurantSettings.findMany();
  const map: Record<string, string> = {};
  // Apply defaults first, then overwrite with stored values
  for (const [key, val] of Object.entries(SETTING_DEFAULTS)) map[key] = val;
  for (const s of settings) map[s.key] = s.value;
  return Response.json(map);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Only admins and managers may change restaurant settings
  const role = session.user?.role as string | undefined;
  if (!role || !["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden — only managers can change settings" }, { status: 403 });
  }

  const body = await req.json() as Record<string, string>;

  await prisma.$transaction(
    Object.entries(body).map(([key, value]) =>
      prisma.restaurantSettings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  return Response.json({ ok: true });
}
