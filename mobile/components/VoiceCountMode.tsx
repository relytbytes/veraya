/**
 * VoiceCountMode — fullscreen shelf-to-sheet voice counting.
 *
 * Flow:
 *   areaSelect → counting (one item at a time) → review → areaSelect (next area)
 *
 * Speech lifecycle is owned entirely by a single useEffect keyed on
 * [currentIdx, visible, phase].  Back/Skip/confirm all set intentionalStopRef
 * before stopping so the "end" event handler knows NOT to auto-restart.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  TextInput, Alert, ActivityIndicator, Animated, Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { patchInventoryItem, parseSpokenCount } from "@/lib/api";
import type { InventoryItem, StorageArea } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

// ─── Speech module lazy-load ──────────────────────────────────────────────────

type SpeechResultEvent = { results?: { transcript: string }[]; isFinal?: boolean };
type Subscription = { remove: () => void };
type SpeechModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (opts: object) => void;
  stop: () => void;
  addListener: (event: string, cb: (e: SpeechResultEvent) => void) => Subscription;
};

let _speechModule: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _speechModule = require("expo-speech-recognition").ExpoSpeechRecognitionModule as SpeechModule;
} catch {
  // Native module not linked — manual entry fallback will be shown
}

const voiceAvailable = _speechModule !== null;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CountedItem {
  item: InventoryItem;
  area: string;
  shelfOrder: number;
}

interface Props {
  visible: boolean;
  areas: StorageArea[];
  inventory: InventoryItem[];
  onClose: () => void;
  onComplete: () => void;
}

const AUTO_ADVANCE_MS = 2500;

// ─── Number parsing ───────────────────────────────────────────────────────────

function parseSpoken(transcript: string): number | null {
  const t = transcript.toLowerCase().trim();
  const wordMap: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    half: 0.5, quarter: 0.25, "a half": 0.5,
  };

  const direct = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!isNaN(direct) && t.match(/^[\d.,\s]+$/)) return direct;

  // iOS often outputs "twenty-four" — normalise hyphens to spaces first
  let normalized = t.replace(/-/g, " ").replace(/\band\b/g, "").replace(/\bpoint\b/g, ".");
  const parts = normalized.split(".");
  const parsePart = (p: string): number => {
    p = p.trim();
    const n = parseFloat(p);
    if (!isNaN(n)) return n;
    let total = 0;
    for (const word of p.split(/\s+/)) {
      const v = wordMap[word];
      if (v !== undefined) total += v;
    }
    return total;
  };

  // Parse decimal digits spoken as words: "three"→0.3, "eight"→0.8, "two five"→0.25
  const parseDecimal = (s: string): number => {
    const words = s.trim().split(/\s+/);
    const digits: number[] = [];
    for (const w of words) {
      const n = parseInt(w, 10);
      if (!isNaN(n) && n >= 0 && n <= 9) { digits.push(n); continue; }
      const v = wordMap[w];
      if (v !== undefined && v >= 0 && v <= 9) { digits.push(v); continue; }
      return NaN;
    }
    return digits.length ? parseFloat("0." + digits.join("")) : NaN;
  };

  if (parts.length === 2) {
    const intPart = parsePart(parts[0]);
    const decValue = parseDecimal(parts[1]);
    return isNaN(decValue) ? intPart : intPart + decValue;
  }

  const total = parsePart(normalized);
  return total > 0 || normalized.includes("zero") ? total : null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VoiceCountMode({ visible, areas, inventory, onClose, onComplete }: Props) {
  const qc = useQueryClient();

  const orderedItems: CountedItem[] = areas
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(area =>
      inventory
        .filter(i => i.storageArea === area.name)
        .sort((a, b) => (a.shelfOrder ?? 999) - (b.shelfOrder ?? 999))
        .map(item => ({ item, area: area.name, shelfOrder: item.shelfOrder ?? 999 }))
    );

  type Phase = "areaSelect" | "counting" | "review";

  const [phase, setPhase] = useState<Phase>("areaSelect");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [reviewArea, setReviewArea] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAreas, setSavedAreas] = useState<Set<string>>(new Set());

  // ── Refs used by speech event handlers to avoid stale closures ──────────────
  // Refs are always up-to-date regardless of render cycle.
  const intentionalStopRef = useRef(false); // true → don't auto-restart on "end"
  const phaseRef = useRef<Phase>("areaSelect");
  const visibleRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);
  const aiBusyRef = useRef(false);
  const isStartingRef = useRef(false);   // guard against concurrent start calls
  const isRunningRef  = useRef(false);   // true while a native session is active
  const permGrantedRef = useRef(false);  // cache permission so we only ask once
  const initializedRef = useRef(false);  // skip redundant reset on first mount

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => { pendingValueRef.current = pendingValue; }, [pendingValue]);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmPendingRef = useRef<() => void>(() => {});
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;

  const current = orderedItems[currentIdx] ?? null;
  const totalItems = orderedItems.length;

  // ── Animations ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isListening) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isListening]);

  useEffect(() => {
    if (pendingValue === null) { countdownAnim.setValue(1); return; }
    countdownAnim.setValue(1);
    Animated.timing(countdownAnim, { toValue: 0, duration: AUTO_ADVANCE_MS, useNativeDriver: false }).start();
  }, [pendingValue]);

  // Keep ref current so the scheduled timeout always calls the latest version
  confirmPendingRef.current = confirmPending;

  useEffect(() => {
    if (pendingValue === null) return;

    setCountdown(AUTO_ADVANCE_MS);

    // Visual tick — only updates the displayed number, no state setters inside
    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 100));
    }, 100);
    countdownRef.current = interval;

    // Actual confirmation fires once after the full delay (separate from the
    // display tick — calling confirmPending inside a setCountdown updater is
    // illegal in React and was silently dropped)
    confirmTimerRef.current = setTimeout(() => {
      confirmPendingRef.current();
    }, AUTO_ADVANCE_MS);

    return () => {
      clearInterval(interval);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [pendingValue]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setCountdown(0);
  }

  // ── Speech start/stop ────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (!_speechModule || isStartingRef.current || isRunningRef.current) return;
    isStartingRef.current = true;
    try {
      if (!permGrantedRef.current) {
        const perm = await _speechModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Allow microphone access in Settings to use voice counting.");
          return;
        }
        permGrantedRef.current = true;
      }
      // continuous: true keeps the session alive until we explicitly stop it,
      // eliminating the rapid on/off cycling caused by iOS's short silence timeout
      _speechModule.start({ lang: "en-US", interimResults: true, continuous: true });
      isRunningRef.current = true;
      setIsListening(true);
    } catch {
      // Swallow — errors here are usually "already started" races
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  /** Stop the recogniser.  Pass intentional=true so the "end" handler won't restart.
   *  No-ops if the session is already down — prevents double-stop from the result
   *  handler and the useEffect cleanup both calling stop(), which would produce two
   *  "end" events, the second of which would restart the mic unintentionally. */
  const stopListening = useCallback((intentional = false) => {
    if (!_speechModule) return;
    if (!isRunningRef.current && !isStartingRef.current) return; // already down
    if (intentional) intentionalStopRef.current = true;
    isStartingRef.current = false;
    isRunningRef.current = false;
    try { _speechModule.stop(); } catch { /* already stopped */ }
    setIsListening(false);
  }, []);

  // ── Native speech event listeners — registered ONCE via stable refs ──────────
  //
  // useSpeechRecognitionEvent() puts its handler in a useEffect dep array, so
  // every render with a new arrow function triggers a remove+re-add.  An "end"
  // event that fires in that brief window disappears, and the next handler fires
  // on mount instead — causing the visible mic flicker.
  //
  // Instead we register directly on the module ONCE and route calls through refs
  // so the handlers always see current state without re-registering.

  const onResultRef = useRef<(e: SpeechResultEvent) => void>(() => {});
  const onEndRef    = useRef<() => void>(() => {});
  const onErrorRef  = useRef<() => void>(() => {});

  // Update the refs on every render so they always hold the latest closures
  onResultRef.current = (e: SpeechResultEvent) => {
    const transcript = e.results?.[0]?.transcript ?? "";
    if (!transcript) return;
    const val = parseSpoken(transcript);
    if (val === null) {
      // Fuzzy phrase the regex can't handle ("a case and a half", "two dozen").
      // Let Vera interpret it — only on a final result, one call at a time, and
      // only while we're still waiting on this item.
      if (e.isFinal && current && pendingValueRef.current === null && !aiBusyRef.current) {
        aiBusyRef.current = true;
        parseSpokenCount(transcript, [{ id: current.item.id, name: current.item.ingredient.name, unit: current.item.ingredient.unit }])
          .then((res) => { const q = res.results[0]?.quantity; if (q != null && pendingValueRef.current === null) setPendingValue(String(q)); })
          .catch(() => { /* ignore — user can speak again */ })
          .finally(() => { aiBusyRef.current = false; });
      }
      return;
    }
    if (val !== null) {
      // Keep the mic open — don't stop here. This lets the user finish saying
      // "fifty point three": we hear "fifty" first (→ pending "50", countdown
      // starts), then "fifty point three" arrives (→ pending "50.3", countdown
      // resets). Duplicate events with the same parsed value are silently ignored
      // by React (same dep → useEffect([pendingValue]) doesn't re-run → timer
      // continues untouched). The mic stops naturally via useEffect cleanup when
      // currentIdx/phase changes after confirmation.
      setPendingValue(String(val));
    }
  };

  onEndRef.current = () => {
    isRunningRef.current = false; // session is definitely down now
    setIsListening(false);
    if (
      !intentionalStopRef.current &&
      pendingValueRef.current === null &&
      phaseRef.current === "counting" &&
      visibleRef.current
    ) {
      setTimeout(startListening, 300);
    }
    intentionalStopRef.current = false;
  };

  onErrorRef.current = () => {
    setIsListening(false);
    if (
      !intentionalStopRef.current &&
      pendingValueRef.current === null &&
      phaseRef.current === "counting" &&
      visibleRef.current
    ) {
      setTimeout(startListening, 500);
    }
    intentionalStopRef.current = false;
  };

  // Register once — empty dep array ensures no re-registration
  useEffect(() => {
    if (!_speechModule) return;
    const subs = [
      _speechModule.addListener("result", (e) => onResultRef.current(e)),
      _speechModule.addListener("end",    ()  => onEndRef.current()),
      _speechModule.addListener("error",  ()  => onErrorRef.current()),
    ];
    return () => subs.forEach(s => s.remove());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single source of truth: start listening when entering a counting item ────
  // Cleanup stops the previous session (intentionally) before the new one starts.

  useEffect(() => {
    if (!visible || phase !== "counting" || !current || pendingValue !== null) return;
    startListening();
    return () => { stopListening(true); };
  }, [currentIdx, visible, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset on open/close ──────────────────────────────────────────────────────
  // Skip the reset on the very first mount: the component is conditionally
  // mounted in inventory.tsx so state already starts at its defaults, and
  // setting them again causes a redundant render that flashes during the modal
  // slide animation.

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (visible) {
      setCurrentIdx(0);
      setCounts({});
      setPendingValue(null);
      setPhase("areaSelect");
      setReviewArea(null);
      setSavedAreas(new Set());
      intentionalStopRef.current = false;
    } else {
      stopListening(true);
      clearCountdown();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ───────────────────────────────────────────────────────────────

  function confirmPending() {
    if (!current || pendingValue === null) return;
    clearCountdown();
    const val = pendingValue;
    setPendingValue(null);
    setCounts(prev => ({ ...prev, [current.item.id]: val }));
    advanceFrom(currentIdx);
  }

  function cancelPending() {
    clearCountdown();
    setPendingValue(null);
    startListening(); // useEffect won't fire (currentIdx unchanged), so restart manually
  }

  function advanceFrom(fromIdx: number) {
    const nextIdx = fromIdx + 1;
    if (nextIdx >= totalItems) {
      // All items done — review last area
      setReviewArea(orderedItems[fromIdx]?.area ?? null);
      setPhase("review");
      return;
    }
    const nextArea = orderedItems[nextIdx].area;
    const currArea = orderedItems[fromIdx]?.area;
    if (nextArea !== currArea) {
      // Crossed area boundary — go to review
      setReviewArea(currArea ?? null);
      setPhase("review");
    } else {
      // Same area — next item; useEffect will start listening
      setCurrentIdx(nextIdx);
    }
  }

  function goBack() {
    clearCountdown();
    setPendingValue(null);
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      // useEffect cleanup stops current session; new effect starts fresh
    }
  }

  function skip() {
    clearCountdown();
    setPendingValue(null);
    advanceFrom(currentIdx);
  }

  /** Called from AreaSelectView when user taps a location card */
  function startFromArea(areaName: string) {
    const firstIdx = orderedItems.findIndex(c => c.area === areaName);
    if (firstIdx === -1) return;
    setCurrentIdx(firstIdx);
    setPhase("counting"); // triggers useEffect → startListening
  }

  async function saveArea(area: string, edits: Record<string, string>) {
    setSaving(true);
    try {
      const itemsInArea = orderedItems.filter(c => c.area === area);
      await Promise.all(
        itemsInArea.map(c => {
          const val = parseFloat(edits[c.item.id] ?? "");
          if (isNaN(val)) return Promise.resolve();
          return patchInventoryItem(c.item.id, { quantity: val });
        })
      );

      const nextSaved = new Set([...savedAreas, area]);
      setSavedAreas(nextSaved);

      const remaining = orderedItems.findIndex(c => !nextSaved.has(c.area));
      if (remaining === -1) {
        await qc.invalidateQueries({ queryKey: ["inventory"] });
        onComplete();
        return;
      }
      // Return to area picker so user can choose what to count next
      setPhase("areaSelect");
      setReviewArea(null);
    } catch (e) {
      Alert.alert("Save error", String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.void }}>
        {phase === "areaSelect" ? (
          <AreaSelectView
            areas={areas}
            orderedItems={orderedItems}
            savedAreas={savedAreas}
            counts={counts}
            onSelectArea={startFromArea}
            onClose={onClose}
          />
        ) : phase === "counting" && current ? (
          <CountingView
            item={current}
            idx={currentIdx}
            total={totalItems}
            pendingValue={pendingValue}
            isListening={isListening}
            countdown={countdown}
            pulseAnim={pulseAnim}
            countdownAnim={countdownAnim}
            counts={counts}
            voiceAvailable={voiceAvailable}
            onConfirm={confirmPending}
            onCancel={cancelPending}
            onSkip={skip}
            onBack={goBack}
            onClose={onClose}
            onManualEntry={(val) => {
              setCounts(prev => ({ ...prev, [current.item.id]: val }));
              advanceFrom(currentIdx);
            }}
            onStartListening={startListening}
            onStopListening={() => stopListening(true)}
          />
        ) : (
          <ReviewView
            area={reviewArea ?? ""}
            items={orderedItems.filter(c => c.area === reviewArea)}
            counts={counts}
            saving={saving}
            onSave={saveArea}
            onBack={() => {
              const lastInArea = orderedItems.reduce(
                (last, c, i) => c.area === reviewArea ? i : last, 0
              );
              setCurrentIdx(lastInArea);
              setPendingValue(null);
              setPhase("counting");
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Area selection screen ────────────────────────────────────────────────────

interface AreaSelectViewProps {
  areas: StorageArea[];
  orderedItems: CountedItem[];
  savedAreas: Set<string>;
  counts: Record<string, string>;
  onSelectArea: (areaName: string) => void;
  onClose: () => void;
}

function AreaSelectView({ areas, orderedItems, savedAreas, counts, onSelectArea, onClose }: AreaSelectViewProps) {
  const sortedAreas = areas.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const remaining = sortedAreas.filter(a => !savedAreas.has(a.name));
  const done = sortedAreas.filter(a => savedAreas.has(a.name));

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{
        backgroundColor: C.surface,
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
        borderBottomWidth: 1, borderColor: C.rim,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.mist, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2 }}>
              Voice Count
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>Choose Location</Text>
          </View>
          {savedAreas.size > 0 && (
            <View style={{ backgroundColor: T.jade, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: C.jade }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade }}>
                {savedAreas.size}/{sortedAreas.length} saved
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 13, color: C.smoke, marginBottom: 4 }}>
          Tap a storage area to start counting. You can do areas in any order.
        </Text>

        {remaining.map(area => {
          const areaItems = orderedItems.filter(c => c.area === area.name);
          const countedHere = areaItems.filter(c => counts[c.item.id] !== undefined).length;
          const inProgress = countedHere > 0 && countedHere < areaItems.length;

          return (
            <TouchableOpacity
              key={area.id}
              onPress={() => onSelectArea(area.name)}
              activeOpacity={0.75}
              style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: inProgress ? C.gold : C.rim,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                ...shadow.sm,
              }}
            >
              <View style={{
                width: 46, height: 46, borderRadius: 13,
                backgroundColor: inProgress ? T.gold : C.surfaceHi,
                alignItems: "center", justifyContent: "center",
                borderWidth: 1, borderColor: inProgress ? C.goldDim : C.rim,
              }}>
                <Ionicons
                  name={inProgress ? "time-outline" : "cube-outline"}
                  size={21}
                  color={inProgress ? C.gold : C.smoke}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{area.name}</Text>
                <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>
                  {inProgress
                    ? `${countedHere} of ${areaItems.length} counted — resume`
                    : `${areaItems.length} item${areaItems.length !== 1 ? "s" : ""}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.smoke} />
            </TouchableOpacity>
          );
        })}

        {done.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
              <Text style={{ fontSize: 10, color: C.smoke, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 }}>
                Saved
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
            </View>
            {done.map(area => (
              <View
                key={area.id}
                style={{
                  backgroundColor: C.surface,
                  borderRadius: 16, borderWidth: 1, borderColor: C.rim,
                  padding: 16, flexDirection: "row", alignItems: "center", gap: 14,
                  opacity: 0.6,
                }}
              >
                <View style={{
                  width: 46, height: 46, borderRadius: 13,
                  backgroundColor: T.jade,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 1, borderColor: C.jade,
                }}>
                  <Ionicons name="checkmark" size={22} color={C.jade} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{area.name}</Text>
                  <Text style={{ fontSize: 12, color: C.jade, marginTop: 2 }}>Saved ✓</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {remaining.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Ionicons name="checkmark-circle" size={52} color={C.jade} />
            <Text style={{ color: C.pearl, fontSize: 17, fontWeight: "700" }}>All locations counted!</Text>
            <Text style={{ color: C.mist, fontSize: 13 }}>Save & Continue from any area to finish.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Counting screen ──────────────────────────────────────────────────────────

interface CountingViewProps {
  item: CountedItem;
  idx: number;
  total: number;
  pendingValue: string | null;
  isListening: boolean;
  countdown: number;
  pulseAnim: Animated.Value;
  countdownAnim: Animated.Value;
  counts: Record<string, string>;
  voiceAvailable: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onBack: () => void;
  onClose: () => void;
  onManualEntry: (val: string) => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

function CountingView({
  item, idx, total, pendingValue, isListening, countdown,
  pulseAnim, countdownAnim, counts, voiceAvailable,
  onConfirm, onCancel, onSkip, onBack, onClose, onManualEntry,
  onStartListening, onStopListening,
}: CountingViewProps) {
  const [manualInput, setManualInput] = useState("");
  const progress = idx / total;
  const alreadyCounted = counts[item.item.id];

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{
        backgroundColor: C.surface,
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
        borderBottomWidth: 1, borderColor: C.rim,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.mist, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2 }}>
              {item.area}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>Voice Count</Text>
          </View>
          <Text style={{ fontSize: 13, color: C.smoke }}>{idx + 1} / {total}</Text>
        </View>
        <View style={{ height: 3, backgroundColor: C.surfaceHi, borderRadius: 99, marginTop: 12, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: C.gold, borderRadius: 99 }} />
        </View>
      </View>

      {/* Main item card */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 32 }}>
        <View style={{ alignItems: "center", gap: 8, width: "100%" }}>
          <Text style={{ fontSize: 11, color: C.smoke, textTransform: "uppercase", letterSpacing: 1.5 }}>Count this item</Text>
          <Text style={{ fontSize: 34, fontWeight: "800", color: C.pearl, textAlign: "center" }}>
            {item.item.ingredient.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 15, color: C.mist }}>On hand:</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.mist }}>
              {Number(item.item.quantity).toFixed(1)} {item.item.ingredient.unit}
            </Text>
          </View>
          {alreadyCounted && (
            <View style={{
              paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99,
              backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim,
            }}>
              <Text style={{ fontSize: 12, color: C.gold, fontWeight: "600" }}>
                Counted: {alreadyCounted} {item.item.ingredient.unit}
              </Text>
            </View>
          )}
        </View>

        {/* Pending confirmation display */}
        {pendingValue !== null ? (
          <View style={{ alignItems: "center", gap: 16, width: "100%" }}>
            <View style={{
              backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.jade,
              padding: 28, alignItems: "center", width: "100%", ...shadow.md,
            }}>
              <Text style={{ fontSize: 11, color: C.jade, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
                Heard
              </Text>
              <Text style={{ fontSize: 52, fontWeight: "800", color: C.pearl }}>{pendingValue}</Text>
              <Text style={{ fontSize: 15, color: C.mist }}>{item.item.ingredient.unit}</Text>
              <View style={{ width: "100%", height: 4, backgroundColor: C.surfaceHi, borderRadius: 99, marginTop: 20, overflow: "hidden" }}>
                <Animated.View style={{
                  height: "100%", borderRadius: 99, backgroundColor: C.jade,
                  width: countdownAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                }} />
              </View>
              <Text style={{ fontSize: 11, color: C.smoke, marginTop: 6 }}>
                Confirming in {(countdown / 1000).toFixed(1)}s…
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                onPress={onCancel}
                style={{
                  flex: 1, paddingVertical: 16, borderRadius: 16,
                  backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, alignItems: "center",
                }}
              >
                <Text style={{ color: C.mist, fontWeight: "600", fontSize: 14 }}>Re-try</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onConfirm}
                style={{ flex: 1, paddingVertical: 16, borderRadius: 16, backgroundColor: C.jade, alignItems: "center", ...shadow.sm }}
              >
                <Text style={{ color: C.void, fontWeight: "700", fontSize: 14 }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : voiceAvailable ? (
          /* Voice input */
          <View style={{ alignItems: "center", gap: 20 }}>
            <TouchableOpacity onPress={isListening ? onStopListening : onStartListening} activeOpacity={0.8}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={{
                  width: 100, height: 100, borderRadius: 50,
                  backgroundColor: isListening ? T.jade : C.surface,
                  borderWidth: 2, borderColor: isListening ? C.jade : C.rim,
                  alignItems: "center", justifyContent: "center", ...shadow.md,
                }}>
                  <Ionicons name={isListening ? "mic" : "mic-outline"} size={40} color={isListening ? C.jade : C.smoke} />
                </View>
              </Animated.View>
            </TouchableOpacity>
            <Text style={{ fontSize: 14, color: isListening ? C.jade : C.smoke, fontWeight: "600" }}>
              {isListening ? "Listening… say a number" : "Tap mic to start"}
            </Text>
          </View>
        ) : (
          /* Manual entry fallback */
          <View style={{ alignItems: "center", gap: 16, width: "100%" }}>
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="mic-off-outline" size={36} color={C.smoke} />
              <Text style={{ fontSize: 12, color: C.smoke, textAlign: "center" }}>
                Voice unavailable — enter manually
              </Text>
            </View>
            <View style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim,
              borderRadius: 16, overflow: "hidden", width: "100%",
            }}>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 16, fontSize: 28, fontWeight: "700", color: C.pearl, textAlign: "center" }}
                value={manualInput}
                onChangeText={setManualInput}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={C.smoke}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (manualInput.trim()) { onManualEntry(manualInput.trim()); setManualInput(""); }
                }}
              />
              <Text style={{ paddingRight: 16, fontSize: 15, color: C.mist }}>{item.item.ingredient.unit}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { if (manualInput.trim()) { onManualEntry(manualInput.trim()); setManualInput(""); } }}
              disabled={!manualInput.trim()}
              style={{
                width: "100%", paddingVertical: 16, borderRadius: 16,
                backgroundColor: manualInput.trim() ? C.jade : C.surfaceHi, alignItems: "center",
              }}
            >
              <Text style={{ color: manualInput.trim() ? C.void : C.smoke, fontWeight: "700", fontSize: 15 }}>
                Next →
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom nav */}
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
        gap: 12, borderTopWidth: 1, borderColor: C.rim, backgroundColor: C.surface,
      }}>
        <TouchableOpacity
          onPress={onBack}
          disabled={idx === 0}
          style={{
            paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14,
            backgroundColor: idx === 0 ? C.surfaceHi : C.surface,
            borderWidth: 1, borderColor: C.rim,
            alignItems: "center", flexDirection: "row", gap: 6,
          }}
        >
          <Ionicons name="chevron-back" size={16} color={idx === 0 ? C.smoke : C.mist} />
          <Text style={{ color: idx === 0 ? C.smoke : C.mist, fontWeight: "600", fontSize: 13 }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSkip}
          style={{
            flex: 1, paddingVertical: 14, borderRadius: 14,
            backgroundColor: C.surfaceHi, alignItems: "center",
          }}
        >
          <Text style={{ color: C.smoke, fontWeight: "600", fontSize: 13 }}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Review screen ────────────────────────────────────────────────────────────

interface ReviewViewProps {
  area: string;
  items: CountedItem[];
  counts: Record<string, string>;
  saving: boolean;
  onSave: (area: string, edits: Record<string, string>) => void;
  onBack: () => void;
}

function ReviewView({ area, items, counts, saving, onSave, onBack }: ReviewViewProps) {
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    items.forEach(c => { m[c.item.id] = counts[c.item.id] ?? ""; });
    return m;
  });

  useEffect(() => {
    setEdits(prev => {
      const updated = { ...prev };
      items.forEach(c => {
        const fresh = counts[c.item.id] ?? "";
        if (fresh !== "" && fresh !== prev[c.item.id]) updated[c.item.id] = fresh;
      });
      return updated;
    });
  }, [counts]);

  function hasChanges(c: CountedItem) {
    const val = parseFloat(edits[c.item.id] ?? "");
    return !isNaN(val) && Math.abs(val - Number(c.item.quantity)) >= 0.05;
  }

  const countedCount = items.filter(c => edits[c.item.id] !== "").length;

  return (
    <View style={{ flex: 1 }}>
      <View style={{
        backgroundColor: C.surface,
        paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
        borderBottomWidth: 1, borderColor: C.rim,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.gold, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2 }}>
              {area}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>Review & Save</Text>
          </View>
          <Text style={{ fontSize: 12, color: C.mist }}>{countedCount}/{items.length} counted</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}>
        <Text style={{ fontSize: 12, color: C.smoke, paddingHorizontal: 4 }}>
          Review your counts. Tap any value to edit before saving.
        </Text>

        {items.map(c => {
          const changed = hasChanges(c);
          const skipped = edits[c.item.id] === "";
          const prev = Number(c.item.quantity);
          const next = parseFloat(edits[c.item.id] ?? "");
          const delta = !isNaN(next) ? next - prev : null;

          return (
            <View
              key={c.item.id}
              style={{
                backgroundColor: C.surface, borderRadius: 14, borderWidth: 1,
                borderColor: changed ? C.jade : skipped ? C.ember : C.rim,
                padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>
                    {c.item.ingredient.name}
                  </Text>
                  {skipped && (
                    <View style={{ backgroundColor: T.ember, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: C.ember, textTransform: "uppercase" }}>
                        skipped
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }}>
                  Was: {prev.toFixed(1)} {c.item.ingredient.unit}
                  {delta !== null && (
                    <Text style={{ color: delta >= 0 ? C.jade : C.coral, fontWeight: "600" }}>
                      {" "}({delta >= 0 ? "+" : ""}{delta.toFixed(1)})
                    </Text>
                  )}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: C.surfaceHi, borderWidth: 1,
                  borderColor: changed ? C.jade : C.rim, borderRadius: 10, overflow: "hidden",
                }}>
                  <TextInput
                    style={{ paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, fontWeight: "700", color: C.pearl, minWidth: 60, textAlign: "center" }}
                    value={edits[c.item.id]}
                    onChangeText={v => setEdits(prev => ({ ...prev, [c.item.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={C.smoke}
                  />
                </View>
                <Text style={{ fontSize: 12, color: C.mist }}>{c.item.ingredient.unit}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.rim,
        padding: 20, paddingBottom: 36,
      }}>
        <TouchableOpacity
          onPress={() => onSave(area, edits)}
          disabled={saving}
          style={{
            borderRadius: 16, paddingVertical: 16, alignItems: "center",
            flexDirection: "row", justifyContent: "center", gap: 8,
            backgroundColor: saving ? C.surfaceHi : C.gold,
            ...(saving ? {} : shadow.gold),
          }}
        >
          {saving
            ? <ActivityIndicator color={C.mist} />
            : <>
                <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save & Continue</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}
