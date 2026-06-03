import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Single production backend. `extra.apiUrl` (app.json) is the only override —
// EXPO_PUBLIC_API_URL was removed because stale baked values (a dead localtunnel)
// took precedence and caused "Network request failed". Falls back to prod.
export const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "https://veraya.vercel.app";

export async function getHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("session_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "bypass-tunnel-reminder": "true",  // bypass localtunnel reminder page
  };
  if (token) {
    // Over HTTPS (Vercel) NextAuth uses the secure-prefixed cookie name; the
    // login response tells us which one to send. Default to the secure name
    // since we target the production https backend.
    const cookieName = (await SecureStore.getItemAsync("session_cookie_name")) ?? "__Secure-authjs.session-token";
    headers["Cookie"] = `${cookieName}=${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Auth
export const mobileLogin = (email: string, password: string) =>
  request<{ token: string; cookieName?: string; user: { id: string; name: string; email: string; role: string } }>(
    "/api/mobile/auth",
    { method: "POST", body: JSON.stringify({ email, password }) }
  );

// Tables
export const getTables = () => request<Table[]>("/api/tables");
export const createTable = (body: { number: number; capacity: number; shape?: string }) =>
  request<Table>("/api/tables", { method: "POST", body: JSON.stringify(body) });
export const deleteTable = (id: string) =>
  request<{ ok: boolean }>(`/api/tables/${id}`, { method: "DELETE" });
export const patchTable = (id: string, body: object) =>
  request<Table>(`/api/tables/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const saveLayout = (updates: { id: string; floorX: number; floorY: number; rotation: number; shape: string }[]) =>
  request<{ ok: boolean }>("/api/tables/layout", { method: "POST", body: JSON.stringify(updates) });

// Waitlist
export const getWaitlist = () => request<WaitlistEntry[]>("/api/waitlist");
export const createWaitlistEntry = (body: { name: string; partySize: number; phone?: string; notes?: string; customerId?: string }) =>
  request<WaitlistEntry>("/api/waitlist", { method: "POST", body: JSON.stringify(body) });
export const patchWaitlistEntry = (id: string, body: { status?: string; tableId?: string }) =>
  request<WaitlistEntry>(`/api/waitlist/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteWaitlistEntry = (id: string) =>
  request<void>(`/api/waitlist/${id}`, { method: "DELETE" });

// Reservations
export const getReservations = (date: string) =>
  request<Reservation[]>(`/api/reservations?date=${date}`);
export const getReservationsRange = (from: string, to: string) =>
  request<Reservation[]>(`/api/reservations?from=${from}&to=${to}`);
// Search reservations across all dates by guest name / phone / email.
export const searchReservations = (q: string) =>
  request<Reservation[]>(`/api/reservations?q=${encodeURIComponent(q)}`);
export const createReservation = (body: { date: string; time: string; partySize: number; name: string; phone?: string; email?: string; tableId?: string; notes?: string; customerId?: string }) =>
  request<Reservation>("/api/reservations", { method: "POST", body: JSON.stringify(body) });
export const patchReservation = (id: string, body: { status?: string; tableId?: string; notes?: string; time?: string; partySize?: number; name?: string; phone?: string | null; email?: string | null; customerId?: string | null }) =>
  request<Reservation>(`/api/reservations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteReservation = (id: string) =>
  request<void>(`/api/reservations/${id}`, { method: "DELETE" });
export const getCustomerReservations = (customerId: string) =>
  request<Reservation[]>(`/api/reservations?customerId=${customerId}`);

// Staff (servers list)
export const getStaff = () => request<StaffMember[]>("/api/staff");

// Orders
export const getOpenOrders = () => request<Order[]>("/api/orders?status=OPEN,IN_PROGRESS,READY");
export const getTableOrders = (tableId: string) => request<Order[]>(`/api/orders?tableId=${tableId}`);
export const createOrder = (body: object) =>
  request<Order>("/api/orders", { method: "POST", body: JSON.stringify(body) });
export const patchOrder = (id: string, body: object) =>
  request<Order>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// Kitchen / Bar — same endpoint, filtered by station (KITCHEN food, BAR drinks)
export const getKitchenOrders = (station: "KITCHEN" | "BAR" = "KITCHEN") =>
  request<Order[]>(`/api/kitchen?station=${station}`);
export const getBarOrders = () => getKitchenOrders("BAR");
export const kitchenAction = (body: object) =>
  request("/api/kitchen", { method: "PATCH", body: JSON.stringify(body) });

// Menu
export const getCategories = () => request<Category[]>("/api/categories");
export const getMenuItems = <T = MenuItem>() => request<T[]>("/api/menu");
export const barcodeSearch = (barcode: string) =>
  request<{
    barcode: string;
    valid?: boolean;
    local: Ingredient | null;
    external: { name: string; brand: string | null; category: string | null; quantity: string | null } | null;
    source?: string | null;
    suggestions: Ingredient[];
    aiFallback?: boolean;
  }>(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`);

// Inventory
export const getInventory = () =>
  request<InventoryItem[]>("/api/inventory");
export const patchInventoryItem = (id: string, body: { quantity?: number; minThreshold?: number; maxThreshold?: number | null; storageArea?: string | null; shelfOrder?: number | null }) =>
  request<InventoryItem>(`/api/inventory/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const saveShelfOrder = (updates: { id: string; storageArea: string | null; shelfOrder: number | null }[]) =>
  request<{ ok: boolean }>("/api/inventory/reorder", { method: "POST", body: JSON.stringify(updates) });

// Storage Areas
export const getStorageAreas = () => request<StorageArea[]>("/api/storage-areas");
export const createStorageArea = (name: string) =>
  request<StorageArea>("/api/storage-areas", { method: "POST", body: JSON.stringify({ name }) });
export const patchStorageArea = (id: string, body: { name?: string; sortOrder?: number }) =>
  request<StorageArea>(`/api/storage-areas/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteStorageArea = (id: string) =>
  request<{ ok: boolean }>(`/api/storage-areas/${id}`, { method: "DELETE" });

// Purchase Orders
export const getPurchaseOrders = () =>
  request<PurchaseOrder[]>("/api/purchase-orders");
export const getPurchaseOrder = (id: string) =>
  request<PurchaseOrder>(`/api/purchase-orders/${id}`);
export const patchPurchaseOrder = (id: string, body: object) =>
  request<PurchaseOrder>(`/api/purchase-orders/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deletePurchaseOrder = (id: string) =>
  request<{ ok: boolean }>(`/api/purchase-orders/${id}`, { method: "DELETE" });

// Suppliers & Ingredients
export const getSuppliers = () => request<Supplier[]>("/api/suppliers");
export const getIngredients = () => request<IngredientFull[]>("/api/ingredients");
export const createIngredient = (body: {
  name: string; unit: string; costPerUnit: number;
  supplierId?: string | null; minThreshold?: number; barcode?: string;
}) => request<IngredientFull>("/api/ingredients", { method: "POST", body: JSON.stringify(body) });
export const createPurchaseOrder = (body: object) =>
  request<PurchaseOrder>("/api/purchase-orders", { method: "POST", body: JSON.stringify(body) });

// Customers
export const searchCustomers = (q: string) =>
  request<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}`);
export const getCustomer = (id: string) =>
  request<Customer>(`/api/customers/${id}`);
export const createCustomer = (body: { name: string; phone?: string; email?: string; birthday?: string; notes?: string; tags?: string }) =>
  request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(body) });
export const patchCustomer = (id: string, body: Partial<{ name: string; phone: string | null; email: string | null; birthday: string | null; notes: string | null; tags: string | null }>) =>
  request<Customer>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteCustomer = (id: string) =>
  request<void>(`/api/customers/${id}`, { method: "DELETE" });

// ── Duplicate-profile review & merge (mirrors web Guest Profiles) ──────────────
export interface DuplicateMember { id: string; name: string; phone: string | null; email: string | null; visitCount?: number; loyaltyPoints?: number }
export interface DuplicateGroup { confidence: "high" | "possible"; reason: string; primaryId: string; members: DuplicateMember[] }
export const getCustomerDuplicates = () =>
  request<{ groups: DuplicateGroup[] }>("/api/customers/duplicates");
export const mergeCustomers = (primaryId: string, duplicateIds: string[]) =>
  request<{ ok: boolean }>("/api/customers/merge", { method: "POST", body: JSON.stringify({ primaryId, duplicateIds }) });

// Vision / AI photo identification
export const visionIdentify = (image: string) =>
  request<VisionResult>("/api/vision", { method: "POST", body: JSON.stringify({ image }) });

// Schedule
export const getSchedule = (from: string, to: string) =>
  request<Shift[]>(`/api/schedule?from=${from}&to=${to}`);
export const createShift = (body: {
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  position?: string;
  notes?: string;
}) => request<Shift>("/api/schedule", { method: "POST", body: JSON.stringify(body) });
export const patchShift = (id: string, body: object) =>
  request<Shift>(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteShift = (id: string) =>
  request<void>(`/api/schedule/${id}`, { method: "DELETE" });
export const publishSchedule = (date: string) =>
  request<{ count: number }>("/api/schedule/publish", {
    method: "POST",
    body: JSON.stringify({ date }),
  });

// Time Clock
export const getActiveClockIns = () => request<ClockEntryWithUser[]>("/api/timeclock");
export const clockAction = (body: { userId: string; action: "IN" | "OUT"; notes?: string }) =>
  request<ClockEntry>("/api/timeclock", { method: "POST", body: JSON.stringify(body) });
export const getClockHistory = (userId: string, from: string, to: string) =>
  request<ClockEntry[]>(`/api/timeclock/history?userId=${userId}&from=${from}&to=${to}`);

// ── Pre-shift briefing (mirrors web Reports → Pre-Shift) ───────────────────────
export interface PreShiftFlag { label: string; kind: "positive" | "watch" | "info" }
export interface PreShiftInsights {
  visits: number; lastVisitAt: string | null; avgCheckCents: number;
  avgDwellMins: number | null; favoriteItems: { name: string; count: number }[];
  avgTipPct: number | null; tippedOrders: number;
}
export interface PreShiftEntry {
  id: string; time: string; name: string; partySize: number;
  tableNumber: number | null; status: string; notes: string | null;
  guestNotes: string | null; insights: PreShiftInsights | null; flags: PreShiftFlag[];
}
export interface PreShift {
  date: string;
  summary: { parties: number; covers: number; vip: number; watch: number; ppx: number };
  entries: PreShiftEntry[];
}
export const getPreShift = (date: string) =>
  request<PreShift>(`/api/reports/pre-shift?date=${date}`);
// Manager/admin punch edit — a non-empty reason is mandatory and audited.
export const editClockEntry = (id: string, body: { clockIn?: string; clockOut?: string | null; reason: string }) =>
  request<ClockEntry>(`/api/timeclock/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// Full staff (with hourlyRate, isActive, createdAt)
export const getFullStaff = () => request<StaffMember[]>("/api/staff");
export const createStaff = (body: object) =>
  request<StaffMember>("/api/staff", { method: "POST", body: JSON.stringify(body) });
export const patchStaff = (id: string, body: object) =>
  request<StaffMember>(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// Dashboard
export const getDashboardStats = () => request<DashboardStats>("/api/dashboard/stats");

// Settings
export const getSettings = () => request<Record<string, string>>("/api/settings");
export const saveSettings = (body: Record<string, string>) =>
  request<{ ok: boolean }>("/api/settings", { method: "POST", body: JSON.stringify(body) });

// ── Types (minimal shapes matching the backend) ────────────────────────────

export interface Table {
  id: string; number: number; capacity: number; status: string;
  serviceStage: string | null; floorX: number | null; floorY: number | null;
  rotation: number; shape: string;
  seatedAt: string | null; guestName: string | null; partySize: number | null;
  serverId: string | null; server: { id: string; name: string } | null;
}

export interface Customer {
  id: string; name: string; phone: string | null; email: string | null;
  birthday: string | null; notes: string | null; tags: string | null;
  visitCount: number; lastVisitAt: string | null; loyaltyPoints: number;
  createdAt: string; updatedAt: string;
}

export interface WaitlistEntry {
  id: string; name: string; partySize: number; phone: string | null;
  notes: string | null; status: string; addedAt: string; seatedAt: string | null;
  tableId: string | null; customerId: string | null;
}

export interface Reservation {
  id: string; date: string; time: string; partySize: number; name: string;
  phone: string | null; email: string | null; tableId: string | null;
  customerId: string | null; notes: string | null; status: string; createdAt: string;
  requiresCard: boolean; cardLast4: string | null; cardBrand: string | null;
  cardHoldAmount: string | null; stripePaymentIntentId: string | null;
  table: { id: string; number: number } | null;
  customer: { id: string; name: string; phone: string | null; visitCount: number; loyaltyPoints: number } | null;
}

export interface StaffMember {
  id: string; name: string; email: string; role: string; isActive: boolean;
  hourlyRate: string | null; createdAt: string;
  employmentType?: string; annualSalary?: string | null; hasManagerPin?: boolean;
}

export interface Shift {
  id: string; userId: string; date: string; startTime: string; endTime: string;
  position: string | null; notes: string | null; isPublished: boolean;
  publishedAt: string | null; createdAt: string;
  user: { id: string; name: string; role: string };
}

export interface ClockEntry {
  id: string; userId: string; clockIn: string; clockOut: string | null;
  notes: string | null; createdAt: string;
}

export interface ClockEntryWithUser extends ClockEntry {
  user: { id: string; name: string; role: string };
}

export interface Category { id: string; name: string }

export interface ModifierOption {
  id: string; name: string; price: string; sortOrder: number;
}
export interface Modifier {
  id: string; name: string; menuItemId: string | null;
  isRequired: boolean; maxSelect: number; sortOrder: number;
  options: ModifierOption[];
}

export const getModifiers = (menuItemId: string) =>
  request<Modifier[]>(`/api/modifiers?menuItemId=${menuItemId}`);

export interface MenuItem {
  id: string; name: string; description: string | null;
  price: string; categoryId: string; prepTime: number | null; imageUrl: string | null;
  trackCount: boolean; countRemaining: number | null;
}

export interface Ingredient { id: string; name: string; unit: string; barcode: string | null }

export interface Supplier {
  id: string; name: string; contactName: string | null;
  email: string | null; phone: string | null;
}

export interface IngredientFull {
  id: string; name: string; unit: string;
  barcode: string | null; costPerUnit: string | null;
  supplier: { id: string; name: string } | null;
  inventoryItem: { quantity: number; minThreshold: number } | null;
}

export interface VisionResult {
  identified: {
    name: string; brand: string | null; type: string;
    searchTerms: string[]; confidence: "high" | "medium" | "low";
  };
  matches: IngredientFull[];
}

export interface InventoryItem {
  id: string; quantity: number; minThreshold: number; maxThreshold: number | null;
  storageArea: string | null; shelfOrder: number | null;
  ingredient: { id: string; name: string; unit: string };
}

export interface StorageArea {
  id: string; name: string; sortOrder: number; createdAt: string;
}

export interface OrderItem {
  id: string; quantity: number; unitPrice: number; course: number;
  heldForFire: boolean; voided: boolean; comped: boolean;
  firedAt: string | null; sentAt: string | null; completedAt: string | null;
  menuItem: { name: string; category: { id: string; name: string } };
}

export interface Order {
  id: string; status: string; type: string;
  subtotal: number; tax: number; total: number;
  tableId: string | null; table: { number: number } | null;
  items: OrderItem[];
  payments: { id: string; amount: number; method: string; tip: number }[];
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string; quantity: number; unitCost: number;
  ingredient: { id: string; name: string; unit: string; barcode: string | null };
}

export interface PurchaseOrder {
  id: string; status: string; totalAmount: number;
  invoiceNumber: string | null; invoiceImageUrl: string | null; notes: string | null;
  orderedAt: string | null; receivedAt: string | null; createdAt: string;
  vendor: { id: string; name: string };
  items: PurchaseOrderItem[];
}

export interface DashboardStats {
  salesTotal: number; salesCount: number; openOrders: number;
  lowStockCount: number; menuItemCount: number;
}

// Events / Catering
export const getEvents = () => request<CalEvent[]>("/api/events");
export const createEvent = (body: object) => request<CalEvent>("/api/events", { method: "POST", body: JSON.stringify(body) });
export const patchEvent = (id: string, body: object) => request<CalEvent>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteEvent = (id: string) => request<void>(`/api/events/${id}`, { method: "DELETE" });

// Gift Cards
export const getGiftCards = () => request<GiftCard[]>("/api/gift-cards");
export const createGiftCard = (body: object) => request<GiftCard>("/api/gift-cards", { method: "POST", body: JSON.stringify(body) });
export const lookupGiftCard = (code: string) => request<GiftCard>(`/api/gift-cards/${code}`);
export const giftCardAction = (code: string, body: object) => request<GiftCard>(`/api/gift-cards/${code}`, { method: "PATCH", body: JSON.stringify(body) });

// Loyalty
export const getLoyalty = (customerId: string) => request<LoyaltyInfo>(`/api/loyalty?customerId=${customerId}`);
export const loyaltyAction = (body: object) => request<LoyaltyInfo>("/api/loyalty", { method: "POST", body: JSON.stringify(body) });

export interface CalEvent {
  id: string; name: string; date: string; startTime: string; endTime: string | null;
  guestCount: number | null; contactName: string; contactPhone: string | null; contactEmail: string | null;
  venue: string | null; status: string; notes: string | null; menuNotes: string | null;
  depositAmount: number | null; depositPaid: boolean; totalAmount: number | null;
  customerId: string | null; customer: { id: string; name: string; phone: string | null } | null;
  createdAt: string;
}

export interface GiftCard {
  id: string; code: string; initialBalance: number; balance: number; isActive: boolean;
  recipientName: string | null; recipientEmail: string | null; message: string | null;
  customerId: string | null;
  transactions: { id: string; amount: number; type: string; createdAt: string }[];
}

export interface LoyaltyInfo {
  customerId: string; points: number;
  transactions: { id: string; points: number; type: string; reason: string | null; createdAt: string }[];
}

// Reports
export const getSalesReport = (from: string, to: string) =>
  request<SalesReport>(`/api/reports/sales?from=${from}&to=${to}`);
export const getLaborReport = (from: string, to: string) =>
  request<LaborReport>(`/api/reports/labor?from=${from}&to=${to}`);
export const getFoodCostReport = (from: string, to: string) =>
  request<FoodCostReport>(`/api/reports/food-cost?from=${from}&to=${to}`);

export interface SalesReport {
  totalRevenue: number; totalOrders: number; avgOrderValue: number; totalTips: number;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  revenueByCategory: { categoryId: string; name: string; revenue: number; count: number }[];
  revenueByHour: { hour: number; revenue: number; orders: number }[];
  topItems: { menuItemId: string; name: string; revenue: number; count: number }[];
}
export interface LaborReport {
  totalHours: number; totalLaborCost: number;
  byEmployee: { userId: string; name: string; role: string; hours: number; cost: number }[];
}
export interface FoodCostReport {
  totalFoodCost: number; wastedCost: number; foodCostPct: number;
  byIngredient: { ingredientId: string; name: string; unit: string; usedQty: number; wastedQty: number; cost: number }[];
}

// ── Vera (intelligence) ──────────────────────────────────────────────────────────

export interface VeraAlert {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "SALES" | "LABOR" | "INVENTORY" | "COSTS" | "RESERVATIONS" | "OPERATIONS";
  message: string;
  link: string;
}

export type VeraStatus = "excellent" | "good" | "fair" | "strained" | "critical";
export interface VeraHealthMetric { label: string; value: string; target?: string; status: VeraStatus }
export interface VeraHealthIssue { severity: "HIGH" | "MEDIUM" | "LOW"; message: string; impact?: string; action?: string; link?: string }
export interface VeraDimension {
  key: string; label: string; score: number; status: VeraStatus; confidence: number;
  summary: string; metrics: VeraHealthMetric[]; wins: string[]; issues: VeraHealthIssue[];
}
export interface VeraProjection {
  expectedRevenue: number | null; projectedRevenue: number; salesToday: number;
  projectedCOGS: number; projectedLabor: number; fixedDaily: number;
  projectedNet: number; projectedMarginPct: number;
  breakEvenRevenue: number; breakEvenProgressPct: number | null;
  serviceElapsedPct: number; inService: boolean;
}

export interface VeraIndicator { tone: "positive" | "concern" | "neutral"; text: string; key: string }

export const sendVeraFeedback = (key: string, action: "dismissed" | "helpful", text?: string) =>
  request("/api/vera/feedback", { method: "POST", body: JSON.stringify({ key, action, text }) });

export interface VeraData {
  healthScore: number;
  status?: VeraStatus;
  confidence?: number;
  headline?: string;
  narrative: string;
  projection?: VeraProjection;
  dimensions?: VeraDimension[];
  indicators?: VeraIndicator[];
  learning?: { daysObserved: number; minDays: number; learning: boolean; topDrivers: { key: string; label: string; weight: number; corr: number | null }[] };
  alerts: VeraAlert[];
  rawSignals: {
    salesToday: number;
    refSales: number;
    pacingRatio: number | null;
    laborSoFar: number;
    projectedLaborPct: number | null;
    lowStockCount: number;
    active86Count: number;
    voidTotal: number;
    confirmedCovers: number;
  };
}

export const getVeraData = () => request<VeraData>("/api/vera");

// Forecast (tonight projection + prep)
export interface VeraForecast {
  projectedSales: number;
  projectedCovers: number;
  reservedCovers: number;
  sampleCount: number;
  dowName: string;
  confidence: "low" | "medium" | "high";
  prep: { name: string; suggestedQty: number; basis: string }[];
  narrative: string;
}
export const getVeraForecast = () => request<VeraForecast>("/api/vera/forecast");

// Anomalies ("Vera caught")
export interface VeraAnomaly { type: string; severity: "HIGH" | "MEDIUM"; title: string; link: string }
export const getVeraAnomalies = () => request<{ anomalies: VeraAnomaly[] }>("/api/vera/anomalies");

// Predicted run-outs
export interface VeraPrediction {
  name: string;
  unit: string;
  estimatedRunsOut: string | null;
  hoursUntilMin: number | null;
  severity: "out" | "critical" | "warn" | "ok";
  affectedMenuItems: string[];
  affected: { id: string; name: string }[];
}
export const getPredictedRunouts = () =>
  request<{ predictions: VeraPrediction[]; summary: { criticalCount: number; warnCount: number; totalAtRisk: number } }>("/api/eightysix/predicted");

// First-run setup status
export interface VeraSetupStep { key: string; label: string; done: boolean; href: string; hint: string }
export const getVeraSetup = () =>
  request<{ steps: VeraSetupStep[]; doneCount: number; total: number; complete: boolean }>("/api/vera/setup");

// Ask Vera (natural-language analysis over a period)
export interface VeraAnswer {
  answer: string;
  dataPoints: { label: string; value: string; context: string; positive: boolean }[];
  followUps: string[];
  aiPowered: boolean;
}
export const askVera = (question: string, from: string, to: string) =>
  request<VeraAnswer>("/api/reports/ask", { method: "POST", body: JSON.stringify({ question, from, to }) });

// ── Ingredient Import ─────────────────────────────────────────────────────────

export interface ExtractedIngredient {
  name: string;
  brand: string | null;
  suggestedUnit: string;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

export interface RecipeSuggestion {
  ingredientId: string;
  ingredientName: string;
  menuItems: { id: string; name: string; category: string; reason?: string }[];
}

export const importIngredientsFromPhoto = (image: string) =>
  request<{ ingredients: ExtractedIngredient[]; count: number }>(
    "/api/ingredients/import-photo",
    { method: "POST", body: JSON.stringify({ image }) }
  );

// Full supplier-invoice extraction (vendor + line items + totals validation).
export interface ExtractedInvoiceLine {
  description: string;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  lineTotal: number | null;
  matchedIngredientId: string | null;
  matchedIngredientName: string | null;
}
export interface ExtractedInvoice {
  vendor: string | null;
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: ExtractedInvoiceLine[];
  matchedCount: number;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  computedTotal: number;
  totalsMatch: boolean | null;
}
export const extractInvoice = (image: string) =>
  request<ExtractedInvoice>("/api/invoices/extract", { method: "POST", body: JSON.stringify({ image }) });

// AI parse of a spoken inventory count, grounded to candidate items.
export const parseSpokenCount = (transcript: string, items: { id: string; name: string; unit: string }[]) =>
  request<{ results: { ingredientId: string; name: string; quantity: number; unit: string }[]; aiPowered: boolean }>(
    "/api/inventory/parse-count",
    { method: "POST", body: JSON.stringify({ transcript, items }) },
  );

export const barcodeLookupIngredient = (barcode: string) =>
  request<{
    barcode: string;
    valid?: boolean;
    local: Ingredient | null;
    external: { name: string; brand: string | null; category: string | null; quantity: string | null } | null;
    source?: string | null;
    suggestions: Ingredient[];
    aiFallback?: boolean;
  }>(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`);

export const suggestRecipeAdditions = (ingredientIds: string[]) =>
  request<{ suggestions: RecipeSuggestion[]; aiPowered: boolean }>(
    "/api/ingredients/suggest-additions",
    { method: "POST", body: JSON.stringify({ ingredientIds }) }
  );

// ── Shift Handoff ─────────────────────────────────────────────────────────────

export interface HandoffDigest {
  period: { from: string; to: string; hours: number };
  sales: {
    total: number;
    orderCount: number;
    avgCheck: number;
    topItems: { name: string; qty: number }[];
    voids: number;
  };
  labor: {
    clockedIn: { name: string; role: string; since: string }[];
    recentlyOut: { name: string; role: string; duration: string }[];
  };
  kitchen: { eightySixed: { item: string; reason: string | null }[] };
  inventory: { lowStock: { name: string; qty: number; unit: string; par: number }[] };
  reservations: { upcoming: { time: string; name: string; partySize: number; notes: string | null }[] };
  logEntries: { type: string; shift: string | null; title: string; severity: string | null; followUp: string | null }[];
  watchFor: string[];
  narrative: string;
  aiPowered: boolean;
}

export const getShiftHandoff = (hours = 8) =>
  request<HandoffDigest>("/api/shifts/handoff", {
    method: "POST",
    body: JSON.stringify({ hours }),
  });

export const sendShiftHandoff = (to: string, digest: HandoffDigest) =>
  request<{ ok: boolean; sid?: string }>("/api/shifts/handoff/send", {
    method: "POST",
    body: JSON.stringify({ to, digest }),
  });

// ── Ordering Recommendations ───────────────────────────────────────────────────

export interface RecommendedItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentQty: number;
  parQty: number;
  maxQty: number | null;
  recommendedOrderQty: number;
  dailyUsage: number | null;
  daysUntilOut: number | null;
  urgency: "OUT" | "CRITICAL" | "LOW" | "UPCOMING";
  supplierId: string | null;
  supplierName: string | null;
  lastUnitCost: number | null;
  estimatedCost: number | null;
}

export interface OrderRecommendations {
  suggestions: RecommendedItem[];
  bySupplier: {
    supplierId: string | null;
    supplierName: string;
    items: RecommendedItem[];
    totalEstimatedCost: number;
  }[];
  totalEstimatedCost: number;
  aiPowered: boolean;
  summary: string;
}

export const getOrderRecommendations = (daysAhead = 7) =>
  request<OrderRecommendations>(`/api/purchase-orders/recommend?daysAhead=${daysAhead}`);

// ── Staff Notes ────────────────────────────────────────────────────────────────

export interface StaffNote {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

export const getStaffNotes = (userId: string) =>
  request<StaffNote[]>(`/api/staff/${userId}/notes`);

export const createStaffNote = (userId: string, body: string) =>
  request<StaffNote>(`/api/staff/${userId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const deleteStaffNote = (userId: string, noteId: string) =>
  request<{ ok: boolean }>(`/api/staff/${userId}/notes?noteId=${noteId}`, {
    method: "DELETE",
  });

// ── Scheduling Analysis ────────────────────────────────────────────────────────

export interface SchedulingAnalysis {
  summary: {
    scheduledHours: number;
    actualHours: number;
    scheduledLaborCost: number;
    actualLaborCost: number;
    revenue: number;
    laborPct: number;
    salesPerLaborHour: number;
  };
  dailyAnalysis: {
    date: string;
    revenue: number;
    scheduledHours: number;
    actualHours: number;
    scheduledLaborCost: number;
    actualLaborCost: number;
    laborPct: number;
  }[];
  dowOptimal: {
    dow: string;
    dowIndex: number;
    avgRevenue: number;
    avgLaborCost: number;
    avgLaborPct: number;
    suggestedStaff: number;
  }[];
  overtimeAlerts: {
    userId: string;
    name: string;
    role: string;
    weekHours: number;
    overtimeHours: number;
  }[];
  roleBreakdown: {
    role: string;
    headcount: number;
    scheduledHours: number;
    actualHours: number;
    laborCost: number;
    laborPct: number;
  }[];
  staffBreakdown: {
    userId: string;
    name: string;
    role: string;
    scheduledHours: number;
    actualHours: number;
    laborCost: number;
    overtimeHours: number;
  }[];
}

export const getSchedulingAnalysis = (from: string, to: string) =>
  request<SchedulingAnalysis>(`/api/reports/scheduling?from=${from}&to=${to}`);

// ── COGS / P&L ─────────────────────────────────────────────────────────────────

export interface CogsReport {
  revenue: number;
  theoreticalCOGS: number;
  cogsPercent: number;
  actualIngredientSpend: number;
  laborCost: number;
  laborPercent: number;
  salaryCost: number;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  operatingMargin: number;
  prevRevenue: number;
  prevCOGS: number;
  prevLaborCost: number;
  prevSalaryCost: number;
  prevGrossProfit: number;
  prevGrossMargin: number;
  prevOperatingIncome: number;
  prevOperatingMargin: number;
  categoryBreakdown: {
    category: string;
    revenue: number;
    cogs: number;
    costPct: number;
  }[];
  dailyPL: {
    date: string;
    revenue: number;
    cogs: number;
    laborCost: number;
    grossProfit: number;
  }[];
}

export const getCogsReport = (from: string, to: string) =>
  request<CogsReport>(`/api/reports/cogs?from=${from}&to=${to}`);

// ── P&L line-item statement (mirrors the web statement) ─────────────────────────

export interface PnlRow {
  key: string;
  label: string;
  indent: number;
  kind: "header" | "line" | "subtotal" | "metric";
  input?: "auto" | "manual";
  emphasize?: boolean;
  isPercentOfSelf?: boolean;
  value: number;
  pct: number | null;
}
export interface PnlBonus {
  enabled: boolean;
  bonus: number;
  rawBonus: number;
  target: number;
  peBeforeBonus: number;
  overage: number;
  modifier: number;
  capped: boolean;
}
export interface PnlStatementResponse {
  from: string;
  to: string;
  periodKey: string;
  rows: PnlRow[];
  bonus: PnlBonus | null;
}
export const getPnlStatement = (from: string, to: string) =>
  request<PnlStatementResponse>(`/api/reports/pnl?from=${from}&to=${to}`);

// ── Beverage Cost ──────────────────────────────────────────────────────────────

export interface BevCostItem {
  id: string;
  ingredientId: string;
  name: string;
  category: string;
  bottleSizeMl: number;
  pourSizeMl: number;
  producer: string | null;
  vintage: string | null;
  abv: number | null;
  poursPerBottle: number;
  costPerBottle: number;
  costPerPour: number;
  pourCostPct: number;
  avgMenuPrice: number;
  currentQty: number;
  currentValueBottles: number;
  theoreticalPours: number;
  actualPours: number;
  variance: number;
  varianceCost: number;
  menuItems: { menuItemId: string; name: string; price: number; quantityPerServing: number }[];
}

export const getBevCostReport = (from: string, to: string) =>
  request<BevCostItem[]>(`/api/reports/beverage-cost?from=${from}&to=${to}`);

// ── Vendor Price History ───────────────────────────────────────────────────────

export interface PriceHistoryEntry {
  ingredientId: string;
  name: string;
  unit: string;
  currentCostPerUnit: number;
  firstCost: number;
  lastCost: number;
  minCost: number;
  maxCost: number;
  avgCost: number;
  changePct: number;
  trend: "up" | "down" | "stable";
  pricePoints: { date: string; cost: number; supplier: string }[];
  suppliers: { supplierId: string; name: string; lastCost: number; ordersCount: number; totalQty: number }[];
}

export interface PriceHistoryReport {
  lookbackDays: number;
  summary: { totalIngredients: number; risingCount: number; fallingCount: number; alertCount: number };
  rows: PriceHistoryEntry[];
}

export const getPriceHistory = (days = 180) =>
  request<PriceHistoryReport>(`/api/reports/price-history?days=${days}`);

// ── Training ───────────────────────────────────────────────────────────────────

export interface TrainingItem {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

export interface TrainingTemplate {
  id: string;
  name: string;
  role: string | null;
  sortOrder: number;
  items: TrainingItem[];
}

export interface TrainingSignoff {
  id: string;
  assignmentId: string;
  itemId: string;
  signedOffBy: string;
  notes: string | null;
  signedOffAt: string;
  manager: { id: string; name: string };
}

export interface TrainingAssignment {
  id: string;
  userId: string;
  templateId: string;
  assignedAt: string;
  dueDate: string | null;
  completedAt: string | null;
  user: { id: string; name: string; role: string };
  assigner: { id: string; name: string };
  template: TrainingTemplate;
  signoffs: TrainingSignoff[];
}

export const getTrainingTemplates = () =>
  request<TrainingTemplate[]>("/api/training/templates");

export const getTrainingAssignments = () =>
  request<TrainingAssignment[]>("/api/training/assignments");

export const createTrainingAssignment = (userId: string, templateId: string, dueDate?: string) =>
  request<TrainingAssignment>("/api/training/assignments", {
    method: "POST",
    body: JSON.stringify({ userId, templateId, dueDate }),
  });

export const signOffTrainingItem = (assignmentId: string, itemId: string, notes?: string) =>
  request<TrainingSignoff>("/api/training/signoffs", {
    method: "POST",
    body: JSON.stringify({ assignmentId, itemId, notes }),
  });

// ── 86 List ────────────────────────────────────────────────────────────────────

export interface EightySixItem {
  id: string;
  menuItemId: string;
  reason: string | null;
  createdAt: string;
  menuItem: { id: string; name: string };
}

export const getEightySix = () =>
  request<EightySixItem[]>("/api/eightysix");

export const addEightySix = (menuItemId: string, reason?: string) =>
  request<EightySixItem>("/api/eightysix", {
    method: "POST",
    body: JSON.stringify({ menuItemId, reason }),
  });

export const removeEightySix = (menuItemId: string) =>
  request<{ ok: boolean }>("/api/eightysix", {
    method: "DELETE",
    body: JSON.stringify({ menuItemId }),
  });

// ── Prep List ──────────────────────────────────────────────────────────────────

export interface PrepListResult {
  targetDate: string;
  targetDOW: string;
  weeksAnalyzed: number;
  coverFactor: number;
  confirmedCovers: number;
  avgHistoricalOrders: number;
  forecastItems: {
    menuItemId: string;
    name: string;
    category: string;
    avgQty: number;
    historicalQty: number;
    weeksTracked: number;
  }[];
  prepRows: {
    ingredientId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    forecastQty: number;
    currentOnHand: number;
    minThreshold: number;
    prepNeeded: number;
    menuItems: string[];
  }[];
  summary: {
    totalItemsToPrep: number;
    totalForecastCost: number;
    totalIngredients: number;
    reservationCount: number;
  };
}

export const getPrepList = (date?: string) =>
  request<PrepListResult>(`/api/prep-list${date ? `?date=${date}` : ""}`);

// ── Manager Log ────────────────────────────────────────────────────────────────

export interface ManagerLogEntry {
  id: string;
  type: string;
  shift: string | null;
  title: string;
  body: string;
  severity: string | null;
  staffIds: string | null;
  followUp: string | null;
  openingBank: number | null;
  closingBank: number | null;
  totalDrop: number | null;
  discrepancy: number | null;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

export const getManagerLog = (type?: string) =>
  request<ManagerLogEntry[]>(`/api/manager-log${type ? `?type=${type}` : ""}`);

export const createManagerLogEntry = (entry: {
  type: string;
  title: string;
  body: string;
  shift?: string;
  severity?: string;
  followUp?: string;
  openingBank?: number;
  closingBank?: number;
  totalDrop?: number;
  discrepancy?: number;
}) =>
  request<ManagerLogEntry>("/api/manager-log", {
    method: "POST",
    body: JSON.stringify(entry),
  });

// ── Inventory Variance ─────────────────────────────────────────────────────────

export interface VarianceReport {
  period: { from: string; to: string };
  summary: {
    totalTheoreticalCost: number;
    totalVarianceCost: number;
    alertCount: number;
    warnCount: number;
    hasAnyActualData: boolean;
    ingredientsTracked: number;
    ordersAnalyzed: number;
  };
  rows: {
    ingredientId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    theoreticalQty: number;
    actualUsedQty: number;
    poReceivedQty: number;
    currentOnHand: number;
    minThreshold: number;
    hasActualData: boolean;
    variance: number;
    variancePct: number;
    varianceCost: number;
    severity: "ok" | "warn" | "alert";
  }[];
}

export const getVarianceReport = (from: string, to: string) =>
  request<VarianceReport>(`/api/reports/variance?from=${from}&to=${to}`);

// ── Create POs from Reorder Suggestions ───────────────────────────────────────

export interface CreatedPOsResult {
  purchaseOrders: { id: string; supplierName: string; itemCount: number; total: number }[];
  totalOrders: number;
}

export const createPOsFromSuggestions = (
  items: { ingredientId: string; qty: number; supplierId: string | null; unitCost: number | null }[]
) =>
  request<CreatedPOsResult>("/api/purchase-orders/from-suggestions", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
