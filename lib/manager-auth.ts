import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Verify a manager override PIN. Returns the authorizing manager (id + name)
 * when the PIN matches an active MANAGER/ADMIN, or null otherwise.
 *
 * PINs are stored as bcrypt hashes; staff is small so a compare loop is fine.
 * Used to gate sensitive POS actions (comps, voids) behind a manager.
 */
export async function verifyManagerPin(
  pin: string,
): Promise<{ id: string; name: string } | null> {
  const clean = (pin ?? "").trim();
  if (!clean) return null;

  const managers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "MANAGER"] }, NOT: { managerPin: null } },
    select: { id: true, name: true, managerPin: true },
  });

  for (const m of managers) {
    if (m.managerPin && (await bcrypt.compare(clean, m.managerPin))) {
      return { id: m.id, name: m.name };
    }
  }
  return null;
}
