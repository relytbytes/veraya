import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/lib/theme";

/**
 * Standard centered state for a screen body — used for empty lists AND failed
 * loads, so a fetch error reads as "couldn't load · retry" instead of a
 * misleading "nothing here yet".
 */
export function ScreenMessage({
  icon, title, subtitle, actionLabel, onAction, tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  const accent = tone === "error" ? C.coral : C.smoke;
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, gap: 16 }}>
      <View style={{ height: 64, width: 64, borderRadius: 16, backgroundColor: tone === "error" ? `${C.coral}14` : C.surfaceHi, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: tone === "error" ? `${C.coral}40` : C.rim }}>
        <Ionicons name={icon} size={30} color={accent} />
      </View>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: C.pearl, fontSize: 15, fontWeight: "600" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: C.mist, fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: tone === "error" ? C.surfaceHi : C.gold, borderWidth: tone === "error" ? 1 : 0, borderColor: C.rim }}
        >
          {tone === "error" && <Ionicons name="refresh" size={15} color={C.pearl} />}
          <Text style={{ fontSize: 13, fontWeight: "700", color: tone === "error" ? C.pearl : C.void }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
