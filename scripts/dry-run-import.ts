import { parseSalesCsv, importSalesHistory, clearImportedSales } from "../lib/sales-import";
import { computeDayForecast } from "../lib/forecast-day";

// End-to-end dry run of the real-sales-history import against the local dev DB.
// Builds a deliberately-messy Aloha-style CSV, imports it, runs the forecast on
// the imported data, then cleans up. Proves parse -> orders -> snapshots -> forecast.

function fmt(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; // M/D/YYYY (Aloha-ish)
}

function buildCsv(days: number): string {
  const rows: string[] = [];
  const today = new Date();
  let total = 0, n = 0;
  for (let i = days; i >= 1; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 1) { // closed Mondays -> $0 row, must be skipped
      rows.push(`${fmt(d)},$0.00,0,0`);
      continue;
    }
    const weekend = dow === 5 || dow === 6;
    const base = weekend ? 6800 : 4200;
    const trend = 1 + (days - i) / days * 0.12;            // slight growth over the window
    const jitter = 0.85 + Math.random() * 0.3;
    const sales = Math.round(base * trend * jitter * 100) / 100;
    const orders = Math.round(sales / 280);                // modest synthetic count (keeps the dry run fast)
    const covers = Math.round(orders * 2.3);
    // throw in $ + thousands commas to exercise number parsing
    const salesStr = `"$${sales.toLocaleString("en-US", { minimumFractionDigits: 2 })}"`;
    rows.push(`${fmt(d)},${salesStr},${orders},${covers}`);
    total += sales; n++;
  }
  // Aloha-style banner preamble + a trailing Total row that must be ignored.
  return [
    `"The Capital Grille - Store #4417"`,
    `"Sales Summary Report"`,
    ``,
    `Business Date,Net Sales,Guest Checks,Covers`,
    ...rows,
    `Total,"$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}",,`,
  ].join("\n");
}

async function main() {
  const tz = "America/Chicago";
  console.log("— clearing any prior imported data —");
  console.log(await clearImportedSales());

  const csv = buildCsv(120);
  console.log("\n— sample CSV (first 6 lines) —");
  console.log(csv.split("\n").slice(0, 6).join("\n"));

  const parsed = parseSalesCsv(csv);
  console.log("\n— parse —");
  console.log("detected:", parsed.detected, "| days:", parsed.byDate.size, "| skipped:", parsed.skipped, "| error:", parsed.error ?? "none");

  console.log("\n— import (creating orders + snapshots) —");
  const t0 = Date.now();
  const res = await importSalesHistory(parsed.byDate, tz);
  console.log(res, `(${Math.round((Date.now() - t0) / 1000)}s)`);

  console.log("\n— forecast on imported data —");
  const f = await computeDayForecast(new Date());
  console.log({
    projectedSales: f.projectedSales,
    projectedCovers: f.projectedCovers,
    baseSales: f.baseSales,
    sampleCount: f.sampleCount,
    confidence: f.confidence,
    trendPct: f.trendPct,
  });

  console.log("\n— cleanup —");
  console.log(await clearImportedSales());
  console.log("\n✓ dry run complete");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
