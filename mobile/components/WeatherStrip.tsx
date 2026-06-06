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

// A day's weather → demand nudge color + label (the business angle).
function dayDemand(multiplier: number): { color: string; text: string } {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct <= -2) return { color: C.coral, text: `↓${Math.abs(pct)}%` };
  if (pct >= 2) return { color: C.jade, text: `↑${pct}%` };
  return { color: C.rim, text: "" };
}

// Dashboard weather snapshot: current conditions + a multi-day strip, each day
// tinted by its forecast demand impact. Renders nothing until a venue location
// is set in Settings → Weather location (web).
export function WeatherStrip() {
  const { data } = useQuery({ queryKey: ["weather"], queryFn: getWeather, staleTime: 10 * 60_000, refetchInterval: 30 * 60_000 });
  if (!data?.configured) return null;

  const accent = accentFor(data.condition);
  const adjPct = data.multiplier != null ? Math.round((data.multiplier - 1) * 100) : 0;
  const showAdj = Math.abs(adjPct) >= 1;
  const up = (data.multiplier ?? 1) >= 1;
  const days = (data.days ?? []).slice(0, 5);

  return (
    <View style={{
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: `${accent}14`, borderRadius: 18, borderWidth: 1, borderColor: `${accent}2E`,
      paddingHorizontal: 14, paddingVertical: 12, ...shadow.sm,
    }}>
      {/* Current conditions */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", ...shadow.sm }}>
          <Text style={{ fontSize: 24 }}>{data.emoji}</Text>
        </View>
        <Text style={{ fontSize: 26, fontWeight: "800", color: C.pearl }}>{data.tempNowF}°</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: C.mist }} numberOfLines={1}>{data.condition}</Text>
          {data.label ? <Text style={{ fontSize: 12, color: C.smoke, marginTop: 1 }} numberOfLines={1}>{data.label}</Text> : null}
        </View>
        {showAdj && (
          <View style={{ backgroundColor: `${up ? C.jade : C.coral}1F`, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: up ? C.jade : C.coral }}>{up ? "↑" : "↓"} {Math.abs(adjPct)}% demand</Text>
          </View>
        )}
      </View>

      {/* Multi-day snapshot */}
      {days.length > 1 && (
        <>
          <View style={{ height: 1, backgroundColor: C.rim, marginVertical: 12 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {days.map((d) => {
              const dd = dayDemand(d.multiplier);
              return (
                <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase" }}>{d.label}</Text>
                  <Text style={{ fontSize: 20 }}>{d.emoji}</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{d.hiF}°</Text>
                    <Text style={{ fontSize: 12, color: C.smoke }}>{d.loF}°</Text>
                  </View>
                  <View style={{ height: 3, width: 28, borderRadius: 999, backgroundColor: dd.color, marginTop: 1 }} />
                  <Text style={{ fontSize: 10, fontWeight: "700", color: dd.color, lineHeight: 12 }}>{dd.text || " "}</Text>
                </View>
              );
            })}
          </View>
          <Text style={{ fontSize: 10, color: C.smoke, textAlign: "center", marginTop: 8 }}>Bar shows each day&apos;s forecast demand impact</Text>
        </>
      )}
    </View>
  );
}
