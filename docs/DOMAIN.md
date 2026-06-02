# Veraya — web domain & implementation plan

Status: **plan / recommendation.** The app already runs on Vercel at
`veraya.vercel.app`. Pointing a custom domain at it is a Vercel + DNS task (no
code change needed for a single domain); multi-tenant subdomains need a small
amount of code, noted below.

## Recommended domain shape

Veraya is a product (the platform) that individual restaurants run. Two layers:

1. **Marketing / product site** — `veraya.com` (or `.app`/`.io` if `.com` is
   taken). This is the "what is Veraya" site + sign-in entry point.
2. **The restaurant app** — where staff actually work (POS, host, KDS, reports).
   Two viable models:
   - **Single tenant (now):** serve the app on the same domain, e.g.
     `veraya.com` → dashboard after login. Simplest; correct while there is one
     restaurant.
   - **Multi-tenant (later):** per-restaurant subdomains, e.g.
     `northside.veraya.com`, `harbor.veraya.com`. Each restaurant gets its own
     URL and (eventually) its own data scope. This is the path once Veraya
     onboards more than one venue.

Recommendation: **buy `veraya.com` now**, run the current app on it single-tenant,
and reserve the subdomain model for when a second restaurant signs on.

## Step-by-step: attach a custom domain (single domain)

1. Buy the domain (Namecheap, Cloudflare Registrar, or Vercel Domains).
2. Vercel → project **veraya** → **Settings → Domains → Add** → enter `veraya.com`
   (and `www.veraya.com`).
3. Vercel shows the DNS records to create. At your registrar:
   - Apex `veraya.com` → **A** record to Vercel's IP (Vercel shows it), or use
     the registrar's ALIAS/ANAME to `cname.vercel-dns.com`.
   - `www` → **CNAME** to `cname.vercel-dns.com`.
4. Wait for DNS to propagate; Vercel auto-provisions the TLS cert.
5. Set the primary domain to `veraya.com` (redirect `www` → apex, or vice-versa).
6. Update any absolute URLs / env:
   - `EXPO_PUBLIC_API_URL` in the mobile app → `https://veraya.com`.
   - Re-test OAuth/Auth callback (Auth.js uses relative URLs, so usually nothing
     to change; set `AUTH_URL`/`NEXTAUTH_URL` to `https://veraya.com` only if a
     callback mismatch appears).

The waitlist QR already encodes `window.location.origin`, so it follows the new
domain automatically with no change.

## If/when going multi-tenant (subdomains)

Code work required (not needed for a single domain):

1. In Vercel, add a **wildcard domain** `*.veraya.com` to the project.
2. Add Next.js **middleware** to read the subdomain from the `Host` header and
   resolve it to a restaurant/tenant id (e.g. a `Restaurant`/`Tenant` table keyed
   by `slug`).
3. Scope data by tenant (every query filtered by `tenantId`). This is the large
   piece — the current schema is single-tenant, so it would need a tenant column
   on the core models + backfill. Defer until a second venue is real.

## TL;DR

- Now: buy `veraya.com`, attach in Vercel (steps above), point mobile
  `EXPO_PUBLIC_API_URL` at it. No code change.
- Later: wildcard subdomain + tenant-aware middleware + per-tenant data scoping.
