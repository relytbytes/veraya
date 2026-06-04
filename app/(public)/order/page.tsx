"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  loadStripe,
  type StripeElementsOptions,
} from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { ShoppingCart, Plus, Minus, Trash2, Loader2, ChevronRight } from "lucide-react";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItemData {
  id: string;
  name: string;
  description?: string;
  price: string;
  prepTime?: number;
}

interface Category {
  id: string;
  name: string;
  menuItems: MenuItemData[];
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

// ─── Checkout form (mounted inside <Elements>) ────────────────────────────────

function CheckoutForm({
  total,
  orderId,
  onBack,
}: {
  total: number;
  orderId: string;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setPaying(true);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/confirmation/${orderId}`,
      },
    });

    // If we get here, confirmPayment redirects on success — an error occurred
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Please try again.");
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to cart
        </button>
        <button
          type="submit"
          disabled={!stripe || paying}
          className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center gap-2 transition-colors"
        >
          {paying && <Loader2 className="h-4 w-4 animate-spin" />}
          Pay ${total.toFixed(2)}
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = "menu" | "guest" | "payment";

export default function OrderPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>("menu");
  const [guest, setGuest] = useState({ name: "", phone: "", notes: "" });
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<{
    clientSecret: string;
    orderId: string;
    total: number;
    elementsOptions: StripeElementsOptions;
  } | null>(null);

  useEffect(() => {
    fetch("/api/public/menu")
      .then((r) => r.json())
      .then(setCategories)
      .finally(() => setLoadingMenu(false));
  }, []);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = subtotal * 0.0875;
  const total = subtotal + tax;

  function addItem(item: MenuItemData) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  function removeItem(menuItemId: string) {
    setCart((prev) =>
      prev
        .map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  function deleteItem(menuItemId: string) {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  }

  function getQty(menuItemId: string) {
    return cart.find((c) => c.menuItemId === menuItemId)?.quantity ?? 0;
  }

  const placeOrder = useCallback(async () => {
    setPlaceError(null);
    setPlacing(true);
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guest.name,
          guestPhone: guest.phone,
          notes: guest.notes || undefined,
          items: cart.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = "Failed to place order";
        try {
          const d = JSON.parse(text);
          if (d.error) msg = d.error;
        } catch {
          // body wasn't JSON — use generic message
        }
        throw new Error(msg);
      }
      const data: { orderId: string; clientSecret: string; total: number } = await res.json();
      setCheckoutData({
        orderId: data.orderId,
        clientSecret: data.clientSecret,
        total: data.total,
        elementsOptions: {
          clientSecret: data.clientSecret,
          appearance: { theme: "stripe" },
        },
      });
      setStep("payment");
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPlacing(false);
    }
  }, [cart, guest]);

  // ── Menu step ──
  if (step === "menu") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Menu */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Order Online</h2>
            <p className="text-gray-500 mt-1 text-sm">Pickup only · Ready in 15–25 min</p>
          </div>

          {loadingMenu ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading menu…
            </div>
          ) : (
            categories.map((cat) => (
              <section key={cat.id}>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">{cat.name}</h3>
                <div className="space-y-2">
                  {cat.menuItems.map((item) => {
                    const qty = getQty(item.id);
                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.description && (
                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                          )}
                          <p className="text-sm font-semibold text-gray-800 mt-1">
                            ${Number(item.price).toFixed(2)}
                          </p>
                        </div>
                        {qty === 0 ? (
                          <button
                            onClick={() => addItem(item)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm font-medium">{qty}</span>
                            <button
                              onClick={() => addItem(item)}
                              className="w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Cart */}
        <div className="lg:sticky lg:top-4 h-fit">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart className="h-5 w-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Your order</h3>
              {cartCount > 0 && (
                <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Your cart is empty</p>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {cart.map((item) => (
                    <div key={item.menuItemId} className="flex items-start gap-2 text-sm">
                      <span className="text-gray-500 w-5 text-center pt-0.5">{item.quantity}×</span>
                      <span className="flex-1 text-gray-800">{item.name}</span>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => deleteItem(item.menuItemId)}
                        className="text-gray-300 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax (8.75%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={() => setStep("guest")}
                  className="mt-4 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Guest info step ──
  if (step === "guest") {
    return (
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <button
            onClick={() => setStep("menu")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-3 block"
          >
            ← Back to menu
          </button>
          <h2 className="text-2xl font-semibold text-gray-900">Your info</h2>
          <p className="text-gray-500 mt-1 text-sm">We&apos;ll text you when your order is ready.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          {/* Order summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm mb-2">
            {cart.map((item) => (
              <div key={item.menuItemId} className="flex justify-between text-gray-700">
                <span>{item.quantity}× {item.name}</span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5 mt-1.5">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={guest.name}
              onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
              placeholder="Your name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              required
              value={guest.phone}
              onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))}
              placeholder="(555) 000-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={guest.notes}
              onChange={(e) => setGuest((g) => ({ ...g, notes: e.target.value }))}
              placeholder="Allergies, substitutions…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {placeError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{placeError}</p>
          )}

          <button
            onClick={placeOrder}
            disabled={!guest.name.trim() || !guest.phone.trim() || placing}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {placing && <Loader2 className="h-4 w-4 animate-spin" />}
            {placing ? "Preparing checkout…" : `Continue to payment · $${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Payment step ──
  if (step === "payment" && checkoutData) {
    return (
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Payment</h2>
          <p className="text-gray-500 mt-1 text-sm">Your order is held while you pay.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <Elements stripe={stripePromise} options={checkoutData.elementsOptions}>
            <CheckoutForm
              total={checkoutData.total}
              orderId={checkoutData.orderId}
              onBack={() => setStep("guest")}
            />
          </Elements>
        </div>
      </div>
    );
  }

  return null;
}
