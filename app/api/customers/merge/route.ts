import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/customers/merge — body { primaryId, duplicateIds[] }
// Commits a guest-profile merge to record: reassigns every related record from
// the duplicates to the primary, folds in their history, deletes the duplicates,
// and writes an audit-log entry. Admin/manager only.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string })?.id;
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role) || !userId) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { primaryId, duplicateIds } = await req.json() as { primaryId?: string; duplicateIds?: string[] };
  const dupes = (duplicateIds ?? []).filter((id) => id && id !== primaryId);
  if (!primaryId || dupes.length === 0) {
    return Response.json({ error: "primaryId and at least one duplicateId are required" }, { status: 400 });
  }

  const ids = [primaryId, ...dupes];
  const customers = await prisma.customer.findMany({ where: { id: { in: ids } } });
  const primary = customers.find((c) => c.id === primaryId);
  if (!primary || customers.length !== ids.length) {
    return Response.json({ error: "One or more profiles no longer exist" }, { status: 404 });
  }
  const dupRows = customers.filter((c) => c.id !== primaryId);

  // Merge scalar history.
  const tagSet = new Set<string>();
  for (const c of customers) (c.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => tagSet.add(t));
  const notes = customers.map((c) => c.notes?.trim()).filter(Boolean).join("\n---\n") || null;
  const lastVisitAt = customers.map((c) => c.lastVisitAt).filter(Boolean).sort().slice(-1)[0] ?? null;
  const merged = {
    visitCount: customers.reduce((s, c) => s + c.visitCount, 0),
    loyaltyPoints: customers.reduce((s, c) => s + c.loyaltyPoints, 0),
    tags: tagSet.size ? [...tagSet].join(",") : null,
    notes,
    lastVisitAt,
    phone: primary.phone ?? dupRows.find((c) => c.phone)?.phone ?? null,
    email: primary.email ?? dupRows.find((c) => c.email)?.email ?? null,
    birthday: primary.birthday ?? dupRows.find((c) => c.birthday)?.birthday ?? null,
  };

  await prisma.$transaction(async (tx) => {
    const where = { customerId: { in: dupes } };
    const to = { customerId: primaryId };
    // Reassign every relation that points at a customer.
    await tx.reservation.updateMany({ where, data: to });
    await tx.waitlist.updateMany({ where, data: to });
    await tx.loyaltyTransaction.updateMany({ where, data: to });
    await tx.giftCard.updateMany({ where, data: to });
    await tx.event.updateMany({ where, data: to });
    await tx.order.updateMany({ where, data: to });
    await tx.table.updateMany({ where, data: to });
    // Delete the duplicates first so their @unique phone/email free up for the primary.
    await tx.customer.deleteMany({ where: { id: { in: dupes } } });
    await tx.customer.update({ where: { id: primaryId }, data: merged });
    await tx.auditLog.create({
      data: {
        action: "GUEST_MERGE",
        userId,
        reason: `Merged ${dupes.length} duplicate guest profile(s) into ${primary.name}`,
        notes: `kept=${primaryId}; merged=${dupes.join(",")}`,
      },
    });
  });

  return Response.json({ ok: true, primaryId, merged: dupes.length });
}
