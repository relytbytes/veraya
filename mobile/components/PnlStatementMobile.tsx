import { View, Text, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getPnlStatement, type PnlRow } from "@/lib/api";
import { C } from "@/lib/theme";

// Accounting format: 2 decimals, negatives in parentheses.
function money(n: number) {
  const v = "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
}
const pctTxt = (p: number | null) => (p == null ? "" : `${(p * 100).toFixed(1)}%`);

/** Full line-item operating statement — mirrors the web Reports → P&L statement. */
export function PnlStatementMobile({ from, to }: { from: string; to: string }) {
  const q = useQuery({
    queryKey: ["pnl-statement", from, to],
    queryFn: () => getPnlStatement(from, to),
  });

  if (q.isLoading) {
    return <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color={C.gold} /></View>;
  }
  if (!q.data) {
    return <Text style={{ textAlign: "center", color: C.smoke, paddingVertical: 32 }}>No P&L data for this period</Text>;
  }

  const rows = q.data.rows ?? [];
  const bonus = q.data.bonus;
  const metrics = rows.filter((r) => r.kind === "metric");
  const statement = rows.filter((r) => r.kind !== "metric");

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: C.pearl }}>P&L Statement</Text>
        <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }}>Auto-filled from POS, labor &amp; recipes</Text>
      </View>

      {/* Manager bonus pool */}
      {bonus?.enabled && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: `${C.gold}12`, borderBottomWidth: 1, borderBottomColor: C.rim }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: C.gold, letterSpacing: 1, textTransform: "uppercase" }}>Manager Bonus Pool</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: C.gold }}>{money(bonus.bonus)}</Text>
          </View>
          {bonus.bonus > 0 ? (
            <Text style={{ fontSize: 11, color: C.mist, marginTop: 3 }}>
              Over target {money(bonus.overage)} · base {money(bonus.rawBonus)}
              {bonus.modifier !== 1 ? ` · scorecard ×${bonus.modifier.toFixed(2)}` : ""}{bonus.capped ? " · capped" : ""}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: C.smoke, marginTop: 3 }}>
              Earnings {money(bonus.peBeforeBonus)} are below the {money(bonus.target)} target — none accrued yet.
            </Text>
          )}
        </View>
      )}

      {/* Metrics strip */}
      {metrics.length > 0 && (
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.rim }}>
          {metrics.map((m, i) => (
            <View key={m.key} style={{ flex: 1, padding: 10, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: C.rim }}>
              <Text style={{ fontSize: 9, color: C.smoke, textTransform: "uppercase", letterSpacing: 0.6 }}>{m.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl, marginTop: 2 }}>
                {m.key === "m_ppa" ? money(m.value) : m.value.toLocaleString("en-US")}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Line items */}
      <View>
        {statement.map((r) => <Row key={r.key} r={r} />)}
      </View>
    </View>
  );
}

function Row({ r }: { r: PnlRow }) {
  if (r.kind === "header") {
    return (
      <View style={{ backgroundColor: C.void, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        <Text style={{ fontSize: 10, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>{r.label}</Text>
      </View>
    );
  }

  const emphasize = r.kind === "subtotal" && r.emphasize;
  const isSub = r.kind === "subtotal";
  const neg = r.value < 0;
  const labelColor = emphasize ? C.pearl : isSub ? C.pearl : C.mist;
  const valueColor = neg ? C.coral : emphasize ? C.pearl : isSub ? C.pearl : C.mist;

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingVertical: emphasize ? 9 : 6,
      paddingLeft: 16 + (r.indent ?? 0) * 12,
      borderTopWidth: emphasize ? 1 : 0, borderTopColor: C.rim,
      backgroundColor: emphasize ? `${C.gold}0A` : "transparent",
    }}>
      <Text style={{ flex: 1, fontSize: emphasize ? 13 : 12.5, fontWeight: emphasize || isSub ? "700" : "400", color: labelColor }}>
        {r.label}
      </Text>
      {r.pct != null && (
        <Text style={{ fontSize: 11, color: C.smoke, width: 52, textAlign: "right", marginRight: 8 }}>{pctTxt(r.pct)}</Text>
      )}
      <Text style={{ fontSize: emphasize ? 14 : 12.5, fontWeight: emphasize || isSub ? "700" : "500", color: valueColor, fontVariant: ["tabular-nums"] }}>
        {money(r.value)}
      </Text>
    </View>
  );
}
