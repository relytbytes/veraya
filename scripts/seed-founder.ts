// Idempotent: create/update the owner's guest card with a permanent
// "Founder of Veraya" note and VIP tag. Runs against whatever DATABASE_URL
// points to (dev.db by default; set DATABASE_URL + DATABASE_AUTH_TOKEN for Turso).

import { prisma } from "@/lib/prisma";

async function main() {
  const c = await prisma.customer.upsert({
    where: { phone: "919.995.7820" },
    update: { name: "Ty Shelton", notes: "Founder of Veraya", tags: "VIP" },
    create: { name: "Ty Shelton", phone: "919.995.7820", notes: "Founder of Veraya", tags: "VIP" },
  });
  console.log(`✓ ${c.name} — ${c.phone} — tags=${c.tags} — notes="${c.notes}"`);
  await prisma.$disconnect();
}

main();
