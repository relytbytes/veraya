import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildRegister } from "@/lib/payroll-server";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", SERVER: "Server", HOST: "Host",
  BARTENDER: "Bartender", BARBACK: "Barback", SERVER_ASSISTANT: "Server Assistant",
  FOOD_RUNNER: "Food Runner",
};

const money = (c: number) => (c / 100).toFixed(2);
const hrs = (h: number) => h.toFixed(2);

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// GET /api/payroll/export?index=<signed period index> → CSV download of the register.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user?.role as string | undefined;
  if (!role || !["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const indexParam = new URL(req.url).searchParams.get("index");
  const index = indexParam !== null && indexParam.trim() !== "" ? Number(indexParam) : null;
  const reg = await buildRegister(index);

  const headers = [
    "Employee", "Role", "Type", "Rate", "Reg Hours", "OT Hours",
    "Reg Pay", "OT Pay", "Salary", "Tips", "Adjustment", "Adj Note", "Gross Pay",
  ];
  const rows = reg.lines.map((l) => [
    l.name,
    ROLE_LABELS[l.role] ?? l.role,
    l.employmentType === "SALARY" ? "Salary" : "Hourly",
    money(l.hourlyRateCents),
    hrs(l.regularHours),
    hrs(l.otHours),
    money(l.regularPayCents),
    money(l.otPayCents),
    money(l.salaryPayCents),
    money(l.tipsCents),
    money(l.adjustmentCents),
    l.adjustmentNote ?? "",
    money(l.netGrossCents),
  ]);
  const totals = [
    "TOTAL", "", "", "",
    hrs(reg.totals.regularHours), hrs(reg.totals.otHours),
    money(reg.totals.regularPayCents), money(reg.totals.otPayCents),
    money(reg.totals.salaryPayCents), money(reg.totals.tipsCents),
    money(reg.totals.adjustmentCents), "", money(reg.totals.grossPayCents),
  ];

  const meta = [
    `Payroll Register,${reg.period.label}`,
    `Period,${reg.period.start} to ${reg.period.end}`,
    `Status,${reg.run?.status ?? "DRAFT (unsaved)"}`,
    `Overtime,${reg.config.otMultiplier}x over ${reg.config.otThresholdHours} hrs/week`,
    "",
  ];

  const lines = [
    ...meta,
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map((c) => csvEscape(String(c))).join(",")),
    totals.map(csvEscape).join(","),
  ];
  const csv = lines.join("\n");

  const filename = `payroll_${reg.period.start}_${reg.period.end}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
