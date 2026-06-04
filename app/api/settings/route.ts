import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DEFAULT_BONUS_CONFIG } from "@/lib/bonus";
import { DEFAULT_FISCAL_CONFIG } from "@/lib/fiscal";

const SETTING_DEFAULTS: Record<string, string> = {
  reservationCardPolicy: JSON.stringify({
    enabled: false,
    holdAmountCents: 2500,
    chargeOnNoShow: true,
    refundOnCancel: true,
    cancelHours: 24,
  }),
  managerBonus: JSON.stringify(DEFAULT_BONUS_CONFIG),
  fiscalCalendar: JSON.stringify(DEFAULT_FISCAL_CONFIG),
  // Phone texted when a new event / private-party inquiry arrives. No-ops until
  // this is set AND Twilio env is configured — drop in the number any time.
  leadNotifyPhone: "",
  // Which dayparts the venue takes reservations for. Combined with the service
  // hours, drives bookable slots when no advanced reservationHours config exists.
  servedDayparts: JSON.stringify({ breakfast: true, lunch: true, dinner: true }),
  // Payroll: how often payroll runs and the overtime rule. Pay periods anchor to
  // the fiscal-year start unless payrollAnchor overrides it. Veraya produces a
  // gross-pay register for export — it does not calculate tax withholding.
  payrollCadence: "BIWEEKLY", // WEEKLY | BIWEEKLY | SEMIMONTHLY
  payrollAnchor: "", // YYYY-MM-DD; blank → derived from the fiscal calendar
  overtimeThresholdHours: "40", // weekly hours before overtime kicks in
  overtimeMultiplier: "1.5", // overtime pay multiplier
  // Auto-no-show sweep (#2): mark overdue, un-arrived bookings NO_SHOW after the
  // grace window. Off by default — a manager opts in.
  autoNoShowEnabled: "false",
  autoNoShowMinutes: "15",
  // Holiday closures / special hours (#11): JSON [{date,name,closed,open,close}].
  holidays: "[]",
  // Public self-serve waitlist join page (#6) — on by default (preserves the
  // existing in-house QR self-add); a manager can close it any time.
  publicWaitlistEnabled: "true",
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
