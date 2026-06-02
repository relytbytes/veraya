"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Lock, ChevronLeft } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Card-on-file hold step. Authorizes (not charges) a hold via Stripe; the
 *  restaurant only captures it on a no-show, per their policy. */
export function CardStep({
  clientSecret, holdAmountCents, onAuthorized, onBack,
}: {
  clientSecret: string;
  holdAmountCents: number;
  onAuthorized: (paymentIntentId: string) => void;
  onBack: () => void;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "flat", variables: { colorPrimary: "#21A090" } } }}>
      <CardForm holdAmountCents={holdAmountCents} onAuthorized={onAuthorized} onBack={onBack} />
    </Elements>
  );
}

function CardForm({
  holdAmountCents, onAuthorized, onBack,
}: {
  holdAmountCents: number;
  onAuthorized: (paymentIntentId: string) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function authorize() {
    if (!stripe || !elements) return;
    setLoading(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (error) { setErr(error.message ?? "We couldn't process that card."); setLoading(false); return; }
    if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) {
      onAuthorized(paymentIntent.id);
    } else {
      setErr("Card couldn't be authorized. Please try another card.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900">
        <Lock className="h-4 w-4 shrink-0 mt-0.5" />
        <span>A <strong>{fmtUsd(holdAmountCents)}</strong> hold secures your table. You&apos;re only charged if you don&apos;t show — your card is not billed now.</span>
      </div>
      <PaymentElement />
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} disabled={loading}
          className="flex items-center gap-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={authorize} disabled={loading || !stripe}
          className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Securing…" : `Confirm & hold ${fmtUsd(holdAmountCents)}`}
        </button>
      </div>
    </div>
  );
}
