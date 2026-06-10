import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { getBaselines } from "@/lib/vera-baselines";
import { snapshotDay } from "@/lib/vera-snapshot";

// POST /api/import/sales  { csv, clear? }
// Turns a restaurant's real daily-sales export (CSV) into the COMPLETED Order rows
// Vera's forecast + baselines + snapshots already read — so the whole intelligence
// layer runs on the venue's actual numbers instead of simulated data. Each imported
// day is materialized as orders spread across service hours (no line items; this is
// a sales-total import), then the learning snapshot is backfilled per day.
//
// Universal format: any POS can export "sales by day". We auto-detect the date and
// sales columns, plus optional order-count and covers columns.

export const maxDuration = 300;

const IMPORT_SOURCE = "IMPORT";
const DEFAULT_AVG_CHECK = 45;     // used to estimate order count when the CSV has none
const MAX_ORDERS_PER_DAY = 80;    // bound row count; daily total is always preserved
const ASSUME_LABOR_PCT = 0.28;    // realistic labor share so snapshot margins make sense

// ── tiny CSV + parsing helpers ─────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Parse common date formats to YYYY-MM-DD; returns null if unrecognized.
function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);            // M/D/YYYY or M/D/YY
  if (m) {
    let y = m[3]; if (y.length === 2) y = "20" + y;
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function pickColumn(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

// Bimodal lunch/dinner service-hour picker (so the intraday shape is plausible).
function serviceTime(dateStr: string): Date {
  const r = Math.random();
  // ~35% lunch (11–14), ~65% dinner (17–22)
  const hour = r < 0.35 ? 11 + Math.floor(Math.random() * 3) : 17 + Math.floor(Math.random() * 5);
  const min = Math.floor(Math.random() * 60);
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { csv, clear } = body as { csv?: string; clear?: boolean };
  const tz = await getRestaurantTz();

  // ── Clear previously-imported data ──
  if (clear) {
    const imported = await prisma.order.findMany({ where: { source: IMPORT_SOURCE }, select: { id: true, createdAt: true } });
    const ids = imported.map((o) => o.id);
    let snapshotsCleared = 0;
    if (ids.length) {
      const dates = [...new Set(imported.map((o) => o.createdAt.toISOString().slice(0, 10)))];
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      const del = await prisma.veraDaySnapshot.deleteMany({ where: { date: { in: dates } } });
      snapshotsCleared = del.count;
    }
    return Response.json({ cleared: ids.length, snapshotsCleared });
  }

  if (!csv || !csv.trim()) return Response.json({ error: "No CSV provided" }, { status: 400 });

  // ── Parse ──
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return Response.json({ error: "CSV needs a header row and at least one data row" }, { status: 400 });

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateCol = pickColumn(headers, [/business.?date/, /\bdate\b/, /\bday\b/]);
  const salesCol = pickColumn(headers, [/net.?sales/, /total.?sales/, /gross.?sales/, /net.?revenue/, /\bsales\b/, /\brevenue\b/, /\bnet\b/, /\btotal\b/, /\bamount\b/]);
  const ordersCol = pickColumn(headers, [/order.?count/, /\borders\b/, /\bchecks\b/, /transactions/, /\btickets\b/]);
  const coversCol = pickColumn(headers, [/\bcovers\b/, /\bguests\b/, /guest.?count/, /\bpax\b/]);

  if (dateCol < 0 || salesCol < 0) {
    return Response.json({
      error: `Couldn't find a date column and a sales column. Detected headers: ${headers.join(", ")}. Need one column with a date and one with daily sales (e.g. "Date", "Net Sales").`,
    }, { status: 400 });
  }

  // Aggregate by date (in case a POS exports multiple rows per day).
  const byDate = new Map<string, { sales: number; orders: number; covers: number }>();
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const date = parseDate(cells[dateCol]);
    const sales = num(cells[salesCol]);
    if (!date || sales == null || sales <= 0) { skipped++; continue; }
    const prev = byDate.get(date) ?? { sales: 0, orders: 0, covers: 0 };
    prev.sales += sales;
    prev.orders += (ordersCol >= 0 ? num(cells[ordersCol]) ?? 0 : 0);
    prev.covers += (coversCol >= 0 ? num(cells[coversCol]) ?? 0 : 0);
    byDate.set(date, prev);
  }

  if (byDate.size === 0) {
    return Response.json({ error: "No valid rows found. Check the date and sales columns." }, { status: 400 });
  }

  // ── Materialize orders per day ──
  type OrderData = Parameters<typeof prisma.order.create>[0]["data"];
  const taxRate = await (async () => {
    const s = await prisma.restaurantSettings.findUnique({ where: { key: "taxRate" } });
    return s ? Number(s.value) / 100 : 0.0875;
  })();

  const dates = [...byDate.keys()].sort();
  const todayStr = new Date().toISOString().slice(0, 10);
  let created = 0;
  let totalSales = 0;

  for (const date of dates) {
    const { sales, orders } = byDate.get(date)!;
    totalSales += sales;
    let count = orders > 0 ? Math.round(orders) : Math.max(1, Math.round(sales / DEFAULT_AVG_CHECK));
    count = Math.min(count, MAX_ORDERS_PER_DAY);
    const perOrder = sales / count;

    const dayOrders: OrderData[] = [];
    let allocated = 0;
    for (let i = 0; i < count; i++) {
      // Last order absorbs rounding so the day sums exactly to the imported total.
      const total = i === count - 1 ? Math.round((sales - allocated) * 100) / 100 : Math.round(perOrder * 100) / 100;
      allocated += total;
      const subtotal = Math.round((total / (1 + taxRate)) * 100) / 100;
      const tax = Math.round((total - subtotal) * 100) / 100;
      const at = serviceTime(date);
      dayOrders.push({
        status: "COMPLETED", type: "DINE_IN", source: IMPORT_SOURCE,
        subtotal, tax, total,
        notes: "[IMPORT]",
        createdAt: at, updatedAt: at, closedAt: at,
      });
    }
    const BATCH = 100;
    for (let b = 0; b < dayOrders.length; b += BATCH) {
      await Promise.all(dayOrders.slice(b, b + BATCH).map((data) => prisma.order.create({ data })));
    }
    created += dayOrders.length;
  }

  // ── Backfill learning snapshots (real margins train the weights) ──
  let snapshotsCreated = 0;
  try {
    const baselines = await getBaselines(new Date(), tz);
    for (const date of dates) {
      if (date >= todayStr) continue; // today isn't a completed day
      try {
        await snapshotDay(date, tz, { baselines, assumeLaborPct: ASSUME_LABOR_PCT });
        snapshotsCreated++;
      } catch { /* one bad day shouldn't sink the import */ }
    }
  } catch { /* snapshots are best-effort */ }

  return Response.json({
    created,
    days: dates.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    totalSales: Math.round(totalSales * 100) / 100,
    snapshotsCreated,
    skipped,
    detected: {
      date: headers[dateCol], sales: headers[salesCol],
      orders: ordersCol >= 0 ? headers[ordersCol] : null,
      covers: coversCol >= 0 ? headers[coversCol] : null,
    },
  });
}
