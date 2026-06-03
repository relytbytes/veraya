import Link from "next/link";
import { getPublicBrand } from "@/lib/brand";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const brand = await getPublicBrand();
  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/book" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt={brand.name} width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
            <span className="text-lg font-bold tracking-tight text-gray-900">{brand.name}</span>
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/book" className="text-gray-600 hover:text-gray-900 font-medium">
              Reserve a Table
            </Link>
            <Link href="/order" className="text-gray-600 hover:text-gray-900 font-medium">
              Order Online
            </Link>
            <Link href="/special-events" className="text-gray-600 hover:text-gray-900 font-medium">
              Special Events
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
