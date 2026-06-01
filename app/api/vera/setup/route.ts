import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Vera setup status — what a brand-new restaurant still needs to configure.
// Drives the first-run guide on the dashboard; goes quiet once everything's done.

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
  hint: string;
}

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [menuItems, tables, staff, inventory] = await Promise.all([
      prisma.menuItem.count(),
      prisma.table.count(),
      prisma.user.count(),
      prisma.inventoryItem.count(),
    ]);

    const steps: SetupStep[] = [
      { key: "menu", label: "Build your menu", done: menuItems > 0, href: "/menu", hint: "Add categories and dishes so Vera can cost and analyze them." },
      { key: "floor", label: "Map your floor", done: tables > 0, href: "/settings/floorplan", hint: "Add tables so the host stand and POS can seat guests." },
      { key: "team", label: "Add your team", done: staff > 1, href: "/staff", hint: "Invite staff and set roles to unlock scheduling and labor." },
      { key: "inventory", label: "Stock your inventory", done: inventory > 0, href: "/inventory", hint: "Add ingredients so Vera can track cost and reorder for you." },
    ];

    const doneCount = steps.filter((s) => s.done).length;
    return Response.json(
      { steps, doneCount, total: steps.length, complete: doneCount === steps.length },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    console.error("[/api/vera/setup]", (err as Error)?.message ?? err);
    return Response.json({ error: "setup_unavailable" }, { status: 503 });
  }
}
