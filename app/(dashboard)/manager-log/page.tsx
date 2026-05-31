"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Loader2, ClipboardList, AlertTriangle, Wrench,
  DollarSign, FileText, CheckCircle2, Clock, Trash2, Pencil,
} from "lucide-react";
import { VeraMark, VeraSpark } from "@/components/brand/vera-mark";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Author {
  id: string;
  name: string;
  role: string;
}

interface LogEntry {
  id: string;
  type: string;
  shift: string | null;
  title: string;
  body: string;
  severity: string | null;
  staffIds: string | null;
  followUp: string | null;
  resolvedAt: string | null;
  openingBank: number | null;
  closingBank: number | null;
  totalDrop: number | null;
  discrepancy: number | null;
  authorId: string;
  createdAt: string;
  author: Author;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

// ─── Templates ────────────────────────────────────────────────────────────────

interface LogTemplate {
  label: string;
  type: string;
  title: string;
  body: string;
  severity?: string;
  followUp?: string;
}

const LOG_TEMPLATES: Record<string, LogTemplate[]> = {
  SHIFT_NOTE: [
    {
      label: "Opening Shift",
      type: "SHIFT_NOTE",
      title: "Opening Shift Notes",
      body: "Staff present:\n\nReservation count:\n\nSpecial notes / VIPs:\n\nEquipment status:\n\nCommunications from previous shift:",
    },
    {
      label: "Closing Shift",
      type: "SHIFT_NOTE",
      title: "Closing Shift Notes",
      body: "Staff departures:\n\nFinal cover count:\n\nSales highlights:\n\nIssues / follow-ups:\n\nEquipment status:\n\nNotes for opening team:",
    },
    {
      label: "Mid-Shift",
      type: "SHIFT_NOTE",
      title: "Mid-Shift Update",
      body: "Current floor status:\n\nWait time:\n\nStaffing notes:\n\nKitchen updates:\n\nAny issues:",
    },
  ],
  INCIDENT: [
    {
      label: "Guest Complaint",
      type: "INCIDENT",
      title: "Guest Complaint",
      body: "Guest name/table:\n\nComplaint:\n\nResolution provided:\n\nComp / action taken:",
      severity: "LOW",
      followUp: "Follow up with GM if escalated.",
    },
    {
      label: "Staff Incident",
      type: "INCIDENT",
      title: "Staff Incident",
      body: "Staff member(s) involved:\n\nDescription of incident:\n\nWitnesses:\n\nImmediate action taken:",
      severity: "MEDIUM",
      followUp: "Review with HR/GM within 24 hours.",
    },
    {
      label: "Food Safety",
      type: "INCIDENT",
      title: "Food Safety Issue",
      body: "Item/area affected:\n\nDescription of issue:\n\nItems discarded:\n\nSanitization completed:\n\nHealth department notification required?",
      severity: "HIGH",
      followUp: "Document corrective action and notify ownership.",
    },
    {
      label: "Accident / Injury",
      type: "INCIDENT",
      title: "Accident or Injury",
      body: "Person involved (staff/guest):\n\nLocation:\n\nDescription of accident:\n\nFirst aid provided:\n\nAmbulance / 911 called? Y/N\n\nWitnesses:",
      severity: "HIGH",
      followUp: "Complete incident report form and notify GM immediately.",
    },
  ],
  MAINTENANCE: [
    {
      label: "Equipment Down",
      type: "MAINTENANCE",
      title: "Equipment Issue",
      body: "Equipment:\n\nLocation:\n\nDescription of problem:\n\nTemporary fix in place?",
      followUp: "Call repair service. Work order #: ___",
    },
    {
      label: "Cleaning Task",
      type: "MAINTENANCE",
      title: "Cleaning / Sanitation Task",
      body: "Area:\n\nTask performed:\n\nProducts used:\n\nCompleted by:",
    },
    {
      label: "Repair Request",
      type: "MAINTENANCE",
      title: "Repair Request",
      body: "Item / area needing repair:\n\nDescription:\n\nUrgency (Low/Medium/High):",
      followUp: "Submit work order to facilities.",
    },
  ],
  CASH_LOG: [
    {
      label: "Opening",
      type: "CASH_LOG",
      title: "Opening Cash Count",
      body: "Counted by:\n\nRegister #:\n\nNotes:",
    },
    {
      label: "Closing",
      type: "CASH_LOG",
      title: "Closing Cash Count",
      body: "Counted by:\n\nRegister #:\n\nCredit card batch closed? Y/N\n\nNotes:",
    },
    {
      label: "Safe Drop",
      type: "CASH_LOG",
      title: "Safe Drop",
      body: "Drop amount:\n\nWitnessed by:\n\nNotes:",
    },
  ],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: "", label: "All" },
  { key: "SHIFT_NOTE", label: "Shift Notes" },
  { key: "INCIDENT", label: "Incidents" },
  { key: "MAINTENANCE", label: "Maintenance" },
  { key: "CASH_LOG", label: "Cash Log" },
];

