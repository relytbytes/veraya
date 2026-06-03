# Deploying Veraya (Vercel + Turso)

## 1. Database — Turso (libSQL)

```bash
# one-time: create the DB and an auth token
turso db create veraya
turso db show veraya --url          # → libsql://veraya-<org>.turso.io
turso db tokens create veraya       # → the auth token
```

Apply the migration history to Turso. **Prisma's own `migrate deploy` cannot talk
to Turso** (it rejects the `libsql://` scheme — P1013), so use the libSQL runner,
which applies the migration SQL files directly and records them in
`_prisma_migrations`:

```bash
DATABASE_URL="libsql://veraya-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<token>" \
npm run db:deploy:turso   # node scripts/migrate-deploy.mjs — applies pending migrations to Turso
npm run db:seed           # optional: seed starter data
```

Run `db:deploy:turso` (with the same env) **after every schema change** to apply
new migrations to prod. It's idempotent — already-applied migrations are skipped.
(`npm run db:deploy` = plain `prisma migrate deploy`, which works only for a local
`file:` SQLite DB, not Turso.)

## 2. Vercel environment variables

Set these in the Vercel project (Production + Preview):

| Var | Value |
|-----|-------|
| `DATABASE_URL` | `libsql://veraya-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | the token from above |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | the deployed origin, e.g. `https://veraya.vercel.app` |
| `OPENAI_API_KEY` | Vera intelligence |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS |
| `CRON_SECRET` | bearer token Vercel Cron sends to the reminder endpoint |

See `.env.example` for the full list.

## 3. Build

No special config needed:
- `postinstall` runs `prisma generate` (the client lives in the gitignored
  `app/generated/prisma`, so it must be regenerated on every install).
- `build` runs `scripts/migrate-deploy.mjs` (the libSQL runner) **before**
  `next build`, so **production** deploys apply pending migrations to Turso
  automatically — idempotent, and it records each in `_prisma_migrations`.
  Prisma's own `migrate deploy` can't reach Turso (P1013), which is why this
  custom runner exists. Guards: it **skips on preview builds** (preview shares
  the prod DB, so un-merged migrations must not apply), maps `TURSO_AUTH_TOKEN`
  → `DATABASE_AUTH_TOKEN`, and fails the build if a migration errors rather than
  shipping a half-migrated schema. You can still apply manually any time with
  `npm run db:deploy:turso` (prod env).
- `vercel.json` registers the daily reservation-reminder cron.

Point Vercel at the repo and deploy. After the first deploy, set the Stripe
webhook and Twilio inbound-SMS webhooks to the deployed URLs.
