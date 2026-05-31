import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { Toaster } from "@/components/ui/toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string })?.role ?? "SERVER";
  const name = session.user?.name ?? null;

  return (
    <div className="flex h-full">
      <Sidebar role={role} name={name} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CommandPalette role={role} />
      <Toaster />
    </div>
  );
}
