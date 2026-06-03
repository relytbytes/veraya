# Veraya — Scale-Layer Backlog (sequenced)

*The engineering path from "built for one" to multi-tenant SaaS, dependency-ordered. Hand to Claude Code one phase at a time. Effort = focused solo + AI work. Maps to the scale-readiness gaps in `OVERVIEW.md` → "Honest maturity read."*

**Grounding facts (verified against the repo):**
- `prisma/schema.prisma`: **44 models, zero tenant-scoping** (no `tenantId` anywhere). → **DB-per-tenant needs no schema migration.** Row-level multi-tenancy is explicitly *not* the path.
- `lib/prisma.ts`: a **single global `PrismaClient`** bound to one `DATABASE_URL` at boot. This is the one thing that must change first — everything else depends on it.
- `vercel.json`: **3 project-level crons** (`reservation-reminders`, `weekly-digest`, `vera-snapshot`) — each currently hits one DB.
- Auth is NextAuth (`lib/auth.ts`); Stripe, Twilio, OpenAI already integrated; ~16 env vars.
- Stack: Next.js 16 App Router, Prisma 7, Turso (libsql) — Turso is purpose-built for database-per-tenant.

**Architecture decision (locked):** shared single Vercel deployment + **one Turso database per restaurant**, resolved per request by subdomain. One deploy updates everyone; isolation is physical (stronger diligence story than row-level). See `OVERVIEW.md` and prior architecture discussion.

---

## Phase 0 — Multi-tenancy foundation ⭐ (everything depends on this)
**Goal:** one deployment serves N restaurants, each on its own Turso DB, with zero schema changes and minimal churn to the ~40 existing route handlers.
**Effort:** ~2–4 weeks. **Risk:** low (work is in the data-access layer, not the schema).

### S0.1 — Tenant registry (control plane)
- **What:** a lookup of `subdomain → { tursoUrl, tursoAuthToken, status, displayName }`. Start as a tiny dedicated Turso "control" DB (or a typed config module for the first 1–2 tenants), with a `Tenant` model.
- **Why:** the single source of truth for routing requests to the right database.
- **Touch points:** new `lib/tenancy/registry.ts`; a `control` Prisma schema or a separate lightweight client.
- **Acceptance:** `getTenantByHost(host)` returns connection info or null; secrets never logged.

### S0.2 — Per-tenant Prisma client factory  *(the core change)*
- **What:** refactor `lib/prisma.ts` from a module singleton into a **cached factory** `getPrismaFor(tenant)` (LRU of `PrismaClient`s keyed by tenant; libsql clients are cheap/HTTP-based, so caching ~50 is fine).
- **Crucial migration trick:** keep the existing `import { prisma } from "@/lib/prisma"` working by exporting a **proxy backed by `AsyncLocalStorage`** — the proxy forwards to the request-scoped client. This avoids rewriting 40+ route files. Fall back to `DATABASE_URL` when there's no tenant context (local dev, scripts, crons-without-tenant).
- **Why:** turns "one DB hardwired at boot" into "the right DB per request" without touching call sites.
- **Touch points:** `lib/prisma.ts` (rewrite), new `lib/tenancy/context.ts` (ALS store).
- **Acceptance:** existing routes work unchanged in single-tenant dev; in multi-tenant mode two subdomains read/write different DBs in the same deployment; no client leaks across requests.

### S0.3 — Tenant-resolution middleware
- **What:** Next.js `middleware.ts` (or a per-request initializer) that reads the `Host` header, looks up the tenant (S0.1), and enters the ALS context (S0.2) for the request. Unknown host → marketing/404.
- **Touch points:** new `middleware.ts`; wire ALS entry at the request boundary.
- **Acceptance:** `acme.veraya.app` and `bistro.veraya.app` resolve to their own DBs; an unmapped host is rejected cleanly.

### S0.4 — Tenant-aware auth
- **What:** scope NextAuth sessions/cookies per tenant so a login on one subdomain can't read another. Users live in each tenant's own DB (already the case — `User` is per-DB).
- **Touch points:** `lib/auth.ts`, cookie/domain config, callbacks.
- **Acceptance:** sessions are isolated per subdomain; no cross-tenant token reuse.

### S0.5 — Tenant-aware crons
- **What:** the 3 crons fan out over the registry — loop tenants, run per-DB. Add a shared secret guard (already present via `CRON_SECRET`).
- **Touch points:** `app/api/cron/{reservation-reminders,weekly-digest,vera-snapshot}/route.ts`, `vercel.json` (unchanged schedule; handler iterates tenants).
- **Acceptance:** one cron invocation processes every active tenant; a failure on one tenant doesn't abort the rest (per-tenant try/catch + logged).

### S0.6 — Provisioning script
- **What:** one command: create Turso DB → `prisma migrate deploy` → seed baseline (settings, roles, empty floor) → insert registry row → (optionally) map subdomain.
- **Touch points:** new `scripts/provision-tenant.ts`; reuse existing seed logic.
- **Acceptance:** `node scripts/provision-tenant.ts --name "Bistro" --subdomain bistro` yields a working, reachable instance in minutes.

### S0.7 — Fleet migration runner
- **What:** apply pending Prisma migrations across **all** tenant DBs from one code version; report per-tenant success/failure; idempotent and re-runnable.
- **Why:** removes the version-skew risk that makes "a Vercel project per restaurant" dangerous.
- **Touch points:** new `scripts/migrate-all-tenants.ts`.
- **Acceptance:** running it after a schema change migrates every tenant; a mid-fleet failure is reported and resumable.

