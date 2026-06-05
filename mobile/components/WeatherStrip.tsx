import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getWeather } from "@/lib/api";
import { C, shadow } from "@/lib/theme";

// Compact current-conditions strip for the mobile dashboard. Renders nothing
// until a venue location is set in Settings → Weather location (web), so it
// stays invisible rather than showing an empty box.
export function WeatherStrip() {
  const { data } = useQuery({ queryKey: ["weather"], queryFn: getWeather, staleTime: 10 * 60_000, refetchInterval: 30 * 60_000 });
  if (!data?.configured) return null;

  const adjPct = data.multiplier != null ? Math.round((data.multiplier - 1) * 100) : 0;
  const showAdj = Math.abs(adjPct) >= 1;
  const up = (data.multiplier ?? 1) >= 1;

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10,
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim,
      paddingHorizontal: 14, paddingVertical: 10, ...shadow.sm,
    }}>
      <Text style={{ fontSize: 24 }}>{data.emoji}</Text>
      <Text style={{ fontSize: 18, fontWeight: "800", color: C.pearl }}>{data.tempNowF}°</Text>
      <Text style={{ fontSize: 13, color: C.mist }}>{data.condition}</Text>
      <Text style={{ fontSize: 11, color: C.smoke }}>H {data.hiF}° · L {data.loF}°</Text>
      {showAdj && (
        <View style={{ marginLeft: "auto", backgroundColor: `${up ? C.jade : C.ember}1A`, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: up ? C.jade : C.ember }}>{adjPct > 0 ? "+" : ""}{adjPct}% demand</Text>
        </View>
      )}
    </View>
  );
}
