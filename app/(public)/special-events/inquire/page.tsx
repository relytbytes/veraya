import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPublicBrand } from "@/lib/brand";
import { InquiryForm } from "./inquiry-form";

export const dynamic = "force-dynamic";

export default async function InquirePage() {
  const brand = await getPublicBrand();
  const accent = brand.color;
  return (
    <div className="max-w-2xl mx-auto py-4">
      <Link href="/special-events" className="inline-flex items-center gap-1.5 text-sm font-medium mb-7 hover:opacity-70" style={{ color: accent }}>
        <ArrowLeft size={14} /> All Events
      </Link>
      <div className="text-center mb-8">
        <p className="text-[11px] font-semibold tracking-[0.25em] uppercase mb-3" style={{ color: accent }}>Private Events</p>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-stone-900">Host your event with us</h1>
        <p className="text-[15px] mt-4 text-stone-500 leading-relaxed">
          Wine dinners, milestone celebrations, corporate gatherings — tell us what you have in mind and our events team will craft it with you.
        </p>
      </div>
      <InquiryForm accent={accent} />
    </div>
  );
}
