import { View, Text, TouchableOpacity, Modal, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/lib/theme";
import { SERVICE_STAGES, STAGE_LABELS, STAGE_COLOR, elapsedLabel } from "@/lib/service-stages";
import type { Table } from "@/lib/api";

/**
 * Unified table-action sheet for the station Host Stand — mirrors the web host
 * panel's actions for an occupied table: advance service stage, move the party,
 * mark bussing, finish & clear, and split a combined table.
 */
export function TableActionSheet({
  table, busy, onClose, onSetStage, onStartMove, onBussing, onFinish, onSplit,
}: {
  table: Table;
  busy: boolean;
  onClose: () => void;
  onSetStage: (stage: string) => void;
  onStartMove: () => void;
  onBussing: () => void;
  onFinish: () => void;
  onSplit?: () => void;
}) {
  const stage = table.serviceStage ?? "SEATED";
  const isCombined = !!table.primaryTableId;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 28, maxHeight: "82%" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.pearl }}>
                Table {table.number}{isCombined ? " · combined" : ""}
              </Text>
              <Text style={{ fontSize: 13, color: C.mist, marginTop: 2 }}>
                {table.guestName ?? "Seated"} · party of {table.partySize ?? "?"}
                {table.seatedAt ? ` · ${elapsedLabel(table.seatedAt)}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={C.mist} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }}>
            {/* Service stage stepper */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Service stage</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SERVICE_STAGES.map((s) => {
                  const active = s === stage;
                  const color = STAGE_COLOR[s] ?? C.gold;
                  return (
                    <TouchableOpacity
                      key={s}
                      disabled={busy}
                      onPress={() => onSetStage(s)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
                        borderColor: active ? color : C.rim,
                        backgroundColor: active ? `${color}22` : C.surfaceHi,
                      }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? color : C.mist }}>{STAGE_LABELS[s]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Actions */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Actions</Text>

              <ActionRow icon="swap-horizontal" label="Move party" sub="Move to another open table" color={C.sky} disabled={busy} onPress={onStartMove} />

              <ActionRow icon="sparkles-outline" label="Mark bussing" sub="Guests have left — needs a reset" color={C.ember} disabled={busy} onPress={onBussing} />

              {isCombined && onSplit && (
                <ActionRow icon="git-branch-outline" label="Split combined tables" sub="Unlink this table group" color={C.mist} disabled={busy} onPress={onSplit} />
              )}

              <ActionRow
                icon="checkmark-done-outline"
                label="Finish & clear"
                sub="Close out and free the table"
                color={C.jade}
                disabled={busy}
                onPress={() => Alert.alert(
                  `Clear Table ${table.number}?`,
                  "This frees the table and clears the seated party.",
                  [{ text: "Cancel", style: "cancel" }, { text: "Finish & clear", style: "destructive", onPress: onFinish }],
                )}
              />
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function ActionRow({ icon, label, sub, color, disabled, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; color: string; disabled: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.rim, backgroundColor: C.surfaceHi, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${color}1A`, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{label}</Text>
        <Text style={{ fontSize: 12, color: C.mist, marginTop: 1 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.smoke} />
    </TouchableOpacity>
  );
}
