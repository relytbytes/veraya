# Veraya — Platform Overview

**Built for one restaurant. Ready for a hundred.**

*Internal positioning one-pager. Source of truth for deck / data-room language.*

---

## The one-liner

**Veraya is a unified restaurant operating system with an intelligence layer — "Vera" — that turns a full shift's worth of operational noise into a short list of what's actually costing the operator money.**

## The problem

An independent restaurant or small group runs on 5–7 disconnected vendors:

- **POS** (Toast, Square, TouchBistro)
- **Reservations / waitlist** (OpenTable, Resy, SevenRooms)
- **Guest CRM & marketing** (often the reservation vendor, or nothing)
- **Inventory / invoicing / cost** (MarginEdge, xtraCHEF)
- **Scheduling / labor** (7shifts, HotSchedules)
- **Analytics** (a patchwork of vendor dashboards + spreadsheets)

None of these talk to each other, so no one has a single picture of the night. And none of them *think* — they report numbers after the fact; they don't tell a busy operator what to act on now. The owner-operator is the integration layer, in their head, while running service.

## The product

Veraya collapses all of it into one platform on a single data model — and then puts a brain on top. Because sales, labor, inventory, reservations, and guests live in one place, Veraya can do something the point-solutions structurally cannot: **diagnose the whole operation in real time and surface the few things that matter.**

That brain is **Vera**.

## Why now / why us

- **Consolidation is the wedge.** Independents can't afford a data team or a 7-vendor stack with integration glue. One platform, one bill, one source of truth.
- **Intelligence is the moat.** Vera learns each venue's own patterns and gets sharper with use — a per-venue data advantage no single-function incumbent can replicate without the unified model underneath.
- **It already exists.** This is a working, integrated, multi-surface product (web + native mobile, real-time), not a prototype or a deck.

---

## What's built — module surface

~40 backend service areas, a ~24-screen web app, and a ~24-screen mobile app at near-parity.

### Front of house / service
- **POS** — order entry, coursing & multi-course holds, auto-fire pacing, manager-PIN-gated comps/voids/refunds with mandatory audited reasons, reopen-paid-check, configurable tips.
- **Host stand** — live floor map (shapes, status colors, dining timers, server load-balancing), walk-in & reservation seating, table combine/move, cover counts, timeline view.
- **Reservations & waitlist** — overlap/pacing/conflict protection, card-on-file deposits & no-show fees (Stripe), guest/phone search, two-way SMS, public self-serve booking + waitlist QR.
- **Kitchen & Bar display (KDS/BDS)** — station-routed tickets, fire rounds, coursing.

### Back of house / cost control
- **Inventory** — automatic depletion from sales, low-stock alerts, beverage BIN program.
- **Purchasing** — POs, reorder suggestions, invoice/photo extraction (parse a vendor invoice from a photo).
- **Menu & recipe costing**, prep lists, 86 board (+ predicted 86s).

### Guest CRM
- Auto-links reservations to guest profiles by phone, visit history, auto-tagging (Regular/VIP), loyalty, gift cards, pre-shift guest briefs (VIPs / allergies / low-tippers flagged before doors).

### Team
- Staff & roles, scheduling + publish, time clock with audited punch edits, training, manager log.

### Reporting
- Sales, labor, COGS / prime cost, food & beverage cost, variance, scheduling efficiency, and a natural-language **"Ask"** interface over the data.

---

## Vera — the intelligence layer (the differentiator)

Vera is a health/diagnosis engine that scores each operating day across cost dimensions and surfaces the few things that matter. It was built in **escalating levels of intelligence** — this is the depth-of-moat story:

| Level | What it does | Why it matters |
|------:|--------------|----------------|
| **0 — Diagnosis engine** | Day-P&L + dimensional health model (labor, comps/voids, COGS, pacing, stock) → one health score + ranked flags. | Turns scattered metrics into a single, actionable read. |
| **1 — Learned baselines** | Ingests ~12 weeks of the venue's *own* history to learn what "a normal Friday by 7pm" looks like. | Judges the night against *this* restaurant's variance, not a generic clock. |
| **2 — Feedback loop** | Managers mark flags helpful / dismissed; Vera adapts what it surfaces. | The tool tunes to how this operator actually works. |
| **3 — Learned weights** | Nightly snapshots correlate each signal against realized profit; Vera reweights itself. | Learns *which signals predict this venue's margin* — self-calibrating. |
| **+ LLM layer** | OpenAI turns the diagnosis into plain-language briefs, with a deterministic fallback. | Owner-readable insight; never hard-depends on the model. |

**The defensibility:** Vera gets smarter the longer a restaurant uses it, and that learning is per-venue and data-locked. That's switching cost *and* a data moat — exactly what a single-function POS or reservation book can't produce.

---

## Technical foundation

- **Stack:** Next.js 16, React 19, Prisma 7, cloud SQLite (Turso), deployed on Vercel with CI on push.
- **Real-time event bus (SSE)** keeps floor / kitchen / POS in sync live across devices.
- **Web + native mobile** from a shared backend — already multi-surface.
- **AI abstracted behind one integration point**, degrades gracefully — not bolted-on prompt calls.
- **Disciplined data practices:** timezone-correct business-day logic app-wide, audited mutations, migration hygiene.

---

## Honest maturity read (for use-of-funds / roadmap)

- **Today:** a deep, working **single-restaurant** platform — "built for one." Broad surface, and the intelligence layer is real and differentiated.
- **To become a fundable multi-tenant SaaS,** the main gaps are *scale* engineering, not features:
  - Multi-tenancy & data isolation
  - Self-serve onboarding / provisioning
  - Payments productionization (PCI scope, processor partnership)
  - Billing & subscription management
  - SOC 2-track security & access controls
  - Per-tenant configurability
  These are standard seed-stage line items — named explicitly, not glossed.
- **Competitive framing:** the goal isn't to out-POS Toast or out-book OpenTable on day one. The wedge is **consolidation + intelligence for independents and small groups** who can't afford a data team. Vera is the unifying brain none of the incumbents have.
