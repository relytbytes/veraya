import { create } from "zustand";

export interface CartItem {
  /** Unique key — defaults to menuItemId, but modifier combos get a longer key. */
  cartKey?: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  /** IDs of selected modifier options */
  modifierOptionIds?: string[];
  held?: boolean;
}

interface CartState {
  items: CartItem[];
  tableId: string | null;
  orderType: "DINE_IN" | "TAKEOUT";
  setTable: (id: string | null) => void;
  setOrderType: (t: "DINE_IN" | "TAKEOUT") => void;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  updateQty: (cartKey: string, delta: number) => void;
  toggleHeld: (cartKey: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  tableId: null,
  orderType: "DINE_IN",
  setTable: (tableId) => set({ tableId }),
  setOrderType: (orderType) => set({ orderType }),
  addItem: (item) =>
    set((s) => {
      const key = item.cartKey ?? item.menuItemId;
      const existing = s.items.find((c) => c.cartKey === key);
      if (existing) {
        return { items: s.items.map((c) => c.cartKey === key ? { ...c, quantity: c.quantity + 1 } : c) };
      }
      return { items: [...s.items, { ...item, cartKey: key, quantity: 1 }] };
    }),
  updateQty: (cartKey, delta) =>
    set((s) => ({
      items: s.items
        .map((c) => c.cartKey === cartKey ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0),
    })),
  toggleHeld: (cartKey) =>
    set((s) => ({
      items: s.items.map((c) => c.cartKey === cartKey ? { ...c, held: !c.held } : c),
    })),
  clear: () => set({ items: [], tableId: null }),
}));
