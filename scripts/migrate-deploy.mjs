// Apply pending Prisma migrations to the database before the build.
//
// Prisma's own `migrate deploy` cannot connect to Turso (it rejects the
// `libsql://` URL scheme — P1013), so this runner applies the migration SQL
// files directly through the libSQL client and records each one in Prisma's
// `_prisma_migrations` table (same bookkeeping Prisma uses), so the history
// stays consistent and idempotent.
//
// Runs as the first step of `npm run build`, so every deploy brings the schema
// up to date automatically. Safe to run repeatedly — already-applied migrations
// are skipped. For a plain `file:` SQLite URL it defers to `prisma migrate
// deploy` (local/dev), which works fine there.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL not set — skipping.");
  process.exit(0);
}

// Local file DB: Prisma's native deploy handles it.
if (url.startsWith("file:")) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env });
  process.exit(res.status ?? 0);
}

if (!url.startsWith("libsql://") && !url.startsWith("http")) {
  console.warn(`[migrate] Unrecognized DATABASE_URL scheme — skipping libsql runner for: ${url.split(":")[0]}`);
  process.exit(0);
}

// Preview deploys share the same (prod) Turso DB, so never apply un-merged
// migrations from a preview build. Only production builds (or manual runs, where
// VERCEL_ENV is unset) migrate.
if (process.env.VERCEL_ENV === "preview") {
  console.log("[migrate] preview build — skipping migrations (prod DB is shared).");
  process.exit(0);
}

const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
if (!existsSync(MIGRATIONS_DIR)) {
  console.warn("[migrate] No prisma/migrations directory — nothing to apply.");
  process.exit(0);
}

const { createClient } = await import("@libsql/client");
const db = createClient({ url, authToken });

const PRISMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

async function run() {
  await db.execute(PRISMA_MIGRATIONS_DDL);

  const appliedRows = await db.execute(
    `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  const applied = new Set(appliedRows.rows.map((r) => r.migration_name));

  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let count = 0;
  for (const name of dirs) {
    if (applied.has(name)) continue;
    const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    const sql = readFileSync(sqlPath, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");

    console.log(`[migrate] applying ${name}…`);
    try {
      await db.executeMultiple(sql);
    } catch (e) {
      console.error(`[migrate] FAILED on ${name}: ${e.message}`);
      process.exit(1);
    }
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO "_prisma_migrations"
        ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
        VALUES (?,?,?,?,NULL,NULL,?,1)`,
      args: [randomUUID(), checksum, now, name, now],
    });
    count++;
  }

  console.log(count ? `[migrate] applied ${count} migration(s).` : "[migrate] up to date.");
}

run().then(() => process.exit(0)).catch((e) => { console.error("[migrate]", e.message); process.exit(1); });
