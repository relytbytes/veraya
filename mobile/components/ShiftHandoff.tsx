import { useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, T, shadow } from "@/lib/theme";
import { getShiftHandoff, sendShiftHandoff } from "@/lib/api";
import type { HandoffDigest } from "@/lib/api";

// ShiftHandoff — end-of-shift digest with AI narrative, watch-for items,
// high-severity flagging, and SMS send to incoming manager.

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Window = 4 | 8 | 12;
const WINDOWS: { label: string; hours: Window }[] = [
  { label: "4h", hours: 4 },
  { label: "8h", hours: 8 },
  { label: "12h", hours: 12 },
];

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function SectionHeader({ icon, label, count, color }: { icon: string; label: string; count?: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <Ionicons name={icon as never} size={13} color={color} />
      <Text style={{ fontSize: 10, fontWeight: "700", color, textTransform: "uppercase", letterSpacing: 1.2, flex: 1 }}>
        {label}
      </Text>
      {count !== undefined && (
        <View style={{
          backgroundColor: color + "22", borderRadius: 99,
          paddingHorizontal: 7, paddingVertical: 1,
        }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color }}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{
      backgroundColor: bg, borderRadius: 99,
      paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: color + "44",
    }}>
      <Text style={{ fontSize: 12, color, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16,
      borderWidth: 1, borderColor: C.rim,
      padding: 14, ...style,
    }}>
      {children}
    </View>
  );
}

// ── Send sheet ───────────────────────────────────────────────────────────────

interface SendSheetProps {
  digest: HandoffDigest;
  onDone: () => void;
}

