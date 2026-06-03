import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rangeFromParams } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { buildStatement, MANUAL_KEYS } from "@/lib/pnl";
import { parseBonusConfig, computeBonus } from "@/lib/bonus";

const SETTINGS_KEY = "pnlEntries";
const SERVICE_ROLES = new Set(["SERVER", "HOST", "SERVER_ASSISTANT"]);

type SalesBucket = "food" | "appetizers" | "desserts" | "liquor" | "beer" | "wine" | "naBev";

function classifySales(name: string, station: string): SalesBucket {
  const n = name.toLowerCase();
  if (station === "BAR") {
    if (n.includes("wine")) return "wine";
    if (n.includes("beer") || n.includes("cider") || n.includes("seltzer")) return "beer";
    if (n.includes("n/a") || n.includes("non-alc") || n.includes("soda") || n.includes("coffee") || n.includes("tea") || n.includes("juice")) return "naBev";
    return "liquor"; // cocktails / spirits / default bar
  }
  if (n.includes("app") || n.includes("starter") || n.includes("small plate")) return "appetizers";
  if (n.includes("dessert") || n.includes("sweet")) return "desserts";
  if (n.includes("n/a") || n.includes("soda") || n.includes("coffee") || n.includes("tea") || n.includes("juice") || n.includes("beverage")) return "naBev";
  return "food";
}

async function loadManual(periodKey: string): Promise<Record<string, number>> {
  const row = await prisma.restaurantSettings.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return {};
  try {
    const all = JSON.parse(row.value) as Record<string, Record<string, number>>;
    return all[periodKey] ?? {};
  } catch { return {}; }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const tz = await getRestaurantTz();
  const { start, end, fromStr, toStr } = rangeFromParams(searchParams.get("from"), searchParams.get("to"), tz);
  const periodKey = `${fromStr}_${toStr}`;

  const [orders, clock, salariedStaff] = await Promise.all([
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        items: {
          select: {
            quantity: true, unitPrice: true, voided: true, comped: true,
            menuItem: {
              select: {
                category: { select: { name: true, station: true } },
                recipe: { select: { quantity: true, ingredient: { select: { costPerUnit: true } } } },
              },
            },
          },
        },
      },
      take: 20000,
    }),
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: start, lte: end } },
      select: { clockIn: true, clockOut: true, user: { select: { role: true, hourlyRate: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true, employmentType: "SALARY", annualSalary: { not: null } },
      select: { annualSalary: true },
    }),
  ]);

  const auto: Record<string, number> = {
    food: 0, appetizers: 0, desserts: 0, liquor: 0, beer: 0, wine: 0, naBev: 0,
    comps: 0, voids: 0, foodCost: 0, bevCost: 0,
    laborService: 0, laborBar: 0, laborKitchen: 0, salary: 0,
  };
  let guestCounts = 0;

  for (const o of orders) {
    guestCounts += 1;
    for (const it of o.items) {
      const line = Number(it.unitPrice) * it.quantity;
      const station = it.menuItem.category?.station ?? "KITCHEN";
      const recipeCost = it.menuItem.recipe.reduce(
        (s, ri) => s + Number(ri.quantity) * Number(ri.ingredient.costPerUnit), 0) * it.quantity;

      if (it.voided) { auto.voids += line; continue; }
      if (it.comped) { auto.comps += line; }
      else {
        auto[classifySales(it.menuItem.category?.name ?? "", station)] += line;
      }
      // COGS accrues on items actually served (comped included; voided excluded).
      if (station === "BAR") auto.bevCost += recipeCost; else auto.foodCost += recipeCost;
    }
  }

  const nowMs = Date.now();
  let laborHours = 0;
  for (const c of clock) {
    const end2 = c.clockOut ? c.clockOut.getTime() : nowMs;
    const hrs = Math.max(0, (end2 - c.clockIn.getTime()) / 3_600_000);
    const cost = hrs * Number(c.user.hourlyRate ?? 0);
    laborHours += hrs;
    const r = c.user.role;
    if (r === "BARTENDER") auto.laborBar += cost;
    else if (r === "KITCHEN") auto.laborKitchen += cost;
    else if (SERVICE_ROLES.has(r)) auto.laborService += cost;
    // MANAGER/ADMIN clock punches are POS-access only — not hourly labor. Their
    // pay is captured below as Management Salary (indirect, fixed).
  }

  // Management Salary — prorated from each salaried employee's annual pay across
  // the days in this period. Auto-derived so it never has to be typed in.
  const periodDays = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
  auto.salary = salariedStaff.reduce(
    (sum, s) => sum + (Number(s.annualSalary ?? 0) / 365) * periodDays, 0);

  const manual = await loadManual(periodKey);
  const values: Record<string, number> = { ...auto };
  for (const k of MANUAL_KEYS) values[k] = Number(manual[k] ?? 0);

  const rows = buildStatement(values);
  const netSales = rows.find((r) => r.key === "netSales")?.value ?? 0;
  values["m_guestCounts"] = guestCounts;
  values["m_laborHours"] = Math.round(laborHours * 10) / 10;
  values["m_ppa"] = guestCounts > 0 ? Math.round((netSales / guestCounts) * 100) / 100 : 0;

  // Manager bonus — profit-share on Performance Earnings BEFORE the bonus itself
  // (this first build has bonus = 0), gated at a monthly target, with a quality
  // scorecard modifier. Auto-fills the Management Bonus line.
  const bonusCfgRow = await prisma.restaurantSettings.findUnique({ where: { key: "managerBonus" } });
  const bonusConfig = parseBonusConfig(bonusCfgRow?.value);
  const val = (k: string) => rows.find((r) => r.key === k)?.value ?? 0;
  const peBeforeBonus = val("performanceEarnings");
  const costOfSales = val("costOfSales");
  const directLabor = val("totalDirectLabor");
  const grossSales = val("totalGrossSales");
  const monthlySalaryTotal = salariedStaff.reduce((s, u) => s + Number(u.annualSalary ?? 0) / 12, 0);
  const bonus = computeBonus({
    peBeforeBonus,
    periodDays,
    monthlySalaryTotal,
    metrics: {
      laborPct: netSales > 0 ? (directLabor / netSales) * 100 : 0,
      primePct: netSales > 0 ? ((costOfSales + directLabor) / netSales) * 100 : 0,
      compVoidPct: grossSales > 0 ? ((auto.comps + auto.voids) / grossSales) * 100 : 0,
    },
    config: bonusConfig,
  });
  values["bonus"] = bonus.bonus;

  // Re-resolve metrics + the bonus line into the row list.
  const final = buildStatement(values);
  return Response.json({ from: fromStr, to: toStr, periodKey, rows: final, bonus });
}

// POST { from, to, lineKey, amount } — save one manual line for the period.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { from, to, lineKey, amount } = await req.json() as { from?: string; to?: string; lineKey?: string; amount?: number };
  if (!from || !to || !lineKey || !MANUAL_KEYS.includes(lineKey)) {
    return Response.json({ error: "from, to, and a valid manual lineKey are required" }, { status: 400 });
  }
  const periodKey = `${from}_${to}`;

  const row = await prisma.restaurantSettings.findUnique({ where: { key: SETTINGS_KEY } });
  let all: Record<string, Record<string, number>> = {};
  if (row) { try { all = JSON.parse(row.value); } catch { all = {}; } }
  all[periodKey] = { ...(all[periodKey] ?? {}), [lineKey]: Number(amount) || 0 };

  await prisma.restaurantSettings.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(all) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(all) },
  });
  return Response.json({ ok: true });
}
