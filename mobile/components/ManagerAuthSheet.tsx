import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, T } from "@/lib/theme";

export interface ManagerAuthRequest {
  title: string;
  description?: string;
  /** Suggested reasons offered as quick-fill chips. */
  reasons: string[];
  confirmLabel?: string;
  /** Perform the protected action. Return {ok:false,error} to keep the sheet
   *  open with a message (e.g. invalid PIN). */
  onConfirm: (reason: string, managerPin: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Gate a sensitive action (comp, void, reopen) behind a mandatory reason + a
 * manager PIN — the mobile counterpart of the web ManagerAuthDialog. The server
 * verifies the PIN (bcrypt against User.managerPin), so we just collect + send it.
 */
export function ManagerAuthSheet({
  request,
  onClose,
}: {
  request: ManagerAuthRequest | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (request) { setReason(""); setPin(""); setErr(""); setBusy(false); }
  }, [request]);

  if (!request) return null;

  async function submit() {
    const r = reason.trim();
    if (!r) { setErr("A reason is required."); return; }
    if (!pin.trim()) { setErr("Manager PIN is required."); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await request!.onConfirm(r, pin.trim());
      if (res.ok) { onClose(); return; }
      setErr(res.error ?? "Could not authorize. Check the PIN and try again.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not authorize.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.6)", padding: 20 }}
      >
        <View style={{ width: "100%", maxWidth: 420, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.rim, padding: 20, gap: 16 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color={C.gold} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: C.pearl }}>{request.title}</Text>
            <TouchableOpacity onPress={() => { if (!busy) onClose(); }} hitSlop={10}>
              <Ionicons name="close" size={22} color={C.smoke} />
            </TouchableOpacity>
          </View>

          {request.description ? (
            <Text style={{ fontSize: 13, color: C.mist }}>{request.description}</Text>
          ) : null}

          {/* Reason */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke }}>REASON *</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {request.reasons.map((r) => {
                const active = reason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setReason(r)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                      borderColor: active ? C.gold : C.rim,
                      backgroundColor: active ? T.gold : C.surfaceHi,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: active ? C.gold : C.mist }}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason for the record"
              placeholderTextColor={C.smoke}
              style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.pearl, fontSize: 15 }}
            />
          </View>

          {/* PIN */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke }}>MANAGER PIN *</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              placeholder="••••"
              placeholderTextColor={C.smoke}
              secureTextEntry
              keyboardType="number-pad"
              autoComplete="off"
              onSubmitEditing={submit}
              style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.pearl, fontSize: 18, letterSpacing: 6 }}
            />
            <Text style={{ fontSize: 11, color: C.smoke }}>A manager or admin must authorize this.</Text>
          </View>

          {err ? (
            <View style={{ backgroundColor: T.coral, borderWidth: 1, borderColor: C.coral, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, color: C.coral }}>{err}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => { if (!busy) onClose(); }}
              disabled={busy}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.rim, alignItems: "center", backgroundColor: C.surfaceHi }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.mist }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={busy || !reason.trim() || !pin.trim()}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: C.gold, opacity: busy || !reason.trim() || !pin.trim() ? 0.5 : 1 }}
            >
              {busy && <ActivityIndicator size="small" color={C.void} />}
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.void }}>{request.confirmLabel ?? "Authorize"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
