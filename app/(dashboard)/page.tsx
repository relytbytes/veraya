import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string })?.role ?? "SERVER";
  const name = session.user?.name ?? null;

  return <DashboardClient role={role} name={name} />;
}
