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
];

export function manualById(id: string): Manual | undefined {
  return STANDARD_MANUALS.find((m) => m.id === id);
}
