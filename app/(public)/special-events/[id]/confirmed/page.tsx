import { prisma } from "@/lib/prisma";
import { formatTime12 } from "@/lib/utils";
import { getPublicBrand } from "@/lib/brand";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, CalendarDays, Clock, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default async function EventConfirmedPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ code?: string }> }) {
  const { id } = await params;
  const { code } = await searchParams;
  const brand = await getPublicBrand();
  const accent = brand.color;

  const order = code
    ? await prisma.eventOrder.findUnique({ where: { confirmationCode: code }, include: { items: true, event: true } })
    : null;

  if (!order || order.eventId !== id) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-lg font-semibold text-stone-800">We couldn&apos;t find that order.</p>
        <Link href={`/special-events/${id}`} className="text-sm mt-3 inline-block font-medium" style={{ color: accent }}>← Back to the event</Link>
      </div>
    );
  }

  const qr = await QRCode.toDataURL(order.confirmationCode, { margin: 1, width: 240, color: { dark: "#1c1917", light: "#ffffff" } });
  const pending = order.status === "PENDING";
  const deposit = order.event.ticketMode === "DEPOSIT";

  return (
    <div className="max-w-md mx-auto py-6">
      <div className="text-center mb-7">
        <CheckCircle2 size={46} style={{ color: accent }} className="mx-auto mb-3" />
        <h1 className="font-display text-3xl text-stone-900">{pending ? "Almost there" : "You're confirmed"}</h1>
        <p className="text-sm mt-1.5 text-stone-500">
          {pending ? "We're finalizing your payment — your confirmation is on its way." : `A confirmation has been sent to ${order.email}.`}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-2xl text-stone-900 mb-4">{order.event.name}</h2>
        <div className="space-y-2 text-sm text-stone-600 mb-5">
          <div className="flex items-center gap-2.5"><CalendarDays size={15} style={{ color: accent }} />{formatDate(order.event.date)}</div>
          <div className="flex items-center gap-2.5"><Clock size={15} style={{ color: accent }} />{formatTime12(order.event.startTime)}{order.event.endTime ? ` – ${formatTime12(order.event.endTime)}` : ""}</div>
          {order.event.venue && <div className="flex items-center gap-2.5"><MapPin size={15} style={{ color: accent }} />{order.event.venue}</div>}
        </div>

        <div className="border-y border-stone-100 py-3 my-3 space-y-1.5">
          {order.items.map((it) => (
            <div key={it.id} className="flex justify-between text-sm">
              <span className="text-stone-500">{it.quantity} × {it.tierName}</span>
              <span className="text-stone-800">{money(it.quantity * it.unitPriceCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold pt-1.5">
            <span className="text-stone-800">{deposit ? "Deposit paid" : "Total paid"}</span>
            <span style={{ color: accent }}>{money(order.amountPaidCents)}</span>
          </div>
          {deposit && <p className="text-[11px] text-stone-400">Remaining balance is settled at the event.</p>}
        </div>

        <div className="flex flex-col items-center mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Check-in code" width={176} height={176} className="rounded-xl border border-stone-100" />
          <p className="text-xs mt-3 text-stone-400">Show this at check-in</p>
          <p className="font-display text-2xl tracking-[0.2em] mt-0.5 text-stone-900">{order.confirmationCode}</p>
        </div>
      </div>

      <Link href={`/special-events/${id}`} className="block text-center text-sm mt-6 font-medium" style={{ color: accent }}>← Back to the event</Link>
    </div>
  );
}