> **Exit criteria for Phase 0:** you can stand up a new paying restaurant on its own DB via one script, all share one deploy, code + migrations propagate fleet-wide safely, and data is isolated per tenant. This is the whole "multi-tenancy & data isolation" gap — done solo, no schema migration.

---

## Phase 1 — Self-serve onboarding
**Goal:** a restaurant can sign up and get configured without the founder touching a database.
**Effort:** ~3–6 weeks. **Depends on:** Phase 0.

- **S1.1 — Signup + instance provisioning trigger:** public signup → calls S0.6 behind the scenes → emails the new admin a login. (Until billing exists, gate behind an invite code so provisioning is deliberate.)
- **S1.2 — Setup wizard:** first-run flow for menu (incl. existing photo/CSV import paths), floor plan (reuse `settings/floorplan`), staff/roles, hours, timezone (already auto-detected), tax, receipt/branding.
- **S1.3 — Onboarding state + checklist:** track completion so Vera and reports don't run on an empty venue; surface "finish setup" nudges.
- **Acceptance:** a non-technical operator goes from signup to taking a test order without founder involvement.

---

## Phase 2 — Billing & subscriptions
**Goal:** charge customers automatically; tie pricing to the unit-economics model.
**Effort:** ~1–2 weeks. **Depends on:** Phase 0 (1 is parallel-able).

- **S2.1 — Stripe Billing:** plans/tiers (e.g. base SaaS vs membership-processing tier per `Veraya_Unit_Economics.xlsx`), subscription lifecycle, trials.
- **S2.2 — Entitlement gating:** suspend/limit a tenant on non-payment (flip registry `status`); dunning emails.
- **S2.3 — Billing admin:** founder view of MRR, plan, status per tenant.
- **Note:** not needed for the first design partners — they're **direct-invoiced** (a Stripe invoice, no engine). Build when self-serve volume justifies it.
- **Acceptance:** a new signup picks a plan, is charged monthly, and loses access on failed payment.

---

## Phase 3 — Payments productionization
**Goal:** move from today's Stripe integration to the interchange-plus posture the pricing model assumes.
**Effort:** variable (vendor-shaped). **Depends on:** a processor/payfac relationship (the one unavoidable outside dependency).

- **S3.1 — Processor/payfac selection:** Stripe Connect platform pricing vs Finix/Payrix-style payfac — pick based on the markup economics in the model.
- **S3.2 — Card-present + hardware:** terminal SDK integration for in-person tender at the POS.
- **S3.3 — PCI-light posture:** SAQ-A/A-EP scope via the processor's hosted/SDK flows; document the boundary.
- **S3.4 — Pricing application:** implement the chosen merchant model (interchange-plus / membership) as platform fees.
- **Acceptance:** a real card-present payment settles through the production processor at the modeled cost; PCI scope documented.

---

## Phase 4 — Reliability & ops (scale hygiene)
**Goal:** run a fleet without being paged blind. This — not features — is the real solo ceiling (~15–20 instances).
**Effort:** ~1–2 weeks, then ongoing. **Depends on:** Phase 0.

- **S4.1 — Monitoring & alerting:** error tracking (Sentry) + uptime, tenant-tagged.
- **S4.2 — Per-tenant backups:** scheduled Turso DB backups/restore runbook.
- **S4.3 — Fleet health view:** founder dashboard — per-tenant status, last cron, error rate.
- **S4.4 — Support hooks:** safe per-tenant impersonation/read for debugging; audit it.
- **Acceptance:** an outage on one tenant pages you with the tenant named; any tenant is restorable from backup.

---

## Phase 5 — Compliance & legal (deferred; deal-triggered, cash not engineering)
**Goal:** unlock multi-unit / enterprise deals. Do **not** pay for this speculatively.

- **S5.1 — SOC 2:** compliance tooling (Vanta/Drata) + audit firm; 6–12 mo evidence. ~$25–60k/yr all-in. Trigger: a deal requires it.
- **S5.2 — Legal/insurance:** ToS, DPA, cyber/E&O insurance. ~$2–10k one-time + ~$1–3k/yr.
- **Acceptance:** you can answer a procurement security review without losing the deal.

---

## Sequencing summary

| Phase | Blocks revenue? | Outside dependency | When |
|---|---|---|---|
| **0 — Multi-tenancy** | No (design partners run direct) | None | First — do before juggling 3+ instances |
| **1 — Onboarding** | No | None | When manual provisioning becomes the bottleneck |
| **2 — Billing** | No (invoice manually) | Stripe (already in) | When self-serve volume justifies it |
| **3 — Payments** | No (deposits already work) | **Processor/payfac** | When payments become a revenue line you want |
| **4 — Reliability** | No | Sentry et al (cheap) | Alongside Phase 0–1; hardens as fleet grows |
| **5 — Compliance** | No | Audit firm, lawyer ($) | Triggered by a specific deal |

**Bottom line:** Phase 0 is the only must-do-early item, it's bootstrappable solo in a few weeks with no schema migration, and nothing here forces a raise — a raise or first hire is triggered by *support load* (~15–20 live instances) or a *SOC 2-gated deal*, not by the build.
