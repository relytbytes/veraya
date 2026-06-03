// Apply pending Prisma migrations before the build.
//
// Runs as the first step of `npm run build`, so every Vercel deploy brings the
// (Turso) database schema up to date automatically — no more manual
// `npm run db:deploy`. `prisma migrate deploy` only applies *pending*
// migrations, so this is safe and idempotent to run on every deploy.
//
// - Skips cleanly when DATABASE_URL is unset (e.g. some CI/lint contexts).
// - For Turso (libsql://), the schema engine needs the auth token under
//   DATABASE_AUTH_TOKEN; we map it from TURSO_AUTH_TOKEN when only that is set
//   (Vercel stores it as TURSO_AUTH_TOKEN).
// - If a migration fails, this exits non-zero and fails the build — that's
//   intentional: better to stop the deploy than ship a half-migrated schema.

import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate-deploy] DATABASE_URL not set — skipping migrate deploy.");
  process.exit(0);
}

const env = { ...process.env };
if (url.startsWith("libsql://") && !env.DATABASE_AUTH_TOKEN && env.TURSO_AUTH_TOKEN) {
  env.DATABASE_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;
}

const target = url.startsWith("libsql://") ? "Turso (libsql)" : url.split(":")[0];
console.log(`[migrate-deploy] Applying pending migrations to ${target}…`);

const res = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env });
if (res.status !== 0) {
  console.error("[migrate-deploy] prisma migrate deploy failed — aborting build.");
  process.exit(res.status ?? 1);
}
console.log("[migrate-deploy] Migrations up to date.");
