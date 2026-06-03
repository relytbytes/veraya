# Veraya — Feature Inventory

*Appendix-grade inventory of what exists, mapped to user-facing value. The kind of table an investor or technical diligence reviewer asks for.*

**Status legend**
- **Live** — built, integrated, and working in the single-restaurant deployment.
- **Live · scale-hardening** — functionally complete; needs multi-tenant / production-scale work before fleet rollout.

> Scope note: everything below runs today against a real single-restaurant deployment ("built for one"). The remaining work to become a multi-tenant SaaS is *scale engineering* (tenancy, onboarding, billing, PCI, SOC 2), not feature build-out. See `OVERVIEW.md` → "Honest maturity read."

---

## Front of house / service

| Feature | Status | User-facing value |
|---|---|---|
| POS order entry & cart | Live | Take and modify orders fast; the operational heartbeat of service. |
| Coursing & multi-course holds + auto-fire | Live | Kitchen fires courses on time without manual chasing; better pacing. |
| Comps / voids / refunds (manager-PIN + audited reason) | Live | Loss-prevention control; every adjustment is attributable. |
| Reopen paid check | Live | Fix mistakes after payment without workarounds. |
| Configurable tips (presets + custom) | Live | Faster, cleaner checkout; higher tip capture. |
| Host stand — live floor map | Live | One glance shows the state of the whole room. |
| Table status colors / dining timers | Live | Spot slow tables and turn opportunities in real time. |
| Walk-in & reservation seating | Live | Unified seating flow for any guest. |
| Server load-balancing on seat | Live | Even cover distribution; fairer, smoother service. |
| Table combine / move party | Live | Handle real-world floor changes without breaking the check. |
| Cover counts | Live | Live read on volume for pacing and labor decisions. |
| Timeline view | Live | See the night's bookings as a schedule, not just a map. |
| Kitchen Display System (KDS) | Live | Paperless kitchen; station-routed tickets. |
| Bar Display System (BDS) | Live | Bar gets its own routed ticket stream. |
| Fire rounds / coursing on displays | Live | Cooks see what to fire and when. |

## Reservations, waitlist & guest

| Feature | Status | User-facing value |
|---|---|---|
| Reservation booking w/ overlap & conflict protection | Live | No double-books; the book is trustworthy. |
| Pacing / cover limits | Live | Protect the kitchen from over-seating a slot. |
| Card-on-file deposits & no-show fees (Stripe) | Live · scale-hardening | Recover revenue lost to no-shows. |
| Guest / phone / email search | Live | Find any guest or booking instantly. |
| Two-way SMS (confirm / remind / table-ready) | Live · scale-hardening | Fewer no-shows; modern guest comms. |
| Public self-serve booking page | Live | Guests book directly; no third-party cut. |
| Public waitlist self-add + QR | Live | Walk-ins add themselves; host saves time. |
| Guest CRM profiles + visit history | Live | Recognize and remember every guest. |
| Auto-link reservation → guest by phone | Live | Profiles build themselves; no manual data entry. |
| Auto-tagging (Regular / VIP) | Live | Surface your best guests automatically. |
| Loyalty points | Live | Drive repeat visits. |
| Gift cards | Live | Capture prepaid revenue. |
| Pre-shift guest brief (VIP / allergy / low-tipper flags) | Live | Staff walk in knowing who's coming and what to watch. |

## Back of house / cost control

| Feature | Status | User-facing value |
|---|---|---|
| Inventory levels & adjustments | Live | Know what's on hand. |
| Automatic depletion from sales | Live | Stock counts stay current without manual deduction. |
| Low-stock alerts | Live | Reorder before you 86 a dish mid-service. |
| Beverage BIN program (BTG / BTB, space-aware) | Live | Structured bar inventory and pour tracking. |
| Purchase orders | Live | Formalize ordering. |
| Reorder suggestions | Live | System proposes what to buy. |
| Invoice / photo extraction | Live · scale-hardening | Snap a vendor invoice; it parses — kills manual entry. |
| Recipe & menu costing | Live | Know the true cost and margin of every dish. |
| Prep lists | Live | Standardize daily prep. |
| 86 board (+ predicted 86s) | Live | Communicate outages; anticipate them. |

## Team

| Feature | Status | User-facing value |
|---|---|---|
| Staff accounts & roles | Live | Right access for each role. |
| Scheduling + publish | Live | Build and share the schedule. |
| Time clock | Live | Accurate punches feed labor cost. |
| Punch edits w/ mandatory audited reason | Live | Correct errors with an accountability trail. |
| Training module | Live | Onboard staff inside the platform. |
| Manager log | Live | Shift-to-shift continuity and record. |

## Reporting & analytics

| Feature | Status | User-facing value |
|---|---|---|
| Sales reports | Live | Revenue by day / hour / category / item. |
| Labor reports | Live | Hours and cost by employee / role. |
| COGS / prime cost | Live | The number that determines if the restaurant makes money. |
| Food & beverage cost | Live | Cost ratios per category. |
| Variance (theoretical vs actual usage) | Live | Catch waste, theft, and over-pouring. |
| Scheduling efficiency | Live | Match labor to demand by day-of-week. |
| Natural-language "Ask" over data | Live · scale-hardening | Ask a question in English; get the number. |
| Timezone-correct business-day logic (app-wide) | Live | "Today" means the venue's day everywhere — reports, dashboard, and Vera agree. |

## Vera — intelligence layer

| Capability | Status | User-facing value |
|---|---|---|
| Day-P&L + dimensional health engine (L0) | Live | One health score + ranked flags from the whole operation. |
| Learned baselines from venue history (L1) | Live | Judges the night vs *this* restaurant's normal, not a generic clock. |
| Manager feedback loop (L2) | Live | Tunes what it surfaces to how this operator works. |
| Learned weights vs realized profit (L3) | Live | Learns which signals actually predict this venue's margin. |
| LLM narrative briefs (+ deterministic fallback) | Live · scale-hardening | Owner-readable insight; never hard-depends on the model. |
| Nightly snapshots / training cron | Live | Vera compounds — it gets smarter with every closed day. |

## Platform / technical foundation

| Capability | Status | Value |
|---|---|---|
| Web app (~24 screens) | Live | Full operator console on any browser. |
| Native mobile app (~24 screens) | Live · scale-hardening | Run the floor from a phone/tablet at parity. |
| Real-time event bus (SSE) | Live | Floor / kitchen / POS stay in sync live across devices. |
| Shared backend across surfaces | Live | One source of truth for web + mobile. |
| AI integration abstracted behind one layer | Live | Upgradable model strategy; graceful degradation. |
| Audited mutations + migration hygiene | Live | Trustworthy data; clean schema evolution. |

---

## Scale-readiness gaps (roadmap / use-of-funds)

Not features — the engineering to take "built for one" to "ready for a hundred":

| Gap | Why it's needed |
|---|---|
| Multi-tenancy & data isolation | Serve many restaurants from one platform, safely. |
| Self-serve onboarding / provisioning | Sign up and configure a new venue without hand-holding. |
| Payments productionization (PCI, processor partnership) | Turn deposits/checkout into a compliant revenue line. |
| Billing & subscription management | Charge customers; the SaaS revenue engine. |
| SOC 2-track security & access controls | Table stakes for selling to multi-unit groups. |
| Per-tenant configurability | Each venue's menu, floor, rules, branding. |
