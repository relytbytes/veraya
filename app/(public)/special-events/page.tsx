import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";

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

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default async function PublicEventsPage() {
  const today = todayStr();
  const events = await prisma.event.findMany({
    where: {
      status: "CONFIRMED",
      date: { gte: today },
    },
    orderBy: { date: "asc" },
  });

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

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-14">
          <p
            className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
            style={{ color: "#d4a853" }}
          >
            Upcoming Events
          </p>
          <h1 className="text-4xl font-bold mb-4" style={{ color: "#f5f0e8" }}>
            Special Events &amp; Experiences
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "#c4b89a" }}>
            Join us for curated evenings, tastings, and celebrations. Each event is a
            unique experience crafted for our guests.
          </p>
        </div>

        {/* Event cards */}
        {events.length === 0 ? (
          <div className="text-center py-20">
            <CalendarDays
              className="mx-auto mb-4 opacity-30"
              style={{ color: "#d4a853" }}
              size={48}
            />
            <p className="text-lg font-medium" style={{ color: "#c4b89a" }}>
              No upcoming events at this time.
            </p>
            <p className="text-sm mt-2" style={{ color: "#8a7a60" }}>
              Check back soon — we&rsquo;re always planning something special.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {events.map((event) => (
              <Link key={event.id} href={`/special-events/${event.id}`} className="block group">
                <div
                  className="rounded-xl border p-6 transition-all duration-200 group-hover:scale-[1.01]"
                  style={{
                    backgroundColor: "#231809",
                    borderColor: "#3a2e1a",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
                  }}
                >
                  {/* Date pill */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="text-xs font-semibold tracking-wider uppercase px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: "rgba(212,168,83,0.15)",
                        color: "#d4a853",
                        border: "1px solid rgba(212,168,83,0.3)",
                      }}
                    >
                      {formatDate(event.date)}
                    </span>
                  </div>

                  <h2
                    className="text-xl font-bold mb-3 group-hover:opacity-90 transition-opacity"
                    style={{ color: "#f5f0e8" }}
                  >
                    {event.name}
                  </h2>

                  {event.notes && (
                    <p
                      className="text-sm mb-4 line-clamp-3"
                      style={{ color: "#c4b89a" }}
                    >
                      {event.notes}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#8a7a60" }}>
                      <Clock size={14} style={{ color: "#d4a853" }} />
                      <span>
                        {formatTime(event.startTime)}
                        {event.endTime ? ` – ${formatTime(event.endTime)}` : ""}
                      </span>
                    </div>
                    {event.venue && (
                      <div className="flex items-center gap-2 text-sm" style={{ color: "#8a7a60" }}>
                        <MapPin size={14} style={{ color: "#d4a853" }} />
                        <span>{event.venue}</span>
                      </div>
                    )}
                    {event.guestCount && (
                      <div className="flex items-center gap-2 text-sm" style={{ color: "#8a7a60" }}>
                        <Users size={14} style={{ color: "#d4a853" }} />
                        <span>Up to {event.guestCount} guests</span>
                      </div>
                    )}
                  </div>

                  <div
                    className="mt-5 pt-4 flex items-center justify-between"
                    style={{ borderTop: "1px solid #3a2e1a" }}
                  >
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "#d4a853" }}
                    >
                      View Details &amp; Inquire →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
