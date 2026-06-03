import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";
import type { PnlResolvedRow } from "@/lib/pnl";

// POST /api/reports/pnl/export — body { from, to, rows } → an .xlsx of the
// statement. Rows are sent from the client (already computed) so the export
// matches exactly what's on screen.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { from, to, rows } = await req.json() as { from?: string; to?: string; rows?: PnlResolvedRow[] };
  if (!rows?.length) return Response.json({ error: "rows required" }, { status: 400 });

  const indent = (n: number) => "  ".repeat(n);
  const aoa: (string | number)[][] = [
    ["Veraya — P&L Statement"],
    [`Period: ${from ?? ""} to ${to ?? ""}`],
    [],
    ["Line Item", "Amount", "% of Net Sales"],
  ];
  for (const r of rows) {
    if (r.kind === "header") { aoa.push([r.label]); continue; }
    if (r.kind === "metric") { aoa.push([r.label, r.value]); continue; }
    aoa.push([
      indent(r.indent) + r.label,
      Math.round(r.value * 100) / 100,
      r.pct != null ? `${(r.pct * 100).toFixed(1)}%` : "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 42 }, { wch: 16 }, { wch: 14 }];
  // Standard accounting format on the Amount column (B): negatives in red parentheses.
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && cell.t === "n") cell.z = '$#,##0.00;[Red]($#,##0.00)';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "P&L");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fname = `veraya-pnl-${from ?? "period"}_${to ?? ""}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
