// Standardized training manuals shipped with Veraya — a differentiator: every
// venue starts with a professional baseline instead of blank documents. These
// render in the Training → Manuals reader. Custom TrainingDocument rows from the
// DB are merged in alongside these by the API.

export interface Manual {
  id: string;
  title: string;
  category: "Service" | "Bar" | "Kitchen" | "Safety" | "Systems";
  summary: string;
  roles: string[];        // which roles it's most relevant to (empty = all)
  content: string;        // lightweight markdown (#, ##, -, plain lines)
  builtIn: true;
}

export const STANDARD_MANUALS: Manual[] = [
  {
    id: "std-steps-of-service",
    title: "Steps of Service",
    category: "Service",
    summary: "The standard sequence for every table, greeting through goodbye.",
    roles: ["SERVER", "HOST", "SERVER_ASSISTANT"],
    builtIn: true,
    content: `# Steps of Service

## 1. Greet (within 60 seconds)
- Approach within one minute of the table being seated.
- Warm welcome, water service, mention any features or 86'd items.

## 2. Drinks & Apps
- Take beverage order first; suggest a cocktail, wine by the glass, or N/A option.
- Fire drinks immediately; offer starters to share.

## 3. Order & Coursing
- Repeat the order back. Note allergies and fire instructions.
- Course the table: apps → entrees → dessert. Hold/fire as the table paces.

## 4. The Meal
- Two-minute / two-bite check back after each course is delivered.
- Pre-bus, refill water, never let a guest ask for something they should already have.

## 5. Dessert & Coffee
- Always offer dessert, coffee, and after-dinner drinks.

## 6. Check & Goodbye
- Drop the check promptly once requested; run payment within two minutes.
- Thank the guest by name when possible. Reset the table cleanly.`,
  },
  {
    id: "std-service-standards",
    title: "Service Standards & Hospitality",
    category: "Service",
    summary: "What 'taking care of the guest' means here, in specifics.",
    roles: ["SERVER", "HOST", "BARTENDER", "MANAGER"],
    builtIn: true,
    content: `# Service Standards

## The non-negotiables
- Make eye contact and smile. Use the guest's name when you have it.
- Anticipate: empty glass, dropped napkin, an allergy concern — handle it before being asked.
- Never say "no." Offer the closest yes.

## Recognizing guests
- Check the host stand / Veraya guest tags for VIPs, regulars, allergies, and notes before the table is seated.
- Flag a special occasion to the manager so we can make it memorable.

## Handling a complaint (LAST)
- **Listen** fully, don't interrupt.
- **Apologize** sincerely — own it on behalf of the house.
- **Solve** it — comp, remake, or escalate to a manager.
- **Thank** them for telling us.`,
  },
  {
    id: "std-wine-service",
    title: "Wine & Beverage Service",
    category: "Bar",
    summary: "Presenting, opening, and pouring wine; BTG and bottle standards.",
    roles: ["SERVER", "BARTENDER"],
    builtIn: true,
    content: `# Wine & Beverage Service

## By the glass
- Standard pour is 5 oz (148 mL). Use the lined glass or a jigger when in doubt.
- Show the bottle if it's a premium pour.

## Bottle service
- Present the bottle label-first to the host who ordered it.
- Open at the table. Offer the cork. Pour a taste for the host; wait for approval.
- Pour clockwise, ladies first, host last. Fill to the widest point of the glass, never more.

## Pairing basics
- Acidic / sparkling with fried & rich. Tannic reds with fat & protein. Off-dry with spice.
- When unsure, ask the guest's preference (lighter vs bolder) and suggest two options.`,
  },
  {
    id: "std-allergens",
    title: "Allergen Handling",
    category: "Safety",
    summary: "The Big-9 allergens and the protocol for an allergy table.",
    roles: ["SERVER", "KITCHEN", "MANAGER"],
    builtIn: true,
    content: `# Allergen Handling

## The Big 9
Milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame.

## Protocol for an allergy table
1. Flag the allergy on the ticket AND verbally to the kitchen and manager.
2. Confirm ingredients — never guess. Check the recipe in Veraya if unsure.
3. Kitchen: change gloves, clean surface, dedicated pan/utensils. Prevent cross-contact.
4. The manager or chef runs the allergy plate to the table and confirms with the guest.

## If in doubt
Treat it as life-threatening. Get a manager. Do not serve until confirmed safe.`,
  },
  {
    id: "std-food-safety",
    title: "Food Safety Basics",
    category: "Safety",
    summary: "Temperatures, handwashing, and cross-contamination essentials.",
    roles: ["KITCHEN", "SERVER", "MANAGER"],
    builtIn: true,
    content: `# Food Safety Basics

## Temperature danger zone
- 41°F – 135°F is the danger zone. Minimize time food spends there.
- Cook: poultry 165°F, ground meat 155°F, whole cuts 145°F, fish 145°F.
- Cold holding ≤ 41°F. Hot holding ≥ 135°F.

## Handwashing
- 20 seconds, warm water, before handling food, after the restroom, after touching face/phone/raw protein.

## Cross-contamination
- Color-coded boards. Raw below ready-to-eat in the walk-in.
- Sanitize surfaces between tasks. Date and label everything (FIFO).`,
  },
  {
    id: "std-opening-closing",
    title: "Opening & Closing Checklist",
    category: "Kitchen",
    summary: "Standard open and close duties front and back of house.",
    roles: [],
    builtIn: true,
    content: `# Opening & Closing

## Opening
- Clock in. Review the pre-shift brief in Veraya (covers, VIPs, 86 list, features).
- FOH: set tables, polish glass/silver, stock stations, check restrooms.
- BOH: temp the coolers, check prep par levels, set up the line.

## During
- Keep the 86 board current in Veraya the moment something runs low.
- Run side work between tables; never stand idle.

## Closing
- Reconcile drawers and tips. Complete the manager log.
- FOH: reset for AM, break down stations, final sweep.
- BOH: wrap/label/date all product, clean the line, take out trash, final temps.`,
  },
  {
    id: "std-veraya-pos",
    title: "Veraya POS Quick Start",
    category: "Systems",
    summary: "Ringing in, coursing/holds, comps & voids, and closing checks.",
    roles: ["SERVER", "BARTENDER", "HOST", "MANAGER"],
    builtIn: true,
    content: `# Veraya POS Quick Start

## Ringing an order
- Open the table from the floor plan. Add items; they route to the right station automatically.
- Use **Hold** to fire a course later; **Fire** sends a held course to the kitchen now.
- The floor color follows the course (seated → apps → entrees → dessert) automatically.

## Comps & voids
- Both require a manager PIN and a specific reason — choose the real one; it's recorded and reviewed.

## Closing a check
- Take payment (Cash or Card), add the tip, and close. Reopen a paid check only with a manager.

## Tips
- Keep the table's course accurate — Vera and the host stand read it live.`,
  },
  {
    id: "std-foh-server-playbook",
    title: "FOH Server Playbook",
    category: "Service",
    summary: "The complete server role: section setup, full steps of service, table maintenance, POS, and closing sidework.",
    roles: ["SERVER", "SERVER_ASSISTANT", "HOST"],
    builtIn: true,
    content: `# FOH Server Playbook

The server owns the guest's experience from the moment they sit until they leave happy. Your job is hospitality first, sales second, speed always.

## Pre-shift (before your first table)
- Clock in and read the Veraya pre-shift brief: cover count, large parties, VIPs/regulars, the 86 list, and tonight's features.
- Taste the features so you can describe and sell them honestly.
- Set your section: tables clean and level, seats wiped, silver/glass polished, condiments full, candles/flowers right.
- Stock your station: check pads, pens, wine key, lighter, crumber, extra napkins, to-go supplies.

## Steps of service (the standard sequence)
1. **Greet within 60 seconds.** Smile, welcome them, drop water, mention 86'd items and features. If you'll be a moment, acknowledge the table anyway.
2. **Beverages first.** Suggest a cocktail, wine by the glass, or a thoughtful N/A option. Fire drinks immediately.
3. **Starters.** Offer something to share while they decide. Make a real recommendation.
4. **Take the order.** Go ladies first, then clockwise. Repeat it back. Note every allergy and any fire/hold instruction.
5. **Course it.** Apps → entrees → dessert. Hold and fire to the table's pace, never dump the whole order on the kitchen at once.
6. **Deliver & check back.** Two-bite / two-minute check after each course lands. "How is everything?" only counts if you mean it and act on the answer.
7. **Pre-bus continuously.** Clear finished plates, refill water and drinks before they're empty, crumb before dessert.
8. **Dessert & coffee.** Always offer — dessert, coffee, after-dinner drinks. This is where check averages grow.
9. **Check & farewell.** Drop the check promptly once they're ready; run payment within two minutes. Thank them by name. Reset the table.

## Table maintenance standards
- No empty glass sits longer than a moment. Refill water unasked.
- Never let a guest ask for something you should have already brought (more bread, a side plate, another napkin).
- Mark the table's course accurately in Veraya — the kitchen, the host stand, and Vera all read it live.
- Handle plates by the rim, glasses by the stem/base. Carry trays low and balanced.

## Selling like a pro
- Suggest, don't ask. "The branzino is the move tonight" beats "Do you want an appetizer?"
- Anchor high, then offer range. Recommend two options when a guest is unsure.
- Add-ons are hospitality when they fit: a wine pairing, a shared starter, a dessert for the table.

## POS essentials
- Open the table from the floor plan; items route to the right station automatically.
- **Hold** stages a course to fire later; **Fire** sends it now. Keep coursing honest.
- Comps and voids need a manager PIN and a true reason — it's recorded and reviewed.
- Take payment, add tip, close. A paid check reopens only with a manager.

## Closing sidework
- Reconcile your sales, cash, and tips; tip out per house policy.
- Reset your section for the next shift: tables, condiments, stock.
- Complete assigned rotating sidework (polishing, restocking, station deep-clean).
- Check out with a manager before you leave — never skip the check-out.`,
  },
  {
    id: "std-bartender-playbook",
    title: "Bartender Playbook",
    category: "Bar",
    summary: "Bar open/close, pour standards, well/call/premium, BTG/BTB handling, responsible service, and cleanliness.",
    roles: ["BARTENDER"],
    builtIn: true,
    content: `# Bartender Playbook

The bar is a station, a sales engine, and a stage. You run service for bar guests and the well for the floor, and you do it accurately, quickly, and legally.

## Opening the bar
- Clock in, read the pre-shift brief, note the 86 list and features.
- Stock: liquor wells full and in standard position, beer cold and rotated (FIFO), wine BTG opened/dated, garnishes cut fresh, juices and mixers dated.
- Set tools: shakers, strainers, jiggers, bar spoon, muddler, channel knife, clean towels.
- Check the BIN system in Veraya — confirm BTG (by-the-glass) and BTB (by-the-bottle) counts match what's physically open.
- Ice down, set glassware, test soda gun, prep batches if used.

## Pour standards (accuracy = cost control)
- Standard spirit pour: **1.5 oz** in a cocktail unless the spec says otherwise. Always jigger or use a measured pour — free-pouring drifts and kills margin.
- Wine by the glass: **5 oz**. Beer: full pour, proper head, correct glass.
- Doubles, neat, and tall pours follow the recipe card, not feel.
- Make every drink to spec, every time — consistency is the product.

## Well, call, premium
- **Well/house:** the default spirit poured when no brand is named.
- **Call:** the guest names a brand ("Tito's and soda").
- **Premium/top-shelf:** upsell when it fits — "Want that with Casamigos?" Ring the correct, higher-priced item; never pour premium and ring well.

## By-the-glass & by-the-bottle (BTG / BTB)
- When you open a new BTG wine, log it in Veraya so the BIN count and pour-tracking stay accurate.
- Date every opened bottle. Pull anything past its freshness window.
- BTB service follows wine-service standards: present label-first, open at the table or bar rail, offer the taste, pour to the widest point of the glass.

## Responsible service (non-negotiable)
- Check ID for anyone who looks under 30. Verify the photo, the birthdate, and the expiration.
- Refuse service to anyone visibly intoxicated — politely, firmly, and tell a manager. Offer water, food, a ride.
- Never serve a minor. Pace drinks. You are legally and personally responsible for over-service.

## Cleanliness & flow
- Wipe the bar top and rail constantly; a wet, sticky bar reads as a dirty bar.
- Clean as you go: rinse tins between drinks, change cutting boards, empty the dump sink.
- Keep glassware spotless — inspect for lipstick, spots, chips before pouring.

## Closing the bar
- Reconcile the drawer and tips; finalize sales in Veraya.
- Cap and date open product, break down the well, restock for the next shift, update BIN counts.
- Clean guns, mats, sinks, and the well; take out recycling/trash; lock liquor per policy.
- Check out with a manager.`,
  },
  {
    id: "std-boh-line-playbook",
    title: "Kitchen / Line Cook Playbook",
    category: "Kitchen",
    summary: "Station setup & mise, the line during service, ticket discipline, KDS use, food safety, and line close.",
    roles: ["KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP"],
    builtIn: true,
    content: `# Kitchen / Line Cook Playbook

The line wins or loses on preparation, consistency, and communication. Cook to spec, keep your station clean, and call the ticket.

## Station setup & mise en place
- Clock in, read the pre-shift brief and the prep list, note the 86 list and reservation/cover forecast.
- Set your mise to par: everything labeled, dated, and within reach. If you run out mid-service, you weren't set up.
- Temp your coolers and hot wells at open; record temps where required.
- Check equipment: burners, flat-top, fryer oil quality/temp, oven calibration, reach-in seals.
- Sharpen knives, lay out clean towels (dry for handling hot, sanitizer bucket for wiping).

## Reading & calling the ticket
- The expo/lead "calls" the order; the line "all day" confirms counts ("two branzino, all day three").
- Acknowledge every call out loud — silence on the line is how tickets get dropped.
- Fire to the course and the table's pace shown on the KDS; don't fire entrees before apps clear unless told.
- Communicate timing: "two minutes on the rib-eye," "I'm in the weeds on sauté, need a hand."

## Cooking to spec
- Every plate matches the recipe and the plating photo — portion, temp, garnish, sauce placement.
- Cook temps: poultry 165°F, ground 155°F, whole cuts/fish 145°F. Use a clean, calibrated thermometer.
- Taste as you go where safe. Season deliberately. Never send a plate you wouldn't eat.
- Wipe every plate rim before it goes in the window. Presentation is half the dish.

## KDS / Veraya discipline
- Bump a ticket only when the food is in the window and complete — bumping early breaks the whole timing picture.
- 86 an item in Veraya the instant you run out so the floor and bar stop selling it immediately.
- Watch the all-day counts on screen; they drive your fire decisions.

## Food safety on the line
- 41–135°F is the danger zone — minimize time there. Cold holding ≤41°F, hot holding ≥135°F.
- Color-coded boards; raw protein stored below ready-to-eat. Sanitize between tasks.
- Wash hands 20 seconds: before handling food, after raw protein, after touching your face/phone, after the restroom.
- FIFO everything: first in, first out, all product labeled and dated.

## Allergy tickets
- An allergy ticket stops the autopilot: fresh gloves, clean board and pan, dedicated utensils, zero cross-contact.
- Confirm ingredients against the recipe — never guess. The chef or manager runs and confirms the allergy plate.

## Line close
- Wrap, label, and date all product; rotate into the walk-in by FIFO.
- Break down, clean, and sanitize your station, equipment, and the floor beneath it.
- Final temps recorded, fryer filtered/capped, gas and equipment off per policy.
- Restock for the next shift's open. Check out with the chef or manager.`,
  },
  {
    id: "std-manager-gm-playbook",
    title: "Manager / GM Playbook",
    category: "Systems",
    summary: "Opening & closing manager duties, cash handling, shift handoff, comps/voids oversight, PO approval, and incident logs.",
    roles: ["MANAGER", "ADMIN"],
    builtIn: true,
    content: `# Manager / GM Playbook

The manager owns the shift: the team, the guests, the money, and the building. You set the tone at pre-shift and you close the loop at the end.

## Opening duties
- Walk the building: dining room, bar, kitchen, restrooms, entry. Fix what a guest would notice before doors open.
- Pull the day's outlook in Veraya: covers, reservations, large parties, VIPs, events, weather.
- Count and assign drawers; verify the safe and starting bank.
- Confirm staffing against the forecast — call in or cut early based on Vera's labor plan and the cover count.
- Run an effective **pre-shift**: features, 86 list, VIPs/regulars, goals, one teaching point. Taste features with the team.

## During service — manage the floor
- Touch tables, especially VIPs, large parties, and any table that's been waiting. You are the recovery valve.
- Watch the pace: seating flow, ticket times, the bar, the host stand. Step in before a problem becomes a complaint.
- Keep labor honest — send people home as volume drops; flag anyone approaching overtime (Veraya alerts hourly staff over 32h and projects OT against the schedule).

## Cash handling
- Drawers are counted in and out by the manager; never let an employee count their own unobserved on a discrepancy.
- Drop large bills to the safe per policy. Document every drawer over/short and investigate anything beyond tolerance.
- Reconcile cash, card batch, and tips at close. Tips out per house policy; finalize the day's sales in Veraya.

## Comps & voids oversight
- Comps and voids require your PIN and a true reason — approve only legitimate ones and choose the accurate category.
- Veraya records every comp/void by employee and reason; review them daily. Patterns (one server, one item, one register) get investigated, not ignored.
- A comp is a recovery tool, not a giveaway — use it to fix a guest's night, then note what went wrong.

## Purchasing / PO approval
- Review and approve purchase orders in Veraya before they're sent — confirm quantities, pricing, and supplier against need and par.
- POs use two-step approval: created, then approved. Don't rubber-stamp; check that reorder quantities match real usage and that received costs are corrected to actual on the invoice.
- Verify deliveries against the PO at receiving: counts, weights, temps, prices. Log discrepancies and short/over.

## Shift handoff
- Review the shift handoff in Veraya: sales vs. forecast, labor, 86s, **received items / open POs needing approval**, equipment issues, guest situations, and anything the next manager must own.
- Don't leave open loops — a reservation problem, a maintenance ticket, a guest follow-up gets written down and assigned, not remembered.

## Incident & manager log
- Log every meaningful event: guest injury or illness, refused/over-service, employee discipline, safety issues, equipment failure, refunds/voids of note.
- Be factual and specific: who, what, when, where, witnesses, action taken. The log is a legal and operational record.
- Escalate serious incidents (injury, alleged intoxication, harassment, theft) to ownership immediately and document the notification.

## Closing duties
- Final walk of the building; verify BOH and FOH closes are actually done, not just claimed.
- Secure cash, lock liquor, set the alarm, check all doors and equipment off.
- Complete the manager log and the daily numbers so the next shift opens informed.`,
  },
];

export function manualById(id: string): Manual | undefined {
  return STANDARD_MANUALS.find((m) => m.id === id);
}
