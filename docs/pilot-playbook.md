# Veraya — Pilot Playbook

*How to run a first pilot with a real restaurant. Low-stakes, low-effort, designed to turn "demo on fake data" into "this works on your restaurant" — and to get the first real testimonial + training data.*

---

## The shape of the pilot

**One restaurant. One slice. Two weeks. Shadow mode.**

- **Slice:** the back-office intelligence layer — Vera's daily forecast + prep, and (optionally) invoice scanning. Not the POS, not the floor. Nothing touches their live service.
- **Shadow mode:** Veraya runs *alongside* whatever they use today. If it's wrong, nothing breaks. This is what makes "yes" easy.
- **Goal:** not revenue. The goal is (1) proof it works on real numbers, (2) one honest testimonial, (3) real data feeding Vera's learning loop.

---

## Who to approach first

The best first pilot is a **warm, forgiving** operator, not a cold prospect:
- An independent or small-group full-service restaurant (not a chain with corporate IT).
- Someone who already knows and likes you, or a friend-of-a-friend owner/GM.
- Ideally on an older POS (e.g. Aloha) where the pain of "no insight" is real.

You are not selling. You are asking a favor and offering something useful for free.

---

## The ask (what to actually say)

> "I've built a tool that forecasts a restaurant's day — sales, covers, how much to prep — and learns your specific patterns over time. I'm not asking you to switch anything or pay anything. I just want to run it quietly next to your current system for two weeks, using your own sales history, and show you what it predicts. If it's useful, great. If it's not, you've lost nothing and you've helped me. Can I get a sales export from your POS and 20 minutes of your time?"

Keep it that honest. A forgiving operator says yes to that.

---

## Setup (≈30 minutes, mostly theirs to pull data)

1. **Get their sales history.** From their POS, export a *Net Sales by Day* report for the last 6 months as CSV. (Aloha: Sales Summary / Net Sales by Day → export → save as CSV.)
2. **Import it.** Settings → Import Real Sales History → upload the CSV. Confirm the result line shows a sensible day count and total. Now Vera forecasts on *their* numbers.
3. **Set the basics.** Restaurant name, service hours, location (Settings → Weather location — needed for the weather signal), and tax rate.
4. **(Optional) Suppliers + invoices.** If you're including invoice scanning, have them photograph a few real supplier invoices so it builds their supplier list and costs.
5. **Give them a login** scoped to their account.
6. **Confirm "this can't hurt you."** Reiterate: it's read-only on their world; importing history and forecasting changes nothing operationally.

---

## The one success metric (agree on it up front)

Pick **one**, write it down, and measure it at the end:
- **Forecast accuracy:** "Vera's daily sales forecast lands within ~10% of actual on most days." (Compare Vera's projection to their real total each day.)
- **Or time saved:** "Invoice entry / prep planning drops from X minutes to Y."

One metric. Agreed before you start. Measured at the end. That's what turns a pilot into a testimonial.

---

## The two weeks

- **Daily (1 min):** glance at Vera's forecast vs. what actually happened. The forecast sharpens as real days accumulate (the learning loop is running).
- **Mid-point check-in (15 min):** ask the operator: what's useful, what's confusing, what's missing, what would make this a "couldn't live without it."
- **Keep a running note** of every reaction. Those quotes are gold for the deck and for the next pilot.

---

## The close (end of two weeks)

1. **Show the result against the metric.** "Here's Vera's forecast vs. your actuals over two weeks."
2. **Ask the three questions:**
   - Was this useful?
   - Would you keep using it?
   - Can I quote you?
3. **Decide the next step together:** keep running it, expand to another slice (e.g. the POS), or move on. Either way you've won — you have real data, a real reaction, and proof for the next conversation.

---

## What you are NOT doing in a first pilot

- Not cutting over their POS or floor operations.
- Not promising uptime guarantees or signing a contract.
- Not charging money (yet).
- Not onboarding multiple locations.

Keep the surface tiny. The whole point is that it's safe to say yes.

---

## After the first pilot

- Fold every piece of feedback into a short punch list.
- Use the testimonial + the accuracy number to make the *next* pilot easier to land.
- A handful of pilots with real usage and retention is what makes an investor conversation real — not the product being "finished."
