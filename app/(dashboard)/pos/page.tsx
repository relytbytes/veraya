"use client";

import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import {
  Plus, Minus, X, ShoppingCart, CreditCard, Loader2,
  LayoutGrid, UtensilsCrossed, Printer, Receipt, Ban, Pencil,
  Timer, Flame, AlertCircle, CheckCircle2, Users, Search,
  Banknote, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ManagerAuthDialog, type ManagerAuthRequest } from "@/components/manager-auth-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; parentId?: string | null }
interface MenuItem {
  id: string; name: string; description: string | null;
  price: string; categoryId: string; prepTime: number | null; imageUrl: string | null;
  trackCount: boolean; countRemaining: number | null;
}
interface TableRow { id: string; number: number; capacity: number; status: string; serviceStage: string | null; floorX: number | null; floorY: number | null; rotation: number; shape: string; }

interface SelectedModifier { modifierId: string; optionId: string; optionName: string; priceAdj: number }
interface ModifierOption { id: string; name: string; priceAdj: string; sortOrder: number }
interface Modifier { id: string; name: string; isRequired: boolean; maxSelect: number; sortOrder: number; options: ModifierOption[] }

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  selectedModifiers?: SelectedModifier[];
  held?: boolean; // When true: item is held back from kitchen until explicitly fired
}

interface OpenOrder {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  type: string;
  tableId: string | null;
  table: { number: number } | null;
  createdAt: string;
  items: { id: string; quantity: number; unitPrice: number; heldForFire: boolean; voided: boolean; comped: boolean; menuItem: { name: string } }[];
  payments: { id: string; amount: number; method: string; tip: number }[];
}

interface CompletedOrder {
  id: string;
  total: number;
  subtotal: number;
  tax: number;
  tip: number;
  type: string;
  tableNumber?: number;
  items: CartItem[];
  payMethod: string;
  change: number;
}

// Floor-plan table visuals. These mirror the host stand's table-state colors
// (see host-utils deriveTableState) so a table reads the same everywhere — each
// course has its own hue: jade=seated, teal=apps, gold=entrees, violet=dessert,
// blue=check, red=bussing/dirty, teal=reserved, neutral=open. Dynamic brand hues
// are applied via inline style (Tailwind JIT can't see interpolated classes).
function floorVisual(status: string, serviceStage: string | null): { hue: string; label: string; open: boolean } {
  if (status === "OCCUPIED") {
    const s = serviceStage ?? "SEATED";
    if (s === "APPS")          return { hue: "#2BB39B", label: "Apps",    open: false };
    if (s === "ENTREES")       return { hue: "#E0A82E", label: "Entrees", open: false };
    if (s === "DESSERT")       return { hue: "#7C5CBF", label: "Dessert", open: false };
    if (s === "CHECK_DROPPED") return { hue: "#2E6EB0", label: "Check",   open: false };
    if (s === "CHECK_PAID")    return { hue: "#2E6EB0", label: "Paid",    open: false };
    if (s === "BUSSING")       return { hue: "#D44030", label: "Bussing", open: false };
    return { hue: "#1E7A45", label: "Seated", open: false };
  }
  if (status === "DIRTY")    return { hue: "#D44030", label: "Bussing", open: false };
  if (status === "RESERVED") return { hue: "#21A090", label: "Reserved", open: false };
  return { hue: "#8A97A6", label: "Open", open: true };
}

