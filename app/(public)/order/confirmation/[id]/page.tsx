"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, ChefHat, PackageCheck, Loader2, AlertCircle } from "lucide-react";

type OrderStatus = "OPEN" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED" | "VOID";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  notes?: string;
  menuItem: { name: string };
}

interface Order {
  id: string;
  status: OrderStatus;
  guestName?: string;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  notes?: string;
  items: OrderItem[];
}

const STATUS_INFO: Record<
  OrderStatus,
  { label: string; description: string; icon: React.ReactNode; color: string }
> = {
  OPEN: {
    label: "Order received",
    description: "Your payment was received. We're preparing your order.",
    icon: <Clock className="h-10 w-10 text-amber-500" />,
    color: "text-amber-600",
  },
  IN_PROGRESS: {
    label: "Being prepared",
    description: "Our kitchen is working on your order right now!",
    icon: <ChefHat className="h-10 w-10 text-blue-500" />,
    color: "text-blue-600",
  },
  READY: {
    label: "Ready for pickup!",
    description: "Your order is ready at the counter. Come on in!",
    icon: <PackageCheck className="h-10 w-10 text-green-500" />,
    color: "text-green-600",
  },
  COMPLETED: {
    label: "Picked up",
    description: "Thanks for your order! See you again soon.",
    icon: <CheckCircle2 className="h-10 w-10 text-gray-400" />,
    color: "text-gray-600",
  },
  CANCELLED: {
    label: "Cancelled",
    description: "This order was cancelled. Please contact us if you have questions.",
    icon: <AlertCircle className="h-10 w-10 text-red-400" />,
    color: "text-red-600",
  },
  VOID: {
    label: "Voided",
    description: "This order was voided. Please contact us if you have questions.",
    icon: <AlertCircle className="h-10 w-10 text-red-400" />,
    color: "text-red-600",
  },
};

const POLL_STATUSES: OrderStatus[] = ["OPEN", "IN_PROGRESS"];

export default function ConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stripe redirects with ?payment_intent_client_secret=... and ?redirect_status=succeeded
  const redirectStatus = searchParams.get("redirect_status");

  async function fetchOrder() {
    try {
      const res = await fetch(`/api/public/orders/${id}`);
      if (!res.ok) throw new Error("Order not found");
      const data: Order = await res.json();
      setOrder(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order");
      return null;
    }
  }

  useEffect(() => {
    if (!id) return;
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll while order is still being prepared
  useEffect(() => {
    if (!order) return;
    if (!POLL_STATUSES.includes(order.status)) return;

    const interval = setInterval(async () => {
      const updated = await fetchOrder();
      if (updated && !POLL_STATUSES.includes(updated.status)) {
        clearInterval(interval);
      }
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status]);

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-gray-700 font-medium">{error}</p>
        <a href="/order" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Start a new order
        </a>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading order…
      </div>
    );
  }

  const info = STATUS_INFO[order.status];

  return (
    <div className="max-w-md mx-auto">
      {redirectStatus === "succeeded" && order.status === "OPEN" && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
          Payment confirmed! Your order is with us.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Status header */}
        <div className="px-6 py-8 text-center border-b border-gray-100">
          <div className="flex justify-center mb-4">{info.icon}</div>
          <h2 className={`text-2xl font-semibold ${info.color}`}>{info.label}</h2>
          <p className="text-sm text-gray-500 mt-1">{info.description}</p>
          {POLL_STATUSES.includes(order.status) && (
            <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating automatically…
            </div>
          )}
        </div>

        {/* Order details */}
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Order #{order.id.slice(-8).toUpperCase()}</p>
            {order.guestName && (
              <p className="text-sm text-gray-500">for {order.guestName}</p>
            )}
          </div>

          <div className="space-y-2 mb-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-700">
                <span>
                  {item.quantity}× {item.menuItem.name}
                  {item.notes && <span className="text-gray-400 italic"> · {item.notes}</span>}
                </span>
                <span>${(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>${Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax</span>
              <span>${Number(order.tax).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total paid</span>
              <span>${Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          {order.notes && (
            <p className="mt-3 text-xs text-gray-500 italic">Note: {order.notes}</p>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <a href="/order" className="text-sm text-indigo-600 hover:underline">
          Place another order
        </a>
      </div>
    </div>
  );
}
