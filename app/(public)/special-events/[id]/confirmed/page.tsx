import { prisma } from "@/lib/prisma";
import { formatTime12 } from "@/lib/utils";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, CalendarDays, Clock, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const GOLD = "#d4a853";
const TEXT = "#f5f0e8";
const MUTED = "#8a7a60";
const PANEL = "#231809";
const BORDER = "#3a2e1a";
const BG = "#1a1208";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default async function EventConfirmedPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { id } = await params;
  const { code } = await searchParams;

  const order = code
    ? await prisma.eventOrder.findUnique({ where: { confirmationCode: code }, include: { items: true, event: true } })
    : null;

  if (!order || order.eventId !== id) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: BG, color: TEXT }}>
        <div className="text-center">
          <p className="text-lg font-semibold">We couldn&apos;t find that order.</p>
          <Link href={`/special-events/${id}`} className="text-sm mt-3 inline-block" style={{ color: GOLD }}>← Back to the event</Link>
        </div>
      </div>
    );
  }

  const qr = await QRCode.toDataURL(order.confirmationCode, { margin: 1, width: 240, color: { dark: "#1a1208", light: "#ffffff" } });
  const pending = order.status === "PENDING";
  const deposit = order.event.ticketMode === "DEPOSIT";

  return (
    <div className="min-h-screen px-6 py-12" style={{ backgroundColor: BG, color: TEXT }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <CheckCircle2 size={48} style={{ color: GOLD }} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">{pending ? "Almost there…" : "You're confirmed!"}</h1>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            {pending
              ? "We're finalizing your payment — your confirmation email is on its way."
              : `A confirmation has been sent to ${order.email}.`}
          </p>
        </div>

        <div className="rounded-2xl border p-6" style={{ backgroundColor: PANEL, borderColor: BORDER }}>
          <h2 className="text-lg font-bold mb-3">{order.event.name}</h2>
          <div className="space-y-2 text-sm mb-5">
            <div className="flex items-center gap-2.5"><CalendarDays size={15} style={{ color: GOLD }} /><span>{formatDate(order.event.date)}</span></div>
            <div className="flex items-center gap-2.5"><Clock size={15} style={{ color: GOLD }} /><span>{formatTime12(order.event.startTime)}{order.event.endTime ? ` – ${formatTime12(order.event.endTime)}` : ""}</span></div>
            {order.event.venue && <div className="flex items-center gap-2.5"><MapPin size={15} style={{ color: GOLD }} /><span>{order.event.venue}</span></div>}
          </div>

          {/* Tickets */}
          <div className="border-t border-b py-3 my-3 space-y-1.5" style={{ borderColor: BORDER }}>
            {order.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span style={{ color: MUTED }}>{it.quantity} × {it.tierName}</span>
                <span>{money(it.quantity * it.unitPriceCents)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-1.5">
              <span>{deposit ? "Deposit paid" : "Total paid"}</span>
              <span style={{ color: GOLD }}>{money(order.amountPaidCents)}</span>
            </div>
            {deposit && <p className="text-[11px]" style={{ color: MUTED }}>Remaining balance is settled at the event.</p>}
          </div>

          {/* QR + code */}
          <div className="flex flex-col items-center mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Check-in code" width={180} height={180} className="rounded-xl" />
            <p className="text-xs mt-3" style={{ color: MUTED }}>Show this at check-in</p>
            <p className="text-2xl font-bold tracking-[0.25em] mt-1" style={{ color: TEXT }}>{order.confirmationCode}</p>
          </div>
        </div>

        <Link href={`/special-events/${id}`} className="block text-center text-sm mt-6" style={{ color: GOLD }}>← Back to the event</Link>
      </div>
    </div>
  );
}
