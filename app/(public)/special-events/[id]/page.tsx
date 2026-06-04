import { prisma } from "@/lib/prisma";
import { formatTime12 } from "@/lib/utils";
import { getPublicBrand } from "@/lib/brand";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users, ArrowLeft } from "lucide-react";
import { EventInquiryForm } from "./inquiry-form";
import { TicketPurchase } from "./ticket-purchase";
import { getEventTicketing } from "@/lib/event-tickets";

export const dynamic = "force-dynamic";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function Meta({ icon: Icon, accent, children }: { icon: typeof CalendarDays; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon size={17} style={{ color: accent }} className="shrink-0" />
      <span className="text-[15px] text-stone-700">{children}</span>
    </div>
  );
}

export default async function PublicEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.status !== "CONFIRMED") notFound();

  const brand = await getPublicBrand();
  const accent = brand.color;
  const ticketing = event.ticketingEnabled ? await getEventTicketing(id) : null;
  const sellable = ticketing?.tiers.filter((t) => t.active) ?? [];

  return (
    <div className="-mx-4 -my-8 sm:-mx-4">
      <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-14">
        <Link href="/special-events" className="inline-flex items-center gap-1.5 text-sm font-medium mb-8 hover:opacity-70 transition-opacity" style={{ color: accent }}>
          <ArrowLeft size={14} /> All Events
        </Link>

        {event.imageUrl && (
          <div className="mb-10 overflow-hidden rounded-2xl border border-stone-200 shadow-sm" style={{ aspectRatio: "16 / 7" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.imageUrl} alt={event.name} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="grid gap-12 lg:grid-cols-[1fr_400px]">
          {/* Left — editorial details */}
          <div>
            <p className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-4" style={{ color: accent }}>Special Event</p>
            <h1 className="font-display text-[2.75rem] sm:text-6xl leading-[1.02] tracking-[-0.01em] text-stone-900 mb-8">{event.name}</h1>

            <div className="rounded-2xl border border-stone-200 bg-white px-6 py-3 divide-y divide-stone-100 shadow-sm">
              <Meta icon={CalendarDays} accent={accent}>{formatDate(event.date)}</Meta>
              <Meta icon={Clock} accent={accent}>{formatTime12(event.startTime)}{event.endTime ? <span className="text-stone-400"> – {formatTime12(event.endTime)}</span> : null}</Meta>
              {event.venue && <Meta icon={MapPin} accent={accent}>{event.venue}</Meta>}
              {event.guestCount && <Meta icon={Users} accent={accent}>Limited to {event.guestCount} guests</Meta>}
            </div>

            {event.notes && (
              <section className="mt-10">
                <h2 className="font-display text-2xl text-stone-900 mb-3">About this event</h2>
                <p className="text-[15px] leading-[1.75] text-stone-600 whitespace-pre-wrap">{event.notes}</p>
              </section>
            )}

            {event.menuNotes && (
              <section className="mt-10">
                <h2 className="font-display text-2xl text-stone-900 mb-3">Menu &amp; cuisine</h2>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-6 py-5 text-[15px] leading-[1.75] text-stone-700 whitespace-pre-wrap">{event.menuNotes}</div>
              </section>
            )}

            {!event.ticketingEnabled && (event.totalAmount || event.depositAmount) && (
              <section className="mt-10">
                <h2 className="font-display text-2xl text-stone-900 mb-3">Pricing</h2>
                {event.totalAmount && <p className="text-stone-900"><span className="text-3xl font-semibold">${Number(event.totalAmount).toFixed(0)}</span><span className="text-sm text-stone-400 ml-1.5">per person</span></p>}
                {event.depositAmount && <p className="text-sm mt-1 text-stone-500">${Number(event.depositAmount).toFixed(0)} deposit to confirm your spot</p>}
              </section>
            )}
          </div>

          {/* Right — buy / inquire */}
          <div className="lg:sticky lg:top-8 h-fit">
            {ticketing && sellable.length > 0 ? (
              <TicketPurchase
                eventId={event.id}
                mode={event.ticketMode}
                accent={accent}
                tiers={sellable.map((t) => ({ id: t.id, name: t.name, description: t.description, priceCents: t.priceCents, chargeNowCents: t.chargeNowCents, remaining: t.remaining, active: t.active }))}
              />
            ) : (
              <EventInquiryForm eventId={event.id} eventName={event.name} guestCount={event.guestCount ?? undefined} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
