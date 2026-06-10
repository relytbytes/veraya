import { prisma } from "@/lib/prisma";
import { getBaselines } from "@/lib/vera-baselines";
import { snapshotDay } from "@/lib/vera-snapshot";

// Core of the real-sales-history import: parse a POS daily-sales CSV and
// materialize it into the COMPLETED Order rows + learning snapshots Vera reads.
// Kept separate from the route so it can be unit/dry-run tested against a real DB.

export const IMPORT_SOURCE = "IMPORT";
const DEFAULT_AVG_CHECK = 45;
const MAX_ORDERS_PER_DAY = 80;
const ASSUME_LABOR_PCT = 0.28;

export interface ParsedSales {
  byDate: Map<string, { sales: number; orders: number; covers: number }>;
  detected: { date: string; sales: string; orders: string | null; covers: string | null } | null;
  skipped: number;
  error?: string;
}

// Split a delimited line, honoring quotes and "" escapes.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { out.push(cur); cur = ""; }
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

// Parse common date formats to YYYY-MM-DD; null if unrecognized.
function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim().replace(/^"|"$/g, "");
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);          // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);      // M/D/YYYY, M-D-YYYY, M/D/YY
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  return null;
}

function pickColumn(headers: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

const DATE_PATS = [/business.?date/, /\bdate\b/, /\bday\b/];
const SALES_PATS = [/net.?sales/, /total.?sales/, /gross.?sales/, /net.?revenue/, /\bsales\b/, /\brevenue\b/, /\bnet\b/, /\btotal\b/, /\bamount\b/];
const ORDER_PATS = [/order.?count/, /\borders\b/, /\bchecks\b/, /transactions/, /\btickets\b/, /guest.?checks/];
const COVER_PATS = [/\bcovers\b/, /\bguests\b/, /guest.?count/, /\bpax\b/];

export function parseSalesCsv(raw: string): ParsedSales {
  const empty: ParsedSales = { byDate: new Map(), detected: null, skipped: 0 };
  if (!raw || !raw.trim()) return { ...empty, error: "No CSV provided" };

  // Strip a UTF-8 byte-order mark (Excel loves to add one).
  const text = raw.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ...empty, error: "CSV needs a header row and at least one data row" };

  // Auto-detect the delimiter from the busiest of comma / semicolon / tab.
  const sample = lines.slice(0, 5).join("\n");
  const counts: Record<string, number> = { ",": (sample.match(/,/g) || []).length, ";": (sample.match(/;/g) || []).length, "\t": (sample.match(/\t/g) || []).length };
  const delim = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) || ",";

  // Find the header row: the first line where we can locate both a date and a
  // sales column. This skips a store-name banner / preamble Aloha often emits.
  let headerIdx = -1, dateCol = -1, salesCol = -1, ordersCol = -1, coversCol = -1, headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const h = splitLine(lines[i], delim).map((x) => x.toLowerCase());
    const dc = pickColumn(h, DATE_PATS), sc = pickColumn(h, SALES_PATS);
    if (dc >= 0 && sc >= 0) {
      headerIdx = i; headers = h; dateCol = dc; salesCol = sc;
      ordersCol = pickColumn(h, ORDER_PATS); coversCol = pickColumn(h, COVER_PATS);
      break;
    }
  }
  if (headerIdx < 0) {
    const first = splitLine(lines[0], delim).join(", ");
    return { ...empty, error: `Couldn't find a date column and a sales column. First row read as: ${first}. Need one column with a date and one with daily sales (e.g. "Date", "Net Sales").` };
  }

  const byDate = new Map<string, { sales: number; orders: number; covers: number }>();
  let skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const date = parseDate(cells[dateCol]);
    const sales = num(cells[salesCol]);
    // A "Total" / banner / blank row has no parseable date or no positive sales — skip it.
    if (!date || sales == null || sales <= 0) { skipped++; continue; }
    const prev = byDate.get(date) ?? { sales: 0, orders: 0, covers: 0 };
    prev.sales += sales;
    prev.orders += ordersCol >= 0 ? num(cells[ordersCol]) ?? 0 : 0;
    prev.covers += coversCol >= 0 ? num(cells[coversCol]) ?? 0 : 0;
    byDate.set(date, prev);
  }

  return {
    byDate, skipped,
    detected: {
      date: headers[dateCol], sales: headers[salesCol],
      orders: ordersCol >= 0 ? headers[ordersCol] : null,
      covers: coversCol >= 0 ? headers[coversCol] : null,
    },
    error: byDate.size === 0 ? "No valid rows found. Check the date and sales columns." : undefined,
  };
}

