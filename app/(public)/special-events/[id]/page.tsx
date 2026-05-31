import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users, ArrowLeft } from "lucide-react";
import { EventInquiryForm } from "./inquiry-form";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

export default async function PublicEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id } });

  if (!event || event.status !== "CONFIRMED") {
    notFound();
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#1a1208", color: "#f5f0e8" }}
    >
      {/* Header */}
      <header
        className="border-b px-6 py-5"
        style={{ borderColor: "#3a2e1a", backgroundColor: "#1a1208" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" style={{ color: "#d4a853" }} className="text-xl font-bold tracking-wide">
            The Restaurant
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link
              href="/book"
              className="font-medium transition-colors hover:opacity-80"
              style={{ color: "#f5f0e8" }}
            >
              Reserve a Table
            </Link>
            <Link
              href="/special-events"
              className="font-medium transition-colors"
              style={{ color: "#d4a853" }}
            >
              Special Events
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link
          href="/special-events"
          className="inline-flex items-center gap-1.5 text-sm mb-8 transition-opacity hover:opacity-70"
          style={{ color: "#d4a853" }}
        >
          <ArrowLeft size={14} />
          All Events
        </Link>

        <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
          {/* Left: Event details */}
          <div>
            {/* Category label */}
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ color: "#d4a853" }}
            >
              Special Event
            </p>

            <h1 className="text-4xl font-bold leading-tight mb-6" style={{ color: "#f5f0e8" }}>
              {event.name}
            </h1>

            {/* Meta info */}
            <div
              className="rounded-xl border p-5 mb-8 space-y-3"
              style={{
                backgroundColor: "#231809",
                borderColor: "#3a2e1a",
              }}
            >
              <div className="flex items-center gap-3">
                <CalendarDays size={18} style={{ color: "#d4a853", flexShrink: 0 }} />
                <span className="text-base" style={{ color: "#f5f0e8" }}>
                  {formatDate(event.date)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock size={18} style={{ color: "#d4a853", flexShrink: 0 }} />
                <span className="text-base" style={{ color: "#f5f0e8" }}>
                  {formatTime(event.startTime)}
                  {event.endTime ? (
                    <span style={{ color: "#8a7a60" }}> – {formatTime(event.endTime)}</span>
                  ) : null}
                </span>
              </div>
              {event.venue && (
                <div className="flex items-center gap-3">
                  <MapPin size={18} style={{ color: "#d4a853", flexShrink: 0 }} />
                  <span className="text-base" style={{ color: "#f5f0e8" }}>
                    {event.venue}
                  </span>
                </div>
              )}
              {event.guestCount && (
                <div className="flex items-center gap-3">
                  <Users size={18} style={{ color: "#d4a853", flexShrink: 0 }} />
                  <span className="text-base" style={{ color: "#f5f0e8" }}>
                    Limited to {event.guestCount} guests
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {event.notes && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-3" style={{ color: "#d4a853" }}>
                  About This Event
                </h2>
                <div className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: "#c4b89a" }}>
                  {event.notes}
                </div>
              </div>
            )}

            {/* Menu notes */}
            {event.menuNotes && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-3" style={{ color: "#d4a853" }}>
                  Menu &amp; Cuisine
                </h2>
                <div
                  className="rounded-xl border p-5 text-base leading-relaxed whitespace-pre-wrap"
                  style={{
                    backgroundColor: "#231809",
                    borderColor: "#3a2e1a",
                    color: "#c4b89a",
                  }}
                >
                  {event.menuNotes}
                </div>
              </div>
            )}

            {/* Pricing hint */}
            {(event.totalAmount || event.depositAmount) && (
              <div
                className="rounded-xl border p-5 mb-8"
                style={{ backgroundColor: "#231809", borderColor: "#3a2e1a" }}
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#d4a853" }}>
                  Pricing
                </h2>
                {event.totalAmount && (
                  <p style={{ color: "#f5f0e8" }}>
                    <span className="text-2xl font-bold">${Number(event.totalAmount).toFixed(0)}</span>
                    <span className="text-sm ml-1" style={{ color: "#8a7a60" }}>per person</span>
                  </p>
                )}
                {event.depositAmount && (
                  <p className="text-sm mt-1" style={{ color: "#8a7a60" }}>
                    ${Number(event.depositAmount).toFixed(0)} deposit required to confirm your spot
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Inquiry form */}
          <div className="lg:sticky lg:top-8 h-fit">
            <EventInquiryForm
              eventId={event.id}
              eventName={event.name}
              guestCount={event.guestCount ?? undefined}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="border-t mt-16 px-6 py-8 text-center text-sm"
        style={{ borderColor: "#3a2e1a", color: "#8a7a60" }}
      >
        <p>© {new Date().getFullYear()} The Restaurant. All rights reserved.</p>
        <p className="mt-1">
          Questions? Call us or{" "}
          <Link href="/book" style={{ color: "#d4a853" }}>
            make a reservation
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