// Inline styles for a floor-plan table from its visual (light POS theme):
// open = white card + gray border; otherwise a soft tint with a solid border.
function floorCardStyle(v: { hue: string; open: boolean }): CSSProperties {
  return v.open
    ? { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
    : { backgroundColor: v.hue + "1A", borderColor: v.hue };
}
// Elapsed-time urgency chip for a seated table.
function timeChipClass(mins: number) {
  return mins > 90 ? "bg-red-100 text-red-700" : mins > 60 ? "bg-warning-100 text-warning-800" : "bg-gray-100 text-gray-500";
}

// ── Stage abbreviations ────────────────────────────────────────────────────────
const STAGE_ABBREV: Record<string, string> = {
  SEATED: "STD", APPS: "APP", ENTREES: "ENT", DESSERT: "DST",
  CHECK_DROPPED: "CHK", CHECK_PAID: "PD", BUSSING: "BUS",
};

function elapsedLabel(createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Menu tile visuals ────────────────────────────────────────────────────────
// Deterministic accent per category so image-less items still read as distinct,
// colorful tiles instead of plain text boxes.
const TILE_ACCENTS = [
  { bg: "#E7F4F1", fg: "#00897B" }, // teal
  { bg: "#E8F2FB", fg: "#2E6EB0" }, // sky
  { bg: "#E9F6EE", fg: "#1E7A45" }, // jade
  { bg: "#FFF4D6", fg: "#B5820A" }, // gold
  { bg: "#F1ECFB", fg: "#7A5AC2" }, // violet
  { bg: "#FDEDE7", fg: "#C2410C" }, // clay
];
function tileAccent(categoryId: string) {
  let h = 0;
  for (let i = 0; i < categoryId.length; i++) h = (h * 31 + categoryId.charCodeAt(i)) >>> 0;
  return TILE_ACCENTS[h % TILE_ACCENTS.length];
}
function itemInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

type POSView = "order" | "floorplan" | "checks";
type TipPreset = "18" | "20" | "22" | "custom" | "none";

// ── Payment method picker ──────────────────────────────────────────────────────
// One clear, icon-led selector used everywhere a tender is chosen (takeout,
// split, recall) so the screen reads the same each time. Debit carries a quiet
// "lower fees" hint to nudge the cheaper-to-process choice.
type PayMethod = "CASH" | "CREDIT" | "DEBIT";
// One "Card" tender — we absorb the credit/debit fee difference, so staff don't
// pick between them. Card maps to CREDIT on the backend.
const PAY_METHODS: { m: PayMethod; label: string; hint?: string; Icon: typeof CreditCard }[] = [
  { m: "CASH", label: "Cash", Icon: Banknote },
  { m: "CREDIT", label: "Card", Icon: CreditCard },
];

function PaymentMethodPicker({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PAY_METHODS.map(({ m, label, hint, Icon }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl border py-3 text-sm font-semibold transition-colors",
            value === m ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50",
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
          {hint && <span className="text-[10px] font-medium text-green-600 leading-none">{hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Tip Section Component ──────────────────────────────────────────────────────

function TipSection({
  subtotal,
  tipPreset,
  setTipPreset,
  customTip,
  setCustomTip,
  tipAmount,
}: {
  subtotal: number;
  tipPreset: TipPreset;
  setTipPreset: (p: TipPreset) => void;
  customTip: string;
  setCustomTip: (v: string) => void;
  tipAmount: number;
}) {
  return (
    <div className="space-y-2">
      <Label>Tip</Label>
      <div className="grid grid-cols-4 gap-2">
        {(["18", "20", "22"] as const).map((pct) => (
          <button
            key={pct}
            onClick={() => { setTipPreset(pct); setCustomTip(""); }}
            className={cn(
              "rounded-lg border py-2 text-sm font-medium transition-colors",
              tipPreset === pct
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {pct}%
          </button>
        ))}
        <button
          onClick={() => setTipPreset("custom")}
          className={cn(
            "rounded-lg border py-2 text-sm font-medium transition-colors",
            tipPreset === "custom"
              ? "border-amber-500 bg-amber-50 text-amber-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          Custom $
        </button>
      </div>
      {tipPreset === "custom" && (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
          <Input
            type="number"
            step="0.01"
            placeholder="Tip amount in dollars"
            className="pl-6"
            value={customTip}
            onChange={(e) => setCustomTip(e.target.value)}
          />
        </div>
      )}
      {tipAmount > 0 && (
        <p className="text-sm text-gray-500">
          Tip: <span className="font-medium text-gray-800">{formatCurrency(tipAmount)}</span>
        </p>
      )}
    </div>
  );
}

function computeTip(preset: TipPreset, customTip: string, subtotal: number): number {
  if (preset === "none") return 0;
  if (preset === "18") return Math.round(subtotal * 0.18 * 100) / 100;
  if (preset === "20") return Math.round(subtotal * 0.20 * 100) / 100;
  if (preset === "22") return Math.round(subtotal * 0.22 * 100) / 100;
  if (preset === "custom") return Math.max(0, Number(customTip) || 0);
  return 0;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function POSPage() {
  const [view, setView] = useState<POSView>("floorplan");

  // Honour ?view= query param
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view") as POSView | null;
    if (v && ["order", "floorplan", "checks"].includes(v)) setView(v);
  }, []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [eightySixIds, setEightySixIds] = useState<Set<string>>(new Set());
  const [floorObjects, setFloorObjects] = useState<{ id: string; type: string; label: string; x: number; y: number; width: number; height: number; rotation: number; color: string }[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [browseParent, setBrowseParent] = useState<string | null>(null); // null = top level of the menu tree
  const [menuSearch, setMenuSearch] = useState("");
  // When set: we're adding items to an existing order (not creating a new one)
  const [addingToOrder, setAddingToOrder] = useState<OpenOrder | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEOUT">("DINE_IN");
  const [tableId, setTableId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [taxRate, setTaxRate] = useState(0.0875);
  const [receiptName, setReceiptName] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  // Takeout payment dialog
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"CASH" | "CREDIT" | "DEBIT">("CREDIT");
  const [cashReceived, setCashReceived] = useState("");
  const [placing, setPlacing] = useState(false);

  // Takeout tip state
  const [checkoutTipPreset, setCheckoutTipPreset] = useState<TipPreset>("none");
  const [checkoutCustomTip, setCheckoutCustomTip] = useState("");

  // Receipt / success dialog
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Recall / close check dialog (occupied table)
  const [recallOrder, setRecallOrder] = useState<OpenOrder | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallPayMethod, setRecallPayMethod] = useState<"CASH" | "CREDIT" | "DEBIT">("CREDIT");
  const [recallCash, setRecallCash] = useState("");
  const [closing, setClosing] = useState(false);

  // Recall tip state
  const [recallTipPreset, setRecallTipPreset] = useState<TipPreset>("none");
  const [recallCustomTip, setRecallCustomTip] = useState("");

  // Split bill state
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitWays, setSplitWays] = useState(2);
  const [splitMethods, setSplitMethods] = useState<("CASH" | "CREDIT" | "DEBIT")[]>(["CREDIT", "CREDIT"]);
  const [splitPaidCount, setSplitPaidCount] = useState(0);
  const [splitChargingIdx, setSplitChargingIdx] = useState<number | null>(null);

  // Void order
  const [voiding, setVoiding] = useState(false);

  // Per-item notes
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  // Hold / Fire state
  const [holdMode, setHoldMode] = useState(false); // When true: tapping cart items toggles their held state
  const [holdFireMins, setHoldFireMins] = useState(0); // 0 = fire held items manually; >0 = auto-fire after N min
  const [firing, setFiring] = useState(false);
  const [voidingItemId, setVoidingItemId] = useState<string | null>(null);
  const [compingItemId, setCompingItemId] = useState<string | null>(null);
  const [compingCheck, setCompingCheck] = useState(false);
  const [managerAuth, setManagerAuth] = useState<ManagerAuthRequest | null>(null);

  // Modifier selection dialog
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [customizeModifiers, setCustomizeModifiers] = useState<Modifier[]>([]);
  const [customizeSelections, setCustomizeSelections] = useState<Record<string, Set<string>>>({});

  // ── Toast notifications ────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "error" | "success" | "warn" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string, type: "error" | "success" | "warn" = "error") => {
    clearTimeout(toastTimerRef.current);
    setToastMsg({ text, type });
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 5000);
  }, []);

  // ── Confirm dialog ─────────────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState<{
    title: string; message: string; onConfirm: () => void; destructive?: boolean;
  } | null>(null);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, destructive = true) => {
    setConfirmState({ title, message, onConfirm, destructive });
  }, []);

  // ── Guest count ────────────────────────────────────────────────────────────
  const [guestCount, setGuestCount] = useState(2);

  const loadTables = useCallback(async () => {
    const res = await fetch("/api/tables");
    if (res.ok) setTables(await res.json());
  }, []);

  const loadOpenOrders = useCallback(async () => {
    const res = await fetch("/api/orders?status=OPEN,IN_PROGRESS,READY");
    if (res.ok) {
      const all: OpenOrder[] = await res.json();
      setOpenOrders(all.filter((o) => o.tableId));
    }
  }, []);

  const loadEightySix = useCallback(async () => {
    try {
      const res = await fetch("/api/eightysix");
      if (res.ok) {
        const items: { menuItemId: string }[] = await res.json();
        setEightySixIds(new Set(items.map((i) => i.menuItemId)));
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, itemsRes, settingsRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/menu"),
          fetch("/api/settings"),
        ]);
        if (!catsRes.ok || !itemsRes.ok) throw new Error("Failed to load menu data");
        setCategories(await catsRes.json());
        setMenuItems(await itemsRes.json());
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          if (s.taxRate) setTaxRate(Number(s.taxRate) / 100);
          if (s.restaurantName) setReceiptName(String(s.restaurantName));
          if (s.receiptFooter) setReceiptFooter(String(s.receiptFooter));
          if (s.floorPlanObjects) {
            try { setFloorObjects(JSON.parse(s.floorPlanObjects)); } catch { /* ignore */ }
          }
        }
        await Promise.all([loadTables(), loadOpenOrders(), loadEightySix()]);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTables, loadOpenOrders, loadEightySix]);

  // Live: reflect floor changes (seating/moves from the host stand), kitchen
  // bumps, and 86 changes from other terminals without a manual refresh.
  useRealtime(["floor", "kitchen"], () => { loadTables(); loadOpenOrders(); loadEightySix(); });

  // Auto-fire pacing: while the POS is open, poke the auto-fire endpoint every
  // 45s so held courses whose timer elapsed fire to the kitchen on their own.
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch("/api/cron/auto-fire", { method: "POST" });
        if (res.ok) {
          const d = await res.json().catch(() => ({ fired: 0 }));
          if (d.fired > 0) { loadTables(); loadOpenOrders(); }
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 45_000);
    return () => clearInterval(id);
  }, [loadTables, loadOpenOrders]);

  // ── Cart helpers ───────────────────────────────────────────────────────────

  async function addToCart(item: MenuItem) {
    // Fetch modifiers for this item; if any exist, open the customize dialog
    try {
      const res = await fetch(`/api/modifiers?menuItemId=${item.id}`);
      if (res.ok) {
        const mods: Modifier[] = await res.json();
        if (mods.length > 0) {
          setCustomizeItem(item);
          setCustomizeModifiers(mods);
          // Pre-select first option for each required radio modifier
          const initial: Record<string, Set<string>> = {};
          for (const m of mods) {
            initial[m.id] = new Set();
            if (m.isRequired && m.maxSelect === 1 && m.options.length > 0) {
              initial[m.id].add(m.options[0].id);
            }
          }
          setCustomizeSelections(initial);
          setCustomizeOpen(true);
          return;
        }
      }
    } catch { /* fall through to direct add */ }
    // No modifiers — add directly
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id && !c.selectedModifiers?.length);
      if (existing) return prev.map((c) => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  function toggleModifierOption(mod: Modifier, optionId: string) {
    setCustomizeSelections((prev) => {
      const current = new Set(prev[mod.id] ?? []);
      if (mod.maxSelect === 1) {
        current.clear();
        current.add(optionId);
      } else {
        if (current.has(optionId)) current.delete(optionId);
        else if (current.size < mod.maxSelect) current.add(optionId);
      }
      return { ...prev, [mod.id]: current };
    });
  }

  function confirmCustomize() {
    if (!customizeItem) return;
    const selected: SelectedModifier[] = [];
    let priceAdj = 0;
    for (const mod of customizeModifiers) {
      for (const optId of customizeSelections[mod.id] ?? []) {
        const opt = mod.options.find((o) => o.id === optId);
        if (opt) {
          selected.push({ modifierId: mod.id, optionId: opt.id, optionName: opt.name, priceAdj: Number(opt.priceAdj) });
          priceAdj += Number(opt.priceAdj);
        }
      }
    }
    const basePrice = Number(customizeItem.price);
    setCart((prev) => [
      ...prev,
      { menuItemId: customizeItem.id, name: customizeItem.name, price: basePrice + priceAdj, quantity: 1, selectedModifiers: selected },
    ]);
    setCustomizeOpen(false);
    setCustomizeItem(null);
  }

  function saveNote(menuItemId: string) {
    setCart((prev) => prev.map((c) => c.menuItemId === menuItemId ? { ...c, notes: noteInput.trim() || undefined } : c));
    setEditingNoteFor(null);
    setNoteInput("");
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev.map((c) => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c)
          .filter((c) => c.quantity > 0)
    );
  }

  function toggleHeld(idx: number) {
    setCart((prev) => prev.map((c, i) => i === idx ? { ...c, held: !c.held } : c));
  }

  async function fireHeldItems(orderId: string, itemIds: string[]) {
    setFiring(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fireItemIds: itemIds }),
      });
      if (res.ok) {
        // Optimistically clear held status in recall dialog
        setRecallOrder((prev) =>
          prev ? { ...prev, items: prev.items.map((i) => itemIds.includes(i.id) ? { ...i, heldForFire: false } : i) } : null
        );
        await loadOpenOrders();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error ?? "Failed to fire items.");
      }
    } catch {
      showToast("Network error. Could not fire items.");
    } finally {
      setFiring(false);
    }
  }

  function voidOrderItem(itemId: string) {
    if (!recallOrder) return;
    setManagerAuth({
      title: "Void Item",
      description: "Voiding removes an item that should not have been rung (e.g. a double ring). Requires manager authorization.",
      reasons: ["Double ring", "Wrong item", "Server error", "Guest changed mind", "86'd item"],
      confirmLabel: "Void Item",
      onConfirm: async (reason, managerPin) => {
        setVoidingItemId(itemId);
        try {
          const res = await fetch(`/api/orders/${recallOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voidItem: { itemId, reason, managerPin } }),
          });
          if (res.ok) {
            setRecallOrder(await res.json());
            await loadOpenOrders();
            return { ok: true };
          }
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: (err as { error?: string }).error ?? "Failed to void item." };
        } catch {
          return { ok: false, error: "Network error." };
        } finally { setVoidingItemId(null); }
      },
    });
  }

  function compOrderItem(itemId: string) {
    if (!recallOrder) return;
    setManagerAuth({
      title: "Comp Item",
      description: "Comping keeps the item made but does not charge for it (goodwill). Requires manager authorization.",
      reasons: ["Kitchen mistake", "Long wait", "Quality issue", "Manager goodwill", "Regular/VIP"],
      confirmLabel: "Comp Item",
      onConfirm: async (reason, managerPin) => {
        setCompingItemId(itemId);
        try {
          const res = await fetch(`/api/orders/${recallOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ compItem: { itemId, reason, managerPin } }),
          });
          if (res.ok) {
            setRecallOrder(await res.json());
            await loadOpenOrders();
            return { ok: true };
          }
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: (err as { error?: string }).error ?? "Failed to comp item." };
        } catch {
          return { ok: false, error: "Network error." };
        } finally { setCompingItemId(null); }
      },
    });
  }

  function reopenCheck() {
    if (!recallOrder) return;
    const orderId = recallOrder.id;
    setManagerAuth({
      title: "Reopen Check",
      description: "Reverses the close so the check can be edited and re-charged. The recorded payment is removed. Requires manager authorization.",
      reasons: ["Wrong total", "Forgot an item", "Wrong tender", "Guest returned", "Correction"],
      confirmLabel: "Reopen Check",
      onConfirm: async (reason, managerPin) => {
        try {
          const res = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reopen: { reason, managerPin } }),
          });
          if (res.ok) {
            setRecallOrder(await res.json());
            await Promise.all([loadTables(), loadOpenOrders()]);
            return { ok: true };
          }
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: (err as { error?: string }).error ?? "Failed to reopen check." };
        } catch {
          return { ok: false, error: "Network error." };
        }
      },
    });
  }

  function compEntireCheck() {
    if (!recallOrder) return;
    setManagerAuth({
      title: "Comp Entire Check",
      description: "This closes the whole check at $0. Requires manager authorization.",
      reasons: ["Kitchen mistake", "Long wait", "Quality issue", "Manager goodwill", "Service recovery"],
      confirmLabel: "Comp Check",
      onConfirm: async (reason, managerPin) => {
        setCompingCheck(true);
        try {
          const res = await fetch(`/api/orders/${recallOrder!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ compCheck: { reason, managerPin } }),
          });
          if (res.ok) {
            setRecallOpen(false);
            setCompletedOrder({
              id: recallOrder!.id,
              total: 0, subtotal: 0, tax: 0, tip: 0,
              type: recallOrder!.type,
              tableNumber: recallOrder!.table?.number,
              items: recallOrder!.items.map((i) => ({ menuItemId: i.id, name: i.menuItem.name, price: 0, quantity: i.quantity })),
              payMethod: "COMP",
              change: 0,
            });
            setRecallOrder(null);
            setSuccessOpen(true);
            await Promise.all([loadTables(), loadOpenOrders()]);
            return { ok: true };
          }
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: (err as { error?: string }).error ?? "Failed to comp check." };
        } catch {
          return { ok: false, error: "Network error." };
        } finally { setCompingCheck(false); }
      },
    });
  }

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const checkoutTip = computeTip(checkoutTipPreset, checkoutCustomTip, subtotal);
  const checkoutGrandTotal = total + checkoutTip;
  const change = payMethod === "CASH" && cashReceived
    ? Number(cashReceived) - checkoutGrandTotal
    : 0;

  // ── Recall helpers ─────────────────────────────────────────────────────────

  const openRecallDialog = useCallback((order: OpenOrder) => {
    setRecallOrder(order);
    setRecallPayMethod("CREDIT");
    setRecallCash("");
    setRecallTipPreset("none");
    setRecallCustomTip("");
    setSplitEnabled(false);
    setSplitWays(2);
    setSplitMethods(["CREDIT", "CREDIT"]);
    setSplitPaidCount(0);
    setSplitChargingIdx(null);
    setRecallOpen(true);
  }, []);

  // ── Floor plan callbacks ────────────────────────────────────────────────────

  function onStartOrder(t: TableRow) {
    setTableId(t.id);
    setOrderType("DINE_IN");
    setView("order");
  }

  async function onForceRelease(t: TableRow) {
    await fetch(`/api/tables/${t.id}?force=true`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "AVAILABLE" }),
    });
    await Promise.all([loadTables(), loadOpenOrders()]);
  }

  async function onMarkAvailable(t: TableRow) {
    await fetch(`/api/tables/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "AVAILABLE" }),
    });
    await Promise.all([loadTables(), loadOpenOrders()]);
  }

  // ── Floor plan: click occupied table → recall check ────────────────────────

  async function selectTableFromFloorPlan(t: TableRow) {
    if (t.status === "OCCUPIED") {
      // Tapping an occupied table opens it for EDITING (add items), not cashout.
      // The server reaches the pay/close screen only via the explicit button.
      const cached = openOrders.find((o) => o.tableId === t.id);
      if (cached) { setAddingToOrder(cached); setTableId(t.id); setOrderType("DINE_IN"); setView("order"); return; }
      // Fallback: fetch from API (cross-day orders, stale state, etc.)
      try {
        const res = await fetch(`/api/orders?tableId=${t.id}`);
        if (res.ok) {
          const orders: OpenOrder[] = await res.json();
          const open = orders.find((o) => ["OPEN", "IN_PROGRESS", "READY"].includes(o.status));
          if (open) { setAddingToOrder(open); setTableId(t.id); setOrderType("DINE_IN"); setView("order"); return; }
          const completed = orders.find((o) => o.status === "COMPLETED");
          if (completed) { openRecallDialog(completed); return; } // already paid → recall to reopen/void
        }
      } catch {
        showToast(`Could not load orders for Table ${t.number}. Check connection.`);
        return;
      }
      // Occupied but no order yet (e.g. just seated from the host stand) —
      // open a fresh check for the table rather than dead-ending.
      setTableId(t.id);
      setOrderType("DINE_IN");
      setView("order");
      return;
    }
    setTableId(t.id);
    setOrderType("DINE_IN");
    setView("order");
  }

  // Deep link from the host stand's "Open check": /pos?table=<id> jumps straight
  // into that table's check (recall existing order, or start a fresh one).
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || tables.length === 0) return;
    const tid = new URLSearchParams(window.location.search).get("table");
    if (!tid) { deepLinkHandled.current = true; return; }
    const t = tables.find((x) => x.id === tid);
    if (t) {
      deepLinkHandled.current = true;
      selectTableFromFloorPlan(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  // ── DINE_IN: send to kitchen (no payment yet) ──────────────────────────────
  // Also handles "add items to existing order" when addingToOrder is set.

  async function sendToKitchen() {
    // Dine-in orders must be tied to a table. Takeout uses completeTakeout().
    if (orderType === "DINE_IN" && !addingToOrder && !tableId) {
      showToast("Choose a table for this order, or switch to Takeout.");
      return;
    }
    setPlacing(true);
    try {
      if (addingToOrder) {
        // Adding items to an existing open check
        const res = await fetch(`/api/orders/${addingToOrder.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdFireMins: cart.some((c) => c.held) ? holdFireMins : 0,
            addItems: cart.map((c) => ({
              menuItemId: c.menuItemId,
              quantity: c.quantity,
              unitPrice: c.price,
              notes: c.notes,
              modifierIds: c.selectedModifiers?.map((m) => m.optionId) ?? [],
              held: c.held ?? false,
            })),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast((err as { error?: string }).error ?? "Failed to add items to check. Please try again.");
          return;
        }
        setCart([]);
        setHoldMode(false);
        setAddingToOrder(null);
        await Promise.all([loadTables(), loadOpenOrders()]);
        // No "sent to kitchen" popup — the fired items just update on the ticket.
        setView("floorplan");
      } else {
        // Creating a new order
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: tableId || null,
            type: "DINE_IN",
            holdFireMins: cart.some((c) => c.held) ? holdFireMins : 0,
            items: cart.map((c) => ({
              menuItemId: c.menuItemId,
              quantity: c.quantity,
              unitPrice: c.price,
              notes: c.notes,
              modifierIds: c.selectedModifiers?.map((m) => m.optionId) ?? [],
              held: c.held ?? false,
            })),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast((err as { error?: string }).error ?? "Failed to send order to kitchen. Please try again.");
          return;
        }
        setCart([]);
        setTableId("");
        setHoldMode(false);
        setGuestCount(2);
        await Promise.all([loadTables(), loadOpenOrders()]);
        // No "sent to kitchen" popup — return to the floor; the table stays open.
        setView("floorplan");
      }
    } catch {
      showToast("Network error. Please check your connection and try again.");
    } finally {
      setPlacing(false);
    }
  }

  // ── TAKEOUT: create order + immediately complete with payment ──────────────

  async function completeTakeout() {
    setPlacing(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: null,
          type: "TAKEOUT",
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity: c.quantity,
            unitPrice: c.price,
            notes: c.notes,
            modifierIds: c.selectedModifiers?.map((m) => m.optionId) ?? [],
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error ?? "Failed to create order. Please try again.");
        return;
      }
      const order = await res.json();

      const patchRes = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          payment: { amount: total, method: payMethod, tip: checkoutTip },
        }),
      });
      if (!patchRes.ok) {
        showToast("Order created but payment failed. Please close the check manually.", "warn");
        return;
      }

      setCompletedOrder({
        id: order.id, total: checkoutGrandTotal, subtotal, tax,
        tip: checkoutTip,
        type: "TAKEOUT",
        items: [...cart],
        payMethod,
        change: change > 0 ? change : 0,
      });
      setCheckoutOpen(false);
      setSuccessOpen(true);
      setCart([]);
      setTableId("");
      await Promise.all([loadTables(), loadOpenOrders()]);
    } catch {
      showToast("Network error. Please check your connection and try again.");
    } finally {
      setPlacing(false);
    }
  }

  // ── Close check (recall dialog) ────────────────────────────────────────────

  async function closeCheck() {
    if (!recallOrder) return;
    setClosing(true);
    const recallSubtotal = Number(recallOrder.subtotal);
    const recallTotal = Number(recallOrder.total);
    const recallTip = computeTip(recallTipPreset, recallCustomTip, recallSubtotal);
    const recallGrandTotal = recallTotal + recallTip;
    const recallChange = recallPayMethod === "CASH" && recallCash
      ? Number(recallCash) - recallGrandTotal
      : 0;

    try {
      const res = await fetch(`/api/orders/${recallOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          payment: { amount: recallTotal, method: recallPayMethod, tip: recallTip },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error ?? "Failed to close check. Please try again.");
        return;
      }

      setRecallOpen(false);
      setCompletedOrder({
        id: recallOrder.id,
        total: recallGrandTotal,
        subtotal: recallSubtotal,
        tax: Number(recallOrder.tax),
        tip: recallTip,
        type: recallOrder.type,
        tableNumber: recallOrder.table?.number,
        items: recallOrder.items.map((i) => ({
          menuItemId: i.id,
          name: i.menuItem.name,
          price: Number(i.unitPrice),
          quantity: i.quantity,
        })),
        payMethod: recallPayMethod,
        change: recallChange > 0 ? recallChange : 0,
      });
      setSuccessOpen(true);
      setRecallOrder(null);
      await Promise.all([loadTables(), loadOpenOrders()]);
    } catch {
      showToast("Network error. Please check your connection and try again.");
    } finally {
      setClosing(false);
    }
  }

  // ── Split bill: charge one split ──────────────────────────────────────────

  async function chargeSplit(idx: number) {
    if (!recallOrder) return;
    setSplitChargingIdx(idx);

    const recallSubtotal = Number(recallOrder.subtotal);
    const recallTotal = Number(recallOrder.total);
    const recallTip = computeTip(recallTipPreset, recallCustomTip, recallSubtotal);
    const grandTotal = recallTotal + recallTip;
    const perSplit = Math.round((grandTotal / splitWays) * 100) / 100;
    const isLastSplit = idx === splitWays - 1;

    // Tip on the last split only; last split absorbs any rounding remainder
    const splitTip = isLastSplit ? recallTip : 0;
    const splitBase = isLastSplit
      ? Math.round((grandTotal - perSplit * (splitWays - 1)) * 100) / 100
      : perSplit;

    try {
      const isLastPayment = idx === splitWays - 1;
      const res = await fetch(`/api/orders/${recallOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isLastPayment && { status: "COMPLETED" }),
          payment: {
            amount: splitBase,
            method: splitMethods[idx],
            tip: splitTip,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error ?? "Failed to charge split. Please try again.");
        return;
      }

      const newPaidCount = splitPaidCount + 1;
      setSplitPaidCount(newPaidCount);

      if (newPaidCount >= splitWays) {
        setRecallOpen(false);
        setCompletedOrder({
          id: recallOrder.id,
          total: grandTotal,
          subtotal: recallSubtotal,
          tax: Number(recallOrder.tax),
          tip: recallTip,
          type: recallOrder.type,
          tableNumber: recallOrder.table?.number,
          items: recallOrder.items.map((i) => ({
            menuItemId: i.id,
            name: i.menuItem.name,
            price: Number(i.unitPrice),
            quantity: i.quantity,
          })),
          payMethod: "Split",
          change: 0,
        });
        setSuccessOpen(true);
        setRecallOrder(null);
        await Promise.all([loadTables(), loadOpenOrders()]);
      }
    } catch {
      showToast("Network error. Please check your connection and try again.");
    } finally {
      setSplitChargingIdx(null);
    }
  }

  function voidOrder() {
    if (!recallOrder) return;
    showConfirm(
      "Void Order",
      "Void this order? This action cannot be undone.",
      async () => {
        setVoiding(true);
        try {
          const res = await fetch(`/api/orders/${recallOrder!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "VOID" }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast((err as { error?: string }).error ?? "Failed to void order.");
            return;
          }
          setRecallOpen(false);
          setRecallOrder(null);
          await Promise.all([loadTables(), loadOpenOrders()]);
        } catch {
          showToast("Network error.");
        } finally {
          setVoiding(false);
        }
      }
    );
  }

  function printReceipt() {
    if (!receiptRef.current) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body{font-family:'Courier New',monospace;font-size:13px;margin:0;padding:16px;max-width:300px}
        .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}
        .row{display:flex;justify-content:space-between;margin:2px 0}
        .total-row{display:flex;justify-content:space-between;font-weight:bold;font-size:15px}
        h2{margin:0 0 4px;font-size:18px}p{margin:2px 0}
      </style></head>
      <body>${receiptRef.current.innerHTML}
      <script>window.onload=function(){window.print();window.close()}<\/script>
      </body></html>
    `);
    win.document.close();
  }

  const searchQ = menuSearch.trim().toLowerCase();
  // Menu tree: Category → Subcategory → items. Selecting a category shows it plus
  // every descendant, so a parent surfaces its whole subtree.
  const catByParent = new Map<string, Category[]>();
  for (const c of categories) {
    const p = c.parentId ?? "__root__";
    if (!catByParent.has(p)) catByParent.set(p, []);
    catByParent.get(p)!.push(c);
  }
  const childrenOfCat = (id: string) => catByParent.get(id) ?? [];
  const topCats = catByParent.get("__root__") ?? [];
  const descendantCatIds = (() => {
    const set = new Set<string>();
    const walk = (id: string) => { set.add(id); for (const ch of (catByParent.get(id) ?? [])) walk(ch.id); };
    if (activeCat !== "all") walk(activeCat);
    return set;
  })();
  const visibleItems = (activeCat === "all" ? menuItems : menuItems.filter((i) => descendantCatIds.has(i.categoryId)))
    .filter((i) => !searchQ || i.name.toLowerCase().includes(searchQ));
  // Quantity of each menu item already in the cart → drives the tile badge.
  const cartQtyById = cart.reduce<Record<string, number>>((m, c) => {
    m[c.menuItemId] = (m[c.menuItemId] ?? 0) + c.quantity;
    return m;
  }, {});
  // Title for the "Send to Kitchen" button changes when adding to an existing order
  const addingToOrderLabel = addingToOrder?.table
    ? `Adding to Table ${addingToOrder.table.number}`
    : addingToOrder
    ? "Adding to Check"
    : null;

  // Derived values for recall dialog
  const recallSubtotalVal = recallOrder ? Number(recallOrder.subtotal) : 0;
  const recallTotalVal = recallOrder ? Number(recallOrder.total) : 0;
  const recallTipVal = computeTip(recallTipPreset, recallCustomTip, recallSubtotalVal);
  const recallGrandTotalVal = recallTotalVal + recallTipVal;
  const recallChangeVal = recallPayMethod === "CASH" && recallCash
    ? Number(recallCash) - recallGrandTotalVal
    : 0;
  const splitAmountVal = splitWays > 0
    ? Math.round((recallGrandTotalVal / splitWays) * 100) / 100
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* View toggle */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => setView("floorplan")}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            view === "floorplan" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100")}
        >
          <LayoutGrid className="h-4 w-4" /> Floor Plan
        </button>
        <button
          onClick={() => setView("checks")}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative",
            view === "checks" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100")}
        >
          <Receipt className="h-4 w-4" /> Checks
          {openOrders.length > 0 && (
            <span className={cn(
              "absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full text-[10px] font-bold flex items-center justify-center px-1",
              view === "checks" ? "bg-white text-amber-600" : "bg-amber-500 text-white"
            )}>
              {openOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setView("order")}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            view === "order" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100")}
        >
          <UtensilsCrossed className="h-4 w-4" /> New Order
        </button>
        {addingToOrder && (
          <Badge className="ml-2 bg-blue-100 text-blue-700 border-blue-200">
            Adding to T{addingToOrder.table?.number ?? "—"}
          </Badge>
        )}
        {tableId && view === "order" && !addingToOrder && (
          <Badge className="ml-2 bg-amber-100 text-amber-700 border-amber-200">
            Table {tables.find((t) => t.id === tableId)?.number}
          </Badge>
        )}
      </div>

      {view === "floorplan" ? (
        <FloorPlanView
          tables={tables}
          floorObjects={floorObjects}
          onSelectTable={selectTableFromFloorPlan}
          selectedTableId={tableId}
          openOrders={openOrders}
          onStartOrder={onStartOrder}
          onForceRelease={onForceRelease}
          onMarkAvailable={onMarkAvailable}
          onFireHeld={fireHeldItems}
          firing={firing}
        />
      ) : view === "checks" ? (
        <ChecksTab
          openOrders={openOrders}
          tables={tables}
          onRecall={openRecallDialog}
          onNewOrder={(t) => { setTableId(t.id); setOrderType("DINE_IN"); setView("order"); }}
          loading={loading}
        />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Menu */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            {/* Adding-to-order mode banner */}
            {addingToOrder && (
              <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-blue-700">
                  {addingToOrderLabel} — select items to add, then tap &quot;Send to Kitchen&quot;
                </span>
                <button
                  onClick={() => { setAddingToOrder(null); setCart([]); setHoldMode(false); }}
                  className="text-xs text-blue-500 hover:text-blue-700 underline shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Open checks banner — driven by actual open orders, not just table status */}
            {openOrders.length > 0 && !addingToOrder && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-amber-700 shrink-0">Open checks:</span>
                {openOrders
                  .sort((a, b) => (a.table?.number ?? 0) - (b.table?.number ?? 0))
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => openRecallDialog(o)}
                      className="px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
                    >
                      T{o.table?.number} · {formatCurrency(Number(o.total))}
                    </button>
                  ))}
              </div>
            )}
            <div className="border-b border-gray-200 bg-white px-4 py-3 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search the menu…"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 transition-colors"
                />
                {menuSearch && (
                  <button
                    onClick={() => setMenuSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
                {(() => {
                  const chip = "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1";
                  const on = "bg-amber-500 text-white shadow-sm";
                  const off = "bg-gray-100 text-gray-600 hover:bg-gray-200";
                  const parentCat = browseParent ? categories.find((c) => c.id === browseParent) : null;
                  const list = browseParent === null ? topCats : childrenOfCat(browseParent);
                  return (
                    <>
                      {browseParent === null ? (
                        <button onClick={() => setActiveCat("all")} className={cn(chip, activeCat === "all" ? on : off)}>All</button>
                      ) : (
                        <>
                          <button
                            onClick={() => { const up = parentCat?.parentId ?? null; setBrowseParent(up); setActiveCat(up ?? "all"); }}
                            className={cn(chip, off)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" /> Back
                          </button>
                          {parentCat && (() => {
                            const acc = tileAccent(parentCat.id);
                            const active = activeCat === parentCat.id;
                            return (
                              <button onClick={() => setActiveCat(parentCat.id)} className={chip}
                                style={active ? { backgroundColor: acc.fg, color: "#fff" } : { backgroundColor: acc.bg, color: acc.fg }}>
                                All {parentCat.name}
                              </button>
                            );
                          })()}
                        </>
                      )}
                      {list.map((cat) => {
                        const hasKids = childrenOfCat(cat.id).length > 0;
                        const active = activeCat === cat.id && !hasKids;
                        const acc = tileAccent(cat.id);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => { if (hasKids) { setBrowseParent(cat.id); setActiveCat(cat.id); } else { setActiveCat(cat.id); } }}
                            className={chip}
                            style={active ? { backgroundColor: acc.fg, color: "#fff" } : { backgroundColor: acc.bg, color: acc.fg }}
                          >
                            {cat.name}{hasKids && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : loadError ? (
              <div className="flex items-center justify-center h-64 text-gray-400">
                <p>Failed to load POS data. <button className="underline text-amber-600" onClick={() => window.location.reload()}>Reload</button></p>
              </div>
            ) : (
              <div className="@container flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5">
                  {visibleItems.map((item) => {
                    const is86 = eightySixIds.has(item.id);
                    const soldOut = item.trackCount && item.countRemaining !== null && item.countRemaining <= 0;
                    const disabled = is86 || soldOut;
                    const lowCount = item.trackCount && item.countRemaining !== null && item.countRemaining > 0 && item.countRemaining <= 5;
                    const trackedCount = item.trackCount && item.countRemaining !== null && !soldOut;
                    const accent = tileAccent(item.categoryId);
                    const qty = cartQtyById[item.id] ?? 0;
                    return (
                    <button
                      key={item.id}
                      onClick={() => !disabled && addToCart(item)}
                      disabled={disabled}
                      className={cn(
                        "group flex flex-col rounded-xl border overflow-hidden text-left transition-all relative",
                        disabled
                          ? "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                          : "bg-white border-gray-200 shadow-sm hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                      )}
                    >
                      {/* Media: photo, or a colored placeholder with item initials */}
                      <div
                        className="relative flex h-20 w-full items-center justify-center"
                        style={item.imageUrl ? undefined : { background: accent.bg }}
                      >
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className={cn("h-full w-full object-cover", disabled && "grayscale")} />
                        ) : (
                          <span className="text-2xl font-extrabold tracking-tight" style={{ color: accent.fg }}>
                            {itemInitials(item.name)}
                          </span>
                        )}

                        {/* qty already in cart */}
                        {qty > 0 && !disabled && (
                          <span className="absolute top-1.5 left-1.5 h-5 min-w-[20px] px-1 rounded-full bg-amber-600 text-white text-[11px] font-bold flex items-center justify-center shadow">
                            {qty}
                          </span>
                        )}
                        {/* availability — top right */}
                        {is86 && (
                          <span className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">86&apos;d</span>
                        )}
                        {soldOut && !is86 && (
                          <span className="absolute top-1.5 right-1.5 bg-gray-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">SOLD OUT</span>
                        )}
                        {/* remaining count — bottom left */}
                        {trackedCount && (
                          <span className={cn(
                            "absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded",
                            lowCount ? "bg-warning-500 text-white" : "bg-white/85 text-gray-600"
                          )}>
                            {item.countRemaining} left
                          </span>
                        )}
                        {/* add affordance — bottom right, on hover */}
                        {!disabled && (
                          <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-white text-amber-600 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="h-4 w-4" />
                          </span>
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex flex-1 flex-col p-2.5">
                        <p className={cn("font-semibold text-sm leading-snug line-clamp-2", disabled ? "text-gray-400 line-through" : "text-gray-900")}>
                          {item.name}
                        </p>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5 pt-2">
                          <span className={cn("text-sm font-bold", disabled ? "text-gray-400" : "text-amber-600")}>
                            {formatCurrency(Number(item.price))}
                          </span>
                          {item.prepTime ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                              <Timer className="h-3 w-3" />{item.prepTime}m
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    );
                  })}
                  {visibleItems.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                      <Search className="h-8 w-8" />
                      <p className="text-sm">{searchQ ? `No items match “${menuSearch.trim()}”` : "No items in this category"}</p>
                      {searchQ && (
                        <button onClick={() => setMenuSearch("")} className="text-xs font-medium text-amber-600 hover:underline">Clear search</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Cart */}
          <div className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
            <div className="border-b border-gray-100 p-4 space-y-3">
              <div className="flex gap-2">
                {(["DINE_IN", "TAKEOUT"] as const).map((t) => (
                  <button key={t} onClick={() => setOrderType(t)}
                    className={cn("flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                      orderType === t ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600")}
                  >
                    {t === "DINE_IN" ? "Dine In" : "Takeout"}
                  </button>
                ))}
              </div>
              {orderType === "DINE_IN" && (
                <>
                  <Select value={tableId} onValueChange={setTableId}>
                    <SelectTrigger className={cn(!addingToOrder && !tableId && "border-amber-400 ring-2 ring-amber-100")}>
                      <SelectValue placeholder="Select a table — required" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.filter((t) => t.status === "AVAILABLE" || t.id === tableId).map((t) => (
                        <SelectItem key={t.id} value={t.id}>Table {t.number} (seats {t.capacity})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!addingToOrder && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                        <Users className="h-3.5 w-3.5" /> Guests
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => setGuestCount(g => Math.max(1, g - 1))}
                          className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{guestCount}</span>
                        <button onClick={() => setGuestCount(g => g + 1)}
                          className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <ShoppingCart className="h-8 w-8" />
                  <p className="text-sm">Cart is empty</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {cart.map((item, idx) => (
                    <div
                      key={`${item.menuItemId}-${idx}`}
                      className={cn(
                        "px-4 py-2.5 transition-colors",
                        item.held && "bg-warning-50",
                        holdMode && "cursor-pointer hover:bg-warning-100 select-none",
                      )}
                      onClick={holdMode ? () => toggleHeld(idx) : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={cn(
                              "text-sm truncate",
                              item.held ? "italic font-normal text-gray-400" : "font-bold text-gray-900",
                            )}>{item.name}</p>
                            {item.held && (
                              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-warning-200 text-warning-800 uppercase tracking-wide">
                                <Timer className="h-2.5 w-2.5" /> Hold
                              </span>
                            )}
                          </div>
                          {item.selectedModifiers?.length ? (
                            <p className="text-[10px] text-gray-400 truncate">
                              {item.selectedModifiers.map((m) => m.optionName).join(", ")}
                            </p>
                          ) : null}
                          {item.notes && <p className="text-[10px] italic text-amber-600 truncate">{item.notes}</p>}
                          <p className="text-xs text-gray-400">{formatCurrency(item.price)} each</p>
                        </div>
                        {/* Note editor toggle — hidden in hold mode to avoid accidental taps */}
                        {!holdMode && <button
                          onClick={() => { setEditingNoteFor(`${item.menuItemId}-${idx}`); setNoteInput(item.notes ?? ""); }}
                          className={cn("p-1 rounded", item.notes ? "text-amber-500" : "text-gray-300 hover:text-gray-500")}
                          title="Add note"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>}
                        {!holdMode && <>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateQty(item.menuItemId, -1)}
                              className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => updateQty(item.menuItemId, 1)}
                              className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="w-14 text-right text-sm font-semibold">{formatCurrency(item.price * item.quantity)}</p>
                          <button onClick={() => updateQty(item.menuItemId, -999)}>
                            <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
                          </button>
                        </>}
                        {holdMode && <p className="w-14 text-right text-sm font-semibold text-gray-400">{item.quantity}×</p>}
                      </div>
                      {/* Inline note editor */}
                      {editingNoteFor === `${item.menuItemId}-${idx}` && (
                        <div className="mt-1.5 flex gap-1.5">
                          <Input
                            autoFocus
                            className="h-7 text-xs py-1"
                            placeholder="Special instructions…"
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNote(item.menuItemId);
                              if (e.key === "Escape") { setEditingNoteFor(null); setNoteInput(""); }
                            }}
                          />
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => saveNote(item.menuItemId)}>OK</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-4 space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-gray-500"><span>Tax (8.75%)</span><span>{formatCurrency(tax)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>

              {orderType === "DINE_IN" ? (
                /* Dine-in: send to kitchen, collect payment later when table is recalled */
                <div className="flex gap-2">
                  <button
                    onClick={() => setHoldMode((v) => !v)}
                    disabled={cart.length === 0}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0 disabled:opacity-40",
                      holdMode
                        ? "bg-amber-500 text-white border-amber-500"
                        : "border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-600"
                    )}
                    title={holdMode ? "Exit hold mode" : "Select items to hold back from kitchen"}
                  >
                    <Timer className="h-4 w-4" />
                    {holdMode ? "Done" : "Hold"}
                  </button>
                  <Button
                    className={cn("flex-1", addingToOrder && "bg-blue-600 hover:bg-blue-700")}
                    disabled={cart.length === 0 || placing || holdMode || (orderType === "DINE_IN" && !addingToOrder && !tableId)}
                    onClick={sendToKitchen}
                  >
                    {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UtensilsCrossed className="h-4 w-4" />}
                    {addingToOrder
                      ? `Add ${cart.reduce((s, c) => s + c.quantity, 0)} Item${cart.reduce((s, c) => s + c.quantity, 0) !== 1 ? "s" : ""} to Check`
                      : cart.some((c) => c.held) && !cart.every((c) => c.held)
                      ? `Fire ${cart.filter((c) => !c.held).length} · Hold ${cart.filter((c) => c.held).length}`
                      : cart.every((c) => c.held)
                      ? "Send Held Order"
                      : "Send to Kitchen"}
                  </Button>
                </div>
              ) : (
                /* Takeout: charge immediately */
                <Button
                  className="w-full"
                  disabled={cart.length === 0}
                  onClick={() => setCheckoutOpen(true)}
                >
                  <CreditCard className="h-4 w-4" /> Charge {formatCurrency(total)}
                </Button>
              )}

              {cart.length > 0 && !holdMode && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setCart([]); setHoldMode(false); }}>
                  Clear Cart
                </Button>
              )}
              {/* Editing an existing check: explicit path to the pay/close screen */}
              {addingToOrder && !holdMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={() => { const o = addingToOrder; setCart([]); setAddingToOrder(null); openRecallDialog(o); }}
                >
                  <CreditCard className="h-4 w-4" /> Pay / Close Check
                </Button>
              )}
              {holdMode && (
                <div className="space-y-2">
                  <p className="text-center text-xs text-amber-600 font-medium">
                    Tap items above to hold/unhold · press Done when finished
                  </p>
                  {cart.some((c) => c.held) && (
                    <div>
                      <p className="text-[11px] font-medium text-gray-500 mb-1">Auto-fire held course</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[{ m: 0, label: "Manual" }, { m: 10, label: "10 min" }, { m: 20, label: "20 min" }, { m: 30, label: "30 min" }].map(({ m, label }) => (
                          <button
                            key={m}
                            onClick={() => setHoldFireMins(m)}
                            className={cn(
                              "rounded-lg border py-1.5 text-xs font-medium transition-colors",
                              holdFireMins === m ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Manager auth (comps / voids) ──────────────────────────────────── */}
      <ManagerAuthDialog request={managerAuth} onClose={() => setManagerAuth(null)} />

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMsg && (
        <div className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm w-full",
          toastMsg.type === "error" ? "bg-red-600 text-white" :
          toastMsg.type === "success" ? "bg-green-600 text-white" :
          "bg-warning-500 text-gray-900"
        )}>
          {toastMsg.type === "error"   ? <AlertCircle className="h-4 w-4 shrink-0" /> :
           toastMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> :
           <AlertCircle className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{toastMsg.text}</span>
          <button onClick={() => setToastMsg(null)} className="text-white/70 hover:text-white shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!confirmState} onOpenChange={(o) => { if (!o) setConfirmState(null); }}>
        <DialogContent className="max-w-sm">
          {confirmState && (
            <>
              <DialogHeader><DialogTitle>{confirmState.title}</DialogTitle></DialogHeader>
              <p className="text-sm text-gray-600">{confirmState.message}</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmState(null)}>Cancel</Button>
                <Button
                  variant={confirmState.destructive ? "destructive" : "default"}
                  onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                >
                  Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── TAKEOUT Payment Dialog ─────────────────────────────────────────── */}
      <Dialog open={checkoutOpen} onOpenChange={(o) => { if (!o) { setCheckoutOpen(false); setCheckoutTipPreset("none"); setCheckoutCustomTip(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Payment — Takeout</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <PaymentMethodPicker value={payMethod} onChange={setPayMethod} />
            </div>

            <TipSection
              subtotal={subtotal}
              tipPreset={checkoutTipPreset}
              setTipPreset={setCheckoutTipPreset}
              customTip={checkoutCustomTip}
              setCustomTip={setCheckoutCustomTip}
              tipAmount={checkoutTip}
            />

            {/* Running total */}
            <div className="bg-amber-50 rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between text-amber-700">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Tax</span><span>{formatCurrency(tax)}</span>
              </div>
              {checkoutTip > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Tip</span><span>{formatCurrency(checkoutTip)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-amber-800 text-base pt-1 border-t border-amber-200">
                <span>Total</span><span>{formatCurrency(checkoutGrandTotal)}</span>
              </div>
            </div>

            {payMethod === "CASH" && (
              <div className="space-y-1.5">
                <Label>Cash Received</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)} />
                {cashReceived && Number(cashReceived) >= checkoutGrandTotal && (
                  <p className="text-sm font-medium text-green-600">Change: {formatCurrency(Number(cashReceived) - checkoutGrandTotal)}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCheckoutOpen(false); setCheckoutTipPreset("none"); setCheckoutCustomTip(""); }}>Cancel</Button>
            <Button onClick={completeTakeout} disabled={placing}>
              {placing && <Loader2 className="h-4 w-4 animate-spin" />} Complete Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Recall / Close Check Dialog (occupied table) ──────────────────── */}
      <Dialog open={recallOpen} onOpenChange={(o) => { if (!o) setRecallOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-500" />
              {recallOrder?.table ? `Table ${recallOrder.table.number} — Close Check` : "Close Check"}
            </DialogTitle>
          </DialogHeader>

          {recallOrder && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Order items — void/comp/fire controls */}
              <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                {recallOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm",
                      item.voided && "bg-gray-50 opacity-60",
                      item.heldForFire && !item.voided && "bg-warning-50",
                      item.comped && !item.voided && "bg-green-50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {item.heldForFire && !item.voided && <Timer className="h-3 w-3 text-warning-600 shrink-0" />}
                      <span className={cn("text-gray-700 truncate", item.voided && "line-through text-gray-400")}>
                        {item.quantity}× {item.menuItem.name}
                      </span>
                      {item.voided && <span className="text-[9px] font-bold uppercase tracking-wide bg-gray-200 text-gray-600 px-1 py-0.5 rounded shrink-0">VOID</span>}
                      {item.comped && !item.voided && <span className="text-[9px] font-bold uppercase tracking-wide bg-green-200 text-green-700 px-1 py-0.5 rounded shrink-0">COMP</span>}
                      {item.heldForFire && !item.voided && <span className="text-[9px] font-bold uppercase tracking-wide bg-warning-200 text-warning-800 px-1 py-0.5 rounded shrink-0">HELD</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("font-medium w-14 text-right", (item.voided || item.comped) ? "text-gray-400 line-through" : "text-gray-600")}>
                        {formatCurrency(Number(item.unitPrice) * item.quantity)}
                      </span>
                      {/* Fire held */}
                      {item.heldForFire && !item.voided && (
                        <button
                          disabled={firing}
                          onClick={() => fireHeldItems(recallOrder.id, [item.id])}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold disabled:opacity-50"
                        >
                          <Flame className="h-2.5 w-2.5" /> Fire
                        </button>
                      )}
                      {/* Comp item */}
                      {!item.voided && !item.comped && !item.heldForFire && (
                        <button
                          disabled={compingItemId === item.id}
                          onClick={() => compOrderItem(item.id)}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-green-100 hover:bg-green-200 text-green-700 text-[10px] font-bold border border-green-200 disabled:opacity-50"
                          title="Comp this item (house on it)"
                        >
                          {compingItemId === item.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Comp"}
                        </button>
                      )}
                      {/* Void item */}
                      {!item.voided && (
                        <button
                          disabled={voidingItemId === item.id}
                          onClick={() => voidOrderItem(item.id)}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold border border-red-200 disabled:opacity-50"
                          title="Void this item (remove from bill)"
                        >
                          {voidingItemId === item.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Void"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fire all held */}
              {recallOrder.items.some((i) => i.heldForFire && !i.voided) && (
                <button
                  disabled={firing}
                  onClick={() => fireHeldItems(recallOrder.id, recallOrder.items.filter((i) => i.heldForFire && !i.voided).map((i) => i.id))}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {firing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                  Fire All Held ({recallOrder.items.filter((i) => i.heldForFire && !i.voided).length} items)
                </button>
              )}

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span><span>{formatCurrency(recallSubtotalVal)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tax</span><span>{formatCurrency(Number(recallOrder.tax))}</span>
                </div>
                {recallTipVal > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Tip</span><span>{formatCurrency(recallTipVal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-100">
                  <span>Total</span><span>{formatCurrency(recallGrandTotalVal)}</span>
                </div>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Status:</span>
                <span className={cn("font-medium px-2 py-0.5 rounded-full",
                  recallOrder.status === "READY" ? "bg-green-100 text-green-700" :
                  recallOrder.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700"
                )}>
                  {recallOrder.status.replace("_", " ")}
                </span>
              </div>

              {/* Tip section */}
              <TipSection
                subtotal={recallSubtotalVal}
                tipPreset={recallTipPreset}
                setTipPreset={setRecallTipPreset}
                customTip={recallCustomTip}
                setCustomTip={setRecallCustomTip}
                tipAmount={recallTipVal}
              />

              {/* Split bill toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setSplitEnabled((v) => !v);
                    setSplitPaidCount(0);
                    setSplitWays(2);
                    setSplitMethods(["CREDIT", "CREDIT"]);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    splitEnabled
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  Split Bill
                </button>
                {splitEnabled && (
                  <span className="text-xs text-gray-500">Each: {formatCurrency(splitAmountVal)}</span>
                )}
              </div>

              {splitEnabled ? (
                /* Split bill mode */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0">Split into</Label>
                    <Input
                      type="number"
                      min={2}
                      max={10}
                      value={splitWays}
                      className="w-20"
                      onChange={(e) => {
                        const n = Math.min(10, Math.max(2, Number(e.target.value) || 2));
                        setSplitWays(n);
                        setSplitMethods((prev) => {
                          const arr = [...prev];
                          while (arr.length < n) arr.push("CREDIT");
                          return arr.slice(0, n);
                        });
                        setSplitPaidCount(0);
                      }}
                    />
                    <span className="text-sm text-gray-500">ways</span>
                  </div>

                  <div className="space-y-2">
                    {Array.from({ length: splitWays }).map((_, idx) => {
                      const isPaid = idx < splitPaidCount;
                      return (
                        <div key={idx} className={cn("rounded-lg border p-3 space-y-2", isPaid ? "border-green-200 bg-green-50" : "border-gray-200")}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Split {idx + 1} — {formatCurrency(splitAmountVal)}
                            </span>
                            {isPaid && <span className="text-xs text-green-600 font-medium">Paid</span>}
                          </div>
                          {!isPaid && (
                            <>
                              <PaymentMethodPicker
                                value={splitMethods[idx]}
                                onChange={(m) => setSplitMethods((prev) => { const arr = [...prev]; arr[idx] = m; return arr; })}
                              />
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={splitChargingIdx !== null}
                                onClick={() => chargeSplit(idx)}
                              >
                                {splitChargingIdx === idx && <Loader2 className="h-3 w-3 animate-spin" />}
                                Charge Split {idx + 1}
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Normal single payment */
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <PaymentMethodPicker value={recallPayMethod} onChange={setRecallPayMethod} />
                  {recallPayMethod === "CASH" && (
                    <div className="space-y-1.5">
                      <Label>Cash Received</Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={recallCash}
                        onChange={(e) => setRecallCash(e.target.value)} />
                      {recallCash && Number(recallCash) >= recallGrandTotalVal && (
                        <p className="text-sm font-medium text-green-600">
                          Change: {formatCurrency(Number(recallCash) - recallGrandTotalVal)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {recallOrder?.status === "COMPLETED" ? (
              <>
                <Button variant="outline" onClick={reopenCheck}>
                  <Pencil className="h-4 w-4" /> Reopen Check
                </Button>
                <Button variant="destructive" onClick={voidOrder} disabled={voiding}>
                  {voiding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Void Order
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setRecallOpen(false)}>Cancel</Button>
            )}
            {recallOrder?.status !== "COMPLETED" && (
              <>
                <Button
                  variant="outline"
                  className="text-blue-700 border-blue-300 hover:bg-blue-50"
                  onClick={() => {
                    const order = recallOrder!;
                    setRecallOpen(false);
                    setRecallOrder(null);
                    setCart([]);
                    setHoldMode(false);
                    setAddingToOrder(order);
                    setView("order");
                  }}
                >
                  <Plus className="h-4 w-4" /> Add Items
                </Button>
                <Button
                  variant="outline"
                  className="text-green-700 border-green-300 hover:bg-green-50"
                  onClick={compEntireCheck}
                  disabled={compingCheck}
                >
                  {compingCheck ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Comp Check
                </Button>
              </>
            )}
            {!splitEnabled && recallOrder?.status !== "COMPLETED" && (
              <Button onClick={closeCheck} disabled={closing}>
                {closing && <Loader2 className="h-4 w-4 animate-spin" />}
                <CreditCard className="h-4 w-4" /> Charge & Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Customize Dialog (modifier selection) ──────────────────────────── */}
      <Dialog open={customizeOpen} onOpenChange={(o) => { if (!o) setCustomizeOpen(false); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize — {customizeItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {customizeModifiers.map((mod) => (
              <div key={mod.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800">{mod.name}</p>
                  {mod.isRequired && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>}
                  {mod.maxSelect > 1 && <span className="text-[10px] text-gray-400">pick up to {mod.maxSelect}</span>}
                </div>
                <div className="space-y-1.5">
                  {mod.options.map((opt) => {
                    const selected = customizeSelections[mod.id]?.has(opt.id) ?? false;
                    const isRadio = mod.maxSelect === 1;
                    return (
                      <button key={opt.id} type="button" onClick={() => toggleModifierOption(mod, opt.id)}
                        className={cn("w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                          selected ? "border-amber-400 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("h-4 w-4 shrink-0 border-2 flex items-center justify-center",
                            isRadio ? "rounded-full" : "rounded",
                            selected ? "border-amber-500 bg-amber-500" : "border-gray-300"
                          )}>
                            {selected && isRadio && <span className="h-1.5 w-1.5 rounded-full bg-white inline-block" />}
                            {selected && !isRadio && <span className="text-white text-[10px] leading-none">✓</span>}
                          </span>
                          <span>{opt.name}</span>
                        </div>
                        {Number(opt.priceAdj) !== 0 && (
                          <span className={cn("text-xs font-medium", Number(opt.priceAdj) > 0 ? "text-green-600" : "text-red-500")}>
                            {Number(opt.priceAdj) > 0 ? "+" : ""}{formatCurrency(Number(opt.priceAdj))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizeOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmCustomize}
              disabled={customizeModifiers.some((m) => m.isRequired && !(customizeSelections[m.id]?.size > 0))}
            >
              Add to Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Success / Receipt Dialog ───────────────────────────────────────── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {completedOrder ? "Sale Complete" : "Order Sent to Kitchen"}
            </DialogTitle>
          </DialogHeader>

          {!completedOrder ? (
            /* Dine-in sent to kitchen — no receipt */
            <div className="text-center py-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <UtensilsCrossed className="h-6 w-6 text-amber-600" />
              </div>
              <p className="font-semibold text-gray-900">Order sent to the kitchen!</p>
              <p className="text-sm text-gray-400 mt-1">Recall the check from the floor plan when the guest is ready to pay.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                  <span className="text-2xl">✓</span>
                </div>
                <p className="font-bold text-gray-900">{formatCurrency(completedOrder.total)} charged</p>
                {completedOrder.change > 0 && (
                  <p className="text-sm text-green-600 mt-1">Change: {formatCurrency(completedOrder.change)}</p>
                )}
              </div>

              {/* Receipt Preview */}
              <div ref={receiptRef} className="border border-dashed border-gray-300 rounded-lg p-4 font-mono text-xs">
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontWeight: "bold", fontSize: "15px" }}>{receiptName || "RECEIPT"}</p>
                  <p>{new Date().toLocaleString()}</p>
                  {completedOrder.tableNumber && <p>Table {completedOrder.tableNumber}</p>}
                  <p>{completedOrder.type === "TAKEOUT" ? "TAKEOUT" : "DINE IN"}</p>
                </div>
                <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
                {completedOrder.items.map((item) => (
                  <div key={item.menuItemId} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{item.quantity}× {item.name}</span>
                    <span>{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Subtotal</span><span>{formatCurrency(completedOrder.subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Tax</span><span>{formatCurrency(completedOrder.tax)}</span>
                </div>
                {completedOrder.tip > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Tip</span><span>{formatCurrency(completedOrder.tip)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "14px", marginTop: "4px" }}>
                  <span>TOTAL</span><span>{formatCurrency(completedOrder.total)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{completedOrder.payMethod}</span>
                  {completedOrder.change > 0 && <span>Change: {formatCurrency(completedOrder.change)}</span>}
                </div>
                <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
                <p style={{ textAlign: "center", whiteSpace: "pre-line" }}>{receiptFooter || "Thank you!"}</p>
              </div>
            </>
          )}

          <DialogFooter className="flex gap-2">
            {completedOrder && (
              <Button variant="outline" onClick={printReceipt}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            <Button className="flex-1" onClick={() => { setSuccessOpen(false); setCompletedOrder(null); }}>
              {completedOrder ? "New Order" : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Checks Tab ─────────────────────────────────────────────────────────────────

type ChecksSort = "table" | "time" | "amount";

function ChecksTab({
  openOrders,
  tables,
  onRecall,
  onNewOrder,
  loading,
}: {
  openOrders: OpenOrder[];
  tables: TableRow[];
  onRecall: (o: OpenOrder) => void;
  onNewOrder: (t: TableRow) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<ChecksSort>("table");

  const available = tables.filter((t) => t.status === "AVAILABLE");
  const totalRevenue = openOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalCovers = openOrders.reduce((s, o) => s + o.items.filter(i => !i.voided).length, 0);

  const filteredOrders = openOrders.filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return String(o.table?.number ?? "").includes(q) ||
           o.status.toLowerCase().includes(q);
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === "table")  return (a.table?.number ?? 999) - (b.table?.number ?? 999);
    if (sortBy === "time")   return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === "amount") return Number(b.total) - Number(a.total);
    return 0;
  });

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-5">
      {/* Summary bar */}
      {openOrders.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-white rounded-xl border border-gray-200 text-sm">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Receipt className="h-4 w-4" />
            <span className="font-semibold text-gray-900">{openOrders.length}</span> open check{openOrders.length !== 1 ? "s" : ""}
          </div>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="font-semibold text-amber-700">{formatCurrency(totalRevenue)}</span> in play
          </div>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="font-semibold text-gray-900">{totalCovers}</span> items outstanding
          </div>
        </div>
      )}

      {/* Search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by table number or status…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-amber-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
          {(["table", "time", "amount"] as ChecksSort[]).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors",
                sortBy === s ? "bg-amber-500 text-white" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              {s === "table" ? "Table" : s === "time" ? "Oldest" : "Amount"}
            </button>
          ))}
        </div>
      </div>

      {/* Open checks */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Open Checks {search ? `(${sortedOrders.length} of ${openOrders.length})` : `(${openOrders.length})`}
        </h2>
        {sortedOrders.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            {openOrders.length === 0 ? "No open checks" : "No checks match your filter"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sortedOrders.map((o) => {
              const heldCount = o.items.filter((i) => i.heldForFire && !i.voided).length;
              const itemCount = o.items.filter((i) => !i.voided).length;
              const elapsed = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
              const isLong = elapsed > 90;
              const statusColor =
                o.status === "READY" ? "border-green-400 bg-green-50" :
                o.status === "IN_PROGRESS" ? "border-amber-400 bg-amber-50" :
                "border-blue-300 bg-blue-50";
              return (
                <button
                  key={o.id}
                  onClick={() => onRecall(o)}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left flex flex-col gap-1 hover:shadow-md transition-all active:scale-95",
                    statusColor,
                    isLong && "ring-2 ring-red-400 ring-offset-1"
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {o.table ? `T${o.table.number}` : "T/O"}
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      {heldCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                          <Timer className="h-2.5 w-2.5" />{heldCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(Number(o.total))}</span>
                  <span className="text-xs text-gray-500">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                  <span className={cn("text-xs font-medium tabular-nums", isLong ? "text-red-600 font-bold" : "text-gray-400")}>
                    {elapsedLabel(o.createdAt)} ago
                  </span>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide mt-0.5",
                    o.status === "READY" ? "text-green-700" :
                    o.status === "IN_PROGRESS" ? "text-amber-700" :
                    "text-blue-700"
                  )}>
                    {o.status.replace("_", " ")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Available tables — quick start order */}
      {available.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Available Tables ({available.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {available
              .sort((a, b) => a.number - b.number)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => onNewOrder(t)}
                  className="px-4 py-2 rounded-lg bg-white border-2 border-green-300 text-green-800 text-sm font-semibold hover:bg-green-50 transition-colors"
                >
                  Table {t.number} <span className="font-normal text-green-600">({t.capacity}p)</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Floor Plan ─────────────────────────────────────────────────────────────────

function FloorPlanView({
  tables, floorObjects, onSelectTable, selectedTableId, openOrders, onStartOrder, onForceRelease, onMarkAvailable, onFireHeld, firing,
}: {
  tables: TableRow[];
  floorObjects: { id: string; type: string; label: string; x: number; y: number; width: number; height: number; rotation: number; color: string }[];
  onSelectTable: (t: TableRow) => void;
  selectedTableId: string;
  openOrders: OpenOrder[];
  onStartOrder: (t: TableRow) => void;
  onForceRelease: (t: TableRow) => void;
  onMarkAvailable: (t: TableRow) => void;
  onFireHeld: (orderId: string, itemIds: string[]) => void;
  firing: boolean;
}) {
  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const sorted = [...tables].sort((a, b) => a.number - b.number);

  function getOrderForTable(tableId: string): OpenOrder | undefined {
    return openOrders.find((o) => o.tableId === tableId);
  }

  const hasMappedLayout = tables.some((t) => t.floorX !== null);
  const [floorMode, setFloorMode] = useState<"grid" | "map">("grid");
  const mode = hasMappedLayout ? floorMode : "grid";

  // At-a-glance counts for the summary bar.
  const counts = {
    available: tables.filter((t) => t.status === "AVAILABLE").length,
    occupied:  tables.filter((t) => t.status === "OCCUPIED").length,
    reserved:  tables.filter((t) => t.status === "RESERVED").length,
    dirty:     tables.filter((t) => t.status === "DIRTY").length,
  };
  const openTotal = openOrders.reduce((s, o) => s + Number(o.total), 0);
  const heldTables = openOrders.filter((o) => o.items.some((i) => i.heldForFire && !i.voided)).length;

  return (
    <div className="flex-1 overflow-auto p-4 bg-gray-50">
      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { key: "available", label: "Open", value: counts.available, dot: "#8A97A6" },
          { key: "occupied",  label: "Seated", value: counts.occupied, dot: "#1E7A45" },
          { key: "reserved",  label: "Reserved", value: counts.reserved, dot: "#21A090" },
          { key: "dirty",     label: "Bussing", value: counts.dirty, dot: "#D44030" },
        ].map(({ key, label, value, dot }) => (
          <div key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
            <span className="text-base font-bold text-gray-900 tabular-nums">{value}</span>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
          <Receipt className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-base font-bold text-amber-600 tabular-nums">{formatCurrency(openTotal)}</span>
          <span className="text-xs text-gray-500">open</span>
        </div>
        {heldTables > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 shadow-sm">
            <Flame className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-semibold text-orange-700">{heldTables} with held items</span>
          </div>
        )}

        {/* Grid / Map toggle (only when a mapped layout exists) */}
        {hasMappedLayout && (
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
            {(["grid", "map"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setFloorMode(m)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "map" && hasMappedLayout ? (
        <div className="relative bg-white border border-gray-200 rounded-xl shadow-inner w-full" style={{ aspectRatio: "3/2" }}>
          {/* Floor objects (non-interactive backdrop) */}
          {floorObjects.map((o) => (
            <div
              key={o.id}
              style={{
                position: "absolute",
                left: `${o.x}%`,
                top: `${o.y}%`,
                width: `${o.width}%`,
                height: `${o.height}%`,
                transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
                backgroundColor: o.color + "15",
                border: `1px solid ${o.color}40`,
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 0,
              }}
            >
              <span className="text-[10px] font-semibold" style={{ color: o.color + "99" }}>{o.label}</span>
            </div>
          ))}
          {tables.filter((t) => t.floorX !== null).map((t) => {
            const isRect = t.shape !== "round";
            const order = getOrderForTable(t.id);
            // Occupied tables bypass the inner dialog and go straight to recall
            const handleClick = () => t.status === "OCCUPIED" ? onSelectTable(t) : setSelectedTable(t);
            return (
              <button
                key={t.id}
                onClick={handleClick}
                className={cn(
                  "absolute flex flex-col items-center justify-center border-2 shadow-sm hover:scale-105 transition-transform cursor-pointer text-gray-900",
                  isRect ? "rounded-lg" : "rounded-full",
                  t.id === selectedTableId && "ring-2 ring-amber-500 ring-offset-2",
                )}
                style={{
                  left: `${t.floorX}%`,
                  top: `${t.floorY}%`,
                  width: isRect ? "72px" : "60px",
                  height: isRect ? "60px" : "60px",
                  transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
                  ...floorCardStyle(floorVisual(t.status, t.serviceStage)),
                }}
              >
                <span className="text-sm font-bold leading-none">{t.number}</span>
                {order ? (
                  <>
                    <span className="text-[10px] font-semibold text-amber-700">{formatCurrency(Number(order.total))}</span>
                    <span className="text-[9px] text-gray-500 tabular-nums">{elapsedLabel(order.createdAt)}</span>
                    {t.serviceStage && (
                      <span className="text-[8px] font-bold uppercase" style={{ color: floorVisual(t.status, t.serviceStage).hue }}>{STAGE_ABBREV[t.serviceStage] ?? t.serviceStage}</span>
                    )}
                    {order.items.some((i) => i.heldForFire) && (
                      <span className="text-[9px] text-orange-600 font-bold flex items-center gap-0.5">
                        <Timer className="h-2.5 w-2.5" />{order.items.filter((i) => i.heldForFire).length}H
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] opacity-60">{t.capacity}p</span>
                )}
              </button>
            );
          })}
          {/* Unmapped tables at bottom */}
          {tables.filter((t) => t.floorX === null).length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
              {tables.filter((t) => t.floorX === null).map((t) => (
                <button
                  key={t.id}
                  onClick={() => t.status === "OCCUPIED" ? onSelectTable(t) : setSelectedTable(t)}
                  className="px-2 py-0.5 text-xs rounded border font-medium text-gray-900"
                  style={floorCardStyle(floorVisual(t.status, t.serviceStage))}
                >
                  T{t.number}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {sorted.map((t) => {
            const isSelected = t.id === selectedTableId;
            const isOccupied = t.status === "OCCUPIED";
            const order = isOccupied ? getOrderForTable(t.id) : undefined;
            const v = floorVisual(t.status, t.serviceStage);
            const mins = order ? Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000) : 0;
            const heldCount = order ? order.items.filter((i) => i.heldForFire && !i.voided).length : 0;
            const itemCount = order ? order.items.filter((i) => !i.voided).length : 0;
            // Occupied → direct recall; others → detail dialog
            const handleClick = () => isOccupied ? onSelectTable(t) : setSelectedTable(t);
            return (
              <button
                key={t.id}
                onClick={handleClick}
                className={cn(
                  "relative flex min-h-[104px] flex-col rounded-xl border-2 p-3 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98] cursor-pointer",
                  isSelected && "ring-2 ring-amber-500 ring-offset-2",
                )}
                style={floorCardStyle(v)}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl font-bold leading-none text-gray-900">{t.number}</span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.hue }} />
                    {v.label}
                  </span>
                </div>

                {order ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-lg font-bold leading-none text-amber-600">{formatCurrency(Number(order.total))}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", timeChipClass(mins))}>
                        {elapsedLabel(order.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                      {t.serviceStage && (
                        <span className="font-bold uppercase text-gray-600">· {STAGE_ABBREV[t.serviceStage] ?? t.serviceStage}</span>
                      )}
                    </div>
                    {heldCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                        <Flame className="h-2.5 w-2.5" /> {heldCount} held
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Users className="h-3.5 w-3.5" /> {t.capacity}
                    </span>
                    <span className="text-[11px] font-medium text-gray-400">
                      {t.status === "AVAILABLE" ? "Tap to start" : t.status === "RESERVED" ? "Seat party" : "Mark clean"}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Table Detail Dialog */}
      <Dialog open={!!selectedTable} onOpenChange={(o) => { if (!o) setSelectedTable(null); }}>
        <DialogContent className="max-w-sm">
          {selectedTable && (() => {
            const t = selectedTable;
            const order = t.status === "OCCUPIED" ? getOrderForTable(t.id) : undefined;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Table {t.number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Status badge */}
                  <span className={cn(
                    "inline-flex text-xs font-medium px-2.5 py-1 rounded-full",
                    t.status === "AVAILABLE" ? "bg-green-100 text-green-800" :
                    t.status === "OCCUPIED"  ? "bg-red-100 text-red-800" :
                    t.status === "RESERVED"  ? "bg-warning-100 text-warning-800" :
                    "bg-gray-100 text-gray-600"
                  )}>
                    {t.status}
                  </span>

                  {/* Order items if occupied */}
                  {t.status === "OCCUPIED" && order && (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
                        {order.items.map((item) => (
                          <div key={item.id} className={cn("flex items-center justify-between px-3 py-2 text-sm gap-2", item.heldForFire && "bg-warning-50")}>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {item.heldForFire && <Timer className="h-3 w-3 text-warning-600 shrink-0" />}
                              <span className={cn("text-gray-700", item.heldForFire && "text-warning-700")}>
                                {item.quantity}× {item.menuItem.name}
                              </span>
                              {item.heldForFire && (
                                <span className="text-[9px] font-bold uppercase tracking-wide bg-warning-200 text-warning-800 px-1 py-0.5 rounded shrink-0">HELD</span>
                              )}
                            </div>
                            <span className="font-medium text-gray-500 shrink-0">{formatCurrency(Number(item.unitPrice) * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-500">
                          <span>Subtotal</span><span>{formatCurrency(Number(order.subtotal))}</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Tax</span><span>{formatCurrency(Number(order.tax))}</span>
                        </div>
                        <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-100">
                          <span>Total</span><span>{formatCurrency(Number(order.total))}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Service stage chip */}
                  {t.serviceStage && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Stage:</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{t.serviceStage}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 pt-2">
                    {t.status === "AVAILABLE" && (
                      <Button className="w-full" onClick={() => { onStartOrder(t); setSelectedTable(null); }}>
                        Start Order
                      </Button>
                    )}
                    {t.status === "OCCUPIED" && (
                      <>
                        {/* Fire all held items for this table in one tap */}
                        {order && order.items.some((i) => i.heldForFire) && (
                          <Button
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                            disabled={firing}
                            onClick={() => {
                              const heldIds = order.items.filter((i) => i.heldForFire).map((i) => i.id);
                              onFireHeld(order.id, heldIds);
                              setSelectedTable(null);
                            }}
                          >
                            {firing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                            Fire Held Items ({order.items.filter((i) => i.heldForFire).length})
                          </Button>
                        )}
                        <Button className="w-full" onClick={() => { onSelectTable(t); setSelectedTable(null); }}>
                          <CreditCard className="h-4 w-4" /> Close Check
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => { onMarkAvailable(t); setSelectedTable(null); }}>
                          ✓ Mark Table Clean
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full text-red-600 border-red-200 hover:bg-red-50 text-xs"
                          onClick={() => { onForceRelease(t); setSelectedTable(null); }}
                        >
                          Clear Table (cancels open order)
                        </Button>
                      </>
                    )}
                    {t.status === "RESERVED" && (
                      <>
                        <Button className="w-full" onClick={() => { onStartOrder(t); setSelectedTable(null); }}>
                          Seat Party
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => { onMarkAvailable(t); setSelectedTable(null); }}>
                          Mark Available
                        </Button>
                      </>
                    )}
                    {t.status === "DIRTY" && (
                      <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => { onMarkAvailable(t); setSelectedTable(null); }}>
                        ✓ Mark Table Clean
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