// Bimodal lunch/dinner service-hour timestamp (plausible intraday shape).
function serviceTime(dateStr: string): Date {
  const r = Math.random();
  const hour = r < 0.35 ? 11 + Math.floor(Math.random() * 3) : 17 + Math.floor(Math.random() * 5);
  const min = Math.floor(Math.random() * 60);
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
}

async function getTaxRate(): Promise<number> {
  const s = await prisma.restaurantSettings.findUnique({ where: { key: "taxRate" } });
  return s ? Number(s.value) / 100 : 0.0875;
}

export interface ImportResult {
  created: number;
  days: number;
  dateRange?: { from: string; to: string };
  totalSales: number;
  snapshotsCreated: number;
}

// Materialize parsed days into orders, then backfill learning snapshots.
export async function importSalesHistory(
  byDate: Map<string, { sales: number; orders: number; covers: number }>,
  tz: string,
): Promise<ImportResult> {
  type OrderData = Parameters<typeof prisma.order.create>[0]["data"];
  const taxRate = await getTaxRate();
  const dates = [...byDate.keys()].sort();
  const todayStr = new Date().toISOString().slice(0, 10);
  let created = 0, totalSales = 0;

  for (const date of dates) {
    const { sales, orders } = byDate.get(date)!;
    totalSales += sales;
    let count = orders > 0 ? Math.round(orders) : Math.max(1, Math.round(sales / DEFAULT_AVG_CHECK));
    count = Math.min(count, MAX_ORDERS_PER_DAY);
    const perOrder = sales / count;

    const dayOrders: OrderData[] = [];
    let allocated = 0;
    for (let i = 0; i < count; i++) {
      const total = i === count - 1 ? Math.round((sales - allocated) * 100) / 100 : Math.round(perOrder * 100) / 100;
      allocated += total;
      const subtotal = Math.round((total / (1 + taxRate)) * 100) / 100;
      const tax = Math.round((total - subtotal) * 100) / 100;
      const at = serviceTime(date);
      dayOrders.push({ status: "COMPLETED", type: "DINE_IN", source: IMPORT_SOURCE, subtotal, tax, total, notes: "[IMPORT]", createdAt: at, updatedAt: at, closedAt: at });
    }
    const BATCH = 100;
    for (let b = 0; b < dayOrders.length; b += BATCH) {
      await Promise.all(dayOrders.slice(b, b + BATCH).map((data) => prisma.order.create({ data })));
    }
    created += dayOrders.length;
  }

  let snapshotsCreated = 0;
  try {
    const baselines = await getBaselines(new Date(), tz);
    for (const date of dates) {
      if (date >= todayStr) continue;
      try { await snapshotDay(date, tz, { baselines, assumeLaborPct: ASSUME_LABOR_PCT }); snapshotsCreated++; } catch { /* skip a bad day */ }
    }
  } catch { /* best effort */ }

  return { created, days: dates.length, dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : undefined, totalSales: Math.round(totalSales * 100) / 100, snapshotsCreated };
}

export async function clearImportedSales(): Promise<{ cleared: number; snapshotsCleared: number }> {
  const imported = await prisma.order.findMany({ where: { source: IMPORT_SOURCE }, select: { id: true, createdAt: true } });
  const ids = imported.map((o) => o.id);
  if (!ids.length) return { cleared: 0, snapshotsCleared: 0 };
  const dates = [...new Set(imported.map((o) => o.createdAt.toISOString().slice(0, 10)))];
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  const del = await prisma.veraDaySnapshot.deleteMany({ where: { date: { in: dates } } });
  return { cleared: ids.length, snapshotsCleared: del.count };
}
