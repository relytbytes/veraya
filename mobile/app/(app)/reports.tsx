import { useState, useMemo, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Animated, Modal } from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getSalesReport, getLaborReport, getFoodCostReport, getCogsReport, getBevCostReport, getPriceHistory, getVarianceReport, getSettings,
  type SalesReport, type LaborReport, type FoodCostReport, type CogsReport, type BevCostItem, type PriceHistoryReport, type VarianceReport,
} from "@/lib/api";
import {
  getFiscalPeriods, getFiscalQuarters, getFiscalYearRange, findFiscalPeriod, fmtShort,
  parseFiscalConfig, DEFAULT_FISCAL_CONFIG, type FiscalConfig,
} from "@/lib/fiscal";
import { C, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { PnlStatementMobile } from "@/components/PnlStatementMobile";

function toYMD(d: Date): string { return d.toISOString().slice(0, 10); }

type RangeKey = "today" | "week" | "month" | "lastMonth";

function getRange(key: RangeKey): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (key) {
    case "today": { const s = toYMD(new Date(y, m, d)); return { from: s, to: s, label: "Today" }; }
    case "week": { const day = now.getDay(); const mon = new Date(y, m, d - ((day + 6) % 7)); return { from: toYMD(mon), to: toYMD(now), label: "This Week" }; }
    case "month": return { from: toYMD(new Date(y, m, 1)), to: toYMD(now), label: "This Month" };
    case "lastMonth": { const first = new Date(y, m - 1, 1); const last = new Date(y, m, 0); return { from: toYMD(first), to: toYMD(last), label: "Last Month" }; }
  }
}

function fmt$(n: number) {
  // Standard accounting format: negatives in parentheses, e.g. ($505.00).
  const v = "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `(${v})` : v;
}
function fmtK(n: number) {
  if (Math.abs(n) < 1000) return fmt$(n);
  const v = "$" + (Math.abs(n) / 1000).toFixed(1) + "k";
  return n < 0 ? `(${v})` : v;
}
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function hourLabel(h: number) { if (h === 0) return "12a"; if (h < 12) return `${h}a`; if (h === 12) return "12p"; return `${h - 12}p`; }

function foodCostColor(pct: number): string {
  if (pct < 28) return C.jade;
  if (pct < 35) return C.ember;
  return C.coral;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const accent = !!color;
  return (
    <View style={{
      flex: 1, borderRadius: 16, padding: 16, gap: 4,
      backgroundColor: accent ? (color + "22") : C.surface,
      borderWidth: 1, borderColor: accent ? (color + "44") : C.rim,
    }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "700", color: color ?? C.pearl }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: C.mist }}>{sub}</Text> : null}
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 16, marginBottom: 8 }}>
      {title}
    </Text>
  );
}

