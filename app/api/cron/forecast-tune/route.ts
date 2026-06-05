import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { backtestSales, DEFAULT_PARAMS, type OrderLite, type ForecastParams } from "@/lib/forecast";
import { loadForecastParams, saveForecastParams } from "@/lib/forecast-params";

// POST/GET /api/cron/forecast-tune
//
// Self-tuning loop: backtest a grid of model parameters against the venue's own
// history and persist the set with the lowest error. Run nightly (after the
// snapshot cron) so the forecast re-tunes itself as seasonality shifts. Only
// adopts a new set if it beats the current one — never regresses.
//
// Auth: CRON_SECRET (?secret= / Bearer) OR a logged-in admin/manager session.

export const maxDuration = 120;

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const session = await auth();
  const sessionOk = !!session && ["ADMIN", "MANAGER"].includes((session.user as { role?: string })?.role ?? "");
  if (!((secret && provided === secret) || sessionOk)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const evalDays = Math.min(120, Math.max(14, Number(url.searchParams.get("evalDays") ?? 56)));
  const totalDays = evalDays + 84;
  const since = new Date(Date.now() - totalDays * 86400_000);

  const history = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: since } },
    select: { total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const orders: OrderLite[] = history.map((o) => ({ total: Number(o.total), createdAt: new Date(o.createdAt) }));

  // Need a reasonable amount of history before auto-tuning means anything.
  if (orders.length < 200) {
    return Response.json({ ok: false, reason: "insufficient_history", orders: orders.length }, { status: 200 });
  }

  const today = new Date();
  const targetDays: Date[] = [];
  for (let i = 1; i <= evalDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - i);
    targetDays.push(d);
  }

  // Grid search over the two parameters that move accuracy most.
  const decays = [1.0, 0.92, 0.85, 0.78, 0.7];
  const trends = [0, 0.15, 0.3, 0.45];
  const maxSamplesOpts = [6, 10, 16];

  let best: { params: ForecastParams; mape: number } | null = null;
  for (const decayPerWeek of decays)
    for (const trendBlend of trends)
      for (const maxSamples of maxSamplesOpts) {
        const p: ForecastParams = { ...DEFAULT_PARAMS, decayPerWeek, trendBlend, maxSamples };
        const r = backtestSales(orders, targetDays, p);
        if (r.model.n >= 8 && (best === null || r.model.mape < best.mape)) best = { params: p, mape: r.model.mape };
      }

  if (!best) return Response.json({ ok: false, reason: "no_valid_grid_point" }, { status: 200 });

  // Compare against the currently-active params; only adopt if strictly better.
  const current = await loadForecastParams();
  const currentScore = backtestSales(orders, targetDays, current).model.mape;
  const adopt = best.mape < currentScore - 0.01;

  // Preserve serviceLevel / avgPartySize / bookingShare from the active set
  // (those are tuned by waste/cover policy, not sales MAPE).
  const tuned: ForecastParams = {
    ...current,
    decayPerWeek: best.params.decayPerWeek,
    trendBlend: best.params.trendBlend,
    maxSamples: best.params.maxSamples,
  };
  if (adopt) await saveForecastParams(tuned);

  return Response.json({
    ok: true,
    adopted: adopt,
    bestMape: Math.round(best.mape * 10) / 10,
    currentMape: Math.round(currentScore * 10) / 10,
    params: adopt ? tuned : current,
    evalDays,
    ordersAnalyzed: orders.length,
  });
}

export const GET = handle;
export const POST = handle;
