"use client";

import { Star, Phone, Cake, Award, TriangleAlert, Pencil, Clock } from "lucide-react";
import {
  type CustomerProfile, BRAND,
  parseAllergies, displayTags, recognition, fmtLastVisit, initials, veraGuestBrief,
} from "../host-utils";
import { VeraSpark } from "@/components/brand/vera-mark";

const TONE: Record<string, { bg: string; fg: string }> = {
  vip: { bg: BRAND.gold, fg: "#fff" },
  regular: { bg: BRAND.jade, fg: "#fff" },
  new: { bg: BRAND.sky, fg: "#fff" },
  none: { bg: "#DCE2EA", fg: BRAND.pearl },
};

/** Guest recognition card — shown for a reservation/seating linked to a customer. */
export function GuestCard({ customer, onEdit }: { customer: CustomerProfile; onEdit?: () => void }) {
  const rec = recognition(customer);
  const allergies = parseAllergies(customer.tags);
  const tags = displayTags(customer.tags);
  const lastVisit = fmtLastVisit(customer.lastVisitAt);
  const brief = veraGuestBrief(customer);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: TONE[rec.tone].bg, color: TONE[rec.tone].fg }}>
          {initials(customer.name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-white truncate">{customer.name}</p>
            {rec.label && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"
                style={{ background: TONE[rec.tone].bg, color: TONE[rec.tone].fg }}>
                {rec.tone === "vip" && <Star className="h-2.5 w-2.5" />}{rec.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Award className="h-3 w-3" />{customer.loyaltyPoints} pts</span>
            {lastVisit && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />last {lastVisit}</span>}
            {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>}
            {customer.birthday && <span className="flex items-center gap-1"><Cake className="h-3 w-3" />{customer.birthday}</span>}
          </div>
        </div>
        {onEdit && (
          <button onClick={onEdit} title="Edit guest" className="shrink-0 text-gray-500 hover:text-white">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {brief && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5">
          <VeraSpark className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="text-xs leading-snug text-gray-200">{brief}</span>
        </div>
      )}

      {allergies.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5"
          style={{ background: "rgba(212,64,48,0.16)", color: "#F2A99F", border: "1px solid rgba(212,64,48,0.35)" }}>
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="text-xs font-semibold">Allergies: {allergies.join(", ")}</span>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-white/10 text-gray-300">{t}</span>
          ))}
        </div>
      )}

      {customer.notes && (
        <p className="mt-2 text-xs text-gray-300 italic leading-snug">“{customer.notes}”</p>
      )}
    </div>
  );
}