function BarRow({ label, value, max, sub, last, barColor = C.gold }: { label: string; value: number; max: number; sub?: string; last?: boolean; barColor?: string }) {
  const pct = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.rim }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flex: 1, marginRight: 8 }}>{label}</Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{fmtK(value)}</Text>
          {sub ? <Text style={{ fontSize: 10, color: C.mist }}>{sub}</Text> : null}
        </View>
      </View>
      <View style={{ height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct * 100}%`, backgroundColor: barColor, borderRadius: 2 }} />
      </View>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
      <Ionicons name="bar-chart-outline" size={32} color={C.smoke} />
      <Text style={{ color: C.mist, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
      {children}
    </View>
  );
}

function SalesTab({ data, isLoading, laborData }: { data: SalesReport | undefined; isLoading: boolean; laborData: LaborReport | undefined }) {
  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data) return <EmptyState message="No sales data for this period" />;

  const laborPct = laborData && data.totalRevenue > 0 ? (laborData.totalLaborCost / data.totalRevenue) * 100 : null;
  const topHours = [...data.revenueByHour].filter((h) => h.orders > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 7);
  const maxHourRev = topHours[0]?.revenue ?? 1;
  const topItems = data.topItems.slice(0, 5);
  const maxItemRev = topItems[0]?.revenue ?? 1;

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Revenue" value={fmtK(data.totalRevenue)} color={C.jade} />
        <StatCard label="Orders" value={String(data.totalOrders)} sub={`avg ${fmt$(data.avgOrderValue)}`} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Tips" value={fmtK(data.totalTips)} color={C.gold} />
        {laborPct !== null ? <StatCard label="Labor %" value={fmtPct(laborPct)} sub="of revenue" color={C.sky} /> : <View style={{ flex: 1 }} />}
      </View>
      {topHours.length > 0 && (<><SectionLabel title="Peak Hours" /><Card>{topHours.map((h, i) => <BarRow key={h.hour} label={hourLabel(h.hour)} value={h.revenue} max={maxHourRev} sub={`${h.orders} orders`} last={i === topHours.length - 1} />)}</Card></>)}
      {topItems.length > 0 && (<><SectionLabel title="Top Menu Items" /><Card>{topItems.map((item, i) => <BarRow key={item.menuItemId} label={item.name} value={item.revenue} max={maxItemRev} sub={`×${item.count}`} last={i === topItems.length - 1} />)}</Card></>)}
      {data.revenueByCategory.length > 0 && (
        <>
          <SectionLabel title="By Category" />
          <Card>
            {data.revenueByCategory.map((cat, i) => (
              <View key={cat.categoryId} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < data.revenueByCategory.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{cat.name}</Text>
                  <Text style={{ fontSize: 11, color: C.mist }}>{cat.count} items sold</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.gold }}>{fmt$(cat.revenue)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function LaborTab({ data, isLoading, salesData }: { data: LaborReport | undefined; isLoading: boolean; salesData: SalesReport | undefined }) {
  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data) return <EmptyState message="No labor data for this period" />;

  const laborPct = salesData && salesData.totalRevenue > 0 ? (data.totalLaborCost / salesData.totalRevenue) * 100 : null;
  const maxCost = data.byEmployee[0]?.cost ?? 1;

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Total Hours" value={data.totalHours.toFixed(1)} color={C.sky} />
        <StatCard label="Labor Cost" value={fmtK(data.totalLaborCost)} />
      </View>
      {laborPct !== null && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <StatCard label="Labor %" value={fmtPct(laborPct)} sub="of revenue" color={laborPct > 35 ? C.coral : laborPct > 28 ? C.ember : C.jade} />
          <View style={{ flex: 1 }} />
        </View>
      )}
      {data.byEmployee.length > 0 ? (
        <>
          <SectionLabel title="By Employee" />
          <Card>
            {data.byEmployee.map((emp, i) => (
              <View key={emp.userId} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < data.byEmployee.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{emp.name}</Text>
                    <Text style={{ fontSize: 11, color: C.mist, textTransform: "capitalize" }}>{emp.role.toLowerCase()}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{fmt$(emp.cost)}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>{emp.hours.toFixed(1)} hrs</Text>
                  </View>
                </View>
                <View style={{ height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${Math.max(0.02, emp.cost / maxCost) * 100}%`, backgroundColor: C.sky, borderRadius: 2 }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : <EmptyState message="No clock entries in this period" />}
    </>
  );
}

