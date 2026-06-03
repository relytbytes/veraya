# Deploying Veraya (Vercel + Turso)

## 1. Database — Turso (libSQL)

```bash
# one-time: create the DB and an auth token
turso db create veraya
turso db show veraya --url          # → libsql://veraya-<org>.turso.io
turso db tokens create veraya       # → the auth token
```

First-time setup — apply the migration history + seed (do NOT use `db push` —
it skips the migration files):

```bash
DATABASE_URL="libsql://veraya-<org>.turso.io" \
DATABASE_AUTH_TOKEN="<token>" \
npm run db:deploy        # prisma migrate deploy
npm run db:seed          # optional: seed starter data
```

After that, **migrations apply automatically on every deploy** (see Build below) —
you only run `db:deploy` by hand for the very first setup.

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
- `build` runs `scripts/migrate-deploy.mjs` **before** `next build`, so every
  deploy applies any pending migrations to the database automatically (idempotent
  — `prisma migrate deploy` only runs pending ones). For Turso it maps
  `TURSO_AUTH_TOKEN` → `DATABASE_AUTH_TOKEN` for the schema engine. If a migration
  fails, the build fails on purpose rather than shipping a half-migrated schema.
- `vercel.json` registers the daily reservation-reminder cron.

Point Vercel at the repo and deploy. After the first deploy, set the Stripe
webhook and Twilio inbound-SMS webhooks to the deployed URLs.
