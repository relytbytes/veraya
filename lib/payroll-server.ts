// Server-side payroll assembly: loads config + clock + tips from the DB, runs the
// pure register computation, and merges in any saved run (adjustments, or the
// frozen snapshot of a finalized run). Shared by the API and CSV-export routes.

import { prisma } from "@/lib/prisma";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { startOfLocalDay, endOfLocalDay } from "@/lib/time";
import {
  getPayrollConfig,
  payPeriodByIndex,
  payPeriodForDate,
  computePayrollLines,
  PERIODS_PER_YEAR,
  type PayrollConfig,
  type PayPeriod,
  type PayrollLineComputed,
} from "@/lib/payroll";

export interface RegisterLine extends PayrollLineComputed {
  lineId: string | null;
  adjustmentCents: number;
  adjustmentNote: string | null;
  netGrossCents: number; // grossPayCents + adjustmentCents
}

export interface RegisterTotals {
  employeeCount: number;
  regularHours: number;
  otHours: number;
  regularPayCents: number;
  otPayCents: number;
  salaryPayCents: number;
  tipsCents: number;
  adjustmentCents: number;
  grossPayCents: number; // net of adjustments
}

export interface Register {
  period: PayPeriod & { cadence: string };
  config: { otThresholdHours: number; otMultiplier: number; periodsPerYear: number };
  run: { id: string; status: string; notes: string | null; finalizedAt: string | null } | null;
  lines: RegisterLine[];
  totals: RegisterTotals;
}

async function loadConfig(): Promise<PayrollConfig> {
  const rows = await prisma.restaurantSettings.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return getPayrollConfig(map);
}

/** Resolve the target period: explicit signed index, else the period for today. */
async function resolvePeriod(cfg: PayrollConfig, index: number | null): Promise<PayPeriod> {
  if (index !== null && Number.isFinite(index)) return payPeriodByIndex(cfg, index);
  return payPeriodForDate(cfg, new Date());
}

/** Compute the live register lines for a period straight from the clock + tips. */
async function computeLive(period: PayPeriod, cfg: PayrollConfig): Promise<PayrollLineComputed[]> {
  const tz = await getRestaurantTz();
  const start = startOfLocalDay(period.start, tz);
  const end = endOfLocalDay(period.end, tz);

  const [employees, spans, tipRows] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, employmentType: true, hourlyRate: true, annualSalary: true },
    }),
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: start, lte: end } },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    prisma.tipDistribution.findMany({
      where: { tipPool: { date: { gte: period.start, lte: period.end } } },
      select: { userId: true, amount: true },
    }),
  ]);

  const tipsByUser = new Map<string, number>();
  for (const t of tipRows) tipsByUser.set(t.userId, (tipsByUser.get(t.userId) ?? 0) + Number(t.amount));

  return computePayrollLines(
    period,
    cfg,
    employees.map((e) => ({
      id: e.id, name: e.name, role: e.role as string,
      employmentType: e.employmentType, hourlyRate: e.hourlyRate != null ? Number(e.hourlyRate) : null,
      annualSalary: e.annualSalary != null ? Number(e.annualSalary) : null,
    })),
    spans.map((s) => ({ userId: s.userId, clockIn: s.clockIn, clockOut: s.clockOut })),
    tipsByUser,
    Date.now(),
  );
}

function emptyTotals(): RegisterTotals {
  return {
    employeeCount: 0, regularHours: 0, otHours: 0, regularPayCents: 0, otPayCents: 0,
    salaryPayCents: 0, tipsCents: 0, adjustmentCents: 0, grossPayCents: 0,
  };
}

function totalsOf(lines: RegisterLine[]): RegisterTotals {
  const t = emptyTotals();
  t.employeeCount = lines.length;
  for (const l of lines) {
    t.regularHours += l.regularHours;
    t.otHours += l.otHours;
    t.regularPayCents += l.regularPayCents;
    t.otPayCents += l.otPayCents;
    t.salaryPayCents += l.salaryPayCents;
    t.tipsCents += l.tipsCents;
    t.adjustmentCents += l.adjustmentCents;
    t.grossPayCents += l.netGrossCents;
  }
  t.regularHours = Math.round(t.regularHours * 100) / 100;
  t.otHours = Math.round(t.otHours * 100) / 100;
  return t;
}

/**
 * Build the register for a period. A FINALIZED run is served from its frozen line
 * snapshots; a DRAFT run recomputes live and overlays saved adjustments; with no
 * run, it's a pure live preview.
 */
