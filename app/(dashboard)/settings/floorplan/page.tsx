"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Save, Loader2, Plus, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TableData {
  id: string;
  number: number;
  capacity: number;
  status: string;
  serviceStage: string | null;
  floorX: number | null;
  floorY: number | null;
  rotation: number;
  shape: string;
}

type FloorObjectType = "bar" | "wall" | "pillar" | "label" | "entrance" | "restroom" | "kitchen" | "host";

interface FloorObject {
  id: string;
  type: FloorObjectType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FLOOR_OBJECT_PRESETS: { type: FloorObjectType; label: string; emoji: string; defaultW: number; defaultH: number; color: string }[] = [
  { type: "bar",      label: "Bar",          emoji: "🍺", defaultW: 20, defaultH: 8,  color: "#92400e" },
  { type: "wall",     label: "Wall",         emoji: "🧱", defaultW: 20, defaultH: 4,  color: "#6b7280" },
  { type: "pillar",   label: "Pillar",       emoji: "⬛", defaultW: 4,  defaultH: 4,  color: "#374151" },
  { type: "kitchen",  label: "Kitchen",      emoji: "🍳", defaultW: 16, defaultH: 10, color: "#dc2626" },
  { type: "entrance", label: "Entrance",     emoji: "🚪", defaultW: 6,  defaultH: 4,  color: "#16a34a" },
  { type: "restroom", label: "Restrooms",    emoji: "🚻", defaultW: 8,  defaultH: 6,  color: "#2563eb" },
  { type: "host",     label: "Host Stand",   emoji: "📋", defaultW: 8,  defaultH: 6,  color: "#7c3aed" },
  { type: "label",    label: "Text Label",   emoji: "🏷️", defaultW: 12, defaultH: 4,  color: "#1f2937" },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FloorPlanEditorPage() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [objects, setObjects] = useState<FloorObject[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [newTableNum, setNewTableNum] = useState("");
  const [newTableCap, setNewTableCap] = useState("4");
  const [addingTable, setAddingTable] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tables" | "objects">("tables");

  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingTableId = useRef<string | null>(null);
  const draggingObjId = useRef<string | null>(null);
  const dragStart = useRef<{ ptrX: number; ptrY: number; itemX: number; itemY: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tables").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([tableData, settings]: [TableData[], Record<string, string>]) => {
      setTables(tableData.sort((a, b) => a.number - b.number));
      if (settings.floorPlanObjects) {
        try { setObjects(JSON.parse(settings.floorPlanObjects)); } catch { /* ignore */ }
      }
      setLoading(false);
    });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const mappedTables = tables.filter((t) => t.floorX !== null);
  const unmappedTables = tables.filter((t) => t.floorX === null);
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedObj = objects.find((o) => o.id === selectedObjId) ?? null;

  const nextTableNumber = Math.max(0, ...tables.map((t) => t.number)) + 1;

  // ── Table mutations ───────────────────────────────────────────────────────────

  function updateSelectedTable(patch: Partial<TableData>) {
    setTables((prev) => prev.map((t) => t.id === selectedTableId ? { ...t, ...patch } : t));
    setDirty(true);
  }

  function removeTableFromMap(id: string) {
    setTables((prev) => prev.map((t) => t.id === id ? { ...t, floorX: null, floorY: null } : t));
    setSelectedTableId(null);
    setDirty(true);
  }

  async function createTable() {
    const num = parseInt(newTableNum);
    const cap = parseInt(newTableCap);
    if (!num || !cap) return;
    if (tables.some((t) => t.number === num)) {
      toast.error(`Table ${num} already exists`);
      return;
    }
    setAddingTable(true);
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: num, capacity: cap }),
    });
    if (res.ok) {
      const created: TableData = await res.json();
      setTables((prev) => [...prev, { ...created, floorX: null, floorY: null, rotation: 0, shape: "rect" }].sort((a, b) => a.number - b.number));
      setAddTableOpen(false);
      setNewTableNum("");
      setNewTableCap("4");
    }
    setAddingTable(false);
  }

  async function deleteTable(id: string) {
    if (!(await confirmDialog("Permanently delete this table? This cannot be undone."))) return;
    setDeletingId(id);
    const res = await fetch(`/api/tables/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTables((prev) => prev.filter((t) => t.id !== id));
      setSelectedTableId(null);
      setDirty(true);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error((data as { error?: string }).error ?? "Failed to delete table — it may have active orders.");
    }
    setDeletingId(null);
  }

  // ── Object mutations ──────────────────────────────────────────────────────────

  function addObject(preset: typeof FLOOR_OBJECT_PRESETS[0]) {
    const obj: FloorObject = {
      id: genId(),
      type: preset.type,
      label: preset.label,
      x: 50,
      y: 50,
      width: preset.defaultW,
      height: preset.defaultH,
      rotation: 0,
      color: preset.color,
    };
    setObjects((prev) => [...prev, obj]);
    setSelectedObjId(obj.id);
    setSelectedTableId(null);
    setActiveTab("objects");
    setDirty(true);
  }

  function updateSelectedObj(patch: Partial<FloorObject>) {
    setObjects((prev) => prev.map((o) => o.id === selectedObjId ? { ...o, ...patch } : o));
    setDirty(true);
  }

  function deleteObject(id: string) {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedObjId(null);
    setDirty(true);
  }

  // ── Drag helpers ──────────────────────────────────────────────────────────────

  function snap(v: number): number {
    return snapToGrid ? Math.round(v / 5) * 5 : v;
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const id = e.dataTransfer.getData("tableId");
    if (!id || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, snap(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(4, Math.min(96, snap(((e.clientY - rect.top) / rect.height) * 100)));
    setTables((prev) => prev.map((t) => t.id === id ? { ...t, floorX: x, floorY: y } : t));
    setSelectedTableId(id);
    setSelectedObjId(null);
    setDirty(true);
  }

  function handleTablePointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const t = tables.find((t) => t.id === id);
    if (!t || t.floorX === null) return;
    draggingTableId.current = id;
    dragStart.current = { ptrX: e.clientX, ptrY: e.clientY, itemX: t.floorX, itemY: t.floorY! };
    setSelectedTableId(id);
    setSelectedObjId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleObjPointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const o = objects.find((o) => o.id === id);
    if (!o) return;
    draggingObjId.current = id;
    dragStart.current = { ptrX: e.clientX, ptrY: e.clientY, itemX: o.x, itemY: o.y };
    setSelectedObjId(id);
    setSelectedTableId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.current.ptrX) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.current.ptrY) / rect.height) * 100;
    const x = Math.max(2, Math.min(98, snap(dragStart.current.itemX + dx)));
    const y = Math.max(2, Math.min(98, snap(dragStart.current.itemY + dy)));

    if (draggingTableId.current) {
      const id = draggingTableId.current;
      setTables((prev) => prev.map((t) => t.id === id ? { ...t, floorX: x, floorY: y } : t));
    } else if (draggingObjId.current) {
      const id = draggingObjId.current;
      setObjects((prev) => prev.map((o) => o.id === id ? { ...o, x, y } : o));
    }
  }

  function handlePointerUp() {
    if (draggingTableId.current || draggingObjId.current) setDirty(true);
    draggingTableId.current = null;
    draggingObjId.current = null;
    dragStart.current = null;
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.dataset.bg === "true") {
      setSelectedTableId(null);
      setSelectedObjId(null);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function saveLayout() {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/tables/layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tables.map((t) => ({
            id: t.id, floorX: t.floorX, floorY: t.floorY,
            rotation: t.rotation, shape: t.shape,
          }))),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ floorPlanObjects: JSON.stringify(objects) }),
        }),
      ]);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const OBJECT_TYPE_LABELS: Record<FloorObjectType, string> = {
    bar: "Bar", wall: "Wall", pillar: "Pillar", label: "Label",
    entrance: "Entrance", restroom: "Restrooms", kitchen: "Kitchen", host: "Host Stand",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-gray-400 hover:text-gray-600 text-sm">← Settings</Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-semibold text-gray-900">Floor Plan Editor</h1>
          {dirty && <span className="text-xs text-amber-600">● Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSnapToGrid((v) => !v)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors",
              snapToGrid ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"
            )}
          >
            Grid {snapToGrid ? "ON" : "OFF"}
          </button>
          <Button onClick={saveLayout} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Layout
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(["tables", "objects"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold capitalize transition-colors",
                  activeTab === tab
                    ? "bg-white text-amber-600 border-b-2 border-amber-500"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* ── Tables tab ── */}
                {activeTab === "tables" && (
                  <>
                    {/* Add table button */}
                    <div>
                      {addTableOpen ? (
                        <div className="space-y-2 border border-amber-200 rounded-lg p-3 bg-amber-50">
                          <p className="text-xs font-semibold text-amber-700">New Table</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-gray-500">Table #</Label>
                              <Input
                                type="number"
                                min="1"
                                placeholder={String(nextTableNumber)}
                                value={newTableNum}
                                onChange={(e) => setNewTableNum(e.target.value)}
                                className="h-7 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-gray-500">Capacity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={newTableCap}
                                onChange={(e) => setNewTableCap(e.target.value)}
                                className="h-7 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <Button size="sm" className="flex-1 h-7 text-xs" onClick={createTable} disabled={addingTable}>
                              {addingTable ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddTableOpen(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { setNewTableNum(String(nextTableNumber)); setAddTableOpen(true); }}>
                          <Plus className="h-3 w-3" /> Add Table
                        </Button>
                      )}
                    </div>

                    {/* Unmapped tables */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Unmapped ({unmappedTables.length})
                      </p>
                      {unmappedTables.length === 0 ? (
                        <p className="text-xs text-gray-400">All tables placed ✓</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {unmappedTables.map((t) => (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("tableId", t.id)}
                              className="flex flex-col items-center justify-center w-14 h-12 rounded-lg border-2 border-dashed border-gray-300 bg-white cursor-grab hover:border-amber-400 hover:bg-amber-50 select-none"
                            >
                              <span className="text-sm font-bold text-gray-700">{t.number}</span>
                              <span className="text-[10px] text-gray-400">{t.capacity}p</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected table properties */}
                    {selectedTable && (
                      <div className="border-t border-gray-200 pt-3 space-y-3">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Table {selectedTable.number} — {selectedTable.capacity}p
                        </p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">Shape</p>
                          <div className="flex gap-1">
                            {(["rect", "round"] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateSelectedTable({ shape: s })}
                                className={cn(
                                  "flex-1 py-1 text-xs rounded border font-medium",
                                  selectedTable.shape === s
                                    ? "bg-amber-500 text-white border-amber-500"
                                    : "border-gray-200 text-gray-600"
                                )}
                              >
                                {s === "rect" ? "▬ Rect" : "● Round"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">Rotation</p>
                          <div className="grid grid-cols-4 gap-1">
                            {[0, 45, 90, 135].map((r) => (
                              <button
                                key={r}
                                onClick={() => updateSelectedTable({ rotation: r })}
                                className={cn(
                                  "py-1 text-xs rounded border font-medium",
                                  selectedTable.rotation === r
                                    ? "bg-amber-500 text-white border-amber-500"
                                    : "border-gray-200 text-gray-600"
                                )}
                              >
                                {r}°
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">Capacity</p>
                          <Input
                            type="number"
                            min="1"
                            className="h-7 text-sm"
                            value={selectedTable.capacity}
                            onChange={(e) => updateSelectedTable({ capacity: parseInt(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => removeTableFromMap(selectedTable.id)}
                            className="flex-1 py-1.5 text-xs text-amber-600 border border-amber-200 rounded hover:bg-amber-50"
                          >
                            Remove from Map
                          </button>
                          <button
                            onClick={() => deleteTable(selectedTable.id)}
                            disabled={deletingId === selectedTable.id}
                            className="py-1.5 px-2 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                            title="Permanently delete table"
                          >
                            {deletingId === selectedTable.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── Objects tab ── */}
                {activeTab === "objects" && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add Object</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {FLOOR_OBJECT_PRESETS.map((preset) => (
                          <button
                            key={preset.type}
                            onClick={() => addObject(preset)}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50 text-left font-medium text-gray-700 transition-colors"
                          >
                            <span>{preset.emoji}</span>
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedObj && (
                      <div className="border-t border-gray-200 pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {OBJECT_TYPE_LABELS[selectedObj.type]}
                          </p>
                          <button
                            onClick={() => deleteObject(selectedObj.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete object"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Label</Label>
                          <Input
                            className="h-7 text-sm"
                            value={selectedObj.label}
                            onChange={(e) => updateSelectedObj({ label: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Width %</Label>
                            <Input
                              type="number" min="2" max="80" className="h-7 text-sm"
                              value={selectedObj.width}
                              onChange={(e) => updateSelectedObj({ width: Math.max(2, Math.min(80, parseInt(e.target.value) || 2)) })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">Height %</Label>
                            <Input
                              type="number" min="2" max="80" className="h-7 text-sm"
                              value={selectedObj.height}
                              onChange={(e) => updateSelectedObj({ height: Math.max(2, Math.min(80, parseInt(e.target.value) || 2)) })}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Rotation</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min="0" max="360" step="15"
                              value={selectedObj.rotation}
                              onChange={(e) => updateSelectedObj({ rotation: parseInt(e.target.value) })}
                              className="flex-1"
                            />
                            <span className="text-xs text-gray-600 w-8 text-right">{selectedObj.rotation}°</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedObj.color}
                              onChange={(e) => updateSelectedObj({ color: e.target.value })}
                              className="h-7 w-10 cursor-pointer rounded border border-gray-200"
                            />
                            <span className="text-xs text-gray-500 font-mono">{selectedObj.color}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {objects.length > 0 && !selectedObj && (
                      <div className="border-t border-gray-200 pt-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Placed ({objects.length})
                        </p>
                        <div className="space-y-1">
                          {objects.map((o) => (
                            <div
                              key={o.id}
                              onClick={() => { setSelectedObjId(o.id); setSelectedTableId(null); }}
                              className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-100 cursor-pointer group"
                            >
                              <span className="text-xs text-gray-700">{o.label}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteObject(o.id); }}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center p-4">
          <div
            ref={canvasRef}
            className="relative bg-white shadow-inner border border-gray-300 w-full"
            style={{ aspectRatio: "3/2", touchAction: "none" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={handleCanvasClick}
            data-bg="true"
          >
            {/* Grid dots */}
            {snapToGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                data-bg="true"
                style={{
                  backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
                  backgroundSize: "5% 5%",
                }}
              />
            )}

            {/* Floor objects (rendered behind tables) */}
            {objects.map((o) => {
              const isSelected = selectedObjId === o.id;
              return (
                <div
                  key={o.id}
                  onPointerDown={(e) => handleObjPointerDown(e, o.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onClick={(e) => { e.stopPropagation(); setSelectedObjId(o.id); setSelectedTableId(null); }}
                  style={{
                    position: "absolute",
                    left: `${o.x}%`,
                    top: `${o.y}%`,
                    width: `${o.width}%`,
                    height: `${o.height}%`,
                    transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
                    backgroundColor: o.color + "22",
                    border: `2px solid ${isSelected ? "#f59e0b" : o.color}`,
                    boxShadow: isSelected ? `0 0 0 3px #fcd34d` : undefined,
                    borderRadius: o.type === "pillar" ? "4px" : "6px",
                    cursor: "grab",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    touchAction: "none",
                    userSelect: "none",
                    zIndex: 1,
                  }}
                >
                  <div className="flex flex-col items-center pointer-events-none">
                    <span className="text-xs font-bold" style={{ color: o.color }}>
                      {o.label}
                    </span>
                    {isSelected && (
                      <span className="text-[9px]" style={{ color: o.color }}>
                        <RotateCw className="h-2.5 w-2.5 inline" /> drag
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Mapped tables */}
            {mappedTables.map((t) => {
              const isSelected = selectedTableId === t.id;
              const isRect = t.shape === "rect";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "absolute flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none border-2 shadow-sm transition-shadow",
                    isRect ? "rounded-lg" : "rounded-full",
                    isSelected
                      ? "border-amber-500 shadow-amber-200 shadow-md ring-2 ring-amber-400 ring-offset-1"
                      : "border-gray-400",
                    t.status === "OCCUPIED"  ? "bg-red-100"
                    : t.status === "RESERVED" ? "bg-amber-100"
                    : t.status === "DIRTY"   ? "bg-gray-200"
                    : "bg-white"
                  )}
                  onPointerDown={(e) => handleTablePointerDown(e, t.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onClick={(e) => { e.stopPropagation(); setSelectedTableId(t.id); setSelectedObjId(null); }}
                  style={{
                    position: "absolute",
                    left: `${t.floorX}%`,
                    top: `${t.floorY}%`,
                    width: isRect ? "72px" : "60px",
                    height: isRect ? "60px" : "60px",
                    transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
                    touchAction: "none",
                    zIndex: 2,
                  }}
                >
                  <span className="text-sm font-bold text-gray-800 leading-none">{t.number}</span>
                  <span className="text-[10px] text-gray-500">{t.capacity}p</span>
                </div>
              );
            })}

            {/* Empty state hint */}
            {mappedTables.length === 0 && objects.length === 0 && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none"
                data-bg="true"
              >
                <p className="text-sm font-medium">Drag tables here or add floor objects</p>
                <p className="text-xs mt-1">Use the left panel to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
