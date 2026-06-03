import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/customers/duplicates — Vera's duplicate-guest report for admin review.
// Groups customer profiles that are very likely the same person: matching phone
// (digits only, so formatting differences still match), matching email, or an
// identical normalized name. Each group suggests a primary to keep.
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true, email: true, visitCount: true, loyaltyPoints: true, lastVisitAt: true, createdAt: true, tags: true },
  });

  const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
  const normName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const emailKey = (e: string | null) => (e ?? "").trim().toLowerCase();

  // Union-find over strong keys (phone digits ≥7, email).
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const c of customers) parent.set(c.id, c.id);

  const byKey = new Map<string, string[]>(); // strong key → customer ids
  for (const c of customers) {
    const keys: string[] = [];
    const d = digits(c.phone); if (d.length >= 7) keys.push(`p:${d}`);
    const e = emailKey(c.email); if (e) keys.push(`e:${e}`);
    for (const k of keys) {
      const arr = byKey.get(k) ?? []; arr.push(c.id); byKey.set(k, arr);
    }
  }
  for (const ids of byKey.values()) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  // Strong groups from union-find.
  const groupsMap = new Map<string, string[]>();
  for (const c of customers) {
    const r = find(c.id);
    const arr = groupsMap.get(r) ?? []; arr.push(c.id); groupsMap.set(r, arr);
  }

  const byId = new Map(customers.map((c) => [c.id, c]));
  const completeness = (c: typeof customers[number]) => (c.phone ? 1 : 0) + (c.email ? 1 : 0) + (c.tags ? 1 : 0);
  const pickPrimary = (ids: string[]) => ids
    .map((id) => byId.get(id)!)
    .sort((a, b) => (b.visitCount - a.visitCount) || (completeness(b) - completeness(a)) || (a.createdAt < b.createdAt ? -1 : 1))[0].id;

  type Group = { confidence: "high" | "possible"; reason: string; primaryId: string; members: typeof customers };
  const groups: Group[] = [];
  const grouped = new Set<string>();

  for (const ids of groupsMap.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id) => grouped.add(id));
    const members = ids.map((id) => byId.get(id)!);
    const sharePhone = new Set(members.map((m) => digits(m.phone)).filter((d) => d.length >= 7)).size < members.filter((m) => digits(m.phone).length >= 7).length;
    groups.push({
      confidence: "high",
      reason: sharePhone ? "Same phone number" : "Same email",
      primaryId: pickPrimary(ids),
      members,
    });
  }

  // Possible duplicates: identical name, not already in a strong group together.
  const byName = new Map<string, string[]>();
  for (const c of customers) {
    if (grouped.has(c.id)) continue;
    const k = normName(c.name);
    if (!k) continue;
    const arr = byName.get(k) ?? []; arr.push(c.id); byName.set(k, arr);
  }
  for (const ids of byName.values()) {
    if (ids.length < 2) continue;
    groups.push({ confidence: "possible", reason: "Same name", primaryId: pickPrimary(ids), members: ids.map((id) => byId.get(id)!) });
  }

  // High confidence first.
  groups.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1));
  return Response.json({ groups, count: groups.length });
}
