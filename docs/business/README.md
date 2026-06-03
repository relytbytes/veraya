# Veraya — Business / Investor Docs

Source material for the business plan, investor deck, and data room. Internal language; lift into external materials as needed.

| Doc | Use it for |
|---|---|
| [OVERVIEW.md](./OVERVIEW.md) | Positioning one-pager — the one-liner, problem, product, Vera levels, technical foundation, and an honest maturity read. Deck slide 1–5 source. |
| [COMPETITIVE_MATRIX.md](./COMPETITIVE_MATRIX.md) | Capability coverage vs Toast / Square / OpenTable / SevenRooms / MarginEdge / 7shifts, the strategic read, and the positioning statement. |
| [FEATURE_INVENTORY.md](./FEATURE_INVENTORY.md) | Appendix-grade feature → status → value table, plus the scale-readiness (use-of-funds) gap list. |
| [Veraya_Unit_Economics.xlsx](./Veraya_Unit_Economics.xlsx) | Interactive payments + SaaS unit-economics model. Change the blue inputs (restaurant count, card volume, avg ticket, SaaS price); compares **flat-% vs interchange-plus vs membership** pricing per-restaurant and fleet-wide. Built by `scripts/build_unit_economics.py`. |
| [SCALE_BACKLOG.md](./SCALE_BACKLOG.md) | Sequenced engineering backlog from "built for one" → multi-tenant SaaS. Phase 0 (multi-tenancy, DB-per-tenant, no schema migration) first; hand to Claude Code one phase at a time. Grounded in the actual repo (44 models, global Prisma singleton, 3 crons). |

**On payments pricing (the model's punchline):** interchange (~2.0–2.3% all-in) is the floor nobody beats; the only lever is the markup. A flat-% model (Square/Toast) earns the most but "taxes" the operator's sales — and even a *thin* % markup on six-figure monthly volume quietly becomes your biggest revenue line (see Fleet sheet, row 18). The on-brand move is interchange-plus or a membership tier: price payments to be fair/transparent, make the margin on the platform + Vera. The "we save you money on processing" story only holds once you're on true interchange-plus cost, not vanilla Stripe flat.

**Through-line:** No incumbent runs the whole house on one data model *and* puts a learning brain on top. That unified model is what makes Vera possible, and Vera is the moat.
