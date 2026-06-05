import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getWeather } from "@/lib/api";
import { C, shadow } from "@/lib/theme";

// Condition → accent color for a subtle tinted card (no gradient dependency).
function accentFor(condition?: string): string {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("thunder")) return C.coral;
  if (c.includes("snow")) return C.sky;
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return C.sky;
  if (c.includes("fog") || c.includes("overcast")) return C.smoke;
  if (c.includes("cloud")) return C.mist;
  return C.gold; // clear / mostly clear
}

// Compact current-conditions strip for the mobile dashboard. Renders nothing
// until a venue location is set in Settings → Weather location (web).
export function WeatherStrip() {
  const { data } = useQuery({ queryKey: ["weather"], queryFn: getWeather, staleTime: 10 * 60_000, refetchInterval: 30 * 60_000 });
  if (!data?.configured) return null;

  const accent = accentFor(data.condition);
  const adjPct = data.multiplier != null ? Math.round((data.multiplier - 1) * 100) : 0;
  const showAdj = Math.abs(adjPct) >= 1;
  const up = (data.multiplier ?? 1) >= 1;

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 12,
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: `${accent}14`, borderRadius: 18, borderWidth: 1, borderColor: `${accent}2E`,
      paddingHorizontal: 14, paddingVertical: 12, ...shadow.sm,
    }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", ...shadow.sm }}>
        <Text style={{ fontSize: 24 }}>{data.emoji}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: C.pearl, lineHeight: 28 }}>{data.tempNowF}°</Text>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.mist }}>{data.condition}</Text>
        </View>
        <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }} numberOfLines={1}>
          H {data.hiF}° · L {data.loF}°{data.label ? ` · ${data.label}` : ""}
        </Text>
      </View>
      {showAdj && (
        <View style={{ backgroundColor: `${up ? C.jade : C.ember}1F`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: up ? C.jade : C.ember }}>{up ? "↑" : "↓"} {Math.abs(adjPct)}% demand</Text>
        </View>
      )}
    </View>
  );
}
