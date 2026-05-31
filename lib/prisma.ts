import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:/Users/ty/restaurant-ops/prisma/dev.db",
  });
  return new PrismaClient({ adapter });
}

// Use a globalThis singleton in DEVELOPMENT so the same client survives
// hot-module-replacement cycles (avoids exhausting LibSQL connections on
// every file save). In production the module is evaluated once, so a fresh
// client per boot is fine either way.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient());
