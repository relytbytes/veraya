import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  FlatList, Modal, RefreshControl, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTables, getMenuItems, getCategories,
  getOpenOrders, createOrder, patchOrder, patchTable, barcodeSearch,
  getWaitlist, createWaitlistEntry, patchWaitlistEntry,
  getReservations, createReservation, patchReservation,
  getStaff, searchCustomers, createCustomer, getLoyalty, loyaltyAction,
  getModifiers, combineTables, splitTables,
} from "@/lib/api";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import type { Table, Order, WaitlistEntry, Reservation, StaffMember, Customer, MenuItem, Modifier } from "@/lib/api";
import { useCartStore } from "@/store/cart";
import { Scanner } from "@/components/Scanner";
import { TableCanvas } from "@/components/TableCanvas";
import { HostStandMode } from "@/components/HostStandMode";
import { SwipeSheet } from "@/components/SwipeSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";

const DEFAULT_CANVAS_H = 500;
const DEFAULT_TABLE_SIZE = 88;

function elapsedMins(seatedAt: string) {
  return Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
}
function elapsedLabel(seatedAt: string, _tick: number) {
  const m = elapsedMins(seatedAt);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function timerColor(seatedAt: string, _tick: number, amberAt = 60, redAt = 90) {
  const m = elapsedMins(seatedAt);
  return m < amberAt ? C.jade : m < redAt ? C.ember : C.coral;
}

// Floor status → mobile palette (mirrors the web FLOOR_STATUS semantics).
// Aligned to the web floor plan: open = gray, seated = jade, reserved = teal, dirty = coral.
const FLOOR_STATUS_M: Record<string, { color: string; bg: string; label: string }> = {
  AVAILABLE: { color: C.smoke, bg: "rgba(138,151,166,0.08)", label: "Open" },
  OCCUPIED:  { color: C.jade,  bg: "rgba(30,122,69,0.07)",   label: "Seated" },
  RESERVED:  { color: C.gold,  bg: "rgba(33,160,144,0.08)",  label: "Reserved" },
  DIRTY:     { color: C.coral, bg: "rgba(212,64,48,0.06)",   label: "Bussing" },
};

const TIP_OPTIONS = [
  { label: "No Tip", value: 0 },
  { label: "18%",    value: 18 },
  { label: "20%",    value: 20 },
  { label: "22%",    value: 22 },
];

// Service-stage colors — must match the web floor plan / host stand exactly.
const SERVICE_STAGES: { key: string; abbrev: string; label: string; color: string; bg: string }[] = [
  { key: "SEATED",        abbrev: "STD", label: "Seated",  color: "#1E7A45", bg: "#1E7A451A" },
  { key: "APPS",          abbrev: "APP", label: "Apps",    color: "#2BB39B", bg: "#2BB39B1A" },
  { key: "ENTREES",       abbrev: "ENT", label: "Entrées", color: "#E0A82E", bg: "#E0A82E1A" },
  { key: "DESSERT",       abbrev: "DST", label: "Dessert", color: "#7C5CBF", bg: "#7C5CBF1A" },
  { key: "CHECK_DROPPED", abbrev: "CHK", label: "Check",   color: "#2E6EB0", bg: "#2E6EB01A" },
  { key: "CHECK_PAID",    abbrev: "PD",  label: "Paid",    color: "#2E6EB0", bg: "#2E6EB01A" },
  { key: "BUSSING",       abbrev: "BUS", label: "Bussing", color: "#D44030", bg: "#D440301A" },
];

// ─── Client-side stage inference (mirrors lib/stage-inference.ts) ────────────
// Used for immediate display from open-orders data before the next table poll.
const STARTER_RE  = /app|starter|small\s*plate|snack|soup|salad|share|tapa|antipa|amuse|bread|charcuter/i;
const ENTREE_RE   = /entree|main|burger|pasta|steak|seafood|sandwich|pizza|meat|poultry|chicken|fish|pork|beef|lamb|ribs|chop|grill|roast|noodle|risotto|curry|bbq/i;
const DESSERT_RE  = /dessert|sweet|cake|ice.?cream|gelato|sorbet|pudding|tart|pie|cookie|brownie|fondue/i;
const STAGE_ORDER_KEYS = ["SEATED","APPS","ENTREES","DESSERT","CHECK_DROPPED","CHECK_PAID","BUSSING"] as const;

function inferStageFromOrder(order: import("@/lib/api").Order | undefined): string | null {
  if (!order) return null;
  if (order.payments.length > 0) return "CHECK_PAID";
  const fired = order.items.filter(i => !i.voided && !i.heldForFire);
  if (fired.length === 0) return null;
  let hasDesset = false, hasEntree = false, hasStarter = false;
  for (const item of fired) {
    const cat = item.menuItem?.category?.name ?? "";
    if (DESSERT_RE.test(cat)) { hasDesset = true; break; }
    if (ENTREE_RE.test(cat))  hasEntree  = true;
    if (STARTER_RE.test(cat)) hasStarter = true;
  }
  if (hasDesset)  return "DESSERT";
  if (hasEntree)  return "ENTREES";
  if (hasStarter) return "APPS";
  return "APPS"; // drinks / unknowns → at minimum APPS
}

/** Return the more-advanced of the stored stage and the live inferred stage. */
function effectiveStage(table: Table, order: import("@/lib/api").Order | undefined): string | null {
  const stored   = table.serviceStage;
  const inferred = inferStageFromOrder(order);
  if (!stored && !inferred) return null;
  if (!stored) return inferred;
  if (!inferred) return stored;
  const si = STAGE_ORDER_KEYS.indexOf(stored as typeof STAGE_ORDER_KEYS[number]);
  const ii = STAGE_ORDER_KEYS.indexOf(inferred as typeof STAGE_ORDER_KEYS[number]);
  return ii > si ? inferred : stored;
}

function estimateWait(position: number, partySize: number, tables: Table[], avgTurnMins = 45): number {
  const fitting = tables.filter((t) => t.capacity >= partySize).length;
  if (fitting === 0) return position * avgTurnMins;
  const turnsNeeded = Math.ceil(position / Math.max(1, fitting));
  return turnsNeeded * avgTurnMins;
}

export default function POSScreen() {
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [screen, setScreen] = useState<"floor" | "order" | "close">("floor");
  const [floorView, setFloorView] = useState<"grid" | "map">("grid");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [closing, setClosing] = useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "error" | "success" | "info" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Modifier modal ─────────────────────────────────────────────────────────
  const [modifierModal, setModifierModal] = useState<{
    item: MenuItem; modifiers: Modifier[]; selections: Record<string, string[]>;
  } | null>(null);
  const [modifierLoading, setModifierLoading] = useState(false);

  // Payment & tip state for close check
  const [payMethod, setPayMethod] = useState<"CREDIT" | "CASH">("CREDIT");
  const [tipPct, setTipPct] = useState(0);

  // Checkout customer lookup + loyalty redemption
  const [checkCustomer, setCheckCustomer] = useState<Customer | null>(null);
  const [checkCustomerQuery, setCheckCustomerQuery] = useState("");
  const [checkCustomerMatches, setCheckCustomerMatches] = useState<Customer[]>([]);
  const [checkRedeemPts, setCheckRedeemPts] = useState(0);
  const checkSearchTimer = useCallback(
    (() => {
      let t: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(t);
        setCheckCustomer(null);
        setCheckRedeemPts(0);
        if (!val.trim()) { setCheckCustomerMatches([]); return; }
        t = setTimeout(async () => {
          const hits = await searchCustomers(val.trim());
          setCheckCustomerMatches(hits.slice(0, 4));
        }, 350);
      };
    })(),
    []
  );

  const { items: cart, tableId, addItem, updateQty, toggleHeld, clear, setTable, setOrderType, orderType } = useCartStore();

  const { data: checkLoyalty } = useQuery({
    queryKey: ["loyalty", checkCustomer?.id],
    queryFn: () => getLoyalty(checkCustomer!.id),
    enabled: !!checkCustomer,
  });

  const { data: tables = [], refetch: refetchTables } = useQuery({
    queryKey: ["tables"], queryFn: getTables, refetchInterval: 120_000, // fallback; SSE drives live updates
  });
  const { refreshing, run } = useManualRefresh();
  const { data: openOrders = [] } = useQuery({
    queryKey: ["openOrders"], queryFn: getOpenOrders, refetchInterval: 120_000, // fallback; SSE drives live updates
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"], queryFn: getCategories,
  });
  const { data: menuItems = [] } = useQuery({
    queryKey: ["menuItems"], queryFn: () => getMenuItems(),
  });

  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
  const { data: waitlist = [] } = useQuery({
    queryKey: ["waitlist"], queryFn: getWaitlist, refetchInterval: 120_000,
  });
  const { data: todayReservations = [] } = useQuery({
    queryKey: ["reservations", today], queryFn: () => getReservations(today), refetchInterval: 120_000,
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff"], queryFn: getStaff,
  });

  // Host view state
  const [sidebarTab, setSidebarTab] = useState<"waitlist" | "reservations" | "timeline">("waitlist");
  const [tick, setTick] = useState(0);
  const [seatModal, setSeatModal] = useState<Table | null>(null);
  const [tableInfoModal, setTableInfoModal] = useState<Table | null>(null);
  const [addWaitlistVisible, setAddWaitlistVisible] = useState(false);
  const [addReservationVisible, setAddReservationVisible] = useState(false);
  const [pickTableFor, setPickTableFor] = useState<{ entry?: WaitlistEntry; reservation?: Reservation } | null>(null);
  const [seating, setSeating] = useState(false);

  // Host Stand Mode
  const [hostStandVisible, setHostStandVisible] = useState(false);
  // Disable scroll while dragging tables on the canvas
  const [canvasEditing, setCanvasEditing] = useState(false);

  // Floor plan customization
  const [showCustomize, setShowCustomize] = useState(false);
  const [canvasHSetting, setCanvasHSetting] = useState<350 | 500 | 700>(DEFAULT_CANVAS_H as 350 | 500 | 700);
  const [tableSizeSetting, setTableSizeSetting] = useState<72 | 88 | 104>(DEFAULT_TABLE_SIZE as 72 | 88 | 104);
  const [amberAt, setAmberAt] = useState(60);
  const [redAt, setRedAt] = useState(90);
  const [showServerBadge, setShowServerBadge] = useState(true);
  const [showOrderTotal, setShowOrderTotal] = useState(true);
  const [showGuestLabel, setShowGuestLabel] = useState(true);


  // Seat party form (walk-in)
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInParty, setWalkInParty] = useState("2");
  const [walkInServerId, setWalkInServerId] = useState("");
  const [combineSel, setCombineSel] = useState<string[]>([]);
  const [combining, setCombining] = useState(false);

  async function doCombine(primary: Table) {
    if (combineSel.length === 0) return;
    setCombining(true);
    try {
      await combineTables(primary.id, combineSel);
      await refetchTables();
      setCombineSel([]);
      qc.invalidateQueries({ queryKey: ["tables"] });
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Could not combine"); }
    finally { setCombining(false); }
  }
  async function doSplit(primaryId: string) {
    setCombining(true);
    try {
      await splitTables(primaryId);
      await refetchTables();
      qc.invalidateQueries({ queryKey: ["tables"] });
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Could not split"); }
    finally { setCombining(false); }
  }

  // Add waitlist form
  const [wlName, setWlName] = useState("");
  const [wlPhone, setWlPhone] = useState("");
  const [wlParty, setWlParty] = useState("2");
  const [wlSaving, setWlSaving] = useState(false);
  const [wlCustomer, setWlCustomer] = useState<Customer | null>(null);
  const [wlMatches, setWlMatches] = useState<Customer[]>([]);

  // Add reservation form
  const [resName, setResName] = useState("");
  const [resPhone, setResPhone] = useState("");
  const [resTime, setResTime] = useState("");
  const [resParty, setResParty] = useState("2");
  const [resNotes, setResNotes] = useState("");
  const [resSaving, setResSaving] = useState(false);
  const [resCustomer, setResCustomer] = useState<Customer | null>(null);
  const [resMatches, setResMatches] = useState<Customer[]>([]);

  // Turn timer tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Customer phone lookup — debounced, fires after 400 ms of no typing
  const wlPhoneTimer = useCallback(
    (() => {
      let t: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(t);
        setWlCustomer(null);
        if (val.replace(/\D/g, "").length >= 7) {
          t = setTimeout(async () => {
            const hits = await searchCustomers(val.replace(/\D/g, ""));
            setWlMatches(hits.slice(0, 3));
          }, 400);
        } else {
          setWlMatches([]);
        }
      };
    })(),
    []
  );

  const resPhoneTimer = useCallback(
    (() => {
      let t: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(t);
        setResCustomer(null);
        if (val.replace(/\D/g, "").length >= 7) {
          t = setTimeout(async () => {
            const hits = await searchCustomers(val.replace(/\D/g, ""));
            setResMatches(hits.slice(0, 3));
          }, 400);
        } else {
          setResMatches([]);
        }
      };
    })(),
    []
  );

  function applyCustomerToWl(c: Customer) {
    setWlCustomer(c);
    setWlName(c.name);
    setWlPhone(c.phone ?? wlPhone);
    setWlMatches([]);
  }

  function applyCustomerToRes(c: Customer) {
    setResCustomer(c);
    setResName(c.name);
    setResPhone(c.phone ?? resPhone);
    setResMatches([]);
  }

  const sendMutation = useMutation({
    mutationFn: (body: Parameters<typeof createOrder>[0]) => createOrder(body),
    onSuccess: () => {
      clear();
      setScreen("floor");
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["openOrders"] });
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // The table currently assigned to the in-progress order
  const activeTable = tables.find((t) => t.id === tableId);

  // Fast-path close: existing open order for the current table in the order builder
  const tableOrder = openOrders.find((o) => o.tableId === tableId);

  function openCloseScreen(order: Order) {
    setActiveOrder(order);
    setPayMethod("CREDIT");
    setTipPct(0);
    setCheckCustomer(null);
    setCheckCustomerQuery("");
    setCheckCustomerMatches([]);
    setCheckRedeemPts(0);
    setScreen("close");
  }

  function openTable(t: Table) {
    if (t.status === "DIRTY") {
      Alert.alert(
        `Table ${t.number} — Dirty`,
        "Mark this table as clean and available?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark Clean",
            onPress: async () => {
              try {
                await patchTable(t.id, { status: "AVAILABLE" });
                qc.invalidateQueries({ queryKey: ["tables"] });
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Failed");
              }
            },
          },
        ]
      );
      return;
    }
    if (t.status === "OCCUPIED") {
      if (isTablet) { setTableInfoModal(t); return; }
      const order = openOrders.find((o) => o.tableId === t.id);
      if (order) { openCloseScreen(order); return; }
      // Seated (e.g. from the host stand) but no order yet → start a fresh check.
      setTable(t.id);
      setOrderType("DINE_IN");
      setScreen("order");
      return;
    }
    // AVAILABLE or RESERVED
    if (isTablet) {
      setSeatModal(t);
      setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId("");
      return;
    }
    setTable(t.id);
    setOrderType("DINE_IN");
    setScreen("order");
  }

  async function seatParty(table: Table, opts: {
    guestName: string; partySize: number; serverId?: string; phone?: string;
    fromWaitlist?: WaitlistEntry; fromReservation?: Reservation;
  }) {
    if (!opts.guestName.trim() || !opts.partySize) {
      Alert.alert("Required", "Please enter a guest name and party size.");
      return;
    }
    setSeating(true);
    try {
      // Auto-create customer record when seating a walk-in with a phone number
      if (opts.phone?.trim() && !opts.fromWaitlist && !opts.fromReservation) {
        try {
          await createCustomer({ name: opts.guestName.trim(), phone: opts.phone.trim() });
        } catch { /* customer may already exist — that's fine */ }
      }
      await patchTable(table.id, {
        status: "OCCUPIED",
        guestName: opts.guestName.trim(),
        partySize: opts.partySize,
        serverId: opts.serverId || null,
        seatedAt: new Date().toISOString(),
      });
      if (opts.fromWaitlist) {
        await patchWaitlistEntry(opts.fromWaitlist.id, { status: "SEATED", tableId: table.id });
      }
      if (opts.fromReservation) {
        await patchReservation(opts.fromReservation.id, { status: "SEATED", tableId: table.id });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tables"] }),
        qc.invalidateQueries({ queryKey: ["waitlist"] }),
        qc.invalidateQueries({ queryKey: ["reservations", today] }),
      ]);
      setSeatModal(null);
      setPickTableFor(null);
      setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to seat party");
    } finally {
      setSeating(false);
    }
  }

  async function addToWaitlist() {
    if (!wlName.trim() || !wlParty) { Alert.alert("Required", "Name and party size required."); return; }
    setWlSaving(true);
    try {
      let customerId = wlCustomer?.id;
      // Auto-create customer record if phone provided and no match found
      if (!customerId && wlPhone.trim()) {
        try {
          const c = await createCustomer({ name: wlName.trim(), phone: wlPhone.trim() });
          customerId = c.id;
        } catch { /* phone already exists — that's fine */ }
      }
      await createWaitlistEntry({
        name: wlName.trim(), partySize: parseInt(wlParty, 10),
        phone: wlPhone.trim() || undefined, customerId,
      });
      await qc.invalidateQueries({ queryKey: ["waitlist"] });
      setAddWaitlistVisible(false);
      setWlName(""); setWlPhone(""); setWlParty("2"); setWlCustomer(null); setWlMatches([]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setWlSaving(false);
    }
  }

  async function addReservation() {
    if (!resName.trim() || !resTime.trim() || !resParty) {
      Alert.alert("Required", "Name, time (HH:MM), and party size required.");
      return;
    }
    setResSaving(true);
    try {
      let customerId = resCustomer?.id;
      if (!customerId && resPhone.trim()) {
        try {
          const c = await createCustomer({ name: resName.trim(), phone: resPhone.trim() });
          customerId = c.id;
        } catch { /* phone already exists — that's fine */ }
      }
      await createReservation({
        date: today, time: resTime.trim(), partySize: parseInt(resParty, 10),
        name: resName.trim(), phone: resPhone.trim() || undefined,
        notes: resNotes.trim() || undefined, customerId,
      });
      await qc.invalidateQueries({ queryKey: ["reservations", today] });
      setAddReservationVisible(false);
      setResName(""); setResPhone(""); setResTime(""); setResParty("2"); setResNotes("");
      setResCustomer(null); setResMatches([]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setResSaving(false);
    }
  }

  function startTakeout() {
    setTable(null);
    setOrderType("TAKEOUT");
    setScreen("order");
  }

  async function handleScan(barcode: string) {
    setScannerOpen(false);
    try {
      const result = await barcodeSearch(barcode);
      // The lookup resolves a product/ingredient name; match it to the menu.
      const productName = result.local?.name ?? result.external?.name ?? null;
      const needle = productName?.toLowerCase();
      const match = needle
        ? menuItems.find((m) => m.name.toLowerCase() === needle)
          ?? menuItems.find((m) => m.name.toLowerCase().includes(needle))
        : null;
      if (match) {
        addItem({ menuItemId: match.id, name: match.name, price: Number(match.price) });
      } else if (productName) {
        Alert.alert("No menu match", `Scanned "${productName}" but no menu item matches it.`);
      } else {
        Alert.alert("Not found", `No product matched barcode ${barcode}.`);
      }
    } catch {
      Alert.alert("Error", "Could not look up barcode.");
    }
  }

  function sendOrder() {
    if (cart.length === 0) return;
    sendMutation.mutate({
      tableId: tableId || null,
      type: orderType,
      items: cart.map((c) => ({
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        unitPrice: c.price,
        held: c.held ?? false,
        notes: c.notes,
        modifierIds: c.modifierOptionIds,
      })),
    });
  }

  async function closeCheck() {
    if (!activeOrder) return;
    const ord = openOrders.find((o) => o.id === activeOrder.id) ?? activeOrder;
    setClosing(true);
    try {
      const tipAmt = Math.round(Number(ord.subtotal) * tipPct) / 100;
      const redeemDiscount = checkRedeemPts > 0 ? checkRedeemPts / 100 : 0; // 100 pts = $1
      const chargeAmount = Math.max(0, Number(ord.total) + tipAmt - redeemDiscount);
      await patchOrder(ord.id, {
        status: "COMPLETED",
        payment: {
          amount: chargeAmount,
          method: payMethod,
          tip: tipAmt,
        },
      });
      // Award loyalty points (1 pt per $1 of subtotal, rounded) and handle redemption
      if (checkCustomer) {
        const earnPts = Math.round(Number(ord.subtotal));
        try {
          if (checkRedeemPts > 0) {
            await loyaltyAction({ customerId: checkCustomer.id, type: "redeem", points: checkRedeemPts });
          }
          if (earnPts > 0) {
            await loyaltyAction({ customerId: checkCustomer.id, type: "award", points: earnPts });
          }
          qc.invalidateQueries({ queryKey: ["loyalty", checkCustomer.id] });
        } catch {
          // Non-fatal — don't block check close on loyalty failure
        }
      }
      setScreen("floor");
      setActiveOrder(null);
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["openOrders"] });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to close check", "error");
    } finally {
      setClosing(false);
    }
  }



  // ── Toast helper ────────────────────────────────────────────────────────────
  function showToast(text: string, type: "error" | "success" | "info" = "info") {
    clearTimeout(toastTimer.current);
    setToastMsg({ text, type });
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }

  // ── Modifier flow ────────────────────────────────────────────────────────────
  async function handleMenuItemPress(m: MenuItem) {
    if (m.trackCount && m.countRemaining !== null && m.countRemaining <= 0) return;
    setModifierLoading(true);
    try {
      const mods = await getModifiers(m.id);
      if (mods.length === 0) {
        addItem({ menuItemId: m.id, name: m.name, price: Number(m.price), cartKey: m.id });
      } else {
        setModifierModal({ item: m, modifiers: mods, selections: {} });
      }
    } catch {
      // On fetch error, add without modifiers
      addItem({ menuItemId: m.id, name: m.name, price: Number(m.price), cartKey: m.id });
    } finally {
      setModifierLoading(false);
    }
  }

  function toggleModifierOption(modId: string, optId: string, maxSelect: number) {
    if (!modifierModal) return;
    const current = modifierModal.selections[modId] ?? [];
    let next: string[];
    if (current.includes(optId)) {
      next = current.filter((id) => id !== optId);
    } else if (maxSelect === 1) {
      next = [optId]; // radio
    } else if (current.length < maxSelect) {
      next = [...current, optId];
    } else {
      next = current; // at max
    }
    setModifierModal({ ...modifierModal, selections: { ...modifierModal.selections, [modId]: next } });
  }

  function confirmModifiers() {
    if (!modifierModal) return;
    const { item, modifiers, selections } = modifierModal;
    for (const mod of modifiers) {
      if (mod.isRequired && (!selections[mod.id] || selections[mod.id].length === 0)) {
        showToast(`${mod.name} is required`, "error");
        return;
      }
    }
    const notesParts: string[] = [];
    const optionIds: string[] = [];
    let extraPrice = 0;
    const cartKeyParts = [item.id];
    for (const mod of modifiers) {
      for (const optId of (selections[mod.id] ?? [])) {
        const opt = mod.options.find((o) => o.id === optId);
        if (opt) {
          notesParts.push(opt.name);
          optionIds.push(opt.id);
          extraPrice += Number(opt.priceAdj);
          cartKeyParts.push(optId);
        }
      }
    }
    addItem({
      menuItemId: item.id,
      name: item.name,
      price: Number(item.price) + extraPrice,
      notes: notesParts.length > 0 ? notesParts.join(", ") : undefined,
      modifierOptionIds: optionIds.length > 0 ? optionIds : undefined,
      cartKey: cartKeyParts.join("::"),
    });
    setModifierModal(null);
  }

  const availableTables = tables.filter((t) => t.status === "AVAILABLE" || t.status === "RESERVED");
  const waitingList = waitlist.filter((w) => w.status === "WAITING");
  const servers = staff.filter((s) => s.isActive && (s.role === "SERVER" || s.role === "MANAGER" || s.role === "ADMIN"));

  const visible = menuItems.filter((m) => {
    const catOk = activeCategory === "all" || m.categoryId === activeCategory;
    const searchOk = !searchText || m.name.toLowerCase().includes(searchText.toLowerCase());
    return catOk && searchOk;
  });

  // ── Toast overlay (rendered in all screens via portal-like element) ──────────
  const toastOverlay = toastMsg ? (
    <View style={{
      position: "absolute", bottom: 24, left: 16, right: 16, zIndex: 999,
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: toastMsg.type === "error" ? "#3b0a0a" : toastMsg.type === "success" ? "#052612" : "#0d1f36",
      borderWidth: 1, borderColor: toastMsg.type === "error" ? C.coral : toastMsg.type === "success" ? C.jade : C.sky,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
      ...shadow.sm,
    }}>
      <Ionicons
        name={toastMsg.type === "error" ? "alert-circle" : toastMsg.type === "success" ? "checkmark-circle" : "information-circle"}
        size={18}
        color={toastMsg.type === "error" ? C.coral : toastMsg.type === "success" ? C.jade : C.sky}
      />
      <Text style={{ flex: 1, fontSize: 14, color: C.pearl }}>{toastMsg.text}</Text>
      <TouchableOpacity onPress={() => setToastMsg(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={C.mist} />
      </TouchableOpacity>
    </View>
  ) : null;

  // ── Modifier modal (shared across order builder) ──────────────────────────
  const modifierModalEl = modifierModal ? (
    <Modal transparent animationType="slide" onRequestClose={() => setModifierModal(null)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <SwipeSheet onClose={() => setModifierModal(null)} style={{ paddingHorizontal: 20, paddingTop: 4, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>{modifierModal.item.name}</Text>
                <Text style={{ fontSize: 13, color: C.gold, fontWeight: "600", marginTop: 2 }}>${Number(modifierModal.item.price).toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModifierModal(null)}
                style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 20, paddingTop: 16, paddingBottom: 8 }}>
              {modifierModal.modifiers.map((mod) => {
                const selected = modifierModal.selections[mod.id] ?? [];
                return (
                  <View key={mod.id} style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{mod.name}</Text>
                      {mod.isRequired && (
                        <View style={{ backgroundColor: T.coral, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: C.coral }}>Required</Text>
                        </View>
                      )}
                      {!mod.isRequired && (
                        <Text style={{ fontSize: 11, color: C.smoke }}>Optional</Text>
                      )}
                      {mod.maxSelect > 1 && (
                        <Text style={{ fontSize: 11, color: C.smoke }}>up to {mod.maxSelect}</Text>
                      )}
                    </View>
                    <View style={{ gap: 8 }}>
                      {mod.options.map((opt) => {
                        const isSelected = selected.includes(opt.id);
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => toggleModifierOption(mod.id, opt.id, mod.maxSelect)}
                            style={{
                              flexDirection: "row", alignItems: "center", gap: 12,
                              backgroundColor: isSelected ? (mod.maxSelect === 1 ? T.jade : T.sky) : C.surfaceHi,
                              borderWidth: 1,
                              borderColor: isSelected ? (mod.maxSelect === 1 ? C.jade : C.sky) : C.rim,
                              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                            }}
                          >
                            <View style={{
                              width: 20, height: 20,
                              borderRadius: mod.maxSelect === 1 ? 10 : 4,
                              borderWidth: 2,
                              borderColor: isSelected ? (mod.maxSelect === 1 ? C.jade : C.sky) : C.smoke,
                              backgroundColor: isSelected ? (mod.maxSelect === 1 ? C.jade : C.sky) : "transparent",
                              alignItems: "center", justifyContent: "center",
                            }}>
                              {isSelected && <Ionicons name="checkmark" size={12} color={C.void} />}
                            </View>
                            <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.pearl }}>{opt.name}</Text>
                            {Number(opt.priceAdj) > 0 && (
                              <Text style={{ fontSize: 13, fontWeight: "600", color: C.gold }}>+${Number(opt.priceAdj).toFixed(2)}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={confirmModifiers}
              style={{ marginTop: 16, paddingVertical: 16, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: C.gold, ...shadow.gold }}
            >
              <Ionicons name="add-circle-outline" size={18} color={C.void} />
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Add to Order</Text>
            </TouchableOpacity>
          </SwipeSheet>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  ) : null;

  // ══════════════════════════════════════════════════════════════════════════════
  // FLOOR PLAN
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen === "floor") {
    // ── Tablet: full host view ─────────────────────────────────────────────────
    if (isTablet) {
      return (
        <SafeAreaView style={{ flex: 1, flexDirection: "row", backgroundColor: C.void }}>
          {modifierModalEl}
          {toastOverlay}

          {/* ── Seat Party Modal ─────────────────────────────────────────── */}
          {seatModal && (
            <Modal transparent animationType="slide" onRequestClose={() => { setSeatModal(null); setCombineSel([]); }}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
                <SwipeSheet onClose={() => { setSeatModal(null); setCombineSel([]); }} style={{ paddingHorizontal: 20, paddingTop: 4, maxHeight: "85%" }}>
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Seat Table {seatModal.number}</Text>
                      <Text style={{ fontSize: 13, color: C.mist }}>{seatModal.capacity} seat capacity</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setSeatModal(null); setCombineSel([]); }}
                      style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Combine tables for a large party */}
                    {(() => {
                      const members = tables.filter((t) => t.primaryTableId === seatModal.id);
                      const combinable = tables.filter((t) => t.status === "AVAILABLE" && t.id !== seatModal.id && !t.primaryTableId);
                      if (members.length > 0) {
                        const totalCap = seatModal.capacity + members.reduce((s, m) => s + m.capacity, 0);
                        return (
                          <View style={{ marginBottom: 16, borderWidth: 1, borderColor: `${C.gold}55`, borderRadius: 12, padding: 12, backgroundColor: `${C.gold}0F` }}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: C.pearl }}>Combined with {members.map((m) => `T${m.number}`).join(", ")}</Text>
                            <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }}>Seats up to {totalCap} as one party.</Text>
                            <TouchableOpacity onPress={() => doSplit(seatModal.id)} disabled={combining} style={{ marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: C.coral }}>
                              <Text style={{ fontSize: 12, fontWeight: "600", color: C.coral }}>{combining ? "…" : "Split tables"}</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }
                      if (combinable.length === 0) return null;
                      const selCap = combineSel.reduce((s, id) => s + (tables.find((t) => t.id === id)?.capacity ?? 0), 0);
                      return (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Combine for a large party</Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                            {combinable.sort((a, b) => a.number - b.number).map((t) => {
                              const sel = combineSel.includes(t.id);
                              return (
                                <TouchableOpacity key={t.id} onPress={() => setCombineSel((p) => sel ? p.filter((x) => x !== t.id) : [...p, t.id])} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, backgroundColor: sel ? `${C.gold}1A` : C.surfaceHi, borderColor: sel ? C.gold : C.rim }}>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: sel ? C.gold : C.mist }}>T{t.number} · {t.capacity}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {combineSel.length > 0 && (
                            <TouchableOpacity onPress={() => doCombine(seatModal)} disabled={combining} style={{ marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: C.gold, opacity: combining ? 0.6 : 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: C.void }}>{combining ? "Combining…" : `Combine — seats ${seatModal.capacity + selCap}`}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })()}

                    {/* Waitlist section */}
                    {waitingList.length > 0 && (
                      <View className="mb-4">
                        <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>From Waitlist</Text>
                        <View className="gap-2">
                          {waitingList.slice(0, 4).map((entry) => (
                            <TouchableOpacity
                              key={entry.id}
                              onPress={() => seatParty(seatModal, { guestName: entry.name, partySize: entry.partySize, fromWaitlist: entry })}
                              disabled={seating}
                              style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rimBright, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                            >
                              <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: T.sky, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ color: C.sky, fontWeight: "700", fontSize: 14 }}>{entry.name.charAt(0).toUpperCase()}</Text>
                              </View>
                              <View className="flex-1">
                                <Text style={{ fontWeight: "600", color: C.pearl }}>{entry.name}</Text>
                                <Text style={{ fontSize: 12, color: C.mist }}>{entry.partySize} guests · waiting {elapsedLabel(entry.addedAt, tick)}</Text>
                              </View>
                              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 14 }}>Seat</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                    {/* Reservations section */}
                    {todayReservations.filter(r => r.status === "PENDING" || r.status === "CONFIRMED").length > 0 && (
                      <View className="mb-4">
                        <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>From Reservations</Text>
                        <View className="gap-2">
                          {todayReservations.filter(r => r.status === "PENDING" || r.status === "CONFIRMED").slice(0, 3).map((res) => (
                            <TouchableOpacity
                              key={res.id}
                              onPress={() => seatParty(seatModal, { guestName: res.name, partySize: res.partySize, fromReservation: res })}
                              disabled={seating}
                              style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rimBright, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                            >
                              <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: T.gold, alignItems: "center", justifyContent: "center" }}>
                                <Ionicons name="calendar-outline" size={16} color={C.gold} />
                              </View>
                              <View className="flex-1">
                                <Text style={{ fontWeight: "600", color: C.pearl }}>{res.name}</Text>
                                <Text style={{ fontSize: 12, color: C.mist }}>{res.partySize} guests · {res.time}</Text>
                              </View>
                              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 14 }}>Seat</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                    {/* Walk-in form */}
                    <View>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Walk-in</Text>
                      <View className="gap-3">
                        <TextInput
                          style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                          placeholder="Guest name"
                          placeholderTextColor={C.smoke}
                          autoCapitalize="words"
                          autoComplete="name"
                          value={walkInName}
                          onChangeText={setWalkInName}
                        />
                        <TextInput
                          style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                          placeholder="Phone"
                          placeholderTextColor={C.smoke}
                          keyboardType="phone-pad"
                          autoComplete="tel"
                          value={walkInPhone}
                          onChangeText={setWalkInPhone}
                        />
                        <View className="flex-row gap-3">
                          <View className="flex-1">
                            <Text style={{ fontSize: 11, color: C.mist, marginBottom: 6 }}>Party size</Text>
                            <View className="flex-row gap-1.5">
                              {["1","2","3","4","5","6","8"].map((n) => (
                                <TouchableOpacity
                                  key={n}
                                  onPress={() => setWalkInParty(n)}
                                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: walkInParty === n ? C.gold : C.surfaceHi }}
                                >
                                  <Text style={{ fontWeight: "700", fontSize: 13, color: walkInParty === n ? C.void : C.mist }}>{n}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        </View>
                        {servers.length > 0 && (
                          <View>
                            <Text style={{ fontSize: 11, color: C.mist, marginBottom: 6 }}>Assign server (optional)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <View className="flex-row gap-2">
                                {servers.map((s) => (
                                  <TouchableOpacity
                                    key={s.id}
                                    onPress={() => setWalkInServerId(walkInServerId === s.id ? "" : s.id)}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: walkInServerId === s.id ? C.gold : C.surfaceHi }}
                                  >
                                    <Text style={{ fontWeight: "600", fontSize: 13, color: walkInServerId === s.id ? C.void : C.mist }}>{s.name.split(" ")[0]}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => seatParty(seatModal, { guestName: walkInName, phone: walkInPhone, partySize: parseInt(walkInParty, 10) || 2, serverId: walkInServerId || undefined })}
                          disabled={seating || !walkInName.trim() || !walkInPhone.trim()}
                          style={{ paddingVertical: 16, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: seating || !walkInName.trim() || !walkInPhone.trim() ? C.surfaceHi : C.gold, ...shadow.gold }}
                        >
                          {seating ? <ActivityIndicator color={C.void} /> : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                              <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Seat Party</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </ScrollView>
                </SwipeSheet>
              </View>
            </Modal>
          )}

          {/* ── Table Info Modal (occupied) ───────────────────────────────── */}
          {tableInfoModal && (
            <Modal transparent animationType="slide" onRequestClose={() => setTableInfoModal(null)}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
                <SwipeSheet onClose={() => setTableInfoModal(null)} style={{ paddingHorizontal: 20, paddingTop: 4, gap: 16 }}>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Table {tableInfoModal.number}</Text>
                    <TouchableOpacity
                      onPress={() => setTableInfoModal(null)}
                      style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ backgroundColor: C.surfaceHi, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.rim }}>
                    {tableInfoModal.guestName && (
                      <View className="flex-row items-center gap-3">
                        <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: T.coral, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: C.coral, fontWeight: "700", fontSize: 15 }}>{tableInfoModal.guestName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={{ fontWeight: "600", color: C.pearl }}>{tableInfoModal.guestName}</Text>
                          <Text style={{ fontSize: 13, color: C.mist }}>{tableInfoModal.partySize} guests</Text>
                        </View>
                      </View>
                    )}
                    {tableInfoModal.seatedAt && (
                      <View className="flex-row items-center justify-between">
                        <Text style={{ fontSize: 13, color: C.mist }}>Time seated</Text>
                        <Text style={{ fontWeight: "700", fontSize: 13, color: timerColor(tableInfoModal.seatedAt, tick, amberAt, redAt) }}>
                          {elapsedLabel(tableInfoModal.seatedAt, tick)}
                        </Text>
                      </View>
                    )}
                    {tableInfoModal.server && (
                      <View className="flex-row items-center justify-between">
                        <Text style={{ fontSize: 13, color: C.mist }}>Server</Text>
                        <Text style={{ fontWeight: "600", fontSize: 13, color: C.sky }}>{tableInfoModal.server.name}</Text>
                      </View>
                    )}
                    {(() => { const ord = openOrders.find(o => o.tableId === tableInfoModal.id); return ord ? (
                      <View className="flex-row items-center justify-between">
                        <Text style={{ fontSize: 13, color: C.mist }}>Check total</Text>
                        <Text style={{ fontWeight: "700", color: C.jade }}>${Number(ord.total).toFixed(2)}</Text>
                      </View>
                    ) : null; })()}
                  </View>

                  {/* Service stage picker — uses the more advanced of the stored
                      stage and the stage inferred live from the active order */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Service Stage</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {SERVICE_STAGES.map((s) => {
                          const liveStage = effectiveStage(tableInfoModal, openOrders.find(o => o.tableId === tableInfoModal.id));
                          const stageIdx = SERVICE_STAGES.findIndex(x => x.key === s.key);
                          const currentIdx = SERVICE_STAGES.findIndex(x => x.key === liveStage);
                          const isActive = liveStage === s.key;
                          const isPast = currentIdx > -1 && stageIdx < currentIdx;
                          return (
                            <TouchableOpacity
                              key={s.key}
                              onPress={async () => {
                                setTableInfoModal((prev) => prev ? { ...prev, serviceStage: s.key } : prev);
                                await patchTable(tableInfoModal.id, { serviceStage: s.key });
                                qc.invalidateQueries({ queryKey: ["tables"] });
                              }}
                              style={{
                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                                backgroundColor: isActive ? s.color : isPast ? s.bg : C.surfaceHi,
                                borderWidth: 1.5,
                                borderColor: isActive ? s.color : isPast ? s.color + "55" : C.rim,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "800", color: isActive ? "#FFF" : isPast ? s.color : C.smoke }}>
                                {isPast ? "✓" : s.abbrev}
                              </Text>
                              <Text style={{ fontSize: 10, fontWeight: "600", color: isActive ? "#FFF" : isPast ? s.color : C.mist }}>{s.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>

                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={async () => {
                        setTableInfoModal(null);
                        await patchTable(tableInfoModal.id, { status: "DIRTY", guestName: null, partySize: null, serverId: null, seatedAt: null });
                        qc.invalidateQueries({ queryKey: ["tables"] });
                      }}
                      style={{ flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}
                    >
                      <Text style={{ fontWeight: "600", color: C.mist }}>Mark Dirty</Text>
                    </TouchableOpacity>
                    {openOrders.find(o => o.tableId === tableInfoModal.id) ? (
                      <TouchableOpacity
                        onPress={() => {
                          const ord = openOrders.find(o => o.tableId === tableInfoModal.id)!;
                          setTableInfoModal(null);
                          openCloseScreen(ord);
                        }}
                        style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: C.gold, alignItems: "center", ...shadow.gold }}
                      >
                        <Text style={{ fontWeight: "700", color: C.void }}>Close Check</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          const id = tableInfoModal.id;
                          setTableInfoModal(null);
                          setTable(id);
                          setOrderType("DINE_IN");
                          setScreen("order");
                        }}
                        style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: C.gold, alignItems: "center", ...shadow.gold }}
                      >
                        <Text style={{ fontWeight: "700", color: C.void }}>Open Check</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </SwipeSheet>
              </View>
            </Modal>
          )}

          {/* ── Add Waitlist Modal ────────────────────────────────────────── */}
          {addWaitlistVisible && (
            <Modal transparent animationType="slide" onRequestClose={() => { setAddWaitlistVisible(false); setWlCustomer(null); setWlMatches([]); }}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
                <SwipeSheet onClose={() => { setAddWaitlistVisible(false); setWlCustomer(null); setWlMatches([]); }} style={{ paddingHorizontal: 20, paddingTop: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl, marginBottom: 16 }}>Add to Waitlist</Text>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>

                    {/* Phone first — drives customer lookup */}
                    <View>
                      <TextInput
                        style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                        placeholder="Phone number (lookup customer)"
                        placeholderTextColor={C.smoke}
                        keyboardType="phone-pad"
                        value={wlPhone}
                        onChangeText={(v) => { setWlPhone(v); wlPhoneTimer(v); }}
                        autoFocus
                      />
                      {/* Matched customers */}
                      {wlMatches.length > 0 && !wlCustomer && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          {wlMatches.map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => applyCustomerToWl(c)}
                              style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rimBright, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                            >
                              <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: T.sky, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ color: C.sky, fontWeight: "700", fontSize: 13 }}>{c.name.charAt(0).toUpperCase()}</Text>
                              </View>
                              <View className="flex-1">
                                <Text style={{ fontWeight: "600", color: C.pearl, fontSize: 13 }}>{c.name}</Text>
                                <Text style={{ fontSize: 11, color: C.mist }}>{c.phone} · {c.visitCount} visit{c.visitCount !== 1 ? "s" : ""}{c.tags ? ` · ${c.tags}` : ""}</Text>
                              </View>
                              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 12 }}>Use</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {/* Linked customer badge */}
                      {wlCustomer && (
                        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Ionicons name="person-circle-outline" size={18} color={C.gold} />
                          <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13, flex: 1 }}>{wlCustomer.name} — {wlCustomer.visitCount} visit{wlCustomer.visitCount !== 1 ? "s" : ""}</Text>
                          <TouchableOpacity onPress={() => { setWlCustomer(null); setWlName(""); }}>
                            <Ionicons name="close-circle" size={16} color={C.smoke} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                      placeholder="Guest name *"
                      placeholderTextColor={C.smoke}
                      autoCapitalize="words"
                      autoComplete="name"
                      value={wlName}
                      onChangeText={setWlName}
                    />
                    <View>
                      <Text style={{ fontSize: 11, color: C.mist, marginBottom: 8 }}>Party size *</Text>
                      <View className="flex-row gap-2">
                        {["1","2","3","4","5","6","7","8+"].map((n) => (
                          <TouchableOpacity
                            key={n}
                            onPress={() => setWlParty(n.replace("+",""))}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: wlParty === n.replace("+","") ? C.gold : C.surfaceHi }}
                          >
                            <Text style={{ fontWeight: "700", color: wlParty === n.replace("+","") ? C.void : C.mist }}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={addToWaitlist}
                      disabled={wlSaving || !wlName.trim()}
                      style={{ paddingVertical: 16, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: wlSaving || !wlName.trim() ? C.surfaceHi : C.gold, ...(wlSaving || !wlName.trim() ? {} : shadow.gold) }}
                    >
                      {wlSaving ? <ActivityIndicator color={C.void} /> : (
                        <>
                          <Ionicons name="person-add-outline" size={18} color={C.void} />
                          <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Add to Waitlist</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </SwipeSheet>
              </KeyboardAvoidingView>
            </Modal>
          )}

          {/* ── Add Reservation Modal ─────────────────────────────────────── */}
          {addReservationVisible && (
            <Modal transparent animationType="slide" onRequestClose={() => { setAddReservationVisible(false); setResCustomer(null); setResMatches([]); }}>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
                <SwipeSheet onClose={() => { setAddReservationVisible(false); setResCustomer(null); setResMatches([]); }} style={{ paddingHorizontal: 20, paddingTop: 4 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl, marginBottom: 16 }}>New Reservation</Text>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>

                    {/* Phone first — drives customer lookup */}
                    <View>
                      <TextInput
                        style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                        placeholder="Phone number (lookup customer)"
                        placeholderTextColor={C.smoke}
                        keyboardType="phone-pad"
                        value={resPhone}
                        onChangeText={(v) => { setResPhone(v); resPhoneTimer(v); }}
                        autoFocus
                      />
                      {/* Matched customers */}
                      {resMatches.length > 0 && !resCustomer && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                          {resMatches.map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => applyCustomerToRes(c)}
                              style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rimBright, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                            >
                              <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: T.gold, alignItems: "center", justifyContent: "center" }}>
                                <Text style={{ color: C.gold, fontWeight: "700", fontSize: 13 }}>{c.name.charAt(0).toUpperCase()}</Text>
                              </View>
                              <View className="flex-1">
                                <Text style={{ fontWeight: "600", color: C.pearl, fontSize: 13 }}>{c.name}</Text>
                                <Text style={{ fontSize: 11, color: C.mist }}>{c.phone} · {c.visitCount} visit{c.visitCount !== 1 ? "s" : ""}{c.tags ? ` · ${c.tags}` : ""}</Text>
                              </View>
                              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 12 }}>Use</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {/* Linked customer badge */}
                      {resCustomer && (
                        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.gold, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Ionicons name="person-circle-outline" size={18} color={C.gold} />
                          <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13, flex: 1 }}>{resCustomer.name} — {resCustomer.visitCount} visit{resCustomer.visitCount !== 1 ? "s" : ""}</Text>
                          <TouchableOpacity onPress={() => { setResCustomer(null); setResName(""); }}>
                            <Ionicons name="close-circle" size={16} color={C.smoke} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                      placeholder="Guest name *"
                      placeholderTextColor={C.smoke}
                      autoCapitalize="words"
                      autoComplete="name"
                      value={resName}
                      onChangeText={setResName}
                    />
                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                      placeholder="Time (19:30) *"
                      placeholderTextColor={C.smoke}
                      value={resTime}
                      onChangeText={setResTime}
                      keyboardType="numbers-and-punctuation"
                    />
                    <View>
                      <Text style={{ fontSize: 11, color: C.mist, marginBottom: 8 }}>Party size *</Text>
                      <View className="flex-row gap-2">
                        {["1","2","3","4","5","6","8","10"].map((n) => (
                          <TouchableOpacity
                            key={n}
                            onPress={() => setResParty(n)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: resParty === n ? C.gold : C.surfaceHi }}
                          >
                            <Text style={{ fontWeight: "700", color: resParty === n ? C.void : C.mist }}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                      placeholder="Notes (allergies, special occasion…)"
                      placeholderTextColor={C.smoke}
                      value={resNotes}
                      onChangeText={setResNotes}
                    />
                    <TouchableOpacity
                      onPress={addReservation}
                      disabled={resSaving || !resName.trim() || !resTime.trim()}
                      style={{ paddingVertical: 16, borderRadius: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: resSaving || !resName.trim() || !resTime.trim() ? C.surfaceHi : C.gold, ...(resSaving || !resName.trim() || !resTime.trim() ? {} : shadow.gold) }}
                    >
                      {resSaving ? <ActivityIndicator color={C.void} /> : (
                        <>
                          <Ionicons name="calendar-outline" size={18} color={C.void} />
                          <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Book Reservation</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </SwipeSheet>
              </KeyboardAvoidingView>
            </Modal>
          )}

          {/* ── Pick Table Modal (seat from sidebar) ─────────────────────── */}
          {pickTableFor && (
            <Modal transparent animationType="slide" onRequestClose={() => setPickTableFor(null)}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
                <SwipeSheet onClose={() => setPickTableFor(null)} style={{ paddingHorizontal: 20, paddingTop: 4, gap: 16 }}>
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>
                        {pickTableFor.entry ? `Seat ${pickTableFor.entry.name}` : `Seat ${pickTableFor.reservation?.name}`}
                      </Text>
                      <Text style={{ fontSize: 13, color: C.mist }}>
                        {pickTableFor.entry ? `${pickTableFor.entry.partySize} guests` : `${pickTableFor.reservation?.partySize} guests · ${pickTableFor.reservation?.time}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setPickTableFor(null)}
                      style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Select a table</Text>
                  {availableTables.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                      <Ionicons name="close-circle-outline" size={28} color={C.smoke} />
                      <Text style={{ color: C.mist, fontSize: 13 }}>No available tables</Text>
                    </View>
                  )}
                  <View className="flex-row flex-wrap gap-2">
                    {availableTables.map((t) => {
                      const partySize = pickTableFor.entry?.partySize ?? pickTableFor.reservation?.partySize ?? 1;
                      const fits = t.capacity >= partySize;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => {
                            const name = pickTableFor.entry?.name ?? pickTableFor.reservation?.name ?? "";
                            const size = pickTableFor.entry?.partySize ?? pickTableFor.reservation?.partySize ?? 1;
                            seatParty(t, { guestName: name, partySize: size, fromWaitlist: pickTableFor.entry, fromReservation: pickTableFor.reservation });
                          }}
                          disabled={seating}
                          style={{ width: "30%", aspectRatio: 1, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: C.surfaceHi, borderColor: fits ? C.jade : C.rim }}
                        >
                          <Text style={{ fontSize: 24, fontWeight: "900", color: C.pearl }}>{t.number}</Text>
                          <Text style={{ fontSize: 11, color: C.mist }}>{t.capacity} seats</Text>
                          {!fits && <Text style={{ fontSize: 9, color: C.coral }}>Small</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </SwipeSheet>
              </View>
            </Modal>
          )}

          {/* ── Customize Modal ───────────────────────────────────────────── */}
          {showCustomize && (
            <Modal transparent animationType="slide" onRequestClose={() => setShowCustomize(false)}>
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
                <SwipeSheet onClose={() => setShowCustomize(false)} style={{ paddingHorizontal: 20, paddingTop: 4, gap: 20 }}>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Floor Plan Settings</Text>
                    <TouchableOpacity
                      onPress={() => setShowCustomize(false)}
                      style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>

                  {/* Canvas height */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Canvas Height</Text>
                    <View className="flex-row gap-2">
                      {([350, 500, 700] as const).map((h) => (
                        <TouchableOpacity
                          key={h}
                          onPress={() => setCanvasHSetting(h)}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: canvasHSetting === h ? C.gold : C.surfaceHi }}
                        >
                          <Text style={{ fontWeight: "700", fontSize: 13, color: canvasHSetting === h ? C.void : C.mist }}>{h === 350 ? "Compact" : h === 500 ? "Default" : "Large"}</Text>
                          <Text style={{ fontSize: 10, color: canvasHSetting === h ? C.void : C.smoke }}>{h}px</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Table size */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Table Size</Text>
                    <View className="flex-row gap-2">
                      {([72, 88, 104] as const).map((sz) => (
                        <TouchableOpacity
                          key={sz}
                          onPress={() => setTableSizeSetting(sz)}
                          style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: tableSizeSetting === sz ? C.gold : C.surfaceHi }}
                        >
                          <Text style={{ fontWeight: "700", fontSize: 13, color: tableSizeSetting === sz ? C.void : C.mist }}>{sz === 72 ? "Small" : sz === 88 ? "Medium" : "Large"}</Text>
                          <Text style={{ fontSize: 10, color: tableSizeSetting === sz ? C.void : C.smoke }}>{sz}px</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Turn timer thresholds */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Turn Timer Alerts</Text>
                    <View className="flex-row gap-3 items-center">
                      <View className="flex-1 gap-1">
                        <Text style={{ fontSize: 11, color: C.ember, fontWeight: "600" }}>⚠ Amber after</Text>
                        <View className="flex-row gap-1.5">
                          {[45, 60, 75, 90].map((m) => (
                            <TouchableOpacity
                              key={m}
                              onPress={() => { setAmberAt(m); if (redAt <= m) setRedAt(m + 15); }}
                              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: amberAt === m ? C.ember : C.surfaceHi }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: "700", color: amberAt === m ? C.void : C.mist }}>{m}m</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                    <View className="flex-row gap-1.5">
                      {[60, 75, 90, 120].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => { setRedAt(m); if (amberAt >= m) setAmberAt(m - 15); }}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: redAt === m ? C.coral : C.surfaceHi }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: redAt === m ? C.void : C.mist }}>{m}m</Text>
                        </TouchableOpacity>
                      ))}
                      <Text style={{ fontSize: 10, color: C.mist, alignSelf: "center", paddingLeft: 4 }}>Red</Text>
                    </View>
                  </View>

                  {/* Display toggles */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Show on Tables</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {[
                        { key: "badge", label: "Server Badge", value: showServerBadge, toggle: () => setShowServerBadge((v) => !v) },
                        { key: "total", label: "Order Total", value: showOrderTotal, toggle: () => setShowOrderTotal((v) => !v) },
                        { key: "guest", label: "Guest Name", value: showGuestLabel, toggle: () => setShowGuestLabel((v) => !v) },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={opt.toggle}
                          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, backgroundColor: opt.value ? T.gold : C.surfaceHi, borderColor: opt.value ? C.gold : C.rim }}
                        >
                          <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: opt.value ? C.gold : C.smoke }} />
                          <Text style={{ fontSize: 13, fontWeight: "600", color: opt.value ? C.gold : C.mist }}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </SwipeSheet>
              </View>
            </Modal>
          )}

          {/* ── Host Stand Mode ──────────────────────────────────────────── */}
          {/* All sub-modals (seatModal, tableInfoModal, addWaitlist, etc.) are
              <Modal> components in this tree — they stack on top of HostStandMode
              automatically. We must NOT close hostStandVisible on any host action. */}
          <HostStandMode
            visible={hostStandVisible}
            onClose={() => setHostStandVisible(false)}
            tables={tables}
            openOrders={openOrders}
            tableSize={tableSizeSetting}
            amberAt={amberAt}
            redAt={redAt}
            showServerBadge={showServerBadge}
            showOrderTotal={showOrderTotal}
            showGuestLabel={showGuestLabel}
            tick={tick}
            onTablePress={(t) => {
              // Occupied → stage management sheet (stays in host stand)
              // Available → seat dialog (stays in host stand)
              // Dirty/Reserved → navigate to order screen (close host stand)
              if (t.status === "OCCUPIED") { setTableInfoModal(t); }
              else if (t.status === "AVAILABLE") { setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId(""); setSeatModal(t); }
              else { setHostStandVisible(false); openTable(t); }
            }}
            onLayoutSaved={() => { refetchTables(); qc.invalidateQueries({ queryKey: ["tables"] }); }}
            onRefresh={() => run(() => { refetchTables(); qc.invalidateQueries({ queryKey: ["waitlist"] }); qc.invalidateQueries({ queryKey: ["reservations", today] }); })}
            isRefreshing={refreshing}
            todayReservations={todayReservations}
            waitingList={waitingList}
            onAddWalkIn={() => { setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId(""); setSeatModal(availableTables[0] ?? null); }}
            onAddWaitlist={() => setAddWaitlistVisible(true)}
            onAddReservation={() => setAddReservationVisible(true)}
            onSeatWaitlistEntry={(entry) => setPickTableFor({ entry })}
            onSeatReservation={(res) => setPickTableFor({ reservation: res })}
            onMarkLeft={async (id) => { await patchWaitlistEntry(id, { status: "LEFT" }); qc.invalidateQueries({ queryKey: ["waitlist"] }); }}
            onMarkNoShow={async (id) => { await patchReservation(id, { status: "NO_SHOW" }); qc.invalidateQueries({ queryKey: ["reservations", today] }); }}
          />

          {/* ── Canvas (left) ─────────────────────────────────────────────── */}
          <View className="flex-1">
            <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.rim, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>Floor Plan</Text>
                <Text style={{ fontSize: 13, color: C.mist }}>
                  {tables.filter((t) => t.status === "OCCUPIED").length} occupied · {waitingList.length} waiting
                </Text>
              </View>
              <View className="flex-row gap-2 items-center">
                <TouchableOpacity
                  onPress={() => { setAddWaitlistVisible(true); setSidebarTab("waitlist"); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.sky, borderWidth: 1, borderColor: C.sky, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
                >
                  <Ionicons name="person-add-outline" size={15} color={C.sky} />
                  <Text style={{ color: C.sky, fontWeight: "600", fontSize: 13 }}>+ Waitlist</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setAddReservationVisible(true); setSidebarTab("reservations"); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
                >
                  <Ionicons name="calendar-outline" size={15} color={C.gold} />
                  <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>+ Reservation</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={startTakeout}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHi, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
                >
                  <Ionicons name="bag-handle-outline" size={15} color={C.mist} />
                  <Text style={{ color: C.mist, fontWeight: "600", fontSize: 13 }}>Takeout</Text>
                </TouchableOpacity>
                <View style={{ width: 1, height: 24, backgroundColor: C.rim }} />
                <TouchableOpacity
                  onPress={() => setHostStandVisible(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
                >
                  <Ionicons name="storefront-outline" size={15} color={C.gold} />
                  <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>Host Stand</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowCustomize(true)}
                  style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="settings-outline" size={18} color={C.mist} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats bar + view toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderBottomWidth: 1, borderColor: C.rim, paddingHorizontal: 20, paddingVertical: 8, gap: 20 }}>
              {[
                { label: "Open", value: tables.filter(t => t.status === "AVAILABLE").length, color: C.jade },
                { label: "Seated", value: tables.filter(t => t.status === "OCCUPIED").length, color: C.coral },
                { label: "Reserved", value: tables.filter(t => t.status === "RESERVED").length, color: C.ember },
                { label: "Waiting", value: waitingList.length, color: C.sky },
              ].map((s) => (
                <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                  <Text style={{ fontSize: 12, color: C.mist }}>{s.label}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: s.value > 0 ? s.color : C.smoke }}>{s.value}</Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", marginLeft: "auto", backgroundColor: C.rim, borderRadius: 9, padding: 2, gap: 2 }}>
                {(["grid", "map"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setFloorView(v)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7, backgroundColor: floorView === v ? C.surface : "transparent" }}
                  >
                    <Ionicons name={v === "grid" ? "grid-outline" : "map-outline"} size={14} color={floorView === v ? C.pearl : C.smoke} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: floorView === v ? C.pearl : C.smoke, textTransform: "capitalize" }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <ScrollView scrollEnabled={!canvasEditing} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(() => { refetchTables(); qc.invalidateQueries({ queryKey: ["waitlist"] }); qc.invalidateQueries({ queryKey: ["reservations", today] }); })} tintColor={C.gold} />}>
              {floorView === "grid" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 16 }}>
                  {[...tables].sort((a, b) => a.number - b.number).map((t) => {
                    const st = FLOOR_STATUS_M[t.status] ?? FLOOR_STATUS_M.DIRTY;
                    const order = openOrders.find((o) => o.tableId === t.id);
                    const stage = effectiveStage(t, order);
                    const stageMeta = stage ? SERVICE_STAGES.find((s) => s.key === stage) : null;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => openTable(t)}
                        style={{
                          width: isTablet ? "23.5%" : "47.5%",
                          minHeight: 104,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: st.color + "55",
                          backgroundColor: st.bg,
                          padding: 12,
                        }}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <Text style={{ fontSize: 24, fontWeight: "800", color: C.pearl, lineHeight: 26 }}>{t.number}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.color }} />
                            <Text style={{ fontSize: 10, fontWeight: "700", color: st.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{st.label}</Text>
                          </View>
                        </View>
                        {order ? (
                          <View style={{ marginTop: 8, gap: 4 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                              <Text style={{ fontSize: 17, fontWeight: "800", color: C.gold }}>${Number(order.total).toFixed(2)}</Text>
                              {t.seatedAt ? (
                                <Text style={{ fontSize: 11, fontWeight: "700", color: timerColor(t.seatedAt, tick, amberAt, redAt) }}>{elapsedLabel(t.seatedAt, tick)}</Text>
                              ) : null}
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              {t.partySize ? <Text style={{ fontSize: 11, color: C.mist }}>{t.partySize} guests</Text> : null}
                              {stageMeta ? <Text style={{ fontSize: 10, fontWeight: "800", color: stageMeta.color, textTransform: "uppercase" }}>{stageMeta.abbrev}</Text> : null}
                            </View>
                          </View>
                        ) : (
                          <View style={{ marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="people-outline" size={13} color={C.smoke} />
                              <Text style={{ fontSize: 12, color: C.mist }}>{t.capacity}</Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke }}>
                              {t.status === "AVAILABLE" ? "Tap to start" : t.status === "RESERVED" ? "Seat party" : "Mark clean"}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <TableCanvas
                  tables={tables}
                  openOrders={openOrders}
                  canvasH={canvasHSetting}
                  tableSize={tableSizeSetting}
                  amberAt={amberAt}
                  redAt={redAt}
                  showServerBadge={showServerBadge}
                  showOrderTotal={showOrderTotal}
                  showGuestLabel={showGuestLabel}
                  tick={tick}
                  onTablePress={openTable}
                  onLayoutSaved={() => { refetchTables(); qc.invalidateQueries({ queryKey: ["tables"] }); }}
                  onEditModeChange={setCanvasEditing}
                />
              )}
            </ScrollView>
          </View>

          {/* ── Sidebar (right) ───────────────────────────────────────────── */}
          <View style={{ width: 320, backgroundColor: C.surface, borderLeftWidth: 1, borderColor: C.rim, flexDirection: "column" }}>
            {/* Tabs */}
            <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: C.rim }}>
              {(["waitlist", "reservations", "timeline"] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setSidebarTab(tab)}
                  style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderColor: sidebarTab === tab ? C.gold : "transparent" }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: sidebarTab === tab ? C.gold : C.smoke }}>
                    {tab === "waitlist"
                      ? `WAIT (${waitingList.length})`
                      : tab === "reservations"
                      ? `RESERV`
                      : "TIMELINE"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
              {/* WAITLIST TAB */}
              {sidebarTab === "waitlist" && (
                <>
                  <TouchableOpacity
                    onPress={() => setAddWaitlistVisible(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.rimBright, backgroundColor: T.sky }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={C.sky} />
                    <Text style={{ color: C.sky, fontWeight: "600", fontSize: 13 }}>Add to Waitlist</Text>
                  </TouchableOpacity>
                  {waitingList.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                      <Ionicons name="people-outline" size={30} color={C.smoke} />
                      <Text style={{ color: C.mist, fontSize: 13 }}>No one waiting</Text>
                    </View>
                  )}
                  {waitingList.map((entry, idx) => {
                    const waitMins = estimateWait(idx + 1, entry.partySize, tables);
                    const hasAvailFit = tables.some(t => t.status === "AVAILABLE" && t.capacity >= entry.partySize);
                    return (
                    <View key={entry.id} style={{ backgroundColor: C.surfaceHi, borderRadius: 12, borderWidth: 1, borderColor: hasAvailFit ? C.jade : C.rim, padding: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: T.sky, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: C.sky, fontWeight: "700", fontSize: 13 }}>{entry.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ fontWeight: "600", color: C.pearl, fontSize: 13 }}>{entry.name}</Text>
                            {hasAvailFit ? (
                              <Text style={{ fontSize: 10, fontWeight: "700", color: C.jade }}>TABLE READY</Text>
                            ) : (
                              <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke }}>~{waitMins}m</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 11, color: C.mist }}>{entry.partySize} guests · waited {elapsedLabel(entry.addedAt, tick)}</Text>
                        </View>
                      </View>
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => setPickTableFor({ entry })}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: hasAvailFit ? C.jade : C.gold, alignItems: "center" }}
                        >
                          <Text style={{ color: C.void, fontWeight: "600", fontSize: 12 }}>Seat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={async () => {
                            await patchWaitlistEntry(entry.id, { status: "LEFT" });
                            qc.invalidateQueries({ queryKey: ["waitlist"] });
                          }}
                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}
                        >
                          <Text style={{ color: C.mist, fontWeight: "600", fontSize: 12 }}>Left</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    );
                  })}
                </>
              )}

              {/* RESERVATIONS TAB */}
              {sidebarTab === "reservations" && (
                <>
                  <TouchableOpacity
                    onPress={() => setAddReservationVisible(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: C.rimBright, backgroundColor: T.gold }}
                  >
                    <Ionicons name="calendar-outline" size={16} color={C.gold} />
                    <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>New Reservation</Text>
                  </TouchableOpacity>
                  {todayReservations.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                      <Ionicons name="calendar-outline" size={30} color={C.smoke} />
                      <Text style={{ color: C.mist, fontSize: 13 }}>No reservations today</Text>
                    </View>
                  )}
                  {todayReservations.map((res) => {
                    const statusStyle: Record<string, { bg: string; text: string }> = {
                      PENDING:   { bg: T.gold,  text: C.gold  },
                      CONFIRMED: { bg: T.jade,  text: C.jade  },
                      SEATED:    { bg: T.sky,   text: C.sky   },
                      CANCELLED: { bg: T.mist,  text: C.smoke },
                      NO_SHOW:   { bg: T.coral, text: C.coral },
                    };
                    const sc = statusStyle[res.status] ?? { bg: T.mist, text: C.smoke };
                    return (
                      <View key={res.id} style={{ backgroundColor: C.surfaceHi, borderRadius: 12, borderWidth: 1, borderColor: C.rim, padding: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                          <View className="flex-1">
                            <Text style={{ fontWeight: "600", color: C.pearl, fontSize: 13 }}>{res.name}</Text>
                            <Text style={{ fontSize: 11, color: C.mist }}>{res.partySize} guests · {res.time}</Text>
                            {res.notes && <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }} numberOfLines={1}>{res.notes}</Text>}
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: sc.bg }}>
                            <Text style={{ fontSize: 10, fontWeight: "700", color: sc.text }}>{res.status}</Text>
                          </View>
                        </View>
                        {(res.status === "PENDING" || res.status === "CONFIRMED") && (
                          <View className="flex-row gap-2">
                            <TouchableOpacity
                              onPress={() => setPickTableFor({ reservation: res })}
                              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gold, alignItems: "center" }}
                            >
                              <Text style={{ color: C.void, fontWeight: "600", fontSize: 12 }}>Seat</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={async () => {
                                await patchReservation(res.id, { status: "NO_SHOW" });
                                qc.invalidateQueries({ queryKey: ["reservations", today] });
                              }}
                              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}
                            >
                              <Text style={{ color: C.mist, fontWeight: "600", fontSize: 12 }}>No Show</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}

              {/* TIMELINE TAB */}
              {sidebarTab === "timeline" && (
                <>
                  {tables.filter((t) => t.status === "OCCUPIED").length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                      <Ionicons name="restaurant-outline" size={30} color={C.smoke} />
                      <Text style={{ color: C.mist, fontSize: 13 }}>No tables occupied</Text>
                    </View>
                  )}
                  {tables
                    .filter((t) => t.status === "OCCUPIED")
                    .sort((a, b) => {
                      if (!a.seatedAt) return 1;
                      if (!b.seatedAt) return -1;
                      return new Date(a.seatedAt).getTime() - new Date(b.seatedAt).getTime();
                    })
                    .map((t) => {
                      const order = openOrders.find((o) => o.tableId === t.id);
                      const mins = t.seatedAt ? elapsedMins(t.seatedAt) : 0;
                      const barPct = Math.min(1, mins / 90);
                      const barColor = mins < amberAt ? C.jade : mins < redAt ? C.ember : C.coral;
                      const liveStage = effectiveStage(t, order);
                      const stageMeta = SERVICE_STAGES.find(s => s.key === liveStage);
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => setTableInfoModal(t)}
                          style={{ backgroundColor: C.surfaceHi, borderRadius: 12, borderWidth: 1.5, borderColor: stageMeta ? stageMeta.color + "55" : C.rim, padding: 12, gap: 8 }}
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-2">
                              <Text style={{ fontWeight: "700", color: C.pearl, fontSize: 13 }}>Table {t.number}</Text>
                              {stageMeta && (
                                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: stageMeta.color }}>
                                  <Text style={{ fontSize: 9, fontWeight: "800", color: "#FFF" }}>{stageMeta.abbrev}</Text>
                                </View>
                              )}
                            </View>
                            {t.seatedAt && (
                              <Text style={{ fontSize: 12, fontWeight: "700", color: timerColor(t.seatedAt, tick, amberAt, redAt) }}>{elapsedLabel(t.seatedAt, tick)}</Text>
                            )}
                          </View>
                          {t.guestName && <Text style={{ fontSize: 11, color: C.mist }}>{t.guestName} · {t.partySize}p</Text>}
                          {t.server && <Text style={{ fontSize: 11, color: C.sky }}>{t.server.name}</Text>}
                          <View style={{ height: 6, backgroundColor: C.rim, borderRadius: 3, overflow: "hidden" }}>
                            <View style={{ height: "100%", borderRadius: 3, backgroundColor: barColor, width: `${barPct * 100}%` }} />
                          </View>
                          {order && (
                            <View className="flex-row items-center justify-between">
                              <Text style={{ fontSize: 11, color: C.mist }}>{order.items.length} items</Text>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade }}>${Number(order.total).toFixed(2)}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                </>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      );
    }

    // ── Phone floor plan ───────────────────────────────────────────────────────
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
        {modifierModalEl}
        {toastOverlay}
        <HostStandMode
          visible={hostStandVisible}
          onClose={() => setHostStandVisible(false)}
          tables={tables}
          openOrders={openOrders}
          tableSize={tableSizeSetting}
          amberAt={amberAt}
          redAt={redAt}
          showServerBadge={showServerBadge}
          showOrderTotal={showOrderTotal}
          showGuestLabel={showGuestLabel}
          tick={tick}
          onTablePress={(t) => {
            if (t.status === "OCCUPIED") { setTableInfoModal(t); }
            else if (t.status === "AVAILABLE") { setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId(""); setSeatModal(t); }
            else { setHostStandVisible(false); openTable(t); }
          }}
          onLayoutSaved={() => { refetchTables(); qc.invalidateQueries({ queryKey: ["tables"] }); }}
          onRefresh={() => run(() => { refetchTables(); qc.invalidateQueries({ queryKey: ["waitlist"] }); qc.invalidateQueries({ queryKey: ["reservations", today] }); })}
          isRefreshing={refreshing}
          todayReservations={todayReservations}
          waitingList={waitingList}
          onAddWalkIn={() => { setWalkInName(""); setWalkInPhone(""); setWalkInParty("2"); setWalkInServerId(""); setSeatModal(tables.find(t => t.status === "AVAILABLE") ?? null); }}
          onAddWaitlist={() => setAddWaitlistVisible(true)}
          onAddReservation={() => setAddReservationVisible(true)}
          onSeatWaitlistEntry={(entry) => setPickTableFor({ entry })}
          onSeatReservation={(res) => setPickTableFor({ reservation: res })}
          onMarkLeft={async (id) => { await patchWaitlistEntry(id, { status: "LEFT" }); qc.invalidateQueries({ queryKey: ["waitlist"] }); }}
          onMarkNoShow={async (id) => { await patchReservation(id, { status: "NO_SHOW" }); qc.invalidateQueries({ queryKey: ["reservations", today] }); }}
        />
        <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.rim, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>Floor Plan</Text>
            <Text style={{ fontSize: 13, color: C.mist }}>
              {tables.filter((t) => t.status === "OCCUPIED").length} occupied · {waitingList.length} waiting
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => setHostStandVisible(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
            >
              <Ionicons name="storefront-outline" size={15} color={C.gold} />
              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>Host Stand</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={startTakeout}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 }}
            >
              <Ionicons name="bag-handle-outline" size={15} color={C.mist} />
              <Text style={{ color: C.mist, fontWeight: "600", fontSize: 13 }}>Takeout</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView scrollEnabled={!canvasEditing} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetchTables)} tintColor={C.gold} />}>
          <TableCanvas
            tables={tables}
            openOrders={openOrders}
            canvasH={canvasHSetting}
            tableSize={tableSizeSetting}
            amberAt={amberAt}
            redAt={redAt}
            showServerBadge={showServerBadge}
            showOrderTotal={showOrderTotal}
            showGuestLabel={showGuestLabel}
            tick={tick}
            onTablePress={openTable}
            onLayoutSaved={() => { refetchTables(); qc.invalidateQueries({ queryKey: ["tables"] }); }}
            onEditModeChange={setCanvasEditing}
          />
          {openOrders.length > 0 && (
            <View style={{ marginTop: 4, paddingHorizontal: 16, paddingBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Open Orders</Text>
                <View style={{ backgroundColor: T.coral, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                  <Text style={{ color: C.coral, fontSize: 11, fontWeight: "700" }}>{openOrders.length}</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                {openOrders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    onPress={() => openCloseScreen(order)}
                    style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}
                  >
                    <View style={{ height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: order.type === "TAKEOUT" ? T.gold : T.coral }}>
                      <Ionicons name={order.type === "TAKEOUT" ? "bag-handle-outline" : "restaurant-outline"} size={18} color={order.type === "TAKEOUT" ? C.gold : C.coral} />
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>
                        {order.type === "TAKEOUT" ? "Takeout" : order.table ? `Table ${order.table.number}` : "Dine-in"}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.mist }}>
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""} · {order.status}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: C.jade }}>${Number(order.total).toFixed(2)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.smoke} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CLOSE CHECK
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen === "close" && activeOrder) {
    // Keep close check in sync with live server data (void/comp invalidate openOrders)
    const liveOrder = openOrders.find((o) => o.id === activeOrder.id) ?? activeOrder;
    const tipAmount = Math.round(Number(liveOrder.subtotal) * tipPct) / 100;
    const redeemDiscount = checkRedeemPts > 0 ? checkRedeemPts / 100 : 0;
    const chargeTotal = Math.max(0, Number(liveOrder.total) + tipAmount - redeemDiscount);
    const earnPts = Math.round(Number(liveOrder.subtotal));
    const checkAvailablePts = checkLoyalty?.points ?? 0;
    const maxRedeemPts = Math.min(checkAvailablePts, Math.floor((Number(liveOrder.total) + tipAmount) * 100));

    const heldItems = liveOrder.items.filter((i) => i.heldForFire && !i.voided);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
        {toastOverlay}
        <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.rim, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => { setScreen("floor"); setActiveOrder(null); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}
          >
            <Ionicons name="chevron-back" size={20} color={C.gold} />
            <Text style={{ color: C.gold, fontWeight: "600" }}>Floor</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: C.pearl, marginLeft: 4 }}>
            {liveOrder.type === "TAKEOUT" ? "Takeout" : liveOrder.table ? `Table ${liveOrder.table.number}` : "Dine-in"} — Close Check
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Customer loyalty */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, paddingHorizontal: 4 }}>Customer & Loyalty</Text>
            {checkCustomer ? (
              <View style={{ gap: 8 }}>
                {/* Linked customer card */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#0a2218", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.jade }}>
                  <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: T.jade, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person-outline" size={18} color={C.jade} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.jade }}>{checkCustomer.name}</Text>
                    <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }}>
                      {checkAvailablePts} pts available · Will earn +{earnPts} pts
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => { setCheckCustomer(null); setCheckCustomerQuery(""); setCheckRedeemPts(0); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={C.smoke} />
                  </TouchableOpacity>
                </View>
                {/* Redemption row */}
                {checkAvailablePts >= 100 && (
                  <View style={{ backgroundColor: C.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: C.rim, padding: 14, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name="ribbon-outline" size={15} color={C.gold} />
                        <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>Redeem Points</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: C.smoke }}>100 pts = $1.00</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {[100, 200, 500].filter((p) => p <= maxRedeemPts).map((p) => (
                        <TouchableOpacity
                          key={p}
                          onPress={() => setCheckRedeemPts(checkRedeemPts === p ? 0 : p)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center", backgroundColor: checkRedeemPts === p ? C.gold : C.void, borderWidth: 1, borderColor: checkRedeemPts === p ? C.gold : C.rim }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: checkRedeemPts === p ? C.void : C.mist }}>{p} pts</Text>
                          <Text style={{ fontSize: 10, color: checkRedeemPts === p ? C.void + "cc" : C.smoke }}>-${(p / 100).toFixed(2)}</Text>
                        </TouchableOpacity>
                      ))}
                      {maxRedeemPts > 0 && (
                        <TouchableOpacity
                          onPress={() => setCheckRedeemPts(checkRedeemPts === maxRedeemPts ? 0 : maxRedeemPts)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center", backgroundColor: checkRedeemPts === maxRedeemPts ? C.gold : C.void, borderWidth: 1, borderColor: checkRedeemPts === maxRedeemPts ? C.gold : C.rim }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: checkRedeemPts === maxRedeemPts ? C.void : C.mist }}>All</Text>
                          <Text style={{ fontSize: 10, color: checkRedeemPts === maxRedeemPts ? C.void + "cc" : C.smoke }}>{maxRedeemPts} pts</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: C.rim, paddingHorizontal: 14 }}>
                  <Ionicons name="search-outline" size={14} color={C.smoke} style={{ marginRight: 8 }} />
                  <TextInput
                    value={checkCustomerQuery}
                    onChangeText={(v) => { setCheckCustomerQuery(v); checkSearchTimer(v); }}
                    placeholder="Search customer by name or phone…"
                    placeholderTextColor={C.smoke}
                    style={{ flex: 1, paddingVertical: 12, fontSize: 14, color: C.pearl }}
                  />
                </View>
                {checkCustomerMatches.length > 0 && (
                  <View style={{ backgroundColor: C.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: C.rim, marginTop: 4, overflow: "hidden" }}>
                    {checkCustomerMatches.map((c, i) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => { setCheckCustomer(c); setCheckCustomerQuery(c.name); setCheckCustomerMatches([]); setCheckRedeemPts(0); }}
                        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < checkCustomerMatches.length - 1 ? 1 : 0, borderColor: C.rim, gap: 10 }}
                      >
                        <Ionicons name="person-outline" size={14} color={C.smoke} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{c.name}</Text>
                          {c.phone ? <Text style={{ fontSize: 11, color: C.smoke }}>{c.phone}</Text> : null}
                        </View>
                        <Text style={{ fontSize: 11, color: C.jade }}>{c.loyaltyPoints} pts</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Payment method */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, paddingHorizontal: 4 }}>Payment Method</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setPayMethod("CREDIT")}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 16, borderWidth: 2, backgroundColor: payMethod === "CREDIT" ? T.sky : C.surface, borderColor: payMethod === "CREDIT" ? C.sky : C.rim }}
              >
                <Ionicons name="card-outline" size={22} color={C.sky} />
                <Text style={{ fontWeight: "600", fontSize: 15, color: payMethod === "CREDIT" ? C.sky : C.mist }}>Card</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPayMethod("CASH")}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 16, borderWidth: 2, backgroundColor: payMethod === "CASH" ? T.jade : C.surface, borderColor: payMethod === "CASH" ? C.jade : C.rim }}
              >
                <Ionicons name="cash-outline" size={22} color={C.jade} />
                <Text style={{ fontWeight: "600", fontSize: 15, color: payMethod === "CASH" ? C.jade : C.mist }}>Cash</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tip selection */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, paddingHorizontal: 4 }}>Tip</Text>
            <View className="flex-row gap-2">
              {TIP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setTipPct(opt.value)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 20, backgroundColor: tipPct === opt.value ? C.gold : C.surfaceHi }}
                >
                  <Text style={{ fontWeight: "600", fontSize: 13, color: tipPct === opt.value ? C.void : C.mist }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Fire held items */}
          {heldItems.length > 0 && (
            <TouchableOpacity
              onPress={async () => {
                try {
                  await patchOrder(liveOrder.id, { fireItemIds: heldItems.map((i) => i.id) });
                  qc.invalidateQueries({ queryKey: ["openOrders"] });
                  showToast(`${heldItems.length} item${heldItems.length !== 1 ? "s" : ""} fired to kitchen`, "success");
                } catch (e: unknown) {
                  showToast(e instanceof Error ? e.message : "Failed to fire items", "error");
                }
              }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: T.ember, borderWidth: 1, borderColor: C.ember }}
            >
              <Ionicons name="flame-outline" size={16} color={C.ember} />
              <Text style={{ color: C.ember, fontWeight: "700", fontSize: 13 }}>
                Fire All Held — {heldItems.length} item{heldItems.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          )}

          {/* Items list with void/comp */}
          <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
            {liveOrder.items.map((item, i) => (
              <View
                key={item.id}
                style={{
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderBottomWidth: i < liveOrder.items.length - 1 ? 1 : 0, borderColor: C.rim,
                  opacity: item.voided ? 0.4 : 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {item.heldForFire && !item.voided && (
                    <Ionicons name="time-outline" size={13} color={C.ember} />
                  )}
                  <Text style={{ flex: 1, color: item.voided ? C.smoke : C.mist, textDecorationLine: item.voided ? "line-through" : "none", fontSize: 13 }}>
                    {item.quantity}× {item.menuItem.name}
                  </Text>
                  {item.voided && (
                    <View style={{ backgroundColor: "#2a2a2a", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: C.smoke }}>VOID</Text>
                    </View>
                  )}
                  {item.comped && !item.voided && (
                    <View style={{ backgroundColor: T.jade, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: C.jade }}>COMP</Text>
                    </View>
                  )}
                  <Text style={{ fontWeight: "600", color: item.voided || item.comped ? C.smoke : C.pearl, fontSize: 13, textDecorationLine: item.voided || item.comped ? "line-through" : "none" }}>
                    ${(Number(item.unitPrice) * item.quantity).toFixed(2)}
                  </Text>
                </View>
                {!item.voided && (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                    {!item.comped && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await patchOrder(liveOrder.id, { voidItem: { itemId: item.id } });
                            qc.invalidateQueries({ queryKey: ["openOrders"] });
                          } catch (e: unknown) {
                            showToast(e instanceof Error ? e.message : "Failed", "error");
                          }
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim }}
                      >
                        <Text style={{ fontSize: 11, color: C.smoke, fontWeight: "600" }}>Void</Text>
                      </TouchableOpacity>
                    )}
                    {!item.comped && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await patchOrder(liveOrder.id, { compItem: { itemId: item.id } });
                            qc.invalidateQueries({ queryKey: ["openOrders"] });
                            showToast(`${item.menuItem.name} comped`, "success");
                          } catch (e: unknown) {
                            showToast(e instanceof Error ? e.message : "Failed", "error");
                          }
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade }}
                      >
                        <Text style={{ fontSize: 11, color: C.jade, fontWeight: "600" }}>Comp</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Totals card */}
          <View style={{ backgroundColor: C.surfaceHi, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: C.rimBright }}>
            <View className="flex-row justify-between">
              <Text style={{ color: C.mist }}>Subtotal</Text>
              <Text style={{ color: C.mist }}>${Number(liveOrder.subtotal).toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text style={{ color: C.mist }}>Tax</Text>
              <Text style={{ color: C.mist }}>${Number(liveOrder.tax).toFixed(2)}</Text>
            </View>
            {tipPct > 0 && (
              <View className="flex-row justify-between">
                <Text style={{ color: C.mist }}>Tip ({tipPct}%)</Text>
                <Text style={{ color: C.mist }}>${tipAmount.toFixed(2)}</Text>
              </View>
            )}
            {redeemDiscount > 0 && (
              <View className="flex-row justify-between">
                <Text style={{ color: C.jade }}>Points Redeemed ({checkRedeemPts} pts)</Text>
                <Text style={{ color: C.jade }}>-${redeemDiscount.toFixed(2)}</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderColor: C.rim }}>
              <Text style={{ color: C.pearl, fontWeight: "700", fontSize: 15 }}>Total</Text>
              <Text style={{ color: C.gold, fontWeight: "700", fontSize: 15 }}>${chargeTotal.toFixed(2)}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={closeCheck}
            disabled={closing}
            style={{ borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, backgroundColor: closing ? C.surfaceHi : C.gold, ...(closing ? {} : shadow.gold) }}
          >
            {closing ? (
              <ActivityIndicator color={C.void} />
            ) : (
              <>
                <Ionicons name={payMethod === "CASH" ? "cash-outline" : "card-outline"} size={18} color={C.void} />
                <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>
                  {payMethod === "CASH" ? "Close Cash" : "Charge Card"} — ${chargeTotal.toFixed(2)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ORDER BUILDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {modifierModalEl}
      {toastOverlay}
      {scannerOpen && (
        <Modal animationType="slide" onRequestClose={() => setScannerOpen(false)}>
          <Scanner onScan={handleScan} onClose={() => setScannerOpen(false)} hint="Scan menu item barcode" />
        </Modal>
      )}

      {/* Header */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.rim }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => { clear(); setScreen("floor"); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}
          >
            <Ionicons name="chevron-back" size={20} color={C.gold} />
            <Text style={{ color: C.gold, fontWeight: "600" }}>Floor</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: C.pearl }}>
              {orderType === "TAKEOUT"
                ? "Takeout Order"
                : activeTable
                  ? `Table ${activeTable.number}`
                  : "New Order"}
            </Text>
          </View>

          {/* Fast-path close buttons */}
          {tableOrder && cart.length === 0 ? (
            <TouchableOpacity
              onPress={() => openCloseScreen(tableOrder)}
              style={{ backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color={C.void} />
              <Text style={{ color: C.void, fontWeight: "600", fontSize: 13 }}>Close Check</Text>
            </TouchableOpacity>
          ) : (
            <>
              {tableOrder && cart.length > 0 && (
                <TouchableOpacity
                  onPress={() => openCloseScreen(tableOrder)}
                  style={{ backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="checkmark-circle-outline" size={13} color={C.jade} />
                  <Text style={{ color: C.jade, fontWeight: "600", fontSize: 12 }}>Close</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setScannerOpen(true)}
                style={{ backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="barcode-outline" size={15} color={C.gold} />
                <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>Scan</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Category filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8, flexDirection: "row" }}>
          {[{ id: "all", name: "All" }, ...categories].map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setActiveCategory(c.id)}
              style={{ paddingHorizontal: isTablet ? 20 : 14, paddingVertical: isTablet ? 10 : 6, borderRadius: 20, backgroundColor: activeCategory === c.id ? C.gold : C.surfaceHi }}
            >
              <Text style={{ fontSize: isTablet ? 15 : 13, fontWeight: "500", color: activeCategory === c.id ? C.void : C.mist }}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <TextInput
            style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.pearl }}
            placeholder="Search menu…"
            placeholderTextColor={C.smoke}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Menu grid */}
        <FlatList
          key={isTablet ? "3col" : "2col"}
          data={visible}
          keyExtractor={(m) => m.id}
          numColumns={isTablet ? 3 : 2}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item: m }) => {
            const inCart = cart.filter((c) => c.menuItemId === m.id).reduce((s, c) => s + c.quantity, 0);
            const soldOut = m.trackCount && m.countRemaining !== null && m.countRemaining <= 0;
            const lowCount = m.trackCount && m.countRemaining !== null && m.countRemaining > 0 && m.countRemaining <= 5;
            return (
              <TouchableOpacity
                onPress={() => !soldOut && handleMenuItemPress(m)}
                disabled={soldOut || modifierLoading}
                style={{ flex: 1, borderRadius: 12, borderWidth: 1, padding: isTablet ? 16 : 12, backgroundColor: soldOut ? C.surfaceHi : inCart > 0 ? T.gold : C.surface, borderColor: soldOut ? C.rim : inCart > 0 ? C.gold : C.rim, opacity: soldOut ? 0.5 : 1 }}
              >
                {inCart > 0 && !soldOut && (
                  <View style={{ position: "absolute", top: 8, right: 8, height: 20, width: 20, borderRadius: 10, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: C.void, fontSize: 10, fontWeight: "700" }}>{inCart}</Text>
                  </View>
                )}
                {soldOut && (
                  <View style={{ position: "absolute", top: 6, right: 6, backgroundColor: "#374151", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                    <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>SOLD OUT</Text>
                  </View>
                )}
                {lowCount && (
                  <View style={{ position: "absolute", top: 6, left: 6, backgroundColor: "#d97706", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                    <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>{m.countRemaining} left</Text>
                  </View>
                )}
                <Text style={{ fontSize: isTablet ? 15 : 13, fontWeight: "600", color: soldOut ? C.smoke : C.pearl, lineHeight: 18, paddingRight: inCart > 0 ? 20 : 0 }} numberOfLines={2}>
                  {m.name}
                </Text>
                <Text style={{ color: soldOut ? C.smoke : C.gold, fontWeight: "700", fontSize: isTablet ? 20 : 15, marginTop: 6 }}>
                  ${Number(m.price).toFixed(2)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Cart panel */}
        <View style={{ width: isTablet ? 288 : 176, backgroundColor: C.surface, borderLeftWidth: 1, borderColor: C.rim, flexDirection: "column" }}>
          <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Cart</Text>
            {cartCount > 0 && (
              <View style={{ backgroundColor: T.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                <Text style={{ color: C.gold, fontSize: 10, fontWeight: "700" }}>{cartCount}</Text>
              </View>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: 8 }}>
            {cart.length === 0 && (
              <Text style={{ fontSize: 11, color: C.smoke, textAlign: "center", marginTop: 24 }}>Empty</Text>
            )}
            {cart.map((item) => (
              <View key={item.cartKey} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: isTablet ? 13 : 11, fontWeight: "600", color: C.pearl, lineHeight: 16 }} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.notes && (
                      <Text style={{ fontSize: 10, color: C.mist, lineHeight: 14, marginTop: 1 }} numberOfLines={1}>{item.notes}</Text>
                    )}
                  </View>
                  {item.held && (
                    <Text style={{ fontSize: 10, fontWeight: "700", color: C.ember, lineHeight: 16 }}>HOLD</Text>
                  )}
                </View>
                <Text style={{ fontSize: 10, color: C.gold, fontWeight: "500" }}>
                  ${(item.price * item.quantity).toFixed(2)}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => updateQty(item.cartKey ?? item.menuItemId, -1)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
                    style={{ height: isTablet ? 32 : 24, width: isTablet ? 32 : 24, borderRadius: isTablet ? 16 : 12, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: isTablet ? 15 : 13, color: C.mist, lineHeight: isTablet ? 18 : 16 }}>−</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: isTablet ? 15 : 11, fontWeight: "700", width: 16, textAlign: "center", color: C.pearl }}>{item.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => updateQty(item.cartKey ?? item.menuItemId, 1)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    style={{ height: isTablet ? 32 : 24, width: isTablet ? 32 : 24, borderRadius: isTablet ? 16 : 12, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: isTablet ? 15 : 13, color: C.mist, lineHeight: isTablet ? 18 : 16 }}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => toggleHeld(item.cartKey ?? item.menuItemId)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                    style={{ marginLeft: "auto", height: 24, paddingHorizontal: 8, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: item.held ? T.ember : C.surfaceHi, borderWidth: 1, borderColor: item.held ? C.ember : C.rim }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: item.held ? C.ember : C.smoke }}>
                      Hold
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={{ padding: 12, borderTopWidth: 1, borderColor: C.rim, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: C.mist }}>Total</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>${subtotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              onPress={sendOrder}
              disabled={cart.length === 0 || sendMutation.isPending}
              style={{ borderRadius: 12, paddingVertical: isTablet ? 16 : 12, alignItems: "center", backgroundColor: cart.length === 0 ? C.surfaceHi : C.gold, ...(cart.length === 0 ? {} : shadow.gold) }}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator color={C.void} size="small" />
              ) : (
                <Text style={{ fontWeight: "700", fontSize: isTablet ? 13 : 11, color: cart.length === 0 ? C.smoke : C.void }}>
                  Send to Kitchen
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
