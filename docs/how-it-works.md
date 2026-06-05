# Veraya — How It Works (Pitch & Sales Reference)

Plain-English explanations of what's happening behind the scenes, written so you
can explain it confidently in pitch meetings and sales calls. Each section has:

- **What the operator sees** — the surface experience
- **Behind the scenes** — the actual mechanism (accurate, not marketing fluff)
- **🎤 Say this** — a tight line for a pitch or demo

> One-liner for the whole product: **Veraya is a restaurant operating system with
> a learning brain. It runs the floor, the kitchen, the books, and the bar — and
> a model named Vera reads every shift, tells the operator what to do right now,
> and forecasts what's coming, getting sharper at *their* restaurant every day.**

---

## 1. Vera — the operational brain (live health score)

**What the operator sees:** A score out of 100 with a one-line read on the shift
("Service hasn't started but we project a normal day of $7,839…"), a projected
P&L (on pace / net / break-even), and a short list of what needs attention.

**Behind the scenes:** Every time the dashboard loads, Vera runs a real
diagnosis (`lib/vera-health.ts`) across **five dimensions**, each scored 0–100:

| Dimension | What it measures |
|-----------|------------------|
| **Profitability** | Projected day P&L vs. break-even (revenue − food cost − labor − fixed overhead) |
| **Demand** | Actual sales pace vs. the *learned* normal for this weekday & hour |
| **Labor** | Labor as a % of revenue against a 20% target |
| **Cost & Inventory** | Penalties for stock-outs, 86s, below-par items, vendor price swings |
| **Service** | Voids + comps as a % of sales |

