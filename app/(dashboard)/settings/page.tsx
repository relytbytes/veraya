"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, Loader2, Plus, Pencil, Trash2, LayoutGrid, FlaskConical, Trash, AlertTriangle, X, Clock, CreditCard } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface TableRow {
  id: string;
  number: number;
  capacity: number;
  status: string;
  notes: string | null;
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  AVAILABLE: "success",
  OCCUPIED: "destructive",
  RESERVED: "warning",
  DIRTY: "secondary",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    restaurantName: "",
    taxRate: "8.75",
    currency: "USD",
    receiptFooter: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Card policy state
  const [cardPolicy, setCardPolicy] = useState({
    enabled: false,
    holdAmountCents: 2500,
    chargeOnNoShow: true,
    refundOnCancel: true,
    cancelHours: 24,
  });
  const [cardPolicySaving, setCardPolicySaving] = useState(false);
  const [cardPolicySaved, setCardPolicySaved] = useState(false);

  const [tables, setTables] = useState<TableRow[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tableStatusError, setTableStatusError] = useState<{ tableNumber: number; tableId: string } | null>(null);
  const [forceReleasing, setForceReleasing] = useState(false);

  // Simulation
  const [simDays, setSimDays] = useState("30");
  const [simOrdersPerDay, setSimOrdersPerDay] = useState("25");
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<{ created?: number; cleared?: number } | null>(null);

  async function runSimulation() {
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: Number(simDays), ordersPerDay: Number(simOrdersPerDay) }),
      });
      const data = await res.json();
      setSimResult(data);
    } finally {
      setSimRunning(false);
    }
  }

  async function clearSimulation() {
    if (!confirm("Delete all simulated orders? This cannot be undone.")) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const data = await res.json();
      setSimResult(data);
    } finally {
      setSimRunning(false);
    }
  }

  // Table dialog
  const [tableDialog, setTableDialog] = useState(false);
  const [editTable, setEditTable] = useState<TableRow | null>(null);
  const [tableForm, setTableForm] = useState({ number: "", capacity: "4" });
  const [tableSaving, setTableSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadTables();
  }, []);

  async function loadSettings() {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      setSettings((prev) => ({ ...prev, ...data }));
      if (data.reservationCardPolicy) {
        try { setCardPolicy(JSON.parse(data.reservationCardPolicy)); } catch { /* ignore */ }
      }
    }
  }

  async function saveCardPolicy() {
    setCardPolicySaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationCardPolicy: JSON.stringify(cardPolicy) }),
    });
    setCardPolicySaving(false);
    setCardPolicySaved(true);
    setTimeout(() => setCardPolicySaved(false), 2000);
  }

  async function saveSettings() {
    setSettingsSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSettingsSaving(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  async function loadTables() {
    setTablesLoading(true);
    const res = await fetch("/api/tables");
    if (res.ok) setTables(await res.json());
    setTablesLoading(false);
  }

  function openNewTable() {
    setEditTable(null);
    const nextNum = tables.length > 0 ? Math.max(...tables.map((t) => t.number)) + 1 : 1;
    setTableForm({ number: String(nextNum), capacity: "4" });
    setTableDialog(true);
  }

  function openEditTable(t: TableRow) {
    setEditTable(t);
    setTableForm({ number: String(t.number), capacity: String(t.capacity) });
    setTableDialog(true);
  }

  async function saveTable() {
    setTableSaving(true);
    if (editTable) {
      await fetch(`/api/tables/${editTable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: parseInt(tableForm.number),
          capacity: parseInt(tableForm.capacity),
        }),
      });
    } else {
      await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: parseInt(tableForm.number),
          capacity: parseInt(tableForm.capacity),
        }),
      });
    }
    setTableSaving(false);
    setTableDialog(false);
    loadTables();
  }

  async function deleteTable(id: string) {
    if (!confirm("Delete this table? This cannot be undone.")) return;
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    loadTables();
  }

  async function setTableStatus(id: string, status: string, tableNumber: number) {
    const res = await fetch(`/api/tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.status === 409) {
      setTableStatusError({ tableNumber, tableId: id });
      return;
    }
    loadTables();
  }

  async function forceReleaseTable() {
    if (!tableStatusError) return;
    setForceReleasing(true);
    try {
      await fetch(`/api/tables/${tableStatusError.tableId}?force=true`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "AVAILABLE" }),
      });
      setTableStatusError(null);
      loadTables();
    } finally {
      setForceReleasing(false);
    }
  }

  return (
    <div>
      <Header title="Settings" description="Restaurant configuration" />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* Restaurant Info */}
        <Card>
          <CardHeader>
            <CardTitle>Restaurant Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Restaurant Name</Label>
                <Input
                  value={settings.restaurantName}
                  onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })}
                  placeholder="My Restaurant"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.taxRate}
                  onChange={(e) => setSettings({ ...settings, taxRate: e.target.value })}
                  placeholder="8.75"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Receipt Footer</Label>
              <Input
                value={settings.receiptFooter}
                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                placeholder="Thank you for dining with us!"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : settingsSaved ? (
                  "✓ Saved!"
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table Management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-gray-500" />
              <CardTitle>Tables</CardTitle>
            </div>
            <Button size="sm" onClick={openNewTable}>
              <Plus className="h-4 w-4" /> Add Table
            </Button>
          </CardHeader>
          <CardContent>
            {tableStatusError && (
              <div className="flex items-start gap-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                <div className="flex-1 space-y-2">
                  <p>
                    <span className="font-medium">Table {tableStatusError.tableNumber} has an active order.</span>
                    {" "}Close the check from the POS first, then update status here.
                    <Link href="/pos?view=floorplan" className="ml-2 underline font-medium hover:text-amber-900">
                      Open POS Floor Plan →
                    </Link>
                  </p>
                  <p className="text-xs text-amber-700">
                    If the check was already paid and the table is stuck, use Force Release to cancel the dangling order and free the table.
                  </p>
                  <button
                    onClick={forceReleaseTable}
                    disabled={forceReleasing}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 underline disabled:opacity-50"
                  >
                    {forceReleasing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                    Force Release Table {tableStatusError.tableNumber}
                  </button>
                </div>
                <button onClick={() => setTableStatusError(null)} className="text-amber-400 hover:text-amber-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {tablesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : tables.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No tables configured</p>
            ) : (
              <div className="space-y-2">
                {tables
                  .sort((a, b) => a.number - b.number)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50"
                    >
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                        {t.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">Table {t.number}</p>
                        <p className="text-xs text-gray-400">Capacity: {t.capacity}</p>
                      </div>
                      <select
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-600"
                        value={t.status}
                        onChange={(e) => setTableStatus(t.id, e.target.value, t.number)}
                      >
                        {["AVAILABLE", "OCCUPIED", "RESERVED", "DIRTY"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <Badge variant={STATUS_COLORS[t.status] ?? "secondary"} className="text-xs">
                        {t.status}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTable(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteTable(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Reservation Hours ─────────────────────────────────────────── */}
        <Card className="border-dashed border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Reservation Availability
            </CardTitle>
            <p className="text-xs text-gray-500 -mt-1">
              Configure operating hours, service periods (Breakfast / Lunch / Dinner), slot intervals, and table blocks.
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/settings/hours">
              <Button variant="outline">
                <Clock className="h-4 w-4" /> Manage Hours &amp; Blocks
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* ── Floor Plan ───────────────────────────────────────────────── */}
        <Card className="border-dashed border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Floor Plan
            </CardTitle>
            <p className="text-xs text-gray-500 -mt-1">
              Set up your dining room layout for the host stand and POS floor view.
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/settings/floorplan">
              <Button variant="outline">
                <Pencil className="h-4 w-4" /> Edit Floor Plan
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* ── Reservation Card Policy ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Reservation Card Policy
            </CardTitle>
            <p className="text-xs text-gray-500 -mt-1">
              Require a credit card hold to protect against no-shows. Stripe integration must be configured to process cards.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Require card to book</p>
                <p className="text-xs text-gray-500">Guests must provide a card when making a reservation</p>
              </div>
              <button
                type="button"
                onClick={() => setCardPolicy(p => ({ ...p, enabled: !p.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${cardPolicy.enabled ? "bg-blue-600" : "bg-gray-200"}`}
                role="switch"
                aria-checked={cardPolicy.enabled}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${cardPolicy.enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Hold amount */}
            <div className="space-y-1.5">
              <Label>Hold Amount (cents)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={100}
                  step={100}
                  value={cardPolicy.holdAmountCents}
                  onChange={e => setCardPolicy(p => ({ ...p, holdAmountCents: Number(e.target.value) }))}
                  className="w-36"
                />
                <span className="text-sm text-gray-500">= ${(cardPolicy.holdAmountCents / 100).toFixed(2)} held per reservation</span>
              </div>
            </div>

            {/* Charge on no-show */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Charge on no-show</p>
                <p className="text-xs text-gray-500">Capture the hold amount if guest does not arrive</p>
              </div>
              <button
                type="button"
                onClick={() => setCardPolicy(p => ({ ...p, chargeOnNoShow: !p.chargeOnNoShow }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${cardPolicy.chargeOnNoShow ? "bg-blue-600" : "bg-gray-200"}`}
                role="switch"
                aria-checked={cardPolicy.chargeOnNoShow}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${cardPolicy.chargeOnNoShow ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Refund on cancel */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Refund on cancellation</p>
                <p className="text-xs text-gray-500">Release the hold when guest cancels in time</p>
              </div>
              <button
                type="button"
                onClick={() => setCardPolicy(p => ({ ...p, refundOnCancel: !p.refundOnCancel }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${cardPolicy.refundOnCancel ? "bg-blue-600" : "bg-gray-200"}`}
                role="switch"
                aria-checked={cardPolicy.refundOnCancel}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${cardPolicy.refundOnCancel ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Cancel hours */}
            <div className="space-y-1.5">
              <Label>Cancellation window (hours before reservation)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={cardPolicy.cancelHours}
                onChange={e => setCardPolicy(p => ({ ...p, cancelHours: Number(e.target.value) }))}
                className="w-24"
              />
            </div>

            {/* Stripe pending notice */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Stripe integration pending — card holds will process live once STRIPE_SECRET_KEY is configured.
            </div>

            <div className="flex justify-end">
              <Button onClick={saveCardPolicy} disabled={cardPolicySaving}>
                {cardPolicySaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : cardPolicySaved ? (
                  "Saved!"
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Card Policy
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Demo / Simulation ────────────────────────────────────────── */}
        <Card className="border-dashed border-purple-200 bg-purple-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <FlaskConical className="h-4 w-4" />
              Simulate Sales Data
            </CardTitle>
            <p className="text-xs text-purple-600 -mt-1">
              Generate realistic historical orders so Reports and Labor Forecast have data to work with. All simulated orders are tagged and can be cleared at any time.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Days of history</Label>
                <Input
                  type="number"
                  min="1"
                  max="90"
                  value={simDays}
                  onChange={(e) => setSimDays(e.target.value)}
                  className="bg-white"
                />
                <p className="text-xs text-gray-400">Max 90 days</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Avg orders per day</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={simOrdersPerDay}
                  onChange={(e) => setSimOrdersPerDay(e.target.value)}
                  className="bg-white"
                />
                <p className="text-xs text-gray-400">Max 100/day</p>
              </div>
            </div>

            {simResult && (
              <div className="rounded-md bg-white border border-purple-200 px-3 py-2 text-sm text-purple-700">
                {simResult.created !== undefined
                  ? `✓ Created ${simResult.created} simulated orders`
                  : `✓ Cleared ${simResult.cleared} simulated orders`}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={runSimulation}
                disabled={simRunning}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {simRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FlaskConical className="h-4 w-4 mr-1.5" />}
                Generate {simDays}d × ~{simOrdersPerDay}/day
              </Button>
              <Button
                variant="outline"
                onClick={clearSimulation}
                disabled={simRunning}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash className="h-4 w-4 mr-1.5" />
                Clear simulated
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table Dialog */}
      <Dialog open={tableDialog} onOpenChange={setTableDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTable ? "Edit Table" : "Add Table"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Table Number *</Label>
              <Input
                type="number"
                min="1"
                value={tableForm.number}
                onChange={(e) => setTableForm({ ...tableForm, number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity (seats) *</Label>
              <Input
                type="number"
                min="1"
                value={tableForm.capacity}
                onChange={(e) => setTableForm({ ...tableForm, capacity: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableDialog(false)}>Cancel</Button>
            <Button
              onClick={saveTable}
              disabled={tableSaving || !tableForm.number || !tableForm.capacity}
            >
              {tableSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editTable ? "Save" : "Add Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
