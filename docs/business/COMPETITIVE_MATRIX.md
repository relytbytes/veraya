# Veraya — Competitive Matrix

*How Veraya maps against the point-solution stack an independent restaurant assembles today. The point isn't to beat any single incumbent at its one job — it's that no one else does all of it on one data model with a learning brain on top.*

---

## The landscape

A typical independent / small-group operator runs:

- **POS:** Toast, Square for Restaurants, TouchBistro
- **Reservations / waitlist / guest:** OpenTable, Resy, SevenRooms
- **Inventory / invoicing / cost:** MarginEdge, xtraCHEF (Toast)
- **Scheduling / labor:** 7shifts, HotSchedules

Four+ vendors, four+ bills, four+ logins, and no shared picture of the night.

---

## Capability coverage

✅ core strength · 🟡 partial / add-on / weak · ⬜ not offered

| Capability | **Veraya** | Toast | Square | OpenTable | SevenRooms | MarginEdge | 7shifts |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| POS / order entry | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| Coursing / KDS / BDS | ✅ | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ⬜ |
| Reservations / waitlist | ✅ | 🟡 | 🟡 | ✅ | ✅ | ⬜ | ⬜ |
| Floor / table management | ✅ | 🟡 | 🟡 | ✅ | ✅ | ⬜ | ⬜ |
| Guest CRM / profiles / tags | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ⬜ | ⬜ |
| Loyalty / gift cards | ✅ | ✅ | ✅ | ⬜ | 🟡 | ⬜ | ⬜ |
| Inventory / depletion | ✅ | 🟡 | 🟡 | ⬜ | ⬜ | ✅ | ⬜ |
| Purchasing / POs / invoice capture | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ✅ | ⬜ |
| Recipe / menu costing | ✅ | 🟡 | ⬜ | ⬜ | ⬜ | ✅ | ⬜ |
| Scheduling / labor | ✅ | 🟡 | 🟡 | ⬜ | ⬜ | ⬜ | ✅ |
| Time clock | ✅ | ✅ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| Reporting / analytics | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | 🟡 |
| **Cross-domain unified data model** | ✅ | 🟡¹ | 🟡¹ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Real-time, multi-surface (web+mobile)** | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| **Learning intelligence layer (per-venue)** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Prescriptive "what to act on now"** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | 🟡² | ⬜ |

¹ Toast/Square cover several domains but bolt them on as separate add-on products with uneven data sharing; reservations/inventory are notably weaker than the specialists. ² MarginEdge surfaces cost variances but is a back-office reporting tool, not a real-time operational brain.

---

## The strategic read

**Incumbents are deep-but-narrow or broad-but-bolted-on.**

- **Toast / Square** are the closest to "platform," but their breadth is a suite of separately-sold modules with uneven integration — and crucially, **no learning intelligence layer**. They report; they don't diagnose.
- **OpenTable / SevenRooms** own the reservation/guest relationship but have zero back-of-house or cost visibility — they can't see margin at all.
- **MarginEdge** is excellent at cost/invoice but is back-office and after-the-fact — no service surface, no real-time.
- **7shifts** is labor-only.

**Veraya's two structural advantages:**

1. **One data model across FOH + BOH + guest + team.** Because sales, labor, inventory, reservations, and guests live together, Veraya can compute a true day-level P&L and cross-domain diagnosis *live* — something no point solution can do, and something the suites don't do because their modules don't share a model.

2. **A learning brain (Vera) that only the unified model makes possible.** It scores each day, learns the venue's own baselines, tunes to manager feedback, and reweights itself against realized profit. This compounds with use — a per-venue data moat and switching cost no single-function vendor can match.

---

## Positioning statement

> **For** independent restaurants and small groups that can't afford a 7-vendor stack or a data analyst, **Veraya** is the unified operating system that runs the whole house *and* tells the operator what's costing them money tonight — **unlike** Toast, OpenTable, or MarginEdge, which each solve one slice and leave the owner to be the integration layer.

---

## Where we deliberately don't compete (yet)

Naming these signals discipline to an investor:

- **Enterprise / large-chain POS** (deep franchise hierarchy, 1000-location rollouts) — not the wedge.
- **Payments processing economics** at incumbent scale — productionizing payments is a roadmap item, not a day-one battleground.
- **Marketing automation / email campaigns** — adjacent, deferrable.

The beachhead is the **independent and small multi-unit operator** underserved by the stack above.
