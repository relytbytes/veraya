import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient(): PrismaClient {
  // Local dev falls back to a relative SQLite file; production points
  // DATABASE_URL at Turso (libsql://…) and supplies an auth token.
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
  const adapter = new PrismaLibSql(authToken ? { url, authToken } : { url });
  return new PrismaClient({ adapter });
}

// Use a globalThis singleton in DEVELOPMENT so the same client survives
// hot-module-replacement cycles (avoids exhausting LibSQL connections on
// every file save). In production the module is evaluated once, so a fresh
// client per boot is fine either way.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient());
