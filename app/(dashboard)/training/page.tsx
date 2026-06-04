"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, GraduationCap, Loader2, Pencil, Trash2, X,
  ChevronDown, ChevronRight, CheckCircle2, Circle,
  Users, ClipboardList, BookOpen,
  GripVertical, AlertTriangle, Search, UserCheck,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
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
import { ManualsTab } from "./manuals-tab";
import { STANDARD_MANUALS } from "@/lib/training-manuals";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingItem {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface TrainingTemplate {
  id: string;
  name: string;
  role: string | null;
  isActive: boolean;
  sortOrder: number;
  items: TrainingItem[];
}

interface TrainingSignoff {
  id: string;
  itemId: string;
  signedOffAt: string;
  notes: string | null;
  manager: { id: string; name: string };
}

interface TrainingAssignment {
  id: string;
  assignedAt: string;
  dueDate: string | null;
  user: { id: string; name: string; role: string };
  assigner: { id: string; name: string };
  template: TrainingTemplate;
  signoffs: TrainingSignoff[];
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES = [
  { value: "ALL",           label: "All Roles"   },
  { value: "ADMIN",         label: "Admin"       },
  { value: "MANAGER",       label: "Manager"     },
  { value: "SERVER",        label: "Server"      },
  { value: "CASHIER",       label: "Cashier"     },
  { value: "KITCHEN",       label: "Kitchen"     },
  { value: "KITCHEN_LINE",  label: "Line Cook"   },
  { value: "KITCHEN_PREP",  label: "Prep Cook"   },
  { value: "KITCHEN_DISH",  label: "Dishwasher"  },
  { value: "BAR",           label: "Bartender"   },
  { value: "HOST",          label: "Host"        },
  { value: "FOOD_RUNNER",   label: "Food Runner" },
  { value: "BARBACK",       label: "Barback"     },
];

const roleLabel = (r: string | null) =>
  r ? (ROLES.find((x) => x.value === r)?.label ?? r) : "All Roles";

const roleColor = (r: string | null) => {
  if (!r) return "bg-gray-100 text-gray-600";
  if (r === "ADMIN" || r === "MANAGER") return "bg-amber-100 text-amber-700";
  if (r.startsWith("KITCHEN")) return "bg-orange-100 text-orange-700";
  if (r === "SERVER" || r === "CASHIER") return "bg-blue-100 text-blue-700";
  if (r === "BAR" || r === "BARBACK") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
};

function progressPct(assignment: TrainingAssignment) {
  const total = assignment.template.items.length;
  if (total === 0) return 100;
  return Math.round((assignment.signoffs.length / total) * 100);
}

function isOverdue(a: TrainingAssignment) {
  if (!a.dueDate) return false;
  const pct = progressPct(a);
  return pct < 100 && new Date(a.dueDate) < new Date();
}

// ─── Starter Templates ────────────────────────────────────────────────────────

const STARTER_TEMPLATES: { name: string; role: string | null; items: string[] }[] = [
  {
    name: "New Server Onboarding",
    role: "SERVER",
    items: [
      "Restaurant policies & code of conduct",
      "POS system training — taking orders",
      "Table numbering & floor layout walkthrough",
      "Menu knowledge — food items & descriptions",
      "Menu knowledge — beverages & alcohol service",
      "Upselling techniques & daily specials",
      "Opening side work checklist",
      "Closing side work checklist",
      "Allergen awareness & special dietary requests",
      "Guest complaint handling procedure",
      "Cash handling & tip-out procedure",
      "Shadowed first shift with trainer",
      "Solo first shift completed",
    ],
  },
  {
    name: "Kitchen Line Cook Onboarding",
    role: "KITCHEN_LINE",
    items: [
      "Kitchen safety & sanitation standards",
      "Station setup and mise en place",
      "Recipe standards review — appetizers",
      "Recipe standards review — entrees",
      "Recipe standards review — sides",
      "Plating standards & portion control",
      "Ticket reading and KDS operation",
      "Communication with front of house",
      "Cooling, storage & FIFO labeling",
      "End-of-shift cleaning & breakdown",
      "Shadowed full service with trainer",
      "First solo station completed",
    ],
  },
  {
    name: "Bartender Certification",
    role: "BAR",
    items: [
      "Responsible alcohol service & ID checks",
      "Bar layout and product locations",
      "Cocktail menu recipes — standard builds",
      "Cocktail menu recipes — seasonal/specialty",
      "Beer & wine list knowledge",
      "Speed pouring & jigger accuracy",
      "Bar inventory and opening checklist",
      "Bar closing checklist & waste log",
      "POS — ringing bar tabs & splitting checks",
      "Guest interaction & upselling at the bar",
      "Cutting off intoxicated guests procedure",
      "First observed shift with trainer",
    ],
  },
  {
    name: "Host Stand Training",
    role: "HOST",
    items: [
      "Greeting guests & first impression standards",
      "Reservation system — viewing & editing",
      "Table management & waitlist procedure",
      "Seating rotation & section assignment",
      "Estimated wait times & managing expectations",
      "Phone etiquette & taking reservations",
      "Large party & special occasion handling",
      "ADA accessibility & special needs awareness",
      "Closing host stand checklist",
    ],
  },
  {
    name: "Manager in Training",
    role: "MANAGER",
    items: [
      "Opening manager checklist",
      "Closing manager checklist & cash count",
      "Shift scheduling & labor management",
      "Inventory counting procedure",
      "Vendor relations & receiving deliveries",
      "Handling guest escalations",
      "Staff coaching & corrective action process",
      "Daily sales reporting & KPIs",
      "Food safety & health code compliance",
      "Emergency procedures (fire, medical, security)",
      "POS void/comp/discount procedures",
      "End-of-period inventory & COGS review",
    ],
  },
  {
    name: "Food Safety & Sanitation",
    role: null,
    items: [
      "Personal hygiene standards",
      "Handwashing procedure & frequency",
      "Temperature danger zone awareness",
      "Proper food storage — raw vs. cooked",
      "FIFO labeling and date rotation",
      "Allergen cross-contamination prevention",
      "Cleaning vs. sanitizing — chemicals & dilution",
      "Receiving & inspecting deliveries",
      "Pest prevention basics",
      "Incident reporting — illness & injury",
    ],
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const [tab, setTab] = useState<"templates" | "assignments" | "manuals">("templates");
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Dialog states
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TrainingTemplate | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [starterDialog, setStarterDialog] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, a, s] = await Promise.all([
        fetch("/api/training/templates").then((r) => r.json()),
        fetch("/api/training/assignments").then((r) => r.json()),
        fetch("/api/staff").then((r) => r.json()),
      ]);
      setTemplates(Array.isArray(t) ? t : []);
      setAssignments(Array.isArray(a) ? a : []);
      setStaff(Array.isArray(s) ? s.filter((m: StaffMember) => m.isActive) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredTemplates = templates.filter((t) => {
    const matchRole = roleFilter === "ALL" || t.role === roleFilter || (!t.role && roleFilter === "ALL");
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const filteredAssignments = assignments.filter((a) => {
    const matchSearch = !search ||
      a.user.name.toLowerCase().includes(search.toLowerCase()) ||
      a.template.name.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const pendingCount = assignments.filter((a) => progressPct(a) < 100).length;
  const overdueCount = assignments.filter(isOverdue).length;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Training"
        description="Onboarding templates, checklists & sign-offs"
        actions={
          <div className="flex gap-2">
            {tab === "templates" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setStarterDialog(true)}>
                  <BookOpen className="h-4 w-4 mr-1.5" />
                  Starter Templates
                </Button>
                <Button size="sm" onClick={() => { setEditTemplate(null); setTemplateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Template
                </Button>
              </>
            )}
            {tab === "assignments" && (
              <Button size="sm" onClick={() => setAssignDialog(true)}>
                <UserCheck className="h-4 w-4 mr-1.5" />
                Assign Training
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs + filters */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-6">
          {([
            { key: "templates", label: "Templates", icon: ClipboardList, count: templates.length },
            { key: "assignments", label: "Assignments", icon: Users, count: assignments.length },
            { key: "manuals", label: "Manuals", icon: BookOpen, count: STANDARD_MANUALS.length },
          ] as const).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors",
                tab === key
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                tab === key ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
              )}>{count}</span>
            </button>
          ))}

          {/* Stats chips */}
          <div className="ml-auto flex items-center gap-3 pb-1">
            {overdueCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                <AlertTriangle className="h-3 w-3" />
                {overdueCount} overdue
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                <ClipboardList className="h-3 w-3" />
                {pendingCount} in progress
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search & role filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={tab === "templates" ? "Search templates…" : "Search by staff or template…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        {tab === "templates" && (
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "manuals" ? (
          <ManualsTab search={search} />
        ) : loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : tab === "templates" ? (
          <TemplatesTab
            templates={filteredTemplates}
            onEdit={(t) => { setEditTemplate(t); setTemplateDialog(true); }}
            onDelete={async (id) => {
              await fetch(`/api/training/templates/${id}`, { method: "DELETE" });
              fetchAll();
            }}
            onItemAdd={async (templateId, title, description) => {
              await fetch("/api/training/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, title, description }),
              });
              fetchAll();
            }}
            onItemDelete={async (itemId) => {
              await fetch(`/api/training/items/${itemId}`, { method: "DELETE" });
              fetchAll();
            }}
          />
        ) : (
          <AssignmentsTab
            assignments={filteredAssignments}
            onSignoff={async (assignmentId, itemId) => {
              await fetch("/api/training/signoffs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignmentId, itemId }),
              });
              fetchAll();
            }}
            onUnsignoff={async (signoffId) => {
              await fetch(`/api/training/signoffs/${signoffId}`, { method: "DELETE" });
              fetchAll();
            }}
            onDelete={async (id) => {
              await fetch(`/api/training/assignments/${id}`, { method: "DELETE" });
              fetchAll();
            }}
          />
        )}
      </div>

      {/* Template create/edit dialog */}
      <TemplateDialog
        open={templateDialog}
        template={editTemplate}
        onClose={() => setTemplateDialog(false)}
        onSave={async (name, role) => {
          if (editTemplate) {
            await fetch(`/api/training/templates/${editTemplate.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, role: role || null }),
            });
          } else {
            await fetch("/api/training/templates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, role: role || null }),
            });
          }
          setTemplateDialog(false);
          fetchAll();
        }}
      />

      {/* Assign training dialog */}
      <AssignDialog
        open={assignDialog}
        templates={templates}
        staff={staff}
        onClose={() => setAssignDialog(false)}
        onSave={async (userId, templateId, dueDate) => {
          await fetch("/api/training/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, templateId, dueDate: dueDate || undefined }),
          });
          setAssignDialog(false);
          fetchAll();
        }}
      />

      {/* Starter templates picker */}
      <StarterDialog
        open={starterDialog}
        onClose={() => setStarterDialog(false)}
        existingNames={templates.map((t) => t.name)}
        onImport={async (starter) => {
          // Atomic: template + all items in a single request (no partial imports).
          // Keep the dialog open so several (or all) can be added in a row.
          await fetch("/api/training/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: starter.name, role: starter.role, items: starter.items }),
          });
          await fetchAll();
        }}
      />
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({
  templates,
  onEdit,
  onDelete,
  onItemAdd,
  onItemDelete,
}: {
  templates: TrainingTemplate[];
  onEdit: (t: TrainingTemplate) => void;
  onDelete: (id: string) => void;
  onItemAdd: (templateId: string, title: string, description: string) => Promise<void>;
  onItemDelete: (itemId: string) => Promise<void>;
}) {
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div className="p-4 rounded-2xl bg-gray-100">
          <GraduationCap className="h-10 w-10 text-gray-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-700">No templates yet</p>
          <p className="text-sm text-gray-500 mt-1">Create a template or import a starter to get going.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {templates.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          onEdit={onEdit}
          onDelete={onDelete}
          onItemAdd={onItemAdd}
          onItemDelete={onItemDelete}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onItemAdd,
  onItemDelete,
}: {
  template: TrainingTemplate;
  onEdit: (t: TrainingTemplate) => void;
  onDelete: (id: string) => void;
  onItemAdd: (templateId: string, title: string, description: string) => Promise<void>;
  onItemDelete: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddItem() {
    if (!newTitle.trim()) return;
    setSaving(true);
    await onItemAdd(template.id, newTitle.trim(), newDesc.trim());
    setNewTitle("");
    setNewDesc("");
    setAddOpen(false);
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("p-2 rounded-lg", template.role ? roleColor(template.role).replace("text-", "bg-").split(" ")[0] + "/20" : "bg-gray-100")}>
          <GraduationCap className="h-5 w-5 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{template.name}</h3>
            {!template.isActive && (
              <Badge variant="outline" className="text-xs text-gray-400">Inactive</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", roleColor(template.role))}>
              {roleLabel(template.role)}
            </span>
            <span className="text-xs text-gray-400">{template.items.length} items</span>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(template)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={async () => {
              if (await confirmDialog({ message: `Delete template "${template.name}"? This cannot be undone.`, destructive: true, confirmText: "Delete" })) onDelete(template.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-gray-400 ml-1 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 ml-1 shrink-0" />}
      </div>

      {/* Checklist items */}
      {expanded && (
        <div className="border-t border-gray-100">
          {template.items.length === 0 && !addOpen && (
            <p className="px-5 py-4 text-sm text-gray-400 italic">No items yet — add your first checklist item.</p>
          )}
          {template.items.map((item, i) => (
            <div
              key={item.id}
              className={cn("flex items-start gap-3 px-5 py-3 group", i < template.items.length - 1 && "border-b border-gray-50")}
            >
              <GripVertical className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                )}
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                onClick={async () => {
                  if (await confirmDialog({ message: "Remove this checklist item?", destructive: true, confirmText: "Remove" })) onItemDelete(item.id);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add item form */}
          {addOpen ? (
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-2">
              <Input
                placeholder="Checklist item title…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") setAddOpen(false); }}
              />
              <Input
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddItem} disabled={saving || !newTitle.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Item"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-3 border-t border-gray-100">
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 border-dashed text-gray-400 hover:text-gray-600"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add item
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Assignments Tab ──────────────────────────────────────────────────────────

function AssignmentsTab({
  assignments,
  onSignoff,
  onUnsignoff,
  onDelete,
}: {
  assignments: TrainingAssignment[];
  onSignoff: (assignmentId: string, itemId: string) => Promise<void>;
  onUnsignoff: (signoffId: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "complete" | "overdue">("all");

  const filtered = assignments.filter((a) => {
    const pct = progressPct(a);
    if (filter === "pending") return pct < 100;
    if (filter === "complete") return pct === 100;
    if (filter === "overdue") return isOverdue(a);
    return true;
  });

  const counts = {
    all: assignments.length,
    pending: assignments.filter((a) => progressPct(a) < 100).length,
    complete: assignments.filter((a) => progressPct(a) === 100).length,
    overdue: assignments.filter(isOverdue).length,
  };

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div className="p-4 rounded-2xl bg-gray-100">
          <Users className="h-10 w-10 text-gray-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-700">No assignments yet</p>
          <p className="text-sm text-gray-500 mt-1">Assign a training template to a staff member to start tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-2">
        {(["all", "pending", "complete", "overdue"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize",
              filter === f
                ? f === "overdue" ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            )}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {filtered.map((a) => {
        const pct = progressPct(a);
        const overdue = isOverdue(a);
        const isOpen = expanded === a.id;

        return (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Row header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(isOpen ? null : a.id)}
            >
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">
                {a.user.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{a.user.name}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", roleColor(a.user.role))}>
                    {roleLabel(a.user.role)}
                  </span>
                  {overdue && (
                    <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                  {pct === 100 && (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Complete
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={cn("h-1.5 rounded-full transition-all", pct === 100 ? "bg-green-500" : overdue ? "bg-red-400" : "bg-amber-400")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {a.signoffs.length}/{a.template.items.length} · {pct}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {a.template.name}
                  {a.dueDate && ` · Due ${new Date(a.dueDate).toLocaleDateString()}`}
                  {` · Assigned by ${a.assigner.name}`}
                </p>
              </div>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={async () => { if (await confirmDialog({ message: "Remove this assignment?", destructive: true, confirmText: "Remove" })) onDelete(a.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-gray-400 ml-1 shrink-0" />
                : <ChevronRight className="h-4 w-4 text-gray-400 ml-1 shrink-0" />}
            </div>

            {/* Checklist sign-off view */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {a.template.items.map((item, i) => {
                  const signoff = a.signoffs.find((s) => s.itemId === item.id);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-3 group transition-colors",
                        i < a.template.items.length - 1 && "border-b border-gray-50",
                        signoff ? "bg-green-50/40" : "hover:bg-gray-50"
                      )}
                    >
                      <button
                        className="shrink-0 transition-transform active:scale-90"
                        onClick={() => signoff ? onUnsignoff(signoff.id) : onSignoff(a.id, item.id)}
                      >
                        {signoff
                          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                          : <Circle className="h-5 w-5 text-gray-300 hover:text-amber-400 transition-colors" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", signoff ? "text-gray-500 line-through" : "text-gray-800")}>
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                        )}
                      </div>
                      {signoff && (
                        <div className="text-right shrink-0">
                          <p className="text-xs text-green-600 font-medium">{signoff.manager.name}</p>
                          <p className="text-xs text-gray-400">{new Date(signoff.signedOffAt).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {a.template.items.length === 0 && (
                  <p className="px-5 py-4 text-sm text-gray-400 italic">This template has no checklist items.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Template Dialog ──────────────────────────────────────────────────────────

function TemplateDialog({
  open, template, onClose, onSave,
}: {
  open: boolean;
  template: TrainingTemplate | null;
  onClose: () => void;
  onSave: (name: string, role: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("ALL");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(template?.name ?? "");
    setRole(template?.role ?? "ALL");
  }, [template, open]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(name.trim(), role === "ALL" ? "" : role);
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "New Training Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Server Onboarding"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Setting a role helps filter which templates apply to which staff.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {template ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Dialog ────────────────────────────────────────────────────────────

function AssignDialog({
  open, templates, staff, onClose, onSave,
}: {
  open: boolean;
  templates: TrainingTemplate[];
  staff: StaffMember[];
  onClose: () => void;
  onSave: (userId: string, templateId: string, dueDate: string) => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setUserId(""); setTemplateId(""); setDueDate(""); }
  }, [open]);

  // Auto-filter templates by selected user's role
  const selectedStaff = staff.find((s) => s.id === userId);
  const relevantTemplates = selectedStaff
    ? templates.filter((t) => !t.role || t.role === selectedStaff.role)
    : templates;

  async function handleSave() {
    if (!userId || !templateId) return;
    setSaving(true);
    await onSave(userId, templateId, dueDate);
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select value={userId} onValueChange={(v) => { setUserId(v); setTemplateId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select staff member…" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {roleLabel(s.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Training Template</Label>
            <Select value={templateId} onValueChange={setTemplateId} disabled={!userId}>
              <SelectTrigger>
                <SelectValue placeholder={userId ? "Select template…" : "Select staff first"} />
              </SelectTrigger>
              <SelectContent>
                {relevantTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.items.length} items)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {userId && relevantTemplates.length < templates.length && (
              <p className="text-xs text-amber-600">
                Showing {relevantTemplates.length} of {templates.length} templates filtered by role.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Due Date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !userId || !templateId}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign Training
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Starter Templates Dialog ─────────────────────────────────────────────────

function StarterDialog({
  open, onClose, onImport, existingNames = [],
}: {
  open: boolean;
  onClose: () => void;
  onImport: (starter: typeof STARTER_TEMPLATES[0]) => Promise<void>;
  existingNames?: string[];
}) {
  const [importing, setImporting] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [preview, setPreview] = useState<typeof STARTER_TEMPLATES[0] | null>(null);

  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  const remaining = STARTER_TEMPLATES.filter((s) => !existing.has(s.name.toLowerCase()));

  async function importAll() {
    setImportingAll(true);
    for (const s of remaining) {
      setImporting(s.name);
      await onImport(s);
    }
    setImporting(null);
    setImportingAll(false);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Starter Templates</DialogTitle>
          <p className="text-sm text-gray-500">
            Pre-built checklists you can import and customise. Items can be added or removed after import.
          </p>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {STARTER_TEMPLATES.map((starter) => (
            <div
              key={starter.name}
              className={cn(
                "rounded-lg border p-4 cursor-pointer transition-colors",
                preview?.name === starter.name ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              )}
              onClick={() => setPreview(preview?.name === starter.name ? null : starter)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-amber-100">
                    <GraduationCap className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{starter.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", roleColor(starter.role))}>
                        {roleLabel(starter.role)}
                      </span>
                      <span className="text-xs text-gray-400">{starter.items.length} items</span>
                    </div>
                  </div>
                </div>
                {existing.has(starter.name.toLowerCase()) ? (
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 px-2"><CheckCircle2 className="h-3.5 w-3.5" /> Added</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!importing}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setImporting(starter.name);
                      await onImport(starter);
                      setImporting(null);
                    }}
                  >
                    {importing === starter.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
                  </Button>
                )}
              </div>

              {/* Preview items */}
              {preview?.name === starter.name && (
                <div className="mt-3 space-y-1.5 pl-2 border-l-2 border-amber-200">
                  {starter.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <Circle className="h-3 w-3 text-gray-300 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {remaining.length > 0 && (
            <Button onClick={importAll} disabled={importingAll} className="bg-amber-500 hover:bg-amber-600 text-white">
              {importingAll ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add all {remaining.length} template{remaining.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