The overall score is a **confidence-weighted blend** of the five. Early in a
shift it leans toward a neutral read (it says "early read, firms up as the shift
fills in") and sharpens as real data comes in. Hard rules override the math —
e.g. a projected loss caps the score, an empty dining room mid-service caps it
lower — so the number can't look healthy while the day is actually underwater.

The projected P&L is a full waterfall: projected revenue, minus food/bev cost,
minus labor, minus fixed daily (rent/salaries), minus other operating, equals
projected net and margin %.

**🎤 Say this:** *"Vera isn't a dashboard of charts — it's a diagnosis. It grades
five parts of your operation in real time, projects the day's profit before
service even starts, and tells the manager the one or two things to fix right
now. It's the GM's experienced gut, quantified."*

---

## 2. Vera learns *your* restaurant — three loops

This is the differentiator. Vera is not a fixed rules engine; it adapts to each
venue from its own data.

### Loop 1 — Learned baselines (`lib/vera-baselines.ts`)
Every read, Vera rebuilds **per-weekday revenue profiles** and an **intraday
pacing curve** from the last ~12 weeks of orders. That's how it can say "you're
ahead of pace for a Friday at 7pm" instead of using a flat clock. More history →
sharper baseline.

### Loop 2 — Learned weights (`lib/vera-weights.ts`) — the real "model"
Each night a snapshot records the five dimension scores **plus that day's actual
profit margin** (`VeraDaySnapshot`). Once 14+ days exist, Vera runs a **Pearson
correlation** of each dimension against realized profit and **re-weights the
overall score toward whichever signals actually predict profit at *this*
restaurant** — blended with sensible defaults via Bayesian shrinkage so it
doesn't overreact early. That's the "Vera is learning" badge; it graduates at 14
days and then shows "what drives your profit."

### Loop 3 — Human feedback (`VeraFeedback`)
Every 👍 / dismiss on an insight is stored and used to suppress noisy alerts
(4+ dismissals) and surface the ones the operator finds useful first.

**🎤 Say this:** *"Two restaurants are different businesses. Vera figures out what
actually drives profit at each one — for a high-volume spot it might be labor
discipline, for a fine-dining room it might be cost control — and re-weights its
score accordingly. It gets smarter every single night, and the operator can
teach it with one tap."*

---

## 3. Vera Forecast — demand forecasting (the "research-grade" engine)

**What the operator sees:** A "tonight" projection — projected sales, projected
covers, a lunch/dinner split, holiday/weather chips, and a prep list ("prep 21×
salad, 9× steak").

**Behind the scenes** (`lib/forecast.ts`, deliberately interpretable, not a black
box):

1. **Recency-weighted seasonal model** — same-weekday history, where recent weeks
   count exponentially more than older ones, plus a **damped trend** term so a
   rising or falling venue is projected forward, not averaged flat.
2. **Demand signals** — tonight's confirmed **reservations** set a cover floor and
   lift the projection; booked **private events** stack their guest counts and
   spend on top.
3. **Exogenous signals** — a built-in **US holiday calendar** and a free
   **weather** lookup (Open-Meteo, no API key) nudge demand up or down within a
   conservative band.
4. **Newsvendor prep** — instead of "prep the average," each item is prepped to a
   **service-level quantile** (μ + z·σ): the statistically right trade-off between
   food waste and running out. This is the textbook inventory-under-uncertainty
   model used in supply chains.
5. **Per-daypart** — lunch and dinner each get their own forecast and share of day.

**How we *prove* it's good — the part most competitors can't show:** there's a
**backtest harness** (`/api/vera/forecast/backtest`). It replays the model day by
day using *only* the data that existed before each day (no cheating), and scores
its error against a naive average. On test data the model cut forecast error from
~17% to ~6.5%. A **nightly self-tuning job** grid-searches the model's parameters
against the venue's own history and keeps the lowest-error settings — and only
adopts a change if it *beats* the current one.

**🎤 Say this:** *"This is real forecasting, not a guess. It blends your sales
history, your bookings, the weather, and holidays — then it preps your kitchen to
the mathematically optimal quantity to balance waste against running out. And we
can prove the accuracy: every model change is backtested against your own history
before it ships, and the model re-tunes itself to your restaurant every night."*

---

## 4. Real-time, everywhere (push, not refresh)

**What the operator sees:** 86 an item on a phone in the kitchen and it reflects
on the dashboard, the POS, and Vera almost instantly — across every device.

**Behind the scenes:** A publish/subscribe layer (`lib/realtime.ts`) backed by
Redis. When inventory, an 86, or an order changes, the server publishes an event;
every connected device is subscribed over a live stream (SSE) and updates without
polling. It degrades gracefully to a polling fallback if Redis isn't configured.

**🎤 Say this:** *"The whole platform is live. There's no 'pull to refresh' —
change something in the kitchen and the floor, the office, and Vera all know in
about a second. One source of truth, everywhere at once."*

---

## 5. Inventory intelligence

- **Auto-depletion:** firing a dish decrements its recipe's ingredients
  automatically — inventory tracks itself as you cook.
- **Vera predicts run-outs:** based on the night's pace, Vera flags "X runs out at
  ~8pm → would 86 these dishes" *before* it happens.
- **Named alerts:** Vera tells you exactly *which* items are out / 86'd / low, not
  just a count.
- **Smart reorder:** order quantities round to real pack sizes; costs are corrected
  to actual on the invoice (weighted-average cost).

**🎤 Say this:** *"Inventory counts itself as the kitchen cooks, and Vera warns you
that you'll run out of branzino around 8 o'clock — while you still have time to do
something about it."*

---

## 6. The rest of the platform (one system, not a stack of apps)

POS + coursing/holds, KDS & BDS (kitchen + bar display), host stand with a live
floor plan, reservations + waitlist + guest CRM, purchasing & supplier database
from scanned invoices, payroll register, P&L, scheduling with overtime alerts,
training manuals, event ticketing. It's all one database — which is *why* Vera can
see across the whole operation at once.

**🎤 Say this:** *"Most restaurants run a POS, a reservation app, a scheduling app,
an inventory app — none of which talk to each other. Veraya is one system. That's
not just tidier; it's the reason the brain works — Vera sees sales, labor,
inventory, and bookings together, which no point solution can."*

---

## 7. The demo data (how we show all this on a fresh account)

**Settings → Simulate Sales Data** generates realistic history on demand: tagged
orders with day-of-week and hourly patterns, a learning snapshot per day (so the
model is already trained), and a week of upcoming reservations. One button, and a
brand-new account shows the full system working — and "Clear simulated" wipes it.

**🎤 Say this (internal / demo):** *"We can stand up a fully populated, learning
restaurant in one click for a demo, then clear it. The prospect sees Vera trained
and forecasting on day zero."*

---

## Quick credibility facts for Q&A

- **Forecast accuracy is measured, not claimed** — walk-forward backtest vs. a
  naive baseline, viewable in Settings.
- **The model self-tunes nightly** and only adopts changes that lower error.
- **Prep uses the newsvendor model** (service-level quantile), the standard for
  inventory under uncertainty.
- **Vera's weighting is learned per-venue** via correlation to realized margin,
  with Bayesian shrinkage so it's stable early.
- **Weather/holidays are honest priors today**, with the data pipeline in place to
  learn true coefficients from accumulated history (roadmap, not vaporware).
- **Everything is live** over a Redis-backed pub/sub layer.

---

*This document is the plain-English companion to the code. Engineering source of
truth: `lib/vera-health.ts`, `lib/vera-baselines.ts`, `lib/vera-weights.ts`,
`lib/forecast.ts`, `lib/realtime.ts`.*