export async function buildRegister(index: number | null): Promise<Register> {
  const cfg = await loadConfig();
  const period = await resolvePeriod(cfg, index);

  const run = await prisma.payrollRun.findUnique({
    where: { periodStart_periodEnd: { periodStart: period.start, periodEnd: period.end } },
    include: { lines: true },
  });

  let lines: RegisterLine[];
  if (run && run.status === "FINALIZED") {
    // Frozen snapshot — never recompute.
    lines = run.lines.map((l) => ({
      userId: l.userId, name: l.name, role: l.role, employmentType: l.employmentType,
      hourlyRateCents: l.hourlyRateCents,
      regularHours: l.regularHours, otHours: l.otHours, totalHours: Math.round((l.regularHours + l.otHours) * 100) / 100,
      regularPayCents: l.regularPayCents, otPayCents: l.otPayCents, salaryPayCents: l.salaryPayCents,
      tipsCents: l.tipsCents, grossPayCents: l.grossPayCents,
      lineId: l.id, adjustmentCents: l.adjustmentCents, adjustmentNote: l.adjustmentNote,
      netGrossCents: l.grossPayCents + l.adjustmentCents,
    }));
    lines.sort((a, b) => b.netGrossCents - a.netGrossCents || a.name.localeCompare(b.name));
  } else {
    const computed = await computeLive(period, cfg);
    const savedByUser = new Map((run?.lines ?? []).map((l) => [l.userId, l]));
    lines = computed.map((c) => {
      const saved = savedByUser.get(c.userId);
      const adjustmentCents = saved?.adjustmentCents ?? 0;
      return {
        ...c,
        lineId: saved?.id ?? null,
        adjustmentCents,
        adjustmentNote: saved?.adjustmentNote ?? null,
        netGrossCents: c.grossPayCents + adjustmentCents,
      };
    });
  }

  return {
    period: { ...period, cadence: cfg.cadence },
    config: { otThresholdHours: cfg.otThresholdHours, otMultiplier: cfg.otMultiplier, periodsPerYear: PERIODS_PER_YEAR[cfg.cadence] },
    run: run ? { id: run.id, status: run.status, notes: run.notes, finalizedAt: run.finalizedAt ? run.finalizedAt.toISOString() : null } : null,
    lines,
    totals: totalsOf(lines),
  };
}

/**
 * Persist (open) a DRAFT run for a period: create the run if absent, then snapshot
 * the live-computed lines, preserving any adjustments already entered. Returns the
 * run id. If `finalize` is set, the run is frozen (status FINALIZED).
 */
export async function openOrFinalizeRun(
  index: number,
  opts: { finalize: boolean; userId: string | null; notes?: string },
): Promise<{ runId: string; status: string }> {
  const cfg = await loadConfig();
  const period = payPeriodByIndex(cfg, index);
  const computed = await computeLive(period, cfg);

  const existing = await prisma.payrollRun.findUnique({
    where: { periodStart_periodEnd: { periodStart: period.start, periodEnd: period.end } },
    include: { lines: true },
  });
  const adjByUser = new Map((existing?.lines ?? []).map((l) => [l.userId, { cents: l.adjustmentCents, note: l.adjustmentNote }]));

  const runId = await prisma.$transaction(async (tx) => {
    const run = existing
      ? await tx.payrollRun.update({
          where: { id: existing.id },
          data: {
            status: opts.finalize ? "FINALIZED" : "DRAFT",
            cadence: cfg.cadence,
            notes: opts.notes ?? existing.notes,
            finalizedAt: opts.finalize ? new Date() : null,
            finalizedById: opts.finalize ? opts.userId : null,
          },
        })
      : await tx.payrollRun.create({
          data: {
            periodStart: period.start, periodEnd: period.end, cadence: cfg.cadence,
            status: opts.finalize ? "FINALIZED" : "DRAFT",
            notes: opts.notes ?? null,
            createdById: opts.userId,
            finalizedById: opts.finalize ? opts.userId : null,
            finalizedAt: opts.finalize ? new Date() : null,
          },
        });

    // Replace line snapshots with freshly computed ones (keep adjustments).
    await tx.payrollLine.deleteMany({ where: { runId: run.id } });
    if (computed.length) {
      await tx.payrollLine.createMany({
        data: computed.map((c) => {
          const adj = adjByUser.get(c.userId);
          return {
            runId: run.id, userId: c.userId, name: c.name, role: c.role,
            employmentType: c.employmentType, hourlyRateCents: c.hourlyRateCents,
            regularHours: c.regularHours, otHours: c.otHours,
            regularPayCents: c.regularPayCents, otPayCents: c.otPayCents,
            salaryPayCents: c.salaryPayCents, tipsCents: c.tipsCents,
            adjustmentCents: adj?.cents ?? 0, adjustmentNote: adj?.note ?? null,
            grossPayCents: c.grossPayCents,
          };
        }),
      });
    }
    return run.id;
  });

  return { runId, status: opts.finalize ? "FINALIZED" : "DRAFT" };
}

/**
 * Set a manager adjustment (bonus +, deduction −) on one employee's line. Ensures
 * a DRAFT run exists (opening it if needed) and refuses to edit a FINALIZED run.
 */
export async function setLineAdjustment(
  index: number,
  userId: string,
  adjustmentCents: number,
  adjustmentNote: string | null,
  actorId: string | null,
): Promise<{ ok: true } | { error: string; status: number }> {
  const cfg = await loadConfig();
  const period = payPeriodByIndex(cfg, index);

  const existing = await prisma.payrollRun.findUnique({
    where: { periodStart_periodEnd: { periodStart: period.start, periodEnd: period.end } },
  });
  if (existing?.status === "FINALIZED") {
    return { error: "Run is finalized — reopen it to edit adjustments.", status: 409 };
  }
  // Make sure the run + line snapshots exist before adjusting.
  if (!existing) await openOrFinalizeRun(index, { finalize: false, userId: actorId });

  const run = await prisma.payrollRun.findUnique({
    where: { periodStart_periodEnd: { periodStart: period.start, periodEnd: period.end } },
  });
  if (!run) return { error: "Could not open run", status: 500 };

  const line = await prisma.payrollLine.findUnique({
    where: { runId_userId: { runId: run.id, userId } },
  });
  if (!line) return { error: "No payroll line for that employee in this period", status: 404 };

  await prisma.payrollLine.update({
    where: { id: line.id },
    data: { adjustmentCents: Math.round(adjustmentCents), adjustmentNote: adjustmentNote || null },
  });
  return { ok: true };
}