const TYPE_LABELS: Record<string, string> = {
  SHIFT_NOTE: "Shift Note",
  INCIDENT: "Incident",
  MAINTENANCE: "Maintenance",
  CASH_LOG: "Cash Log",
};

const EMPTY_FORM = {
  type: "SHIFT_NOTE",
  shift: "AM",
  title: "",
  body: "",
  severity: "LOW",
  staffIds: [] as string[],
  followUp: "",
  openingBank: "",
  closingBank: "",
  totalDrop: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getTypeBadge(entry: LogEntry) {
  switch (entry.type) {
    case "SHIFT_NOTE":
      return { cls: "bg-blue-100 text-blue-800 border-blue-200", icon: <FileText className="h-3 w-3" /> };
    case "INCIDENT": {
      const sev = entry.severity ?? "LOW";
      if (sev === "HIGH") return { cls: "bg-red-100 text-red-800 border-red-200", icon: <AlertTriangle className="h-3 w-3" /> };
      if (sev === "MEDIUM") return { cls: "bg-amber-100 text-amber-800 border-amber-200", icon: <AlertTriangle className="h-3 w-3" /> };
      return { cls: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <AlertTriangle className="h-3 w-3" /> };
    }
    case "MAINTENANCE":
      return { cls: "bg-orange-100 text-orange-800 border-orange-200", icon: <Wrench className="h-3 w-3" /> };
    case "CASH_LOG":
      return { cls: "bg-green-100 text-green-800 border-green-200", icon: <DollarSign className="h-3 w-3" /> };
    default:
      return { cls: "bg-gray-100 text-gray-700 border-gray-200", icon: <FileText className="h-3 w-3" /> };
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [resolving, setResolving] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    narrative: string;
    bullets: string[];
    metrics: Record<string, number | null>;
    aiPowered: boolean;
    date: string;
  } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const params = filterType ? `?type=${filterType}` : "";
    const res = await fetch(`/api/manager-log${params}`);
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, [filterType]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  async function generateAiSummary() {
    setAiSummaryLoading(true);
    setAiSummaryOpen(true);
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await fetch("/api/manager-log/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr }),
      });
      if (res.ok) setAiSummary(await res.json());
    } catch { /* silent */ } finally {
      setAiSummaryLoading(false);
    }
  }

  function useAiSummaryAsEntry() {
    if (!aiSummary) return;
    const body = aiSummary.narrative + (aiSummary.bullets.length > 0
      ? "\n\nKey highlights:\n" + aiSummary.bullets.map(b => `• ${b}`).join("\n")
      : "");
    setForm(f => ({ ...f, type: "SHIFT_NOTE", body, title: `Shift Summary — ${aiSummary.date}` }));
    setAiSummaryOpen(false);
    setShowTemplates(false);
    setDialogOpen(true);
  }

  useEffect(() => {
    fetch("/api/staff")
      .then((r) => r.ok ? r.json() : [])
      .then((d: StaffMember[]) => setStaff(d.filter((s) => s.role !== "INACTIVE")));
  }, []);

  // Auto-calculate discrepancy for CASH_LOG
  const calcDiscrepancy = (): string => {
    const opening = parseFloat(form.openingBank) || 0;
    const closing = parseFloat(form.closingBank) || 0;
    const drop = parseFloat(form.totalDrop) || 0;
    return ((closing + drop) - opening).toFixed(2);
  };

  async function saveEntry() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      type: form.type,
      shift: form.shift || null,
      title: form.title,
      body: form.body,
    };

    if (form.type === "INCIDENT") {
      payload.severity = form.severity;
      payload.staffIds = form.staffIds.join(",") || null;
      payload.followUp = form.followUp || null;
    }
    if (form.type === "MAINTENANCE") {
      payload.followUp = form.followUp || null;
    }
    if (form.type === "CASH_LOG") {
      if (form.openingBank) payload.openingBank = parseFloat(form.openingBank);
      if (form.closingBank) payload.closingBank = parseFloat(form.closingBank);
      if (form.totalDrop) payload.totalDrop = parseFloat(form.totalDrop);
      const disc = parseFloat(calcDiscrepancy());
      if (!isNaN(disc)) payload.discrepancy = disc;
    }

    const res = await fetch("/api/manager-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      loadEntries();
    }
    setSaving(false);
  }

  async function resolveEntry(entry: LogEntry) {
    setResolving(true);
    await fetch(`/api/manager-log/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolvedAt: entry.resolvedAt ? null : new Date().toISOString() }),
    });
    setResolving(false);
    const res = await fetch(`/api/manager-log`);
    if (res.ok) {
      const all: LogEntry[] = await res.json();
      const updated = all.find((e) => e.id === entry.id);
      if (updated) setSelectedEntry(updated);
      setEntries(all.filter((e) => !filterType || e.type === filterType));
    }
  }

  async function saveFollowUp(entry: LogEntry) {
    setSavingFollowUp(true);
    const res = await fetch(`/api/manager-log/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUp: editFollowUp }),
    });
    if (res.ok) {
      const updated: LogEntry = await res.json();
      setSelectedEntry(updated);
      loadEntries();
    }
    setSavingFollowUp(false);
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/manager-log/${id}`, { method: "DELETE" });
    setSelectedEntry(null);
    loadEntries();
  }

  function openDetail(entry: LogEntry) {
    setSelectedEntry(entry);
    setEditFollowUp(entry.followUp ?? "");
  }

  function applyTemplate(tpl: LogTemplate) {
    setForm((prev) => ({
      ...prev,
      type: tpl.type,
      title: tpl.title,
      body: tpl.body,
      severity: tpl.severity ?? prev.severity,
      followUp: tpl.followUp ?? "",
    }));
    setShowTemplates(false);
  }

  const staffMap = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <div>
      <Header
        title="Manager Log"
        description="Shift notes, incidents, maintenance & cash logs"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={generateAiSummary}
              disabled={aiSummaryLoading}
              className="gap-1.5"
            >
              <VeraSpark className="h-3.5 w-3.5" />
              {aiSummaryLoading ? "Analyzing…" : "Shift Summary"}
            </Button>
            <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setShowTemplates(true); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> New Entry
            </Button>
          </div>
        }
      />

      {/* Filter pills */}
      <div className="flex gap-2 px-6 py-4 border-b border-gray-200 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              filterType === tab.key
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-24 text-center text-gray-400">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No entries yet</p>
            <p className="text-sm mt-1">Add your first manager log entry</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {entries.map((entry) => {
              const badge = getTypeBadge(entry);
              return (
                <div
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className={cn(
                    "bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all",
                    entry.resolvedAt && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1.5 mt-0.5 shrink-0">
                      <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium", badge.cls)}>
                        {badge.icon}
                        {TYPE_LABELS[entry.type]}
                        {entry.type === "INCIDENT" && entry.severity && (
                          <span className="opacity-70">· {entry.severity}</span>
                        )}
                      </span>
                      {entry.shift && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                          {entry.shift}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{entry.title}</p>
                        {entry.resolvedAt && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{entry.body}</p>
                      {entry.type === "CASH_LOG" && entry.discrepancy != null && (
                        <p className={cn("text-xs mt-1 font-medium", Number(entry.discrepancy) === 0 ? "text-green-600" : "text-red-600")}>
                          Discrepancy: {formatCurrency(entry.discrepancy)}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">{timeAgo(entry.createdAt)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{entry.author.name}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              New Log Entry
            </DialogTitle>
          </DialogHeader>

          {/* Template picker */}
          {showTemplates ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Choose a template</p>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Start blank
                </button>
              </div>
              {(["SHIFT_NOTE", "INCIDENT", "MAINTENANCE", "CASH_LOG"] as const).map((type) => {
                const templates = LOG_TEMPLATES[type] ?? [];
                const typeColors: Record<string, string> = {
                  SHIFT_NOTE: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
                  INCIDENT: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
                  MAINTENANCE: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",
                  CASH_LOG: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100",
                };
                return (
                  <div key={type} className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{TYPE_LABELS[type]}</p>
                    <div className="flex flex-wrap gap-2">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.label}
                          onClick={() => applyTemplate(tpl)}
                          className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors", typeColors[type])}
                        >
                          {tpl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <button
              onClick={() => setShowTemplates(true)}
              className="w-full text-xs text-amber-600 hover:text-amber-700 border border-dashed border-amber-200 rounded-lg py-2 hover:bg-amber-50 transition-colors"
            >
              ← Browse templates
            </button>
          )}

          <div className="space-y-4">
            {/* Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHIFT_NOTE">Shift Note</SelectItem>
                    <SelectItem value="INCIDENT">Incident</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="CASH_LOG">Cash Log</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Shift</Label>
                <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                  <SelectTrigger><SelectValue placeholder="Select shift…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                    <SelectItem value="NIGHT">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="Brief title…"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label>Details *</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Describe what happened…"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>

            {/* INCIDENT-specific fields */}
            {form.type === "INCIDENT" && (
              <>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Staff Involved</Label>
                  <div className="border border-input rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                    {staff.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={form.staffIds.includes(s.id)}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              staffIds: e.target.checked
                                ? [...form.staffIds, s.id]
                                : form.staffIds.filter((id) => id !== s.id),
                            });
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{s.name}</span>
                        <span className="text-xs text-gray-400">{s.role}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Follow-up Required</Label>
                  <textarea
                    className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="What needs to happen next…"
                    value={form.followUp}
                    onChange={(e) => setForm({ ...form, followUp: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* MAINTENANCE-specific fields */}
            {form.type === "MAINTENANCE" && (
              <div className="space-y-1.5">
                <Label>Follow-up / Work Order</Label>
                <textarea
                  className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Work order number or next steps…"
                  value={form.followUp}
                  onChange={(e) => setForm({ ...form, followUp: e.target.value })}
                />
              </div>
            )}

            {/* CASH_LOG-specific fields */}
            {form.type === "CASH_LOG" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Opening Bank</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <Input
                        className="pl-6"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={form.openingBank}
                        onChange={(e) => setForm({ ...form, openingBank: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Closing Bank</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <Input
                        className="pl-6"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={form.closingBank}
                        onChange={(e) => setForm({ ...form, closingBank: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total Drop</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <Input
                        className="pl-6"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={form.totalDrop}
                        onChange={(e) => setForm({ ...form, totalDrop: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                {(form.openingBank || form.closingBank || form.totalDrop) && (
                  <div className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2",
                    parseFloat(calcDiscrepancy()) === 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  )}>
                    <DollarSign className="h-4 w-4" />
                    Discrepancy: {formatCurrency(calcDiscrepancy())}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={saveEntry}
              disabled={saving || !form.title.trim() || !form.body.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={(o) => { if (!o) setSelectedEntry(null); }}>
        {selectedEntry && (() => {
          const badge = getTypeBadge(selectedEntry);
          const involvedStaff = selectedEntry.staffIds
            ? selectedEntry.staffIds.split(",").filter(Boolean).map((id) => staffMap.get(id) ?? id)
            : [];
          return (
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium", badge.cls)}>
                    {badge.icon}
                    {TYPE_LABELS[selectedEntry.type]}
                    {selectedEntry.type === "INCIDENT" && selectedEntry.severity && ` · ${selectedEntry.severity}`}
                  </span>
                  {selectedEntry.shift && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                      {selectedEntry.shift}
                    </span>
                  )}
                  {selectedEntry.resolvedAt && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{selectedEntry.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedEntry.createdAt).toLocaleString()} · {selectedEntry.author.name}
                  </p>
                </div>

                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEntry.body}</p>

                {/* INCIDENT details */}
                {selectedEntry.type === "INCIDENT" && involvedStaff.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Staff Involved</p>
                    <div className="flex flex-wrap gap-1.5">
                      {involvedStaff.map((name) => (
                        <span key={name} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* CASH_LOG details */}
                {selectedEntry.type === "CASH_LOG" && (
                  <div className="rounded-lg border border-gray-200 p-3 space-y-1.5 text-sm">
                    {selectedEntry.openingBank != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Opening Bank</span>
                        <span className="font-medium">{formatCurrency(selectedEntry.openingBank)}</span>
                      </div>
                    )}
                    {selectedEntry.closingBank != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Closing Bank</span>
                        <span className="font-medium">{formatCurrency(selectedEntry.closingBank)}</span>
                      </div>
                    )}
                    {selectedEntry.totalDrop != null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Drop</span>
                        <span className="font-medium">{formatCurrency(selectedEntry.totalDrop)}</span>
                      </div>
                    )}
                    {selectedEntry.discrepancy != null && (
                      <div className={cn("flex justify-between font-semibold pt-1 border-t border-gray-100", Number(selectedEntry.discrepancy) === 0 ? "text-green-700" : "text-red-700")}>
                        <span>Discrepancy</span>
                        <span>{formatCurrency(selectedEntry.discrepancy)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Follow-up */}
                <div className="space-y-1.5">
                  <Label>Follow-up Notes</Label>
                  <textarea
                    className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Add follow-up notes…"
                    value={editFollowUp}
                    onChange={(e) => setEditFollowUp(e.target.value)}
                  />
                  {editFollowUp !== (selectedEntry.followUp ?? "") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      disabled={savingFollowUp}
                      onClick={() => saveFollowUp(selectedEntry)}
                    >
                      {savingFollowUp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                      Save Follow-up
                    </Button>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 mr-auto"
                  onClick={() => deleteEntry(selectedEntry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resolving}
                  onClick={() => resolveEntry(selectedEntry)}
                >
                  {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {selectedEntry.resolvedAt ? "Unresolve" : "Mark Resolved"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedEntry(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* Vera Shift Summary Dialog */}
      <Dialog open={aiSummaryOpen} onOpenChange={setAiSummaryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <VeraMark className="h-5 w-5" />
              Shift Summary
            </DialogTitle>
          </DialogHeader>

          {aiSummaryLoading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-gray-500">Analyzing today&apos;s shift data…</p>
            </div>
          ) : aiSummary ? (
            <div className="space-y-4">
              {aiSummary.aiPowered && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                  <VeraSpark className="h-3 w-3" />
                  Summarized by Vera
                </div>
              )}

              {/* Narrative */}
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{aiSummary.narrative}</p>
              </div>

              {/* Bullets */}
              {aiSummary.bullets.length > 0 && (
                <ul className="space-y-1.5">
                  {aiSummary.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-amber-400 mt-1 shrink-0">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { label: "Revenue", value: aiSummary.metrics.totalRevenue != null ? `$${Number(aiSummary.metrics.totalRevenue).toFixed(0)}` : "—" },
                  { label: "Orders", value: aiSummary.metrics.orderCount != null ? String(aiSummary.metrics.orderCount) : "—" },
                  { label: "Avg Check", value: aiSummary.metrics.avgCheck != null ? `$${Number(aiSummary.metrics.avgCheck).toFixed(2)}` : "—" },
                  { label: "Labor %", value: aiSummary.metrics.laborPct != null ? `${Number(aiSummary.metrics.laborPct).toFixed(1)}%` : "—" },
                  { label: "Staff", value: aiSummary.metrics.staffCount != null ? String(aiSummary.metrics.staffCount) : "—" },
                  { label: "Covers", value: aiSummary.metrics.covers != null ? String(aiSummary.metrics.covers) : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">Could not generate summary</p>
          )}

          <DialogFooter className="gap-2">
            {aiSummary && (
              <Button size="sm" onClick={useAiSummaryAsEntry} className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add to Log
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setAiSummaryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
