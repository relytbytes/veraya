import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { backtestSales, DEFAULT_PARAMS, type OrderLite, type ForecastParams } from "@/lib/forecast";

// GET /api/vera/forecast/backtest
//
// Walk-forward evaluation of the demand model. For each recent day, forecast it
// using ONLY prior orders, compare to actual, and score MAPE/MAE/bias against a
// naive same-weekday mean. This is how we measure (and tune) forecast accuracy
// rather than guessing — the foundation for developing the model rigorously.
//
// Query params:
//   ?evalDays=N   how many recent days to score (default 56)
//   ?sweep=1      try a small grid of params and report the best
//   ?decay= &trendBlend= &maxSamples=   override individual params

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const evalDays = Math.min(120, Math.max(7, Number(url.searchParams.get("evalDays") ?? 56)));
  const sweep = url.searchParams.get("sweep") === "1";

  // Load enough history that even the oldest target day has same-weekday samples
  // before it: evaluation window + ~12 weeks of lead-in.
  const totalDays = evalDays + 84;
  const since = new Date(Date.now() - totalDays * 86400_000);

  const history = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: since } },
    select: { total: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const orders: OrderLite[] = history.map((o) => ({ total: Number(o.total), createdAt: new Date(o.createdAt) }));

  if (orders.length === 0) {
    return Response.json({ error: "no_history", message: "No completed orders to backtest. Seed simulated data first." }, { status: 200 });
  }

  // Target days = the most recent `evalDays` calendar days.
  const targetDays: Date[] = [];
  const today = new Date();
  for (let i = 1; i <= evalDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - i);
    targetDays.push(d);
  }

  // Param overrides for a single run.
  const override: ForecastParams = {
    ...DEFAULT_PARAMS,
    decayPerWeek: Number(url.searchParams.get("decay") ?? DEFAULT_PARAMS.decayPerWeek),
    trendBlend: Number(url.searchParams.get("trendBlend") ?? DEFAULT_PARAMS.trendBlend),
    maxSamples: Number(url.searchParams.get("maxSamples") ?? DEFAULT_PARAMS.maxSamples),
  };

  if (!sweep) {
    const report = backtestSales(orders, targetDays, override);
    return Response.json({
      evalDays,
      ordersAnalyzed: orders.length,
      model: report.model,
      naive: report.naive,
      improvementVsNaivePct: Math.round(report.improvementPct * 10) / 10,
      params: report.params,
    });
  }

  // Parameter sweep — model selection across a small grid, ranked by MAPE.
  const decays = [1.0, 0.9, 0.82, 0.7];
  const trends = [0, 0.25, 0.5];
  const grid: { decayPerWeek: number; trendBlend: number; mape: number; bias: number; n: number }[] = [];
  let best: { params: ForecastParams; mape: number } | null = null;
  for (const decayPerWeek of decays) {
    for (const trendBlend of trends) {
      const p: ForecastParams = { ...DEFAULT_PARAMS, decayPerWeek, trendBlend };
      const r = backtestSales(orders, targetDays, p);
      grid.push({ decayPerWeek, trendBlend, mape: Math.round(r.model.mape * 10) / 10, bias: Math.round(r.model.bias * 10) / 10, n: r.model.n });
      if (best === null || r.model.mape < best.mape) best = { params: p, mape: r.model.mape };
    }
  }
  grid.sort((a, b) => a.mape - b.mape);
  const naive = backtestSales(orders, targetDays, DEFAULT_PARAMS).naive;

  return Response.json({
    evalDays,
    ordersAnalyzed: orders.length,
    naiveMape: Math.round(naive.mape * 10) / 10,
    best: best ? { params: { decayPerWeek: best.params.decayPerWeek, trendBlend: best.params.trendBlend }, mape: Math.round(best.mape * 10) / 10 } : null,
    grid,
  });
}
