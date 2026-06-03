import { View, Text, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getVeraForecast, getVeraSetup } from "@/lib/api";
import { C, shadow } from "@/lib/theme";

// ── Vera Forecast ─────────────────────────────────────────────────────────────

const CONF: Record<string, string> = { high: C.jade, medium: C.ember, low: C.smoke };

export function VeraForecastCard() {
  const { data } = useQuery({ queryKey: ["vera-forecast"], queryFn: getVeraForecast, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 });
  if (!data || data.sampleCount === 0) return null;

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, paddingBottom: 10 }}>
        <Image source={require("../assets/vera-forecast.png")} style={{ width: 34, height: 34, borderRadius: 8 }} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: C.pearl }}>Vera Forecast</Text>
          <Text style={{ fontSize: 11, color: C.smoke, textTransform: "uppercase", letterSpacing: 0.6 }}>Tonight</Text>
        </View>
        <View style={{ backgroundColor: `${CONF[data.confidence]}1A`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: CONF[data.confidence], textTransform: "capitalize" }}>{data.confidence} confidence</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
        <View style={{ flex: 1, padding: 12, borderRightWidth: 1, borderColor: C.rim }}>
          <Text style={{ fontSize: 11, color: C.mist }}>Projected sales</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.gold, marginTop: 2 }}>${data.projectedSales.toLocaleString("en-US")}</Text>
        </View>
        <View style={{ flex: 1, padding: 12 }}>
          <Text style={{ fontSize: 11, color: C.mist }}>Projected guests</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: C.pearl, marginTop: 2 }}>{data.projectedCovers}{data.reservedCovers > 0 ? <Text style={{ fontSize: 11, color: C.smoke }}>  {data.reservedCovers} booked</Text> : null}</Text>
        </View>
      </View>

      <Text style={{ fontSize: 13, color: C.mist, lineHeight: 19, paddingHorizontal: 14, paddingTop: 10 }}>{data.narrative}</Text>

      {data.prep.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Vera recommends prepping</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {data.prep.map((p) => (
              <View key={p.name} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHi, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: C.pearl }}>{p.suggestedQty}×</Text>
                <Text style={{ fontSize: 12, color: C.mist }}>{p.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Vera Setup Guide (first-run) ────────────────────────────────────────────────

export function VeraSetupCard() {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ["vera-setup"], queryFn: getVeraSetup, staleTime: 60_000 });
  if (!data || data.complete) return null;

  const routeMap: Record<string, string> = {
    "/menu": "/(app)/menu",
    "/settings/floorplan": "/(app)/settings",
    "/staff": "/(app)/staff",
    "/inventory": "/(app)/inventory",
  };
  const pct = Math.round((data.doneCount / data.total) * 100);

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#0C1A1E", padding: 14 }}>
        <Image source={require("../assets/vera-avatar.png")} style={{ width: 36, height: 36, borderRadius: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFFFFF" }}>Let&apos;s set up Veraya</Text>
          <Text style={{ fontSize: 11, color: "#C7D2DE", marginTop: 1 }}>{data.doneCount} of {data.total} done — Vera starts working once you finish.</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF" }}>{pct}%</Text>
      </View>
      {data.steps.map((s) => (
        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: C.rim }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: s.done ? `${C.jade}1A` : "transparent", borderWidth: s.done ? 0 : 2, borderColor: C.rim }}>
            {s.done && <Ionicons name="checkmark" size={13} color={C.jade} />}
          </View>
          {s.done ? (
            <Text style={{ fontSize: 14, color: C.smoke, textDecorationLine: "line-through" }}>{s.label}</Text>
          ) : (
            <Text onPress={() => router.push((routeMap[s.href] ?? "/(app)/settings") as never)} style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.pearl }}>
              {s.label}
              <Text style={{ fontSize: 12, fontWeight: "400", color: C.mist }}>{"\n"}{s.hint}</Text>
            </Text>
          )}
          {!s.done && <Ionicons name="chevron-forward" size={16} color={C.smoke} />}
        </View>
      ))}
    </View>
  );
}
