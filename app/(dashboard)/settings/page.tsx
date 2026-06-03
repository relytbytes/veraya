"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, Loader2, Plus, Pencil, Trash2, LayoutGrid, FlaskConical, Trash, AlertTriangle, X, Clock, CreditCard, DollarSign } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { type BonusConfig, DEFAULT_BONUS_CONFIG, parseBonusConfig } from "@/lib/bonus";
import { type FiscalConfig, DEFAULT_FISCAL_CONFIG, parseFiscalConfig, WEEKDAY_NAMES, fiscalYearStart, fmtShort } from "@/lib/fiscal";

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
    fixedMonthlyCost: "",
    targetFoodCostPct: "30",
    serviceOpen: "11:00",
    serviceClose: "22:00",
    timezone: "",
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [bonus, setBonus] = useState<BonusConfig>(DEFAULT_BONUS_CONFIG);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusSaved, setBonusSaved] = useState(false);
  const [fiscal, setFiscal] = useState<FiscalConfig>(DEFAULT_FISCAL_CONFIG);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalSaved, setFiscalSaved] = useState(false);

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
    if (!(await confirmDialog("Delete all simulated orders? This cannot be undone."))) return;
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
      // Auto-detect the venue timezone from this browser on first setup; once
      // saved, the stored value is authoritative (the books shouldn't shift if
      // someone opens the dashboard from another timezone).
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
      setSettings((prev) => ({ ...prev, ...data, timezone: data.timezone || prev.timezone || detectedTz }));
      if (data.reservationCardPolicy) {
        try { setCardPolicy(JSON.parse(data.reservationCardPolicy)); } catch { /* ignore */ }
      }
      if (data.managerBonus) setBonus(parseBonusConfig(data.managerBonus));
      if (data.fiscalCalendar) setFiscal(parseFiscalConfig(data.fiscalCalendar));
    }
  }

  async function saveFiscal() {
    setFiscalSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalCalendar: JSON.stringify(fiscal) }),
    });
    setFiscalSaving(false);
    setFiscalSaved(true);
    setTimeout(() => setFiscalSaved(false), 2000);
  }

  async function saveBonus() {
    setBonusSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerBonus: JSON.stringify(bonus) }),
    });
    setBonusSaving(false);
    setBonusSaved(true);
    setTimeout(() => setBonusSaved(false), 2000);
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
    // Strip the JSON blobs that have their own dedicated savers — otherwise this
    // would re-write a stale copy carried in settings state and clobber them.
    const { managerBonus: _mb, reservationCardPolicy: _cp, fiscalCalendar: _fc, ...economics } =
      settings as typeof settings & { managerBonus?: string; reservationCardPolicy?: string; fiscalCalendar?: string };
    void _mb; void _cp; void _fc;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(economics),
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
    if (!(await confirmDialog("Delete this table? This cannot be undone."))) return;
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

        {/* Vera economics — drives the live P&L projection + break-even */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-teal-600" /> Vera Economics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">
              Vera uses these to project your daily P&amp;L and break-even. Leave blank to use industry estimates.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fixed monthly costs ($)</Label>
                <Input
                  type="number"
                  value={settings.fixedMonthlyCost}
                  onChange={(e) => setSettings({ ...settings, fixedMonthlyCost: e.target.value })}
                  placeholder="rent + utilities + insurance"
                />
                <p className="text-[11px] text-gray-400">Sliced to a daily break-even (÷ 30.4).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Target food cost (%)</Label>
                <Input
                  type="number"
                  value={settings.targetFoodCostPct}
                  onChange={(e) => setSettings({ ...settings, targetFoodCostPct: e.target.value })}
                  placeholder="30"
                />
                <p className="text-[11px] text-gray-400">COGS as a share of sales.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Open time</Label>
                <Input
                  type="time"
                  value={settings.serviceOpen}
                  onChange={(e) => setSettings({ ...settings, serviceOpen: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Close time</Label>
                <Input
                  type="time"
                  value={settings.serviceClose}
                  onChange={(e) => setSettings({ ...settings, serviceClose: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {(() => {
                  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
                  const zones = supported ? supported("timeZone") : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"];
                  const list = settings.timezone && !zones.includes(settings.timezone) ? [settings.timezone, ...zones] : zones;
                  return list.map((z) => <option key={z} value={z}>{z}</option>);
                })()}
              </select>
              <p className="text-[11px] text-gray-400">Detected from your browser. Vera, reports, and service hours use the venue&apos;s local time. Set this to where the restaurant operates.</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : settingsSaved ? "✓ Saved!" : (<><Save className="h-4 w-4" /> Save Settings</>)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Manager Bonus — profit-share over budget, with a quality scorecard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-teal-600" /> Manager Bonus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-gray-500">
              A monthly profit-share on Performance Earnings above a target, with accelerator tiers and a
              quality scorecard. Auto-fills the Management Bonus line on the P&amp;L. Computed on profit
              <em> before</em> the bonus itself.
            </p>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={bonus.enabled}
                onChange={(e) => setBonus({ ...bonus, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              Enable manager bonus
            </label>

            <div className={`space-y-5 ${bonus.enabled ? "" : "opacity-50 pointer-events-none"}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Monthly target — Performance Earnings ($)</Label>
                  <Input type="number" value={bonus.monthlyTarget || ""}
                    onChange={(e) => setBonus({ ...bonus, monthlyTarget: Number(e.target.value) || 0 })}
                    placeholder="budgeted monthly profit" />
                  <p className="text-[11px] text-gray-400">Bonus only accrues on profit above this.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Cap (% of management salary)</Label>
                  <Input type="number" value={bonus.capPctOfSalary || ""}
                    onChange={(e) => setBonus({ ...bonus, capPctOfSalary: Number(e.target.value) || 0 })}
                    placeholder="30" />
                  <p className="text-[11px] text-gray-400">0 = uncapped. Caps the monthly payout.</p>
                </div>
              </div>

              {/* Accelerator tiers */}
              <div className="space-y-2">
                <Label>Profit-share tiers</Label>
                <p className="text-[11px] text-gray-400 -mt-1">Marginal share of the overage. Each tier applies above its monthly $ threshold.</p>
                <div className="space-y-2">
                  {bonus.tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">over $</span>
                      <Input type="number" className="w-32" value={t.over || (i === 0 ? 0 : "")}
                        onChange={(e) => {
                          const tiers = bonus.tiers.map((x, j) => j === i ? { ...x, over: Number(e.target.value) || 0 } : x);
                          setBonus({ ...bonus, tiers });
                        }} />
                      <span className="text-xs text-gray-500">→</span>
                      <Input type="number" className="w-24" value={t.pct || ""}
                        onChange={(e) => {
                          const tiers = bonus.tiers.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) || 0 } : x);
                          setBonus({ ...bonus, tiers });
                        }} />
                      <span className="text-xs text-gray-500">%</span>
                      {bonus.tiers.length > 1 && (
                        <button type="button" className="text-gray-400 hover:text-red-600"
                          onClick={() => setBonus({ ...bonus, tiers: bonus.tiers.filter((_, j) => j !== i) })}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm"
                  onClick={() => setBonus({ ...bonus, tiers: [...bonus.tiers, { over: 0, pct: 0 }] })}>
                  <Plus className="h-3.5 w-3.5" /> Add tier
                </Button>
              </div>

              {/* Quality scorecard */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <input
                    type="checkbox"
                    checked={bonus.scorecard.enabled}
                    onChange={(e) => setBonus({ ...bonus, scorecard: { ...bonus.scorecard, enabled: e.target.checked } })}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  Quality scorecard modifier (×0.8–1.2)
                </label>
                <p className="text-[11px] text-gray-400 -mt-1">
                  Scales the payout by how well targets were hit — so profit can&apos;t be gamed by cutting corners.
                </p>
                <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${bonus.scorecard.enabled ? "" : "opacity-50 pointer-events-none"}`}>
                  {([
                    ["laborTargetPct", "Labor target (%)", "labor"],
                    ["primeTargetPct", "Prime cost target (%)", "prime"],
                    ["compVoidMaxPct", "Comps+voids max (%)", "compVoid"],
                  ] as const).map(([key, label, wkey]) => (
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs">{label}</Label>
                      <Input type="number" value={(bonus.scorecard[key] as number) || ""}
                        onChange={(e) => setBonus({ ...bonus, scorecard: { ...bonus.scorecard, [key]: Number(e.target.value) || 0 } })} />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">weight</span>
                        <Input type="number" className="h-7 text-xs" value={bonus.scorecard.weights[wkey] || ""}
                          onChange={(e) => setBonus({ ...bonus, scorecard: { ...bonus.scorecard, weights: { ...bonus.scorecard.weights, [wkey]: Number(e.target.value) || 0 } } })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveBonus} disabled={bonusSaving}>
                {bonusSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : bonusSaved ? "✓ Saved!" : (<><Save className="h-4 w-4" /> Save Bonus Settings</>)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fiscal Calendar — 5-4-4 period close */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-teal-600" /> Fiscal Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">
              Drives true period-close reporting. Each quarter is 13 weeks split 5 + 4 + 4, giving 12 fiscal
              periods a year that always start and end on a week boundary.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Week starts on</Label>
                <select
                  value={fiscal.weekStart}
                  onChange={(e) => setFiscal({ ...fiscal, weekStart: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {WEEKDAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <p className="text-[11px] text-gray-400">Every period boundary lands on this day.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Period 1 begins</Label>
                <select
                  value={fiscal.anchor}
                  onChange={(e) => setFiscal({ ...fiscal, anchor: e.target.value as FiscalConfig["anchor"] })}
                  className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="week-of-jan1">Week containing January 1</option>
                  <option value="first-weekday">First {WEEKDAY_NAMES[fiscal.weekStart]} of January</option>
                </select>
                <p className="text-[11px] text-gray-400">Where the fiscal year is anchored.</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
              This year, Period 1 starts <b className="text-gray-900">{fmtShort(fiscalYearStart(new Date().getFullYear(), fiscal))}, {fiscalYearStart(new Date().getFullYear(), fiscal).getFullYear()}</b>.
            </p>
            <div className="flex justify-end">
              <Button onClick={saveFiscal} disabled={fiscalSaving}>
                {fiscalSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : fiscalSaved ? "✓ Saved!" : (<><Save className="h-4 w-4" /> Save Fiscal Calendar</>)}
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
                      <Button variant="ghost" size="icon" aria-label="Edit table" className="h-7 w-7" onClick={() => openEditTable(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon" aria-label="Delete table"
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
