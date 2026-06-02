import { prisma } from "@/lib/prisma";

// Per-guest dining intelligence, computed from orders linked to a customer
// (Order.customerId). Powers the guest card, the per-guest tip record, and the
// pre-shift report. Vera turns the raw history into a few plain-language flags.

export interface GuestFlag {
  label: string;
  kind: "positive" | "watch" | "info";
}

export interface GuestInsights {
  customerId: string;
  visits: number;            // completed dine-in orders on record
  lastVisitAt: string | null;
  avgCheckCents: number;     // average completed-order total
  lifetimeSpendCents: number;
  avgDwellMins: number | null;
  favoriteItems: { name: string; count: number }[];
  // Tip record
  tippedOrders: number;
  avgTipPct: number | null;  // weighted: sum(tips)/sum(subtotals)
  lastTipPct: number | null;
  flags: GuestFlag[];
}

const TIP_GENEROUS = 22;
const TIP_LOW = 12;

export async function getGuestInsights(customerId: string): Promise<GuestInsights> {
  const [customer, orders] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { tags: true, visitCount: true } }),
    prisma.order.findMany({
      where: { customerId, status: "COMPLETED" },
      select: {
        subtotal: true, total: true, createdAt: true, closedAt: true,
        items: { where: { voided: false }, select: { quantity: true, menuItem: { select: { name: true } } } },
        payments: { select: { tip: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const tags = (customer?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const visits = orders.length;

  // Spend + dwell
  let lifetimeSpendCents = 0;
  const dwellMins: number[] = [];
  for (const o of orders) {
    lifetimeSpendCents += Math.round(Number(o.total) * 100);
    if (o.closedAt) {
      const mins = (new Date(o.closedAt).getTime() - new Date(o.createdAt).getTime()) / 60000;
      if (mins > 0 && mins < 600) dwellMins.push(mins);
    }
  }
  const avgCheckCents = visits ? Math.round(lifetimeSpendCents / visits) : 0;
  const avgDwellMins = dwellMins.length
    ? Math.round(dwellMins.reduce((a, b) => a + b, 0) / dwellMins.length)
    : null;

  // Favorite items
  const itemCounts = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      itemCounts.set(it.menuItem.name, (itemCounts.get(it.menuItem.name) ?? 0) + it.quantity);
    }
  }
  const favoriteItems = [...itemCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Tip record (weighted average over orders that carried a tip)
  let tipSum = 0, tipBaseSum = 0, tippedOrders = 0;
  let lastTipPct: number | null = null;
  for (const o of orders) {
    const tip = o.payments.reduce((s, p) => s + Number(p.tip), 0);
    const base = Number(o.subtotal);
    if (tip > 0 && base > 0) {
      tipSum += tip; tipBaseSum += base; tippedOrders += 1;
      if (lastTipPct === null) lastTipPct = Math.round((tip / base) * 100);
    }
  }
  const avgTipPct = tipBaseSum > 0 ? Math.round((tipSum / tipBaseSum) * 100) : null;

  // Flags — Vera's plain-language read on the guest.
  const flags: GuestFlag[] = [];
  if (tags.includes("VIP")) flags.push({ label: "VIP", kind: "positive" });
  if (visits >= 5) flags.push({ label: "Regular", kind: "positive" });
  else if (visits <= 1) flags.push({ label: "First-timer", kind: "info" });
  if (avgTipPct != null && tippedOrders >= 2) {
    if (avgTipPct >= TIP_GENEROUS) flags.push({ label: `Generous tipper (${avgTipPct}%)`, kind: "positive" });
    else if (avgTipPct < TIP_LOW) flags.push({ label: `Low tipper (${avgTipPct}%)`, kind: "watch" });
  }
  if (avgCheckCents >= 10000) flags.push({ label: "High spend", kind: "positive" });
  for (const t of tags) {
    if (/allerg/i.test(t)) flags.push({ label: t, kind: "watch" });
  }

  return {
    customerId,
    visits,
    lastVisitAt: orders[0]?.closedAt?.toISOString() ?? orders[0]?.createdAt?.toISOString() ?? null,
    avgCheckCents,
    lifetimeSpendCents,
    avgDwellMins,
    favoriteItems,
    tippedOrders,
    avgTipPct,
    lastTipPct,
    flags,
  };
}

/** Batch insights for many guests (pre-shift report). */
export async function getGuestInsightsBatch(customerIds: string[]): Promise<Map<string, GuestInsights>> {
  const ids = [...new Set(customerIds)].filter(Boolean);
  const results = await Promise.all(ids.map((id) => getGuestInsights(id)));
  return new Map(results.map((r) => [r.customerId, r]));
}