function FoodCostTab({ data, isLoading }: { data: FoodCostReport | undefined; isLoading: boolean }) {
  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data) return <EmptyState message="No food cost data for this period" />;
  const maxCost = data.byIngredient[0]?.cost ?? 1;
  const fcColor = foodCostColor(data.foodCostPct);

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Food Cost" value={fmtK(data.totalFoodCost)} color={fcColor} />
        <StatCard label="Food Cost %" value={fmtPct(data.foodCostPct)} sub="of revenue" color={fcColor} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Wasted" value={fmtK(data.wastedCost)} color={data.wastedCost > 0 ? C.coral : C.mist} />
        <View style={{ flex: 1 }} />
      </View>
      {data.byIngredient.length > 0 ? (
        <>
          <SectionLabel title="By Ingredient" />
          <Card>
            {data.byIngredient.map((ing, i) => (
              <View key={ing.ingredientId} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < data.byIngredient.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{ing.name}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>
                      Used: {ing.usedQty} {ing.unit}{ing.wastedQty > 0 ? `  ·  Wasted: ${ing.wastedQty} ${ing.unit}` : ""}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{fmt$(ing.cost)}</Text>
                </View>
                <View style={{ height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${Math.max(0.02, ing.cost / maxCost) * 100}%`, backgroundColor: C.coral, borderRadius: 2 }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : <EmptyState message="No inventory usage recorded in this period" />}
    </>
  );
}

function CogsTab({ data, isLoading }: { data: CogsReport | undefined; isLoading: boolean }) {
  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data) return <EmptyState message="No P&L data for this period" />;

  function delta(curr: number, prev: number) {
    if (prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }
  function DeltaBadge({ curr, prev, invert = false }: { curr: number; prev: number; invert?: boolean }) {
    const d = delta(curr, prev);
    if (d === null) return null;
    const good = invert ? d < 0 : d > 0;
    return (
      <Text style={{ fontSize: 10, color: good ? C.jade : C.coral, fontWeight: "700" }}>
        {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%
      </Text>
    );
  }

  // Safely coerce API numbers — any field could be undefined/null if no data exists
  const n = (v: unknown) => Number(v ?? 0);

  const cogsPct    = n(data.cogsPercent);
  const grossMgn   = n(data.grossMargin);
  const opMgn      = n(data.operatingMargin);
  const revenue    = n(data.revenue);
  const prevRev    = n(data.prevRevenue);
  const prevCOGS   = n(data.prevCOGS);
  const prevGrossMgn  = n(data.prevGrossMargin);
  const prevOpMgn     = n(data.prevOperatingMargin);
  const grossProfit   = n(data.grossProfit);
  const opIncome      = n(data.operatingIncome);

  const cogsColor   = cogsPct > 35 ? C.coral : cogsPct > 28 ? C.ember : C.jade;
  const marginColor = grossMgn > 65 ? C.jade : grossMgn > 55 ? C.ember : C.coral;
  const opColor     = opMgn > 15 ? C.jade : opMgn > 5 ? C.ember : C.coral;

  return (
    <>
      {/* KPI grid */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: C.rim }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Revenue</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: C.jade }}>{fmtK(revenue)}</Text>
          <DeltaBadge curr={revenue} prev={prevRev} />
        </View>
        <View style={{ flex: 1, backgroundColor: cogsColor + "18", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: cogsColor + "33" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>COGS %</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: cogsColor }}>{fmtPct(cogsPct)}</Text>
          <DeltaBadge curr={cogsPct} prev={prevCOGS > 0 && prevRev > 0 ? (prevCOGS / prevRev) * 100 : 0} invert />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <View style={{ flex: 1, backgroundColor: marginColor + "18", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: marginColor + "33" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Gross Margin</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: marginColor }}>{fmtPct(grossMgn)}</Text>
          <DeltaBadge curr={grossMgn} prev={prevGrossMgn} />
        </View>
        <View style={{ flex: 1, backgroundColor: opColor + "18", borderRadius: 16, padding: 14, gap: 4, borderWidth: 1, borderColor: opColor + "33" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Operating Margin</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: opColor }}>{fmtPct(opMgn)}</Text>
          <DeltaBadge curr={opMgn} prev={prevOpMgn} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Gross Profit" value={fmtK(grossProfit)} />
        <StatCard label="Operating Income" value={fmtK(opIncome)} />
      </View>

      {/* Category breakdown */}
      {(data.categoryBreakdown ?? []).length > 0 && (
        <>
          <SectionLabel title="COGS by Category" />
          <Card>
            {data.categoryBreakdown.map((cat, i) => {
              const catCostPct = n(cat.costPct);
              const catColor = catCostPct > 35 ? C.coral : catCostPct > 28 ? C.ember : C.jade;
              return (
                <View key={cat.category} style={{
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: i < data.categoryBreakdown.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                  flexDirection: "row", alignItems: "center", gap: 10,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{cat.category}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>COGS {fmt$(n(cat.cogs))}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: catColor }}>{fmtPct(catCostPct)}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>{fmt$(n(cat.revenue))} rev</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}

      {/* Daily P&L */}
      {(data.dailyPL ?? []).length > 0 && (
        <>
          <SectionLabel title="Daily P&L" />
          <Card>
            {data.dailyPL.slice(-14).map((day, i, arr) => {
              const gp = n(day.grossProfit);
              const gpColor = gp >= 0 ? C.jade : C.coral;
              return (
                <View key={day.date} style={{
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                  flexDirection: "row", alignItems: "center", gap: 8,
                }}>
                  <Text style={{ fontSize: 12, color: C.mist, width: 44 }}>
                    {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.pearl, flex: 1 }}>{fmt$(n(day.revenue))}</Text>
                  <Text style={{ fontSize: 11, color: C.smoke }}>{fmt$(n(day.cogs))} cogs</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: gpColor }}>{fmt$(gp)}</Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}

function BevCostTab({ data, isLoading }: { data: BevCostItem[] | undefined; isLoading: boolean }) {
  const [sortBy, setSortBy] = useState<"variance" | "costPct" | "name">("variance");

  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data || data.length === 0) return <EmptyState message="No beverage profiles configured" />;

  const nb = (v: unknown) => Number(v ?? 0);
  const totalVarianceCost = data.reduce((s, b) => s + nb(b.varianceCost), 0);
  const totalInventoryValue = data.reduce((s, b) => s + nb(b.currentValueBottles), 0);
  const avgPourCostPct = data.filter(b => nb(b.avgMenuPrice) > 0).reduce((s, b) => s + nb(b.pourCostPct), 0) /
    Math.max(1, data.filter(b => nb(b.avgMenuPrice) > 0).length);

  const sorted = [...data].sort((a, b) => {
    if (sortBy === "variance") return Math.abs(b.varianceCost) - Math.abs(a.varianceCost);
    if (sortBy === "costPct") return b.pourCostPct - a.pourCostPct;
    return a.name.localeCompare(b.name);
  });

  // Group by category
  const categories = [...new Set(sorted.map(b => b.category))];

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Items" value={String(data.length)} />
        <StatCard label="Inv. Value" value={fmtK(totalInventoryValue)} color={C.gold} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard
          label="Avg Pour Cost"
          value={fmtPct(avgPourCostPct)}
          color={avgPourCostPct > 25 ? C.coral : avgPourCostPct > 20 ? C.ember : C.jade}
        />
        <StatCard
          label="Variance Cost"
          value={fmtK(Math.abs(totalVarianceCost))}
          sub={totalVarianceCost > 0 ? "over-poured" : "under-poured"}
          color={totalVarianceCost > 50 ? C.coral : C.mist}
        />
      </View>

      {/* Sort chips */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {(["variance", "costPct", "name"] as const).map(s => (
          <TouchableOpacity
            key={s}
            onPress={() => setSortBy(s)}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
              backgroundColor: sortBy === s ? C.gold : C.surfaceHi,
              borderWidth: 1, borderColor: sortBy === s ? C.gold : C.rim,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: sortBy === s ? C.void : C.mist }}>
              {s === "variance" ? "Variance" : s === "costPct" ? "Pour Cost %" : "Name"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {categories.map(cat => {
        const items = sorted.filter(b => b.category === cat);
        return (
          <View key={cat}>
            <SectionLabel title={cat} />
            <Card>
              {items.map((bev, i) => {
                const pourCostPct = nb(bev.pourCostPct);
                const varianceCost = nb(bev.varianceCost);
                const costPerPour = nb(bev.costPerPour);
                const theoreticalPours = nb(bev.theoreticalPours);
                const actualPours = nb(bev.actualPours);
                const variance = nb(bev.variance);
                const currentQty = nb(bev.currentQty);
                const costColor = pourCostPct > 25 ? C.coral : pourCostPct > 20 ? C.ember : C.jade;
                const varGood = varianceCost <= 0;
                return (
                  <View key={bev.id} style={{
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                    gap: 6,
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{bev.name}</Text>
                        {bev.producer && <Text style={{ fontSize: 11, color: C.smoke }}>{bev.producer}</Text>}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: costColor }}>
                          {fmtPct(pourCostPct)}
                        </Text>
                        <Text style={{ fontSize: 10, color: C.smoke }}>${costPerPour.toFixed(2)}/pour</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <View>
                        <Text style={{ fontSize: 10, color: C.smoke }}>Theoretical</Text>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.pearl }}>{theoreticalPours.toFixed(0)} pours</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: C.smoke }}>Actual</Text>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.pearl }}>{actualPours.toFixed(0)} pours</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: C.smoke }}>Variance</Text>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: varGood ? C.jade : C.coral }}>
                          {variance > 0 ? "+" : ""}{variance.toFixed(0)} ({varGood ? "-" : "+"}{fmt$(Math.abs(varianceCost))})
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: C.smoke }}>On Hand</Text>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.pearl }}>{currentQty.toFixed(1)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        );
      })}
    </>
  );
}

function PriceHistoryTab({ data, isLoading }: { data: PriceHistoryReport | undefined; isLoading: boolean }) {
  const [filter, setFilter] = useState<"all" | "up" | "down" | "alert">("alert");

  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data || data.rows.length === 0) return <EmptyState message="No purchase order history yet" />;

  const { summary, rows } = data;

  const filtered = rows.filter((r) => {
    if (filter === "up") return r.trend === "up";
    if (filter === "down") return r.trend === "down";
    if (filter === "alert") return Math.abs(r.changePct) > 10;
    return true;
  });

  return (
    <>
      {/* Summary */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Tracked Items" value={String(summary.totalIngredients)} />
        <StatCard label="Price Alerts" value={String(summary.alertCount)} color={summary.alertCount > 0 ? C.coral : C.mist} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Rising" value={String(summary.risingCount)} color={C.coral} />
        <StatCard label="Falling" value={String(summary.fallingCount)} color={C.jade} />
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {(["alert", "up", "down", "all"] as const).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
              backgroundColor: filter === f ? C.gold : C.surfaceHi,
              borderWidth: 1, borderColor: filter === f ? C.gold : C.rim,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: filter === f ? C.void : C.mist }}>
              {f === "alert" ? "🔺 Alerts" : f === "up" ? "Rising" : f === "down" ? "Falling" : "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && <EmptyState message="No items match this filter" />}

      {filtered.length > 0 && (
        <Card>
          {filtered.map((row, i) => {
            const up = row.trend === "up";
            const down = row.trend === "down";
            const alert = Math.abs(row.changePct) > 10;
            const trendColor = up ? C.coral : down ? C.jade : C.mist;
            const trendIcon = up ? "trending-up" : down ? "trending-down" : "remove-outline";

            return (
              <View key={row.ingredientId} style={{
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                gap: 6,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{row.name}</Text>
                    <Text style={{ fontSize: 11, color: C.smoke }}>
                      {row.pricePoints[0]?.supplier ?? "Unknown supplier"} · {row.unit}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>
                      ${row.lastCost.toFixed(2)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Ionicons name={trendIcon as keyof typeof Ionicons.glyphMap} size={12} color={trendColor} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: trendColor }}>
                        {row.changePct > 0 ? "+" : ""}{row.changePct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Mini sparkline using price range */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 10, color: C.smoke }}>
                    ${row.minCost.toFixed(2)} — ${row.maxCost.toFixed(2)}
                  </Text>
                  <View style={{ flex: 1, height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                    <View style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${row.maxCost > row.minCost ? ((row.lastCost - row.minCost) / (row.maxCost - row.minCost)) * 100 : 50}%`,
                      backgroundColor: alert ? C.coral : C.gold, borderRadius: 2,
                    }} />
                  </View>
                  <Text style={{ fontSize: 10, color: C.smoke }}>
                    {row.pricePoints.length} orders
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

function VarianceTab({ data, isLoading }: { data: VarianceReport | undefined; isLoading: boolean }) {
  const [filter, setFilter] = useState<"all" | "alert" | "warn">("alert");
  if (isLoading) return <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>;
  if (!data) return <EmptyState message="No variance data for this period" />;

  const nv = (v: unknown) => Number(v ?? 0);
  const { summary, rows } = data;
  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "alert" ? r.severity === "alert" : r.severity !== "ok"
  );

  const sevColor = (s: string) => s === "alert" ? C.coral : s === "warn" ? C.ember : C.jade;

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
        <StatCard label="Tracked" value={String(summary.ingredientsTracked)} />
        <StatCard label="Variance Cost" value={`$${nv(summary.totalVarianceCost).toFixed(0)}`} color={summary.alertCount > 0 ? C.coral : C.mist} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Alerts" value={String(summary.alertCount)} color={summary.alertCount > 0 ? C.coral : C.mist} />
        <StatCard label="Warnings" value={String(summary.warnCount)} color={summary.warnCount > 0 ? C.ember : C.mist} />
      </View>

      {!summary.hasAnyActualData && (
        <View style={{ backgroundColor: C.gold + "12", borderRadius: 12, padding: 12, flexDirection: "row", gap: 8 }}>
          <Ionicons name="information-circle-outline" size={16} color={C.goldDim} />
          <Text style={{ flex: 1, fontSize: 12, color: C.goldDim }}>
            No inventory usage transactions found. Log USED/WASTED transactions to see variance data.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["alert", "warn", "all"] as const).map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: filter === f ? C.gold : C.surfaceHi, borderWidth: 1, borderColor: filter === f ? C.gold : C.rim }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: filter === f ? C.void : C.mist }}>
              {f === "alert" ? "🔴 Alerts" : f === "warn" ? "🟡 Warnings" : "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && <EmptyState message="No items match this filter" />}
      {filtered.length > 0 && (
        <Card>
          {filtered.map((row, i) => (
            <View key={row.ingredientId} style={{
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: C.rim,
              gap: 4,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sevColor(row.severity) }} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: C.pearl }}>{row.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: sevColor(row.severity) }}>
                  {nv(row.variancePct) > 0 ? "+" : ""}{nv(row.variancePct).toFixed(1)}%
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 16, paddingLeft: 16 }}>
                <Text style={{ fontSize: 11, color: C.smoke }}>Theory: {nv(row.theoreticalQty).toFixed(1)}</Text>
                <Text style={{ fontSize: 11, color: C.smoke }}>Actual: {nv(row.actualUsedQty).toFixed(1)}</Text>
                <Text style={{ fontSize: 11, color: sevColor(row.severity), fontWeight: "600" }}>
                  ${nv(row.varianceCost).toFixed(2)} cost
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const RANGE_KEYS: RangeKey[] = ["today", "week", "month", "lastMonth"];
const TAB_DEFS: { key: "sales" | "labor" | "foodcost" | "cogs" | "bev" | "prices" | "variance"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "sales",    label: "Sales",    icon: "cash-outline" },
  { key: "labor",    label: "Labor",    icon: "people-outline" },
  { key: "foodcost", label: "Food",     icon: "leaf-outline" },
  { key: "cogs",     label: "P&L",      icon: "analytics-outline" },
  { key: "bev",      label: "Beverage", icon: "wine-outline" },
  { key: "prices",   label: "Pricing",  icon: "pricetag-outline" },
  { key: "variance", label: "Variance", icon: "git-compare-outline" },
];

export default function ReportsScreen() {
  const { refreshing, run } = useManualRefresh();
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const [tab, setTab] = useState<"sales" | "labor" | "foodcost" | "cogs" | "bev" | "prices" | "variance">("sales");

  // Fiscal-period selection (overrides the quick range chips when set).
  const [fiscalSel, setFiscalSel] = useState<{ from: string; to: string; label: string } | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const settingsQ = useQuery({ queryKey: ["settings", "fiscal"], queryFn: getSettings, staleTime: 5 * 60_000 });
  const fiscalCfg: FiscalConfig = useMemo(
    () => parseFiscalConfig(settingsQ.data?.fiscalCalendar),
    [settingsQ.data],
  );
  const currentPeriod = useMemo(() => findFiscalPeriod(new Date(), fiscalCfg), [fiscalCfg]);
  const [pickerFy, setPickerFy] = useState<number>(() => new Date().getFullYear());
  useEffect(() => { if (currentPeriod) setPickerFy(currentPeriod.year); }, [currentPeriod]);

  const range = useMemo(() => fiscalSel ?? getRange(rangeKey), [fiscalSel, rangeKey]);

  // Quick ‹/› stepping between fiscal periods (wraps across fiscal years). If no
  // period is selected yet, the first tap jumps to the current period.
  function stepFiscal(dir: number) {
    const anchorPeriod = fiscalSel
      ? findFiscalPeriod(new Date(`${fiscalSel.from}T12:00:00`), fiscalCfg)
      : currentPeriod;
    if (!anchorPeriod) return;
    let fy = anchorPeriod.year;
    let n = anchorPeriod.n + (fiscalSel ? dir : 0);
    if (n < 1) { fy -= 1; n = 12; }
    if (n > 12) { fy += 1; n = 1; }
    const p = getFiscalPeriods(fy, fiscalCfg)[n - 1];
    if (!p) return;
    setFiscalSel({ from: p.from, to: p.to, label: p.label });
    setPickerFy(fy);
  }

  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const salesQ = useQuery({ queryKey: ["reports", "sales", range.from, range.to], queryFn: () => getSalesReport(range.from, range.to) });
  const laborQ = useQuery({ queryKey: ["reports", "labor", range.from, range.to], queryFn: () => getLaborReport(range.from, range.to) });
  const foodQ  = useQuery({ queryKey: ["reports", "foodcost", range.from, range.to], queryFn: () => getFoodCostReport(range.from, range.to) });
  const cogsQ   = useQuery({ queryKey: ["reports", "cogs", range.from, range.to], queryFn: () => getCogsReport(range.from, range.to), enabled: tab === "cogs" });
  const bevQ    = useQuery({ queryKey: ["reports", "bev", range.from, range.to], queryFn: () => getBevCostReport(range.from, range.to), enabled: tab === "bev" });
  const pricesQ   = useQuery({ queryKey: ["reports", "prices"], queryFn: () => getPriceHistory(180), enabled: tab === "prices" });
  const varianceQ = useQuery({ queryKey: ["reports", "variance", range.from, range.to], queryFn: () => getVarianceReport(range.from, range.to), enabled: tab === "variance" });
  const activeQ = tab === "sales" ? salesQ : tab === "labor" ? laborQ : tab === "foodcost" ? foodQ : tab === "cogs" ? cogsQ : tab === "bev" ? bevQ : tab === "prices" ? pricesQ : varianceQ;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Reports"
        subtitle={range.from === range.to ? range.from : `${range.from} – ${range.to}`}
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
      />

      {/* Range chips */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {RANGE_KEYS.map((k) => {
              const active = !fiscalSel && k === rangeKey;
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => { setFiscalSel(null); setRangeKey(k); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: active ? C.gold : C.surfaceHi,
                    borderWidth: 1, borderColor: active ? C.gold : C.rim,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? C.void : C.mist }}>
                    {getRange(k).label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {/* ‹ step to previous fiscal period (shown once a period is active) */}
            {fiscalSel && (
              <TouchableOpacity
                onPress={() => stepFiscal(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim }}
              >
                <Ionicons name="chevron-back" size={14} color={C.mist} />
              </TouchableOpacity>
            )}
            {/* Fiscal period picker */}
            <TouchableOpacity
              onPress={() => setPeriodOpen(true)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: fiscalSel ? C.gold : C.surfaceHi,
                borderWidth: 1, borderColor: fiscalSel ? C.gold : C.rim,
              }}
            >
              <Ionicons name="calendar-outline" size={13} color={fiscalSel ? C.void : C.mist} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: fiscalSel ? C.void : C.mist }}>
                {fiscalSel ? fiscalSel.label : "Period"}
              </Text>
            </TouchableOpacity>
            {/* › step to next fiscal period */}
            {fiscalSel && (
              <TouchableOpacity
                onPress={() => stepFiscal(1)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim }}
              >
                <Ionicons name="chevron-forward" size={14} color={C.mist} />
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Tabs */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row" }}>
          {TAB_DEFS.map((t) => {
            const active = t.key === tab;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key as typeof tab)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 6, paddingVertical: 12, paddingHorizontal: 16,
                  borderBottomWidth: 2, borderBottomColor: active ? C.gold : "transparent",
                  minWidth: 80,
                }}
              >
                <Ionicons name={t.icon} size={14} color={active ? C.gold : C.smoke} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? C.gold : C.smoke }}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(() => activeQ.refetch())} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {tab === "sales"    && <SalesTab    data={salesQ.data} isLoading={salesQ.isLoading} laborData={laborQ.data} />}
        {tab === "labor"    && <LaborTab    data={laborQ.data} isLoading={laborQ.isLoading} salesData={salesQ.data} />}
        {tab === "foodcost" && <FoodCostTab data={foodQ.data}  isLoading={foodQ.isLoading} />}
        {tab === "cogs"     && <><CogsTab data={cogsQ.data} isLoading={cogsQ.isLoading} /><PnlStatementMobile from={range.from} to={range.to} /></>}
        {tab === "bev"      && <BevCostTab    data={bevQ.data}     isLoading={bevQ.isLoading} />}
        {tab === "prices"   && <PriceHistoryTab data={pricesQ.data}    isLoading={pricesQ.isLoading} />}
        {tab === "variance" && <VarianceTab     data={varianceQ.data} isLoading={varianceQ.isLoading} />}
      </Animated.ScrollView>

      {/* Fiscal period picker modal */}
      <Modal visible={periodOpen} transparent animationType="slide" onRequestClose={() => setPeriodOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 28 }}>
            {/* Year nav */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
              <TouchableOpacity onPress={() => setPickerFy((y) => y - 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color={C.gold} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>Fiscal Year {pickerFy}</Text>
              <TouchableOpacity onPress={() => setPickerFy((y) => y + 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-forward" size={22} color={C.gold} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
              {(() => {
                const todayIso = toYMD(new Date());
                const rows: { label: string; sub: string; from: string; to: string; closed: boolean }[] = [];
                rows.push((() => { const y = getFiscalYearRange(pickerFy, fiscalCfg); return { label: `Full Year FY${pickerFy}`, sub: `${fmtShort(y.fromDate)} – ${fmtShort(y.toDate)}`, from: y.from, to: y.to, closed: y.to < todayIso }; })());
                for (const q of getFiscalQuarters(pickerFy, fiscalCfg)) rows.push({ label: `${q.label} (P${q.periods[0]}–P${q.periods[2]})`, sub: `${fmtShort(q.fromDate)} – ${fmtShort(q.toDate)} · 13 wk`, from: q.from, to: q.to, closed: q.to < todayIso });
                for (const p of getFiscalPeriods(pickerFy, fiscalCfg)) rows.push({ label: `${p.label} · Q${p.quarter}`, sub: `${fmtShort(p.fromDate)} – ${fmtShort(p.toDate)} · ${p.weeks} wk`, from: p.from, to: p.to, closed: p.to < todayIso });
                return rows.map((r) => {
                  const selected = fiscalSel?.from === r.from && fiscalSel?.to === r.to;
                  return (
                    <TouchableOpacity
                      key={r.label}
                      onPress={() => { setFiscalSel({ from: r.from, to: r.to, label: r.label.split(" ·")[0].replace(/ \(.*\)/, "") }); setPeriodOpen(false); }}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                        paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
                        backgroundColor: selected ? `${C.gold}1A` : C.surfaceHi,
                        borderWidth: 1, borderColor: selected ? C.gold : C.rim,
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{r.label}</Text>
                        <Text style={{ fontSize: 11, color: C.smoke, marginTop: 2 }}>{r.sub}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: r.closed ? `${C.jade}1A` : `${C.ember}1A` }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: r.closed ? C.jade : C.ember }}>{r.closed ? "Closed" : "Open"}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
            <TouchableOpacity onPress={() => setPeriodOpen(false)} style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: C.surfaceHi, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.mist }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
