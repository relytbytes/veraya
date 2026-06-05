import { useState } from "react";
import { Text, TouchableOpacity, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, shadow } from "@/lib/theme";

/**
 * A subtle "(i)" affordance that opens a short explanation of a metric. Doubles
 * as a live pitch aid — tap it in a demo to show the mechanic behind a number.
 */
export function InfoTip({ title, text, size = 14, color = C.smoke }: { title?: string; text: string; size?: number; color?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 360, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.rim, padding: 20, ...shadow.sm }}>
            {title ? <Text style={{ fontSize: 15, fontWeight: "800", color: C.pearl, marginBottom: 8 }}>{title}</Text> : null}
            <Text style={{ fontSize: 13.5, color: C.mist, lineHeight: 20 }}>{text}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16 }}>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.gold }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