function SendSheet({ digest, onDone }: SendSheetProps) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 10) {
      Alert.alert("Invalid number", "Please enter a valid 10-digit phone number.");
      return;
    }
    setSending(true);
    try {
      await sendShiftHandoff(phone, digest);
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send.";
      if (msg.includes("not configured")) {
        Alert.alert(
          "SMS Not Configured",
          "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to your .env.local to enable SMS.",
          [{ text: "Got it" }]
        );
      } else {
        Alert.alert("Send Failed", msg);
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={{ padding: 20, alignItems: "center", gap: 12 }}>
        <View style={{
          width: 52, height: 52, borderRadius: 99,
          backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade + "44",
          alignItems: "center", justifyContent: "center",
        }}>
          <Ionicons name="checkmark-circle" size={26} color={C.jade} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>Sent!</Text>
        <Text style={{ fontSize: 13, color: C.mist, textAlign: "center" }}>
          Handoff digest sent to {phone}
        </Text>
        <TouchableOpacity onPress={onDone} style={{
          marginTop: 4, backgroundColor: C.gold, borderRadius: 99,
          paddingHorizontal: 24, paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.void }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ padding: 20, gap: 14 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>Send to Incoming Manager</Text>
        <Text style={{ fontSize: 13, color: C.mist }}>
          The digest will be sent as a text message. Enter the incoming manager's phone number.
        </Text>
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: C.surfaceHi, borderRadius: 12,
          borderWidth: 1, borderColor: C.rim,
          paddingHorizontal: 12, paddingVertical: 2, gap: 8,
        }}>
          <Ionicons name="call-outline" size={16} color={C.smoke} />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 555-5555"
            placeholderTextColor={C.smoke}
            keyboardType="phone-pad"
            style={{ flex: 1, fontSize: 15, color: C.pearl, paddingVertical: 10 }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={onDone}
            style={{
              flex: 1, paddingVertical: 12, borderRadius: 99,
              backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.mist }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || phone.length < 10}
            style={{
              flex: 2, paddingVertical: 12, borderRadius: 99,
              backgroundColor: sending || phone.length < 10 ? C.surfaceHi : C.gold,
              alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
            }}
          >
            {sending
              ? <ActivityIndicator size="small" color={C.mist} />
              : <Ionicons name="send-outline" size={14} color={phone.length >= 10 ? C.void : C.smoke} />
            }
            <Text style={{ fontSize: 14, fontWeight: "700", color: sending || phone.length < 10 ? C.smoke : C.void }}>
              {sending ? "Sending…" : "Send Text"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ShiftHandoff({ visible, onClose }: Props) {
  const [selectedHours, setSelectedHours] = useState<Window>(8);
  const [loading, setLoading] = useState(false);
  const [digest, setDigest] = useState<HandoffDigest | null>(null);
  const [showSend, setShowSend] = useState(false);

  async function generate(hours: Window) {
    setSelectedHours(hours);
    setDigest(null);
    setShowSend(false);
    setLoading(true);
    try {
      const data = await getShiftHandoff(hours);
      setDigest(data);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate handoff.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setDigest(null);
    setLoading(false);
    setShowSend(false);
    onClose();
  }

  const hasUrgent = digest
    ? digest.logEntries.some(l => l.severity === "HIGH") || digest.watchFor.length > 0
    : false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: C.void }}>

        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
          backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim,
          gap: 12,
        }}>
          <View style={{
            width: 36, height: 36, borderRadius: 10,
            backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim,
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="document-text-outline" size={18} color={C.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: C.pearl }}>Shift Handoff</Text>
            <Text style={{ fontSize: 12, color: C.mist }}>Generate a digest for the incoming manager</Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 32, height: 32, borderRadius: 99,
              backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={16} color={C.mist} />
          </TouchableOpacity>
        </View>

        {/* Window selector + generate + send */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim,
          flexWrap: "wrap",
        }}>
          <Text style={{ fontSize: 13, color: C.mist }}>Look back</Text>
          {WINDOWS.map(w => (
            <TouchableOpacity
              key={w.hours}
              onPress={() => setSelectedHours(w.hours)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99,
                backgroundColor: selectedHours === w.hours ? C.gold : C.surfaceHi,
                borderWidth: 1,
                borderColor: selectedHours === w.hours ? C.gold : C.rim,
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: "600",
                color: selectedHours === w.hours ? C.void : C.mist,
              }}>
                {w.label}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {/* Send button — only shown when digest is ready */}
          {digest && !showSend && (
            <TouchableOpacity
              onPress={() => setShowSend(true)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                backgroundColor: C.surfaceHi,
                paddingHorizontal: 13, paddingVertical: 9,
                borderRadius: 99, borderWidth: 1, borderColor: C.rim,
              }}
            >
              <Ionicons name="send-outline" size={13} color={C.mist} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.mist }}>Send</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => generate(selectedHours)}
            disabled={loading}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: loading ? C.surfaceHi : C.gold,
              paddingHorizontal: 16, paddingVertical: 9,
              borderRadius: 99, ...shadow.gold,
            }}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.mist} />
              : <Ionicons name="sparkles-outline" size={14} color={C.void} />
            }
            <Text style={{ fontSize: 13, fontWeight: "700", color: loading ? C.mist : C.void }}>
              {loading ? "Generating…" : digest ? "Regenerate" : "Generate"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Send sheet (inline, slides in below toolbar) */}
        {showSend && digest && (
          <View style={{
            backgroundColor: C.surface,
            borderBottomWidth: 1, borderBottomColor: C.rim,
          }}>
            <SendSheet digest={digest} onDone={() => setShowSend(false)} />
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>

          {/* Empty / prompt state */}
          {!loading && !digest && (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 14 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name="document-text-outline" size={30} color={C.gold} />
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: C.pearl }}>Ready to generate</Text>
                <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", paddingHorizontal: 40 }}>
                  Choose a look-back window and tap Generate to create an AI-written handoff note.
                </Text>
              </View>
            </View>
          )}

          {/* Loading skeleton */}
          {loading && (
            <View style={{ gap: 10 }}>
              {[120, 90, 70, 100].map((h, i) => (
                <View key={i} style={{
                  height: h, backgroundColor: C.surfaceHi,
                  borderRadius: 16, borderWidth: 1, borderColor: C.rim,
                }} />
              ))}
            </View>
          )}

          {digest && (
            <>
              {/* Period badge */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="time-outline" size={13} color={C.smoke} />
                <Text style={{ fontSize: 12, color: C.smoke }}>
                  {fmtTime(digest.period.from)} → {fmtTime(digest.period.to)}
                  {"  ·  "}{digest.period.hours}h window
                </Text>
                {digest.aiPowered && (
                  <View style={{
                    backgroundColor: T.jade, borderRadius: 99,
                    paddingHorizontal: 8, paddingVertical: 2, marginLeft: 4,
                    borderWidth: 1, borderColor: C.jade + "44",
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.jade }}>AI</Text>
                  </View>
                )}
              </View>

              {/* ── URGENT BANNER — shown when HIGH severity items exist ── */}
              {hasUrgent && (
                <View style={{
                  backgroundColor: "#FF3B3011",
                  borderRadius: 14, padding: 14,
                  borderWidth: 1.5, borderColor: C.coral + "66",
                  gap: 8,
                }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="alert-circle" size={16} color={C.coral} />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: C.coral, textTransform: "uppercase", letterSpacing: 1.2 }}>
                      Needs Attention
                    </Text>
                  </View>
                  {digest.watchFor.map((item, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <Text style={{ fontSize: 13, color: C.coral, lineHeight: 20 }}>•</Text>
                      <Text style={{ fontSize: 13, color: C.pearl, lineHeight: 20, flex: 1 }}>
                        {item.replace(/^[🔴📋⚠️🚫]\s*/, "")}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Narrative */}
              <Card>
                <Text style={{ fontSize: 14, color: C.pearl, lineHeight: 22 }}>
                  {digest.narrative}
                </Text>
              </Card>

              {/* Sales */}
              <Card>
                <SectionHeader icon="cash-outline" label="Sales" color={C.jade} />
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <View style={{
                    flex: 1, backgroundColor: T.jade, borderRadius: 12,
                    padding: 12, alignItems: "center", gap: 2,
                  }}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: C.jade }}>
                      {fmtCurrency(digest.sales.total)}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.jade + "BB" }}>Revenue</Text>
                  </View>
                  <View style={{
                    flex: 1, backgroundColor: C.surfaceHi, borderRadius: 12,
                    padding: 12, alignItems: "center", gap: 2,
                    borderWidth: 1, borderColor: C.rim,
                  }}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>
                      {digest.sales.orderCount}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>Orders</Text>
                  </View>
                  <View style={{
                    flex: 1, backgroundColor: C.surfaceHi, borderRadius: 12,
                    padding: 12, alignItems: "center", gap: 2,
                    borderWidth: 1, borderColor: C.rim,
                  }}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>
                      {fmtCurrency(digest.sales.avgCheck)}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>Avg check</Text>
                  </View>
                </View>
                {digest.sales.topItems.length > 0 && (
                  <>
                    <Text style={{ fontSize: 11, color: C.smoke, fontWeight: "600", marginBottom: 6 }}>TOP SELLERS</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {digest.sales.topItems.map(item => (
                        <Pill key={item.name} label={`${item.name} ×${item.qty}`} color={C.jade} bg={T.jade} />
                      ))}
                    </View>
                  </>
                )}
              </Card>

              {/* Staff */}
              <Card>
                <SectionHeader
                  icon="people-outline"
                  label="On Floor"
                  count={digest.labor.clockedIn.length}
                  color={C.sky}
                />
                {digest.labor.clockedIn.length === 0 ? (
                  <Text style={{ fontSize: 13, color: C.smoke }}>No one currently clocked in</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {digest.labor.clockedIn.map((s, i) => (
                      <View key={i} style={{
                        flexDirection: "row", alignItems: "center",
                        backgroundColor: T.sky, borderRadius: 10, padding: 10, gap: 10,
                      }}>
                        <View style={{
                          width: 32, height: 32, borderRadius: 99,
                          backgroundColor: C.sky + "22", alignItems: "center", justifyContent: "center",
                        }}>
                          <Ionicons name="person-outline" size={15} color={C.sky} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{s.name}</Text>
                          <Text style={{ fontSize: 11, color: C.mist }}>{roleLabel(s.role)} · since {s.since}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {digest.labor.recentlyOut.length > 0 && (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Text style={{ fontSize: 10, color: C.smoke, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 }}>
                      Recently clocked out
                    </Text>
                    {digest.labor.recentlyOut.map((s, i) => (
                      <Text key={i} style={{ fontSize: 12, color: C.mist }}>
                        {s.name} ({s.duration})
                      </Text>
                    ))}
                  </View>
                )}
              </Card>

              {/* 86'd items */}
              {digest.kitchen.eightySixed.length > 0 && (
                <Card>
                  <SectionHeader
                    icon="close-circle-outline"
                    label="86'd"
                    count={digest.kitchen.eightySixed.length}
                    color={C.coral}
                  />
                  <View style={{ gap: 6 }}>
                    {digest.kitchen.eightySixed.map((e, i) => (
                      <View key={i} style={{
                        flexDirection: "row", alignItems: "flex-start", gap: 8,
                        backgroundColor: T.coral, borderRadius: 10, padding: 10,
                      }}>
                        <Ionicons name="remove-circle-outline" size={15} color={C.coral} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{e.item}</Text>
                          {e.reason && <Text style={{ fontSize: 11, color: C.mist, marginTop: 1 }}>{e.reason}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Low stock */}
              {digest.inventory.lowStock.length > 0 && (
                <Card>
                  <SectionHeader
                    icon="warning-outline"
                    label="Low Stock"
                    count={digest.inventory.lowStock.length}
                    color={C.ember}
                  />
                  <View style={{ gap: 6 }}>
                    {digest.inventory.lowStock.map((i, idx) => {
                      const pct = i.par > 0 ? i.qty / i.par : 1;
                      const isCritical = pct < 0.5;
                      return (
                        <View key={idx} style={{
                          flexDirection: "row", alignItems: "center",
                          backgroundColor: isCritical ? T.coral : T.ember,
                          borderRadius: 10, padding: 10, gap: 10,
                          borderWidth: isCritical ? 1 : 0,
                          borderColor: isCritical ? C.coral + "44" : "transparent",
                        }}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{i.name}</Text>
                              {isCritical && (
                                <View style={{
                                  backgroundColor: C.coral + "33", borderRadius: 4,
                                  paddingHorizontal: 5, paddingVertical: 1,
                                }}>
                                  <Text style={{ fontSize: 9, fontWeight: "700", color: C.coral }}>CRITICAL</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 11, color: C.mist }}>
                              {i.qty} {i.unit} remaining · par {i.par} {i.unit}
                            </Text>
                          </View>
                          <View style={{
                            backgroundColor: (isCritical ? C.coral : C.ember) + "22", borderRadius: 8,
                            paddingHorizontal: 8, paddingVertical: 4,
                          }}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: isCritical ? C.coral : C.ember }}>
                              {Math.round(pct * 100)}%
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              )}

              {/* Upcoming reservations */}
              {digest.reservations.upcoming.length > 0 && (
                <Card>
                  <SectionHeader
                    icon="calendar-outline"
                    label="Coming Up"
                    count={digest.reservations.upcoming.length}
                    color={C.sky}
                  />
                  <View style={{ gap: 6 }}>
                    {digest.reservations.upcoming.map((r, i) => {
                      const hasNotes = r.notes && r.notes.trim();
                      return (
                        <View key={i} style={{
                          flexDirection: "row", alignItems: "flex-start",
                          borderLeftWidth: 3,
                          borderLeftColor: hasNotes ? C.ember : C.sky,
                          paddingLeft: 10, paddingVertical: 6, gap: 8,
                        }}>
                          <Text style={{ fontSize: 15, fontWeight: "700", color: hasNotes ? C.ember : C.sky, width: 48 }}>
                            {r.time}
                          </Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{r.name}</Text>
                            <Text style={{ fontSize: 11, color: C.mist }}>Party of {r.partySize}</Text>
                            {hasNotes && (
                              <View style={{
                                flexDirection: "row", alignItems: "center", gap: 4,
                                marginTop: 4, backgroundColor: T.ember,
                                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                              }}>
                                <Ionicons name="information-circle-outline" size={12} color={C.ember} />
                                <Text style={{ fontSize: 11, color: C.ember, fontWeight: "500", flex: 1 }}>
                                  {r.notes}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              )}

              {/* Manager log */}
              {digest.logEntries.length > 0 && (
                <Card style={{ marginBottom: 4 }}>
                  <SectionHeader
                    icon="clipboard-outline"
                    label="Manager Log"
                    count={digest.logEntries.length}
                    color={C.mist}
                  />
                  <View style={{ gap: 8 }}>
                    {digest.logEntries.map((l, i) => {
                      const isHigh = l.severity === "HIGH";
                      const isMed = l.severity === "MEDIUM";
                      const color = isHigh ? C.coral : isMed ? C.ember : C.mist;
                      const bg = isHigh ? "#FF3B3011" : C.surfaceHi;
                      const borderColor = isHigh ? C.coral + "55" : C.rim;
                      return (
                        <View key={i} style={{
                          backgroundColor: bg, borderRadius: 10,
                          padding: 10, borderWidth: isHigh ? 1.5 : 1,
                          borderColor, gap: 4,
                        }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            {isHigh && (
                              <Ionicons name="alert-circle" size={13} color={C.coral} />
                            )}
                            <Text style={{ fontSize: 10, fontWeight: "700", color, textTransform: "uppercase", flex: 1 }}>
                              {l.type.replace("_", " ")}
                              {l.shift ? ` · ${l.shift}` : ""}
                              {l.severity ? ` · ${l.severity}` : ""}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{l.title}</Text>
                          {l.followUp && (
                            <View style={{
                              flexDirection: "row", alignItems: "flex-start", gap: 4,
                              marginTop: 2,
                            }}>
                              <Text style={{ fontSize: 11, color: isHigh ? C.coral : C.ember }}>↪</Text>
                              <Text style={{ fontSize: 11, color: isHigh ? C.coral : C.ember, flex: 1, fontWeight: "500" }}>
                                {l.followUp}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </Card>
              )}

              {/* All-clear */}
              {digest.kitchen.eightySixed.length === 0 &&
               digest.inventory.lowStock.length === 0 &&
               digest.logEntries.length === 0 && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: T.jade, borderRadius: 14, padding: 14, marginBottom: 8,
                  borderWidth: 1, borderColor: C.jade + "44",
                }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={C.jade} />
                  <Text style={{ fontSize: 13, color: C.jade, fontWeight: "500" }}>
                    No 86's, no low stock, no open log entries — clean handoff!
                  </Text>
                </View>
              )}

              {/* Bottom spacer */}
              <View style={{ height: 16 }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
