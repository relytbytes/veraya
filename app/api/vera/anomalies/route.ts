import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Vera anomaly detection — surfaces *unusual* patterns a threshold check misses:
//   1. Vendor price creep: an ingredient's unit cost drifting up across several
//      deliveries (sustained trend, not a one-off spike).
//   2. Comp/void outlier: a server whose comps+voids run well above the team.
// Deterministic statistics; no AI needed to detect (only to phrase, elsewhere).

export interface Anomaly {
  type: "PRICE_CREEP" | "COMP_OUTLIER";
  severity: "HIGH" | "MEDIUM";
  title: string;
  link: string;
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const ninetyAgo = new Date(Date.now() - 90 * 86400_000);
    const sevenAgo = new Date(Date.now() - 7 * 86400_000);

    const [pos, compVoidLogs] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { status: "RECEIVED", receivedAt: { gte: ninetyAgo } },
        include: {
          items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
          vendor: { select: { name: true } },
        },
        orderBy: { receivedAt: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { action: { in: ["VOID", "COMP"] }, createdAt: { gte: sevenAgo } },
        select: { amount: true, user: { select: { id: true, name: true } } },
      }),
    ]);

    const anomalies: Anomaly[] = [];

    // ── 1. Vendor price creep ──────────────────────────────────────────────────
    const series = new Map<string, { name: string; unit: string; points: { cost: number; vendor: string }[] }>();
    for (const po of pos) {
      if (!po.receivedAt) continue;
      for (const it of po.items) {
        const k = it.ingredient.id;
        if (!series.has(k)) series.set(k, { name: it.ingredient.name, unit: it.ingredient.unit, points: [] });
        series.get(k)!.points.push({ cost: Number(it.unitCost), vendor: po.vendor.name });
      }
    }
    for (const [, s] of series) {
      if (s.points.length < 3) continue;               // need a trend, not two points
      const first = s.points[0].cost;
      const last = s.points[s.points.length - 1].cost;
      if (first <= 0) continue;
      const pct = ((last - first) / first) * 100;
      // sustained upward drift: net rise ≥10% and the latest is the highest seen
      const isHigh = last >= Math.max(...s.points.map((p) => p.cost)) - 1e-9;
      if (pct >= 10 && isHigh) {
        anomalies.push({
          type: "PRICE_CREEP",
          severity: pct >= 25 ? "HIGH" : "MEDIUM",
          title: `${s.name} creeping up +${pct.toFixed(0)}% over ${s.points.length} deliveries (${fmt(first)} to ${fmt(last)}/${s.unit}) from ${s.points[s.points.length - 1].vendor}.`,
          link: "/purchasing",
        });
      }
    }

    // ── 2. Comp/void outlier ───────────────────────────────────────────────────
    const byUser = new Map<string, { name: string; total: number }>();
    for (const l of compVoidLogs) {
      const id = l.user?.id ?? "unknown";
      const name = l.user?.name ?? "Unknown";
      const e = byUser.get(id) ?? { name, total: 0 };
      e.total += Number(l.amount ?? 0);
      byUser.set(id, e);
    }
    const totals = [...byUser.values()];
    if (totals.length >= 3) {
      const mean = totals.reduce((s, u) => s + u.total, 0) / totals.length;
      for (const u of totals) {
        // well above the team and material in absolute terms
        if (mean > 0 && u.total >= mean * 2 && u.total >= 75) {
          anomalies.push({
            type: "COMP_OUTLIER",
            severity: u.total >= mean * 3 ? "HIGH" : "MEDIUM",
            title: `${u.name}'s comps and voids hit ${fmt(u.total)} this week, ${(u.total / mean).toFixed(1)}x the team average.`,
            link: "/reports",
          });
        }
      }
    }

    anomalies.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1));

    return Response.json(
      { anomalies: anomalies.slice(0, 4) },
      { headers: { "Cache-Control": "private, max-age=600, stale-while-revalidate=120" } },
    );
  } catch (err) {
    console.error("[/api/vera/anomalies]", (err as Error)?.message ?? err);
    return Response.json({ error: "anomalies_unavailable" }, { status: 503 });
  }
}
