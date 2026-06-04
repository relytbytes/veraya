import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { Toaster } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string })?.role ?? "SERVER";
  const name = session.user?.name ?? null;

  return (
    <>
      <DashboardShell role={role} name={name}>{children}</DashboardShell>
      <CommandPalette role={role} />
      <Toaster />
      <ConfirmHost />
    </>
  );
}
