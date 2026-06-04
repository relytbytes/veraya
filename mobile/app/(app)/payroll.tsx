import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { getPayroll, type PayrollLineRow } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", SERVER: "Server", HOST: "Host",
  BARTENDER: "Bartender", BARBACK: "Barback", SERVER_ASSISTANT: "Server Asst", FOOD_RUNNER: "Food Runner",
};
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (h: number) => h.toFixed(2);

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    FINALIZED: { bg: "#0e3a2f", fg: "#34d399", label: "Finalized" },
    DRAFT: { bg: "#3a300e", fg: "#fbbf24", label: "Draft" },
  };
  const s = status ? map[status] : null;
  const v = s ?? { bg: C.surfaceHi, fg: C.smoke, label: "Not started" };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: v.bg }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: v.fg }}>{v.label}</Text>
    </View>
  );
}

function EmployeeRow({ l }: { l: PayrollLineRow }) {
  const isSalary = l.employmentType === "SALARY";
  return (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 14, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{l.name}</Text>
          <Text style={{ fontSize: 12, color: C.smoke, marginTop: 1 }}>
            {ROLE_LABELS[l.role] ?? l.role} · {isSalary ? "Salary" : `${money(l.hourlyRateCents)}/hr`}
          </Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: C.gold }}>{money(l.netGrossCents)}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {!isSalary && <Chip label="Reg" value={`${hrs(l.regularHours)}h`} />}
        {l.otHours > 0 && <Chip label="OT" value={`${hrs(l.otHours)}h`} accent={C.ember} />}
        {!isSalary && <Chip label="Reg pay" value={money(l.regularPayCents)} />}
        {l.otPayCents > 0 && <Chip label="OT pay" value={money(l.otPayCents)} accent={C.ember} />}
        {isSalary && <Chip label="Salary" value={money(l.salaryPayCents)} />}
        {l.tipsCents > 0 && <Chip label="Tips" value={money(l.tipsCents)} accent={C.jade} />}
        {l.adjustmentCents !== 0 && <Chip label="Adj" value={money(l.adjustmentCents)} accent={l.adjustmentCents < 0 ? C.coral : C.jade} />}
      </View>
    </View>
  );
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceHi, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: accent ?? C.mist }}>{value}</Text>
    </View>
  );
}

export default function PayrollScreen() {
  const router = useRouter();
  const { refreshing, run } = useManualRefresh();
  const [index, setIndex] = useState<number | null>(null);

  const q = useQuery({ queryKey: ["payroll", index], queryFn: () => getPayroll(index) });
  const data = q.data;

  // Anchor the local index to the server-resolved current period on first load.
  useEffect(() => {
    if (index === null && data?.period) setIndex(data.period.index);
  }, [index, data]);

  const forbidden = q.error instanceof Error && /403|forbidden/i.test(q.error.message);

  function step(dir: number) {
    if (data?.period) setIndex(data.period.index + dir);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }} edges={["top"]}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={C.gold} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: C.pearl }}>Payroll</Text>
          <Text style={{ fontSize: 11, color: C.smoke }}>Gross-pay register · export from the web app</Text>
        </View>
      </View>

      {forbidden ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="lock-closed-outline" size={36} color={C.smoke} />
          <Text style={{ color: C.mist, fontSize: 15, fontWeight: "600", marginTop: 12 }}>Managers only</Text>
          <Text style={{ color: C.smoke, fontSize: 13, marginTop: 4, textAlign: "center" }}>Payroll is restricted to admins and managers.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(() => q.refetch())} tintColor={C.gold} />}
        >
          {/* Period stepper */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 }}>
            <TouchableOpacity onPress={() => step(-1)} disabled={!data} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.surfaceHi }}>
              <Ionicons name="chevron-back" size={18} color={C.mist} />
            </TouchableOpacity>
            <View style={{ alignItems: "center", flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: C.pearl }}>{data?.period.label ?? "—"}</Text>
                <StatusBadge status={data?.run?.status} />
              </View>
              {data && (
                <Text style={{ fontSize: 11, color: C.smoke, marginTop: 2 }}>
                  {data.config.otMultiplier}× OT over {data.config.otThresholdHours} hrs/wk
                  {index !== null && index !== 0 ? "  ·  " : ""}
                  {index !== null && index !== 0 ? <Text onPress={() => setIndex(null)} style={{ color: C.gold }}>Current</Text> : null}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => step(1)} disabled={!data} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.surfaceHi }}>
              <Ionicons name="chevron-forward" size={18} color={C.mist} />
            </TouchableOpacity>
          </View>

          {q.isLoading ? (
            <View style={{ paddingVertical: 60, alignItems: "center" }}><ActivityIndicator color={C.gold} /></View>
          ) : data && data.lines.length > 0 ? (
            <>
              {/* Totals summary */}
              <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 14, padding: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: C.smoke }}>{data.totals.employeeCount} employee{data.totals.employeeCount === 1 ? "" : "s"}</Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: C.gold }}>{money(data.totals.grossPayCents)}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: C.rim, marginVertical: 12 }} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <SummaryCell label="Reg hours" value={hrs(data.totals.regularHours)} />
                  <SummaryCell label="OT hours" value={hrs(data.totals.otHours)} accent={data.totals.otHours > 0 ? C.ember : undefined} />
                  <SummaryCell label="Reg + OT" value={money(data.totals.regularPayCents + data.totals.otPayCents)} />
                  <SummaryCell label="Salary" value={money(data.totals.salaryPayCents)} />
                  <SummaryCell label="Tips" value={money(data.totals.tipsCents)} accent={C.jade} />
                  <SummaryCell label="Adjustments" value={money(data.totals.adjustmentCents)} />
                </View>
              </View>

              {data.lines.map((l) => <EmployeeRow key={l.userId} l={l} />)}

              <Text style={{ fontSize: 11, color: C.smoke, lineHeight: 16, paddingHorizontal: 4 }}>
                Tips are shown for reporting only and are not part of gross pay. Open, finalize, and export this register from the web app under Team → Payroll.
              </Text>
            </>
          ) : (
            <View style={{ paddingVertical: 60, alignItems: "center", gap: 8 }}>
              <Ionicons name="time-outline" size={32} color={C.smoke} />
              <Text style={{ color: C.mist, fontSize: 14, fontWeight: "600" }}>No hours this period</Text>
              <Text style={{ color: C.smoke, fontSize: 12 }}>Clock entries will appear here.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ minWidth: "30%", flexGrow: 1, backgroundColor: C.surfaceHi, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "800", color: accent ?? C.pearl, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
