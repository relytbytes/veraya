import { prisma } from "@/lib/prisma";
import { formatTime12 } from "@/lib/utils";
import { getPublicBrand } from "@/lib/brand";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users, ArrowRight, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}
function todayStr(): string { return new Date().toISOString().split("T")[0]; }

export default async function PublicEventsPage() {
  const today = todayStr();
  const [events, brand] = await Promise.all([
    prisma.event.findMany({ where: { status: "CONFIRMED", date: { gte: today } }, orderBy: { date: "asc" } }),
    getPublicBrand(),
  ]);
  const accent = brand.color;

  return (
    <div>
      {/* Hero */}
      <div className="text-center max-w-2xl mx-auto pt-6 pb-12">
        <p className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-4" style={{ color: accent }}>Upcoming Events</p>
        <h1 className="font-display text-5xl sm:text-6xl leading-[1.03] tracking-[-0.01em] text-stone-900">Special events &amp; experiences</h1>
        <p className="text-[15px] sm:text-base mt-5 text-stone-500 leading-relaxed">
          Curated evenings, tastings, and celebrations — each crafted as a one-night-only experience for our guests.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-stone-200 bg-white">
          <CalendarDays className="mx-auto mb-4 text-stone-300" size={44} />
          <p className="text-lg font-medium text-stone-700">No upcoming events right now.</p>
          <p className="text-sm mt-1.5 text-stone-400">Check back soon — we&rsquo;re always planning something special.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {events.map((event) => (
            <Link key={event.id} href={`/special-events/${event.id}`} className="group block">
              <article className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                {event.imageUrl && (
                  <div className="overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={event.imageUrl} alt={event.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  </div>
                )}
                <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[11px] font-semibold tracking-[0.12em] uppercase px-3 py-1 rounded-full" style={{ backgroundColor: `${accent}14`, color: accent }}>
                    {formatDate(event.date)}
                  </span>
                  {event.ticketingEnabled && (
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase px-2.5 py-1 rounded-full border" style={{ borderColor: `${accent}40`, color: accent }}>Tickets</span>
                  )}
                </div>

                <h2 className="font-display text-2xl leading-snug text-stone-900 mb-2.5">{event.name}</h2>
                {event.notes && <p className="text-sm text-stone-500 line-clamp-2 mb-4 leading-relaxed">{event.notes}</p>}

                <div className="space-y-1.5 text-sm text-stone-500">
                  <div className="flex items-center gap-2"><Clock size={14} style={{ color: accent }} />{formatTime12(event.startTime)}{event.endTime ? ` – ${formatTime12(event.endTime)}` : ""}</div>
                  {event.venue && <div className="flex items-center gap-2"><MapPin size={14} style={{ color: accent }} />{event.venue}</div>}
                  {event.guestCount && <div className="flex items-center gap-2"><Users size={14} style={{ color: accent }} />Up to {event.guestCount} guests</div>}
                </div>

                <div className="mt-5 pt-4 border-t border-stone-100 flex items-center gap-1.5 text-sm font-semibold group-hover:gap-2.5 transition-all" style={{ color: accent }}>
                  {event.ticketingEnabled ? "Get tickets" : "View details"} <ArrowRight size={15} />
                </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {/* Host-a-private-event inquiry CTA — captures leads straight into Inquiries */}
      <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-7 sm:p-8 text-center shadow-sm">
        <Sparkles size={22} className="mx-auto mb-3" style={{ color: accent }} />
        <h3 className="font-display text-2xl sm:text-3xl text-stone-900">Planning something special?</h3>
        <p className="text-[15px] text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
          Wine dinners, private celebrations, corporate gatherings — tell us what you have in mind and we&rsquo;ll craft it with you.
        </p>
        <Link href="/special-events/inquire" className="inline-flex items-center gap-1.5 mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
          Host a private event <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
