import { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Modal, ScrollView } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { C, T, shadow } from "@/lib/theme";
import { saveLayout, createTable, deleteTable } from "@/lib/api";
import type { Table } from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMins(seatedAt: string) {
  return Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
}
function elapsedLabel(seatedAt: string) {
  const m = elapsedMins(seatedAt);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function timerColor(seatedAt: string, amberAt: number, redAt: number) {
  const m = elapsedMins(seatedAt);
  return m < amberAt ? C.jade : m < redAt ? C.ember : C.coral;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LocalPos = { id: string; x: number; y: number; shape: string; rotation: number };

export type FloorSection = {
  id: string; label: string; color: string;
  x: number; y: number; w: number; h: number; // all percentages (0–100)
};

const SECTION_COLORS = [
  { label: "Warm",  value: "rgba(168,64,28,0.10)",  border: "rgba(168,64,28,0.35)"  },
  { label: "Green", value: "rgba(30,122,69,0.10)",   border: "rgba(30,122,69,0.35)"  },
  { label: "Blue",  value: "rgba(46,110,176,0.10)",  border: "rgba(46,110,176,0.35)" },
  { label: "Amber", value: "rgba(208,112,32,0.10)",  border: "rgba(208,112,32,0.35)" },
  { label: "Mist",  value: "rgba(107,82,72,0.08)",   border: "rgba(107,82,72,0.25)"  },
];

const SECTIONS_KEY = "floor_sections";

async function loadSections(): Promise<FloorSection[]> {
  try {
    const raw = await SecureStore.getItemAsync(SECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
async function saveSections(s: FloorSection[]) {
  try { await SecureStore.setItemAsync(SECTIONS_KEY, JSON.stringify(s)); } catch {}
}

// ─── Chip geometry ────────────────────────────────────────────────────────────

function chipDims(shape: string, sz: number) {
  if (shape === "round") return { w: sz, h: sz, r: sz / 2 };
  if (shape === "booth") return { w: Math.round(sz * 1.3), h: Math.round(sz * 0.7), r: 8 };
  return { w: sz, h: Math.round(sz * 0.9), r: 12 };
}

// Table-status colors — aligned to the web floor plan (reserved = teal, dirty = coral).
function statusStyle(status: string): { borderColor: string; borderWidth: number; bg: string } {
  if (status === "OCCUPIED") return { borderColor: C.jade,  borderWidth: 3,   bg: C.surfaceHi };
  if (status === "RESERVED") return { borderColor: C.gold,  borderWidth: 2,   bg: "rgba(33,160,144,0.06)" };
  if (status === "DIRTY")    return { borderColor: C.coral, borderWidth: 2,   bg: "rgba(212,64,48,0.06)" };
  return                             { borderColor: C.rim,  borderWidth: 1.5, bg: C.surface };
}

// Service-stage colors — must match the web floor plan / host stand exactly.
const STAGE_CHIP_COLOR: Record<string, string> = {
  SEATED:        "#1E7A45",
  APPS:          "#2BB39B",
  ENTREES:       "#E0A82E",
  DESSERT:       "#7C5CBF",
  CHECK_DROPPED: "#2E6EB0",
  CHECK_PAID:    "#2E6EB0",
  BUSSING:       "#D44030",
};

const STAGE_ABBREV: Record<string, string> = {
  SEATED:        "STD",
  APPS:          "APP",
  ENTREES:       "ENT",
  DESSERT:       "DST",
  CHECK_DROPPED: "CHK",
  CHECK_PAID:    "PD",
  BUSSING:       "BUS",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TableCanvasProps {
  tables: Table[];
  openOrders: Array<{ id: string; tableId: string | null; total: string | number }>;
  canvasH: number;
  tableSize: number;
  amberAt: number;
  redAt: number;
  showServerBadge: boolean;
  showOrderTotal: boolean;
  showGuestLabel: boolean;
  tick: number;
  onTablePress: (table: Table) => void;
  onLayoutSaved?: () => void;
  onEditModeChange?: (editing: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TableCanvas({
  tables, openOrders, canvasH, tableSize, amberAt, redAt,
  showServerBadge, showOrderTotal, showGuestLabel,
  tick: _tick, onTablePress, onLayoutSaved, onEditModeChange,
}: TableCanvasProps) {

  const [canvasW, setCanvasW] = useState(0);
  const [editMode, setEditMode] = useState(false);

  // Table positions
  const [localPos, setLocalPos] = useState<LocalPos[]>([]);
  const [originPos, setOriginPos] = useState<LocalPos[]>([]);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Sections
  const [sections, setSections] = useState<FloorSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [renamingSection, setRenamingSection] = useState<FloorSection | null>(null);
  const [renameText, setRenameText] = useState("");

  // Add-table modal
  const [addTableVisible, setAddTableVisible] = useState(false);
  const [newTableNum, setNewTableNum] = useState("");
  const [newTableCap, setNewTableCap] = useState("4");
  const [newTableShape, setNewTableShape] = useState<"rect" | "round" | "booth">("rect");
  const [addingTable, setAddingTable] = useState(false);

  // Drag state (refs avoid stale closures in touch handlers)
  const dragging = useRef<{ kind: "table" | "section"; id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  // Ref copies for touch handlers (set synchronously, always current)
  const localPosRef = useRef<LocalPos[]>([]);
  const sectionsRef = useRef<FloorSection[]>([]);
  const canvasWRef = useRef(0);
  const canvasHRef = useRef(canvasH);
  const tableSizeRef = useRef(tableSize);

  useEffect(() => { localPosRef.current = localPos; }, [localPos]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { canvasWRef.current = canvasW; }, [canvasW]);
  useEffect(() => { canvasHRef.current = canvasH; }, [canvasH]);
  useEffect(() => { tableSizeRef.current = tableSize; }, [tableSize]);

  // Load sections on mount
  useEffect(() => { loadSections().then(setSections); }, []);

  // Persist sections on change
  const sectionsChangeRef = useRef(false);
  useEffect(() => {
    if (!sectionsChangeRef.current) { sectionsChangeRef.current = true; return; }
    saveSections(sections);
  }, [sections]);

  // ── Position computation ──────────────────────────────────────────────────

  const computePositions = useCallback((): LocalPos[] => {
    const cw = canvasW;
    if (cw === 0) return tables.map(t => ({ id: t.id, x: 0, y: 0, shape: t.shape, rotation: t.rotation }));
    const hasPos = tables.some(t => t.floorX !== null && t.floorY !== null);
    const cols = Math.ceil(Math.sqrt(tables.length * 1.5)) || 1;
    return tables.map((t, idx) => {
      if (hasPos && t.floorX !== null && t.floorY !== null) {
        return { id: t.id, x: (t.floorX / 100) * cw, y: (t.floorY / 100) * canvasH, shape: t.shape, rotation: t.rotation };
      }
      const col = idx % cols, row = Math.floor(idx / cols);
      const pad = tableSize * 0.7;
      const rows = Math.ceil(tables.length / cols);
      const cw2 = (cw - pad * 2) / cols, ch2 = (canvasH - pad * 2) / rows;
      return { id: t.id, x: pad + col * cw2 + cw2 / 2, y: pad + row * ch2 + ch2 / 2, shape: t.shape, rotation: t.rotation };
    });
  }, [tables, canvasW, canvasH, tableSize]);

  useEffect(() => {
    if (!editMode && canvasW > 0) {
      const pos = computePositions();
      setLocalPos(pos);
      setOriginPos(pos);
    }
  }, [tables, canvasW, editMode, computePositions]);

  // ── Hit testing ───────────────────────────────────────────────────────────

  function hitTable(x: number, y: number): string | null {
    const threshold = tableSizeRef.current * 0.6;
    const positions = localPosRef.current;
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      if (Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold) return p.id;
    }
    return null;
  }

  function hitSection(x: number, y: number): string | null {
    const cw = canvasWRef.current, ch = canvasHRef.current;
    const secs = sectionsRef.current;
    for (let i = secs.length - 1; i >= 0; i--) {
      const s = secs[i];
      const sx = (s.x / 100) * cw, sy = (s.y / 100) * ch;
      const sw = (s.w / 100) * cw, sh = (s.h / 100) * ch;
      if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) return s.id;
    }
    return null;
  }

  // ── RNGH gestures ────────────────────────────────────────────────────────
  // GestureHandlerRootView wraps the whole app, so RNGH native recognizers
  // run before the RN JS responder system.  We must use RNGH's own API.
  //
  // Edit mode:    Pan gesture (minDistance 8).
  //   • onBegin  — record start pos, find drag target
  //   • onUpdate — move table / section
  //   • onEnd    — mark layout dirty if something moved
  //   • onFinalize(success=false) — gesture never reached minDist = tap →
  //                                 select/deselect table or section
  //
  // Non-edit mode: Tap gesture.
  //   • onEnd — hit-test and call onTablePress

  const tablesRef = useRef(tables);
  useEffect(() => { tablesRef.current = tables; }, [tables]);

  const onTablePressRef = useRef(onTablePress);
  useEffect(() => { onTablePressRef.current = onTablePress; }, [onTablePress]);

  // Pan gesture — edit mode drag + tap-to-select
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .enabled(editMode)
    .minDistance(8)
    .onBegin((e) => {
      touchStart.current = { x: e.x, y: e.y, t: Date.now() };
      dragging.current = null;
      const tableId = hitTable(e.x, e.y);
      if (tableId) {
        const p = localPosRef.current.find(p => p.id === tableId)!;
        dragging.current = { kind: "table", id: tableId, startX: e.x, startY: e.y, origX: p.x, origY: p.y };
        return;
      }
      const sectionId = hitSection(e.x, e.y);
      if (sectionId) {
        const s = sectionsRef.current.find(s => s.id === sectionId)!;
        dragging.current = { kind: "section", id: sectionId, startX: e.x, startY: e.y, origX: s.x, origY: s.y };
      }
    })
    .onUpdate((e) => {
      const d = dragging.current;
      if (!d) return;
      const dx = e.translationX, dy = e.translationY;
      if (d.kind === "table") {
        const half = tableSizeRef.current / 2;
        const cw = canvasWRef.current, ch = canvasHRef.current;
        const nx = Math.max(half, Math.min(cw - half, d.origX + dx));
        const ny = Math.max(half, Math.min(ch - half, d.origY + dy));
        setLocalPos(prev => prev.map(p => p.id === d.id ? { ...p, x: nx, y: ny } : p));
      } else {
        const cw = canvasWRef.current, ch = canvasHRef.current;
        setSections(prev => prev.map(s => {
          if (s.id !== d.id) return s;
          const nx = Math.max(0, Math.min(100 - s.w, d.origX + (dx / cw) * 100));
          const ny = Math.max(0, Math.min(100 - s.h, d.origY + (dy / ch) * 100));
          return { ...s, x: nx, y: ny };
        }));
      }
    })
    .onEnd(() => {
      if (dragging.current) setLayoutDirty(true);
      dragging.current = null;
    })
    .onFinalize((_e, success) => {
      if (!success) {
        // Didn't reach minDistance → treat as a tap (select / deselect)
        const ts = touchStart.current;
        if (ts && Date.now() - ts.t < 500) {
          const tableId = hitTable(ts.x, ts.y);
          if (tableId) {
            setSelectedTableId(prev => prev === tableId ? null : tableId);
            setSelectedSectionId(null);
          } else {
            const sectionId = hitSection(ts.x, ts.y);
            if (sectionId) {
              setSelectedSectionId(prev => prev === sectionId ? null : sectionId);
              setSelectedTableId(null);
            } else {
              setSelectedTableId(null);
              setSelectedSectionId(null);
            }
          }
        }
      }
      dragging.current = null;
      touchStart.current = null;
    });

  // Tap gesture — non-edit mode, opens the table
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .enabled(!editMode)
    .maxDistance(10)
    .onEnd((e) => {
      const tableId = hitTable(e.x, e.y);
      if (tableId) {
        const table = tablesRef.current.find(t => t.id === tableId);
        if (table) onTablePressRef.current(table);
      }
    });

  const canvasGesture = Gesture.Race(panGesture, tapGesture);

  // ── Edit mode helpers ─────────────────────────────────────────────────────

  function enterEdit() { setEditMode(true);  onEditModeChange?.(true);  }
  function exitEdit()  { setEditMode(false); onEditModeChange?.(false); }

  // ── Table editing ─────────────────────────────────────────────────────────

  function setShape(id: string, shape: string) {
    setLocalPos(prev => prev.map(p => p.id === id ? { ...p, shape } : p));
    setLayoutDirty(true);
  }
  function rotate(id: string) {
    setLocalPos(prev => prev.map(p => p.id === id ? { ...p, rotation: (p.rotation + 45) % 360 } : p));
    setLayoutDirty(true);
  }

  // ── Save / cancel ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (saving || canvasW === 0) return;
    setSaving(true);
    try {
      await saveLayout(localPos.map(p => ({
        id: p.id,
        floorX: Math.round((p.x / canvasW) * 1000) / 10,
        floorY: Math.round((p.y / canvasH) * 1000) / 10,
        rotation: p.rotation,
        shape: p.shape,
      })));
      setLayoutDirty(false);
      exitEdit();
      setSelectedTableId(null);
      setSelectedSectionId(null);
      onLayoutSaved?.();
    } catch {} finally { setSaving(false); }
  }

  function handleCancel() {
    setLocalPos(originPos);
    setLayoutDirty(false);
    exitEdit();
    setSelectedTableId(null);
    setSelectedSectionId(null);
    dragging.current = null;
  }

  // ── Section editing ───────────────────────────────────────────────────────

  function addSection() {
    const s: FloorSection = { id: Date.now().toString(), label: "New Zone", color: SECTION_COLORS[0].value, x: 5, y: 5, w: 40, h: 35 };
    setSections(prev => [...prev, s]);
    setSelectedSectionId(s.id);
    setLayoutDirty(true);
  }

  function deleteSection(id: string) {
    setSections(prev => prev.filter(s => s.id !== id));
    setSelectedSectionId(null);
    setLayoutDirty(true);
  }

  function setSectionColor(id: string, color: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, color } : s));
    setLayoutDirty(true);
  }

  function commitRename() {
    if (!renamingSection) return;
    const label = renameText.trim() || renamingSection.label;
    setSections(prev => prev.map(s => s.id === renamingSection.id ? { ...s, label } : s));
    setRenamingSection(null);
    setLayoutDirty(true);
  }

  // ── Table create / delete ─────────────────────────────────────────────────

  async function handleCreateTable() {
    const num = parseInt(newTableNum, 10);
    const cap = parseInt(newTableCap, 10);
    if (!num || num < 1 || !cap || cap < 1) return;
    setAddingTable(true);
    try {
      await createTable({ number: num, capacity: cap, shape: newTableShape });
      setAddTableVisible(false);
      setNewTableNum("");
      setNewTableCap("4");
      setNewTableShape("rect");
      onLayoutSaved?.(); // refresh parent table list
    } catch { /* ignore */ } finally { setAddingTable(false); }
  }

  async function handleDeleteTable(id: string) {
    try {
      await deleteTable(id);
      setSelectedTableId(null);
      setLocalPos(prev => prev.filter(p => p.id !== id));
      onLayoutSaved?.();
    } catch { /* ignore */ }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selTablePos = selectedTableId ? localPos.find(p => p.id === selectedTableId) : null;
  const selSection  = selectedSectionId ? sections.find(s => s.id === selectedSectionId) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View>

      {/* ── Edit mode banner ──────────────────────────────────────────── */}
      {editMode && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: T.gold, borderBottomWidth: 1, borderColor: C.gold, gap: 8 }}>
          <Ionicons name="move-outline" size={15} color={C.gold} />
          <Text style={{ flex: 1, fontSize: 12, color: C.gold, fontWeight: "600" }}>Drag to move tables & zones</Text>
          <TouchableOpacity
            onPress={addSection}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.goldMuted, borderWidth: 1, borderColor: C.gold }}
          >
            <Ionicons name="add" size={13} color={C.gold} />
            <Text style={{ color: C.gold, fontWeight: "700", fontSize: 12 }}>Zone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setNewTableNum(""); setNewTableCap("4"); setNewTableShape("rect"); setAddTableVisible(true); }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(46,110,176,0.10)", borderWidth: 1, borderColor: C.sky }}
          >
            <Ionicons name="add" size={13} color={C.sky} />
            <Text style={{ color: C.sky, fontWeight: "700", fontSize: 12 }}>Table</Text>
          </TouchableOpacity>
          {layoutDirty && (
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
            >
              {saving
                ? <ActivityIndicator size="small" color={C.void} />
                : <><Ionicons name="checkmark" size={14} color={C.void} /><Text style={{ color: C.void, fontWeight: "700", fontSize: 12 }}>Save</Text></>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleCancel} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surfaceHov }}>
            <Text style={{ color: C.mist, fontWeight: "600", fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Selected table — shape/rotation strip ─────────────────────── */}
      {editMode && selTablePos && (() => {
        const t = tables.find(x => x.id === selTablePos.id);
        return (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.rim, gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>T{t?.number}</Text>
            <View style={{ width: 1, height: 16, backgroundColor: C.rim }} />
            {(["rect", "round", "booth"] as const).map(s => (
              <TouchableOpacity key={s} onPress={() => setShape(selTablePos.id, s)}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: selTablePos.shape === s ? C.gold : C.surfaceHi, borderColor: selTablePos.shape === s ? C.gold : C.rim }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: selTablePos.shape === s ? C.void : C.mist }}>
                  {s === "rect" ? "Square" : s === "round" ? "Round" : "Booth"}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => rotate(selTablePos.id)}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: C.surfaceHi, borderColor: C.rim }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist }}>↺ {selTablePos.rotation}°</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => handleDeleteTable(selTablePos.id)}
              style={{ padding: 7, borderRadius: 10, backgroundColor: "rgba(212,64,48,0.08)", borderWidth: 1, borderColor: C.coral }}
            >
              <Ionicons name="trash-outline" size={15} color={C.coral} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedTableId(null)}>
              <Ionicons name="close-circle" size={18} color={C.smoke} />
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* ── Selected section — label/color strip ──────────────────────── */}
      {editMode && selSection && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.rim, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => { setRenamingSection(selSection); setRenameText(selSection.label); }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim }}
            >
              <Ionicons name="pencil-outline" size={13} color={C.smoke} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl, flex: 1 }}>{selSection.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteSection(selSection.id)}
              style={{ padding: 8, borderRadius: 10, backgroundColor: "rgba(212,64,48,0.08)", borderWidth: 1, borderColor: C.coral }}>
              <Ionicons name="trash-outline" size={15} color={C.coral} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedSectionId(null)}>
              <Ionicons name="close-circle" size={18} color={C.smoke} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {SECTION_COLORS.map(sc => (
                <TouchableOpacity key={sc.label} onPress={() => setSectionColor(selSection.id, sc.value)}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: sc.value, borderWidth: 2, borderColor: selSection.color === sc.value ? C.gold : sc.border }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist }}>{sc.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Canvas + edit button ──────────────────────────────────────── */}
      {/* The pencil button must be a SIBLING of GestureDetector (not a child)
          so it stays outside RNGH's native gesture recognizer and can be
          tapped as a plain TouchableOpacity. */}
      <View style={{ position: "relative", marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
        <GestureDetector gesture={canvasGesture}>
          <View
            style={{
              height: canvasH,
              borderRadius: 20,
              backgroundColor: C.surfaceHi,
              borderWidth: editMode ? 2 : 1,
              borderColor: editMode ? C.gold : C.rim,
              overflow: "hidden",
              ...shadow.sm,
            }}
            onLayout={(e) => setCanvasW(e.nativeEvent.layout.width)}
          >
            {/* Section overlays (behind tables) */}
            {sections.map(s => {
              const sc = SECTION_COLORS.find(c => c.value === s.color) ?? SECTION_COLORS[0];
              const isSelSec = editMode && selectedSectionId === s.id;
              return (
                <View key={s.id} pointerEvents="none" style={{
                  position: "absolute",
                  left: (s.x / 100) * canvasW, top: (s.y / 100) * canvasH,
                  width: (s.w / 100) * canvasW, height: (s.h / 100) * canvasH,
                  backgroundColor: s.color,
                  borderWidth: isSelSec ? 2 : 1,
                  borderColor: isSelSec ? C.gold : sc.border,
                  borderStyle: "dashed",
                  borderRadius: 12,
                }}>
                  <Text style={{ position: "absolute", top: 6, left: 10, fontSize: 10, fontWeight: "800", color: C.mist, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.75 }}>
                    {s.label}
                  </Text>
                </View>
              );
            })}

            {/* Table chips */}
            {localPos.map((lp) => {
              const table = tables.find(t => t.id === lp.id);
              if (!table) return null;
              const order = openOrders.find(o => o.tableId === lp.id);
              const { w, h, r } = chipDims(lp.shape, tableSize);
              const { borderColor, borderWidth, bg } = statusStyle(table.status);
              const isSelectedT = editMode && selectedTableId === lp.id;
              const isOccupied  = table.status === "OCCUPIED";
              const isReserved  = table.status === "RESERVED";
              const isDirty     = table.status === "DIRTY";

              // Stage
              const stage       = isOccupied ? (table.serviceStage ?? null) : null;
              const stageColor  = stage ? (STAGE_CHIP_COLOR[stage] ?? null) : null;
              const stageAbbrev = stage ? (STAGE_ABBREV[stage] ?? stage) : null;

              // Active border: stage color > status default > selection gold
              const activeBorderColor = isSelectedT ? C.gold : (stageColor ?? borderColor);

              // Server first name (shown inline for occupied tables)
              const serverFirst = table.server?.name.split(" ")[0] ?? null;

              // Guest name font size scales with chip
              const nameFontSize = tableSize >= 96 ? 13 : 11;

              return (
                <View
                  key={lp.id}
                  style={{
                    position: "absolute",
                    left: lp.x - w / 2, top: lp.y - h / 2,
                    width: w, height: h,
                    transform: [{ rotate: `${lp.rotation}deg` }],
                    backgroundColor: bg,
                    borderRadius: r,
                    borderWidth: isSelectedT ? 3 : borderWidth,
                    borderColor: activeBorderColor,
                    alignItems: "center", justifyContent: "center",
                    zIndex: dragging.current?.id === lp.id ? 10 : 1,
                    overflow: "hidden",
                    ...shadow.sm,
                  }}
                >
                  {isOccupied ? (
                    <>
                      {/* ── Occupied chip ── */}
                      {/* Table # — small corner label */}
                      <Text style={{ position: "absolute", top: 5, left: 7, fontSize: 8, fontWeight: "700", color: C.smoke, lineHeight: 10 }}>
                        T{table.number}
                      </Text>

                      {/* Timer — top-right, colour-coded */}
                      {table.seatedAt && (
                        <Text style={{ position: "absolute", top: 5, right: 7, fontSize: 8, fontWeight: "700", color: timerColor(table.seatedAt, amberAt, redAt), lineHeight: 10 }}>
                          {elapsedLabel(table.seatedAt)}
                        </Text>
                      )}

                      {/* Guest name — primary info */}
                      <Text
                        style={{ fontSize: nameFontSize, fontWeight: "800", color: C.pearl, textAlign: "center", paddingHorizontal: 6, lineHeight: nameFontSize + 3 }}
                        numberOfLines={1}
                      >
                        {table.guestName ?? `Table ${table.number}`}
                      </Text>

                      {/* Party size + server */}
                      <Text style={{ fontSize: 8, color: C.smoke, marginTop: 2, textAlign: "center" }}>
                        {table.partySize ? `${table.partySize}p` : ""}
                        {serverFirst ? ` · ${serverFirst}` : ""}
                        {showOrderTotal && order ? `  $${Number(order.total).toFixed(0)}` : ""}
                      </Text>

                      {/* Ghost spacer so flex-center leaves room for stage strip */}
                      {stageColor && <View style={{ height: 10 }} />}

                      {/* Stage strip */}
                      {stageColor && stageAbbrev && (
                        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 14, backgroundColor: stageColor, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 7, fontWeight: "800", color: "#fff", letterSpacing: 0.8, textTransform: "uppercase" }}>
                            {stageAbbrev}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : isReserved ? (
                    <>
                      {/* ── Reserved chip ── */}
                      <Text style={{ fontSize: tableSize >= 96 ? 20 : 17, fontWeight: "900", color: C.sky, lineHeight: tableSize >= 96 ? 24 : 20 }}>
                        {table.number}
                      </Text>
                      {table.guestName ? (
                        <Text style={{ fontSize: 9, color: C.sky, fontWeight: "600", textAlign: "center", paddingHorizontal: 4, marginTop: 2 }} numberOfLines={1}>
                          {table.guestName}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 8, color: C.sky, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Reserved</Text>
                      )}
                      {table.partySize != null && (
                        <Text style={{ fontSize: 8, color: C.smoke, marginTop: 1 }}>{table.partySize}p</Text>
                      )}
                    </>
                  ) : isDirty ? (
                    <>
                      {/* ── Dirty chip ── */}
                      <Text style={{ fontSize: tableSize >= 96 ? 22 : 18, fontWeight: "900", color: C.ember }}>
                        {table.number}
                      </Text>
                      <Text style={{ fontSize: 8, fontWeight: "700", color: C.ember, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                        Dirty
                      </Text>
                    </>
                  ) : (
                    <>
                      {/* ── Available chip ── */}
                      <Text style={{ fontSize: tableSize >= 96 ? 24 : 20, fontWeight: "900", color: C.smoke, lineHeight: tableSize >= 96 ? 28 : 24 }}>
                        {table.number}
                      </Text>
                      <Text style={{ fontSize: 9, color: C.smoke, opacity: 0.6, marginTop: 1 }}>
                        {table.capacity}p
                      </Text>
                    </>
                  )}

                  {/* Server badge — only for non-occupied (occupied shows inline) */}
                  {showServerBadge && table.server && !isOccupied && (
                    <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: C.sky, borderRadius: 10, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.surface }}>
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 7 }}>{table.server.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </GestureDetector>

        {/* Edit mode toggle — outside GestureDetector so it stays a plain
            TouchableOpacity unaffected by RNGH's native recognizer */}
        <TouchableOpacity
          onPress={() => editMode ? handleCancel() : enterEdit()}
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 20,
            height: 32, width: 32, borderRadius: 10,
            backgroundColor: editMode ? C.gold : C.surface,
            borderWidth: 1, borderColor: editMode ? C.gold : C.rim,
            alignItems: "center", justifyContent: "center",
            ...shadow.sm,
          }}
        >
          <Ionicons name={editMode ? "close" : "pencil-outline"} size={15} color={editMode ? C.void : C.mist} />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={{ paddingHorizontal: 20, paddingVertical: 8, gap: 6 }}>
        {/* Status legend */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[
            { label: "Available", color: C.smoke },
            { label: "Occupied",  color: C.jade  },
            { label: "Reserved",  color: C.sky   },
            { label: "Dirty",     color: C.ember },
          ].map(({ label, color }) => (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ height: 7, width: 7, borderRadius: 3.5, backgroundColor: color }} />
              <Text style={{ fontSize: 10, color: C.smoke }}>{label}</Text>
            </View>
          ))}
        </View>
        {/* Course legend */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(STAGE_ABBREV).map(([key, abbrev]) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ height: 6, width: 16, borderRadius: 2, backgroundColor: STAGE_CHIP_COLOR[key] }} />
              <Text style={{ fontSize: 9, color: C.smoke }}>{abbrev}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Add table modal */}
      <Modal visible={addTableVisible} transparent animationType="fade" onRequestClose={() => setAddTableVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: C.rim }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: C.pearl }}>Add Table</Text>

            {/* Table number */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.8 }}>Table Number</Text>
              <TextInput
                style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={newTableNum}
                onChangeText={setNewTableNum}
                keyboardType="number-pad"
                placeholder="e.g. 12"
                placeholderTextColor={C.smoke}
                returnKeyType="next"
              />
            </View>

            {/* Capacity */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.8 }}>Seats</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[2, 4, 6, 8, 10, 12].map(n => (
                    <TouchableOpacity key={n} onPress={() => setNewTableCap(String(n))}
                      style={{ width: 48, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1.5, backgroundColor: newTableCap === String(n) ? C.sky : C.surfaceHi, borderColor: newTableCap === String(n) ? C.sky : C.rim }}>
                      <Text style={{ fontWeight: "700", fontSize: 15, color: newTableCap === String(n) ? C.void : C.mist }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Shape */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.8 }}>Shape</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["rect", "round", "booth"] as const).map(s => (
                  <TouchableOpacity key={s} onPress={() => setNewTableShape(s)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5, backgroundColor: newTableShape === s ? C.gold : C.surfaceHi, borderColor: newTableShape === s ? C.gold : C.rim }}>
                    <Text style={{ fontWeight: "700", fontSize: 13, color: newTableShape === s ? C.void : C.mist }}>
                      {s === "rect" ? "Square" : s === "round" ? "Round" : "Booth"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setAddTableVisible(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}>
                <Text style={{ fontWeight: "600", color: C.mist }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateTable}
                disabled={addingTable || !newTableNum}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: newTableNum ? C.sky : C.surfaceHov, alignItems: "center" }}
              >
                {addingTable
                  ? <ActivityIndicator size="small" color={C.void} />
                  : <Text style={{ fontWeight: "700", color: newTableNum ? C.void : C.smoke }}>Add Table</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename zone modal */}
      {renamingSection && (
        <Modal transparent animationType="fade" onRequestClose={() => setRenamingSection(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 32 }}>
            <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: C.rim }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: C.pearl }}>Rename Zone</Text>
              <TextInput
                style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={commitRename}
                placeholder="Zone name"
                placeholderTextColor={C.smoke}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => setRenamingSection(null)}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}>
                  <Text style={{ fontWeight: "600", color: C.mist }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={commitRename}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.gold, alignItems: "center" }}>
                  <Text style={{ fontWeight: "700", color: C.void }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
