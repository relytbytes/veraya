import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Veraya</h1>
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
