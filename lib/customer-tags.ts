import { prisma } from "@/lib/prisma";

// Visit-count thresholds for automatic loyalty tags.
const REGULAR_AT = 5;
const VIP_AT = 10;

/**
 * Add Regular / VIP tags automatically once a guest crosses the visit-count
 * thresholds. Never removes manually-set tags; only appends. Safe no-op when
 * there's no customer.
 */
export async function applyAutoTags(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { tags: true, visitCount: true },
    });
    if (!c) return;

    const tags = new Set((c.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
    const before = tags.size;
    if (c.visitCount >= REGULAR_AT) tags.add("Regular");
    if (c.visitCount >= VIP_AT) tags.add("VIP");

    if (tags.size !== before) {
      await prisma.customer.update({ where: { id: customerId }, data: { tags: [...tags].join(", ") } });
    }
  } catch (err) {
    console.error("[applyAutoTags]", (err as Error)?.message ?? err);
  }
}
