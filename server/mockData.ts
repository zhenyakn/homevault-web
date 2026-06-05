import type {
  InsertProperty,
  InsertExpense,
  InsertRepair,
  InsertRepairQuote,
  InsertUpgrade,
  InsertUpgradeOption,
  InsertUpgradeItem,
  InsertLoan,
  InsertWishlistItem,
  InsertPurchaseCost,
  InsertCalendarEvent,
  InsertInventoryItem,
} from "../drizzle/schema";

/**
 * Strip server-assigned fields so seed objects only describe user-visible data.
 * `id`, `ownerId`, `propertyId`, `createdAt`, `updatedAt` are injected by the
 * seeding loop in db.ts — they must not be in the mock data objects.
 */
type Seed<T> = Omit<
  T,
  "id" | "ownerId" | "propertyId" | "createdAt" | "updatedAt"
>;

/**
 * HomeVault — Demo / POC Seed Data
 * Location: Tel Aviv, Israel (Florentin neighbourhood)
 *
 * HOW TO USE
 * ----------
 * 1. Click "Restore demo property" in Settings → Data.
 * 2. The seed is fully idempotent — safe to run multiple times.
 *    It finds (or recreates) the property by MOCK_PROPERTY_NAME,
 *    wipes its data, and re-inserts everything below.
 *
 * HOW TO EDIT
 * -----------
 * - All monetary values use the `ils()` helper which converts ILS → agorot
 *   (integer cents), matching the database storage convention.
 *   Example: ils(8_200) = 8,200.00 ₪ stored as 820000.
 * - Dates are ISO strings "YYYY-MM-DD".
 * - After editing, click the restore button in the app to reload the data.
 *
 * PROPERTY IDENTIFIER
 * -------------------
 * The seed locates the demo property by matching houseName === MOCK_PROPERTY_NAME
 * for the current user. If deleted, a new property is created on restore.
 */

/** Used to find/identify the demo property in the DB */
export const MOCK_PROPERTY_NAME = "Florentin Apartment";

/** ILS to agorot (integer cents) — all monetary DB columns use this unit */
const ils = (n: number) => Math.round(n * 100);

// ─── Property ─────────────────────────────────────────────────────────────────

export const mockProperty: Seed<InsertProperty> = {
  houseName: MOCK_PROPERTY_NAME,
  houseNickname: "Florentin",
  propertyType: "Apartment",
  address: "Abarbanel St 12, Tel Aviv-Yafo, 6612421",
  latitude: "32.0580",
  longitude: "34.7699",
  purchaseDate: "2022-03-15",
  purchasePrice: ils(2_800_000), // 2,800,000 ₪
  squareMeters: 78,
  rooms: 3,
  yearBuilt: 1965,
  floor: 3,
  parkingSpots: 0,
  hasStorage: true,
  currency: "₪",
  currencyCode: "ILS",
  timezone: "Asia/Jerusalem",
  startOfWeek: "Sunday",
  reminderDaysBefore: 7,
  mapsProvider: "google" as const,
  remindExpenses: true,
  remindLoans: true,
  remindRepairs: true,
  remindCalendar: true,
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const mockExpenses: Seed<InsertExpense>[] = [
  // ── Mortgage (monthly recurring) ──────────────────────────────────────────
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200), // 8,200 ₪/month
    date: "2026-04-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes: "Loan #74-382910 · 25-year fixed · linked to prime rate",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-03-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-03-03",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-02-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-02-02",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-01-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-01-02",
  },

  // ── Va'ad Bayit / HOA (monthly) ───────────────────────────────────────────
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450), // 450 ₪/month
    date: "2026-04-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes:
      "Building committee fee · covers elevator, cleaning, garden, intercom",
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-03-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-03-05",
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-02-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-02-06",
  },

  // ── Electricity — IEC (monthly) ───────────────────────────────────────────
  {
    name: "Electricity (IEC)",
    amount: ils(315),
    date: "2026-03-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes:
      "Israel Electric Corporation · bimonthly billed, split to monthly here",
    isPaid: true,
    paidDate: "2026-03-20",
  },
  {
    name: "Electricity (IEC)",
    amount: ils(295),
    date: "2026-02-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-02-18",
  },
  {
    name: "Electricity (IEC)",
    amount: ils(345),
    date: "2026-01-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-01-17",
  },

  // ── Water & sewage (monthly) ──────────────────────────────────────────────
  {
    name: "Water & Sewage",
    amount: ils(175),
    date: "2026-03-01",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes: "Tel Aviv municipality · meter reading 1st of month",
    isPaid: true,
    paidDate: "2026-03-08",
  },
  {
    name: "Water & Sewage",
    amount: ils(162),
    date: "2026-02-01",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    isPaid: true,
    paidDate: "2026-02-07",
  },

  // ── Arnona — municipal tax (quarterly) ────────────────────────────────────
  {
    name: "Arnona Q2 2026",
    amount: ils(920), // 920 ₪/quarter · 3-room reduced rate
    date: "2026-04-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
    notes:
      "Tel Aviv-Yafo municipal tax · reduced rate (toshav) · due by 30 Apr",
  },
  {
    name: "Arnona Q1 2026",
    amount: ils(920),
    date: "2026-01-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
    isPaid: true,
    paidDate: "2026-01-15",
  },
  {
    name: "Arnona Q4 2025",
    amount: ils(920),
    date: "2025-10-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
    isPaid: true,
    paidDate: "2025-10-12",
  },

  // ── Insurance (annual) ────────────────────────────────────────────────────
  {
    name: "Building Insurance — Clal",
    amount: ils(2_400), // 2,400 ₪/year
    date: "2026-01-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "yearly" as const,
    notes: "Policy #CL-2024-48821 · structure only · auto-renews Jan 1",
    isPaid: true,
    paidDate: "2026-01-03",
  },
  {
    name: "Contents & Liability Insurance — Harel",
    amount: ils(1_850), // 1,850 ₪/year
    date: "2026-02-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "yearly" as const,
    notes: "Home contents + personal liability · auto-renews Feb 1",
    isPaid: true,
    paidDate: "2026-02-03",
  },

  // ── One-time maintenance ──────────────────────────────────────────────────
  {
    name: "Plumber — kitchen drain unclogging",
    amount: ils(850),
    date: "2026-02-20",
    category: "Maintenance" as const,
    notes: "Avi Plumbing Services · 052-344-5566 · 2-hour job",
    isPaid: true,
    paidDate: "2026-02-20",
  },
  {
    name: "Electrician — new grounded outlet (kitchen)",
    amount: ils(680),
    date: "2025-12-10",
    category: "Maintenance" as const,
    notes: "Added outlet near counter for future dishwasher",
    isPaid: true,
    paidDate: "2025-12-10",
  },
  {
    name: "AC units — annual service & cleaning",
    amount: ils(480),
    date: "2025-08-25",
    category: "Maintenance" as const,
    notes: "2 units serviced before summer peak",
    isPaid: true,
    paidDate: "2025-08-25",
  },
  {
    name: "Exterior roller shutter repair",
    amount: ils(1_200),
    date: "2025-11-05",
    category: "Maintenance" as const,
    notes: "Living room shutter motor replaced · Halon Shutters Ltd",
    isPaid: true,
    paidDate: "2025-11-07",
  },
];

// ─── Repairs (with embedded quotes & payments) ────────────────────────────────
//
// Each repair may have quotes[] — vendor estimates. Set selected: true on the
// chosen one. payments[] logs actual transfers against that quote.
//
type SeedRepair = Seed<InsertRepair> & {
  quotes?: (Omit<Seed<InsertRepairQuote>, "repairId"> & { payments?: any[] })[];
};

export const mockRepairs: SeedRepair[] = [
  // ── 1. Kitchen sink — in_progress, high, Plumbing ─────────────────────────
  {
    title: "Kitchen sink — slow drain after descaling",
    description:
      "Water drains slowly. May need pipe replacement section. Plumber did a temporary clearing in Feb but issue returned within 3 weeks.",
    category: "Plumbing" as const,
    priority: "high" as const,
    status: "in_progress" as const,
    reportedDate: "2026-03-15",
    contractor: "Avi Plumbing Services",
    notes:
      "Second visit scheduled. Contractor suspects partial blockage ~80cm in. Will run a camera before deciding on pipe section replacement.",
    quotes: [
      {
        contractor: "Avi Plumbing Services",
        amount: ils(1_400),
        date: "2026-03-18",
        notes:
          "Camera inspection + targeted pipe section replacement if needed. Includes return-visit warranty (30 days). Quick to schedule.",
        selected: true,
        payments: [
          {
            date: "2026-03-22",
            amount: ils(400),
            notes: "Deposit — camera inspection booked",
          },
        ],
      },
      {
        contractor: "Tel Aviv Drains Ltd",
        amount: ils(1_900),
        date: "2026-03-25",
        notes:
          "Full kitchen drain line replacement to the main stack. More invasive — would require opening the wall behind the cabinet. Higher cost but permanent fix.",
        selected: false,
      },
    ],
  },

  // ── 2. Electrical panel — waiting_for_contractor, urgent, Electrical ──────
  {
    title: "Electrical panel — kitchen circuit trips under load",
    description:
      "Kitchen circuit breaker trips when microwave and kettle run together. Started after the new outlet was added in December. Suspect undersized breaker or aged wiring.",
    category: "Electrical" as const,
    priority: "urgent" as const,
    status: "waiting_for_contractor" as const,
    reportedDate: "2026-04-28",
    contractor: "Eli Gabai (Licensed Electrician)",
    notes:
      "Eli is the licensed electrician already doing the Shelly relay install. Booked combined visit May 15 — will replace breaker and inspect kitchen wiring while he's here.",
    quotes: [
      {
        contractor: "Eli Gabai (Licensed Electrician)",
        amount: ils(950),
        date: "2026-05-02",
        notes:
          "Replace 16A breaker with 20A + visual inspection of kitchen circuit. Licensed, familiar with the panel from previous job.",
        selected: true,
        payments: [
          {
            date: "2026-05-03",
            amount: ils(300),
            notes: "Deposit to secure May 15 slot",
          },
        ],
      },
      {
        contractor: "Mor Electric",
        amount: ils(1_200),
        date: "2026-05-04",
        notes:
          "Full panel inspection + breaker replacement + amperage testing. Thorough but slower to schedule (3-week wait).",
        selected: false,
      },
    ],
  },

  // ── 3. AC outdoor unit — open, low, HVAC (no quotes yet) ──────────────────
  {
    title: "AC outdoor unit — unusual noise when starting",
    description:
      "Compressor makes a grinding sound for the first 30 seconds when starting from cold. Worse in cool mornings. Cooling performance still normal.",
    category: "HVAC" as const,
    priority: "low" as const,
    status: "open" as const,
    reportedDate: "2026-02-10",
    notes:
      "Technician visit already booked for May annual service — will diagnose then. No separate quote needed yet.",
  },

  // ── 4. Bathroom tiles — open, medium, Structural (quotes, none picked) ────
  {
    title: "Bathroom wall tiles — hairline cracks (3 tiles)",
    description:
      "Hairline cracks above the shower surround on 3 adjacent tiles. Not leaking yet, but risk of water ingress into the wall if not addressed before next winter.",
    category: "Structural" as const,
    priority: "medium" as const,
    status: "open" as const,
    reportedDate: "2026-01-20",
    notes:
      "Two quotes in. Deferring decision until after kitchen renovation finishes (May) — don't want overlapping contractor work.",
    quotes: [
      {
        contractor: "Roni Tiling Works",
        amount: ils(2_800),
        date: "2026-02-05",
        notes:
          "Replace 3 cracked tiles + regrout the surrounding 6 tiles. Match existing tile from leftover stock in storage. 1-day job.",
        selected: false,
      },
      {
        contractor: "Dan Renovations",
        amount: ils(3_400),
        date: "2026-02-12",
        notes:
          "Replace 3 tiles + waterproof membrane patch behind. Slightly over-engineered for the issue but more durable.",
        selected: false,
      },
    ],
  },

  // ── 5. Refrigerator — waiting_for_parts, medium, Appliance ────────────────
  {
    title: "Refrigerator — door seal failing on freezer compartment",
    description:
      "Freezer door seal has condensation buildup and ice forming around the edge. Door doesn't close flush. Samsung confirmed seal needs replacement under extended warranty.",
    category: "Appliance" as const,
    priority: "medium" as const,
    status: "waiting_for_parts" as const,
    reportedDate: "2026-03-08",
    contractor: "Samsung Authorized Service (Tel Aviv)",
    notes:
      "Part ordered through Samsung extended warranty (purchased 2023). ETA 2 weeks. Labour covered, parts free under warranty — quote is service call only.",
    quotes: [
      {
        contractor: "Samsung Authorized Service (Tel Aviv)",
        amount: ils(280),
        date: "2026-03-12",
        notes:
          "Service call fee only. Seal replacement covered under extended warranty. Includes return visit for installation when part arrives.",
        selected: true,
        payments: [
          {
            date: "2026-03-12",
            amount: ils(280),
            notes: "Service call paid on first visit (diagnosis)",
          },
        ],
      },
    ],
  },

  // ── 6. Bedroom door — completed, low, Cosmetic (single quote, fully paid) ─
  {
    title: "Master bedroom door — stiff latch",
    description:
      "Latch didn't retract smoothly when handle was turned, sometimes jammed entirely. Required two hands to open.",
    category: "Cosmetic" as const,
    priority: "low" as const,
    status: "completed" as const,
    reportedDate: "2025-10-05",
    completedDate: "2025-10-20",
    contractor: "Local handyman (Moti)",
    cost: ils(180),
    notes:
      "Replaced latch mechanism + adjusted strike plate. Works fine now. 6-month workmanship guarantee — no recurrence so far.",
    quotes: [
      {
        contractor: "Local handyman (Moti)",
        amount: ils(180),
        date: "2025-10-12",
        notes:
          "Quick fix — latch mechanism replacement + adjustment. Same-day availability. Parts included.",
        selected: true,
        payments: [
          {
            date: "2025-10-20",
            amount: ils(180),
            notes: "Paid on completion (cash, no receipt requested)",
          },
        ],
      },
    ],
  },

  // ── 7. Balcony seepage — completed, high, Structural (fully paid) ─────────
  {
    title: "Balcony — water seepage into ceiling below",
    description:
      "Water stain appeared on the ceiling of the ground-floor storage room after heavy November rain. Traced to balcony membrane failure at the drain corner.",
    category: "Structural" as const,
    priority: "high" as const,
    status: "completed" as const,
    reportedDate: "2025-09-01",
    completedDate: "2025-09-28",
    contractor: "Roni Waterproofing Ltd",
    cost: ils(4_800),
    notes:
      "Applied new bitumen membrane + drainage mat + new perimeter sealant. 5-year workmanship warranty. Tested through two heavy rain events — no recurrence.",
    quotes: [
      {
        contractor: "Roni Waterproofing Ltd",
        amount: ils(4_800),
        date: "2025-09-08",
        notes:
          "Full membrane replacement at drain corner (2.5 sqm) + perimeter resealing. 5-year warranty. Neighbour recommendation — used them on the floor below us.",
        selected: true,
        payments: [
          {
            date: "2025-09-15",
            amount: ils(2_000),
            notes: "Deposit — work scheduled",
          },
          {
            date: "2025-09-28",
            amount: ils(2_800),
            notes: "Final payment on completion + warranty document received",
          },
        ],
      },
      {
        contractor: "Aqua Seal Israel",
        amount: ils(5_600),
        date: "2025-09-10",
        notes:
          "Polyurethane liquid membrane (premium product). Longer warranty (8 years) but more expensive. Slower start date (3 weeks out).",
        selected: false,
      },
    ],
  },

  // ── 8. Intercom buzzer — cancelled, low, Other (HOA took it on) ───────────
  {
    title: "Intercom — buzzer handset silent when called from lobby",
    description:
      "Lobby panel rings, but the handset in the apartment is silent. Outgoing door release still works. Reported to va'ad bayit since the lobby panel may be the failing component.",
    category: "Other" as const,
    priority: "low" as const,
    status: "cancelled" as const,
    reportedDate: "2026-01-12",
    notes:
      "Cancelled — va'ad bayit (HOA) decided to replace the entire building intercom system in March as part of their annual maintenance plan. Our handset was swapped at no cost. Keeping this record for traceability.",
    quotes: [
      {
        contractor: "Tel Aviv Intercoms",
        amount: ils(620),
        date: "2026-01-20",
        notes:
          "Replace apartment handset + test lobby panel connection. Standalone fix — wouldn't address root cause if lobby panel is actually failing.",
        selected: false,
      },
    ],
  },
];

// ─── Upgrades (with embedded options & items) ─────────────────────────────────
//
// Each upgrade has:
//   options[] — vendor quotes. Set selected: true on the chosen one.
//               payments[] logs actual transfers to that vendor.
//   items[]   — individual products / tasks tracked via purchased boolean.
//
type SeedUpgrade = Seed<InsertUpgrade> & {
  options?: (Omit<Seed<InsertUpgradeOption>, "upgradeId"> & {
    payments?: any[];
  })[];
  items?: Omit<Seed<InsertUpgradeItem>, "upgradeId">[];
};

export const mockUpgrades: SeedUpgrade[] = [
  // ── 1. Kitchen renovation ─────────────────────────────────────────────────
  {
    title: "Kitchen renovation",
    description:
      "Full gut-and-replace: new cabinets (Egger board), quartz countertop (Caesarstone Statuario), undermount sink, and backsplash tiles. Existing layout kept.",
    category: "Kitchen" as const,
    status: "in_progress" as const,
    priority: "high" as const,
    estimatedCost: ils(48_000),
    actualCost: ils(29_500),
    startDate: "2026-01-15",
    contractor: "Rami Ben David (IKEA Kitchens)",
    notes:
      "Countertop delivery ETA May 8 — Rami can only start installation after it arrives. Electrician phase follows.",

    options: [
      {
        title: "IKEA + Rami Installation",
        description:
          "IKEA Metod cabinets supply, handles, full installation by Rami. Countertop and sink ordered separately. Very professional — Rami does IKEA kitchen installs full-time.",
        estimatedCost: ils(17_100),
        selected: true,
        payments: [
          { date: "2026-02-10", amount: ils(5_000), notes: "Deposit" },
          {
            date: "2026-03-20",
            amount: ils(6_900),
            notes: "Cabinets delivery + start",
          },
        ],
      },
      {
        title: "Yossi Cabinets",
        description:
          "Custom cabinets + installation. Countertop and handles excluded. Cheaper but slower communication — didn't include handles in quote.",
        estimatedCost: ils(16_200),
        selected: false,
      },
      {
        title: "Local Carpenter (Shlomo)",
        description:
          "All-inclusive: custom cabinets, countertop, handles, installation, cleanup. Most expensive but best warranty and fastest timeline. Good reviews from neighbour.",
        estimatedCost: ils(19_800),
        selected: false,
      },
    ],

    items: [
      {
        name: "Kitchen cabinets (IKEA Metod)",
        estimatedCost: ils(8_400),
        actualCost: ils(8_100),
        purchased: true,
      },
      {
        name: "Backsplash tiles (Porcelanosa, 30×60)",
        estimatedCost: ils(3_600),
        actualCost: ils(3_400),
        purchased: true,
      },
      {
        name: "Cabinet handles ×24 (IKEA Eneryda)",
        estimatedCost: ils(400),
        actualCost: ils(380),
        purchased: true,
      },
      {
        name: "Plumber — pipe relocation",
        estimatedCost: ils(1_800),
        actualCost: ils(1_800),
        purchased: true,
      },
      {
        name: "Countertop — Caesarstone Statuario",
        estimatedCost: ils(4_200),
        purchased: false,
        notes: "Must arrive before Rami starts installation",
      },
      {
        name: "LED strip under cabinets (5m)",
        estimatedCost: ils(280),
        purchased: false,
      },
      {
        name: "Undermount sink (Franke MRG 110-52)",
        estimatedCost: ils(1_100),
        purchased: false,
        notes: "Must fit 60cm cabinet. Check Hashkiya and Rami's supplier.",
      },
      {
        name: "Kitchen faucet (pull-out spray)",
        estimatedCost: ils(600),
        purchased: false,
        notes: "Coordinate finish colour with handles (brushed nickel)",
      },
      {
        name: "Built-in oven (60cm)",
        estimatedCost: ils(3_200),
        purchased: false,
        notes: "Needs dedicated 32A circuit — confirm with electrician first",
      },
    ],
  },

  // ── 2. Main bathroom retiling ─────────────────────────────────────────────
  {
    title: "Main bathroom retiling",
    description:
      "Remove all existing wall + floor tiles. Lay 60×60 large-format porcelain (Atlas Concorde). Include new vanity unit (IKEA Godmorgon).",
    category: "Bathroom" as const,
    status: "planning" as const,
    priority: "medium" as const,
    estimatedCost: ils(22_000),
    actualCost: 0,
    notes:
      "Starting after kitchen is fully done. Need to choose tile colour and vanity finish before deciding on contractor.",

    options: [
      {
        title: "Roni Tiling Works",
        description:
          "Full demo, waterproofing membrane, wall + floor tiles (supply & lay). Vanity installation excluded. Did our balcony waterproofing — reliable, will give discount as repeat customer.",
        estimatedCost: ils(20_000),
        selected: false,
      },
      {
        title: "Dan Renovations",
        description:
          "Full demo, waterproofing, wall + floor tiles, vanity + mirror installation included. More expensive but shorter timeline.",
        estimatedCost: ils(24_500),
        selected: false,
      },
    ],

    items: [
      {
        name: "Floor tiles — Atlas Concorde 60×60 (7 sqm)",
        estimatedCost: ils(3_200),
        purchased: false,
        notes:
          "Grey marble-look. Got price from Porcelanosa — comparing online.",
      },
      {
        name: "Wall tiles — Atlas Concorde 30×60 (18 sqm)",
        estimatedCost: ils(2_800),
        purchased: false,
      },
      {
        name: "IKEA Godmorgon vanity 80cm (white)",
        estimatedCost: ils(2_400),
        purchased: false,
        notes: "Check if 80cm fits. Measure again before ordering.",
      },
      {
        name: "Shower mixer (Grohe Euphoria)",
        estimatedCost: ils(1_800),
        purchased: false,
      },
      {
        name: "Toilet (Roca Meridian)",
        estimatedCost: ils(1_600),
        purchased: false,
      },
      {
        name: "Towel rail — heated electric",
        estimatedCost: ils(900),
        purchased: false,
      },
    ],
  },

  // ── 3. Smart lighting — Shelly relays ────────────────────────────────────
  {
    title: "Smart lighting — Shelly relays",
    description:
      "Replace all switches with Shelly 1PM relays (behind existing switches, no rewiring needed). All rooms + kitchen + hallway. Google Home integration.",
    category: "Technology" as const,
    status: "in_progress" as const,
    priority: "medium" as const,
    estimatedCost: ils(4_500),
    actualCost: ils(1_120),
    startDate: "2026-04-10",
    contractor: "Eli Gabai (Licensed Electrician)",
    notes:
      "Shelly relays delivered. Electrician booked for May 15 to install during kitchen electrician phase.",

    options: [
      {
        title: "DIY + Electrician (Eli)",
        description:
          "Eli installs 8x Shelly relays + wires to existing switches. We supply parts. Licensed and familiar with Shelly — half-day job.",
        estimatedCost: ils(1_800),
        selected: true,
        payments: [{ date: "2026-04-01", amount: ils(500), notes: "Deposit" }],
      },
    ],

    items: [
      {
        name: "Shelly 1PM relays ×8",
        estimatedCost: ils(1_120),
        actualCost: ils(1_120),
        purchased: true,
        notes: "Arrived. Tested 1 unit — works with Google Home.",
      },
      {
        name: "Electrician labour (Eli)",
        estimatedCost: ils(1_800),
        purchased: false,
        notes: "Booked May 15 during kitchen phase",
      },
      {
        name: "Switch cover plates ×8 (white)",
        estimatedCost: ils(240),
        purchased: false,
        notes: "Current covers may not refit after relay — measure first",
      },
    ],
  },

  // ── 4. Hallway built-in storage ───────────────────────────────────────────
  {
    title: "Hallway built-in storage",
    description:
      "Custom floor-to-ceiling wardrobe in entrance hallway (2.4m wide). Melamine board, push-to-open hinges.",
    category: "Other" as const,
    status: "completed" as const,
    priority: "low" as const,
    estimatedCost: ils(8_500),
    actualCost: ils(8_200),
    startDate: "2025-03-10",
    completedDate: "2025-04-10",
    contractor: "Yossi Amsalem Carpentry",
    notes:
      "Completed April 2025. Very satisfied with result. Small scratch on top shelf was repaired on-site.",

    options: [
      {
        title: "Yossi Amsalem Carpentry",
        description:
          "Custom melamine wardrobe, push-to-open hinges, internal shelving, full installation. Excellent work — finished 3 days ahead of schedule.",
        estimatedCost: ils(8_200),
        selected: true,
        payments: [
          { date: "2025-03-15", amount: ils(4_000), notes: "Deposit 50%" },
          {
            date: "2025-04-10",
            amount: ils(4_200),
            notes: "Final payment on completion",
          },
        ],
      },
    ],

    items: [
      {
        name: "Custom wardrobe unit (2.4m)",
        estimatedCost: ils(7_800),
        actualCost: ils(7_800),
        purchased: true,
      },
      {
        name: "Push-to-open hinges ×6 (Blum)",
        estimatedCost: ils(280),
        actualCost: ils(280),
        purchased: true,
      },
      {
        name: "Internal shelving hardware",
        estimatedCost: ils(120),
        actualCost: ils(120),
        purchased: true,
      },
    ],
  },
];

// ─── Loans ────────────────────────────────────────────────────────────────────

export const mockLoans: (Seed<InsertLoan> & { repayments: any[] })[] = [
  {
    name: "Bank Hapoalim — Mortgage",
    lender: "Bank Hapoalim",
    originalAmount: ils(2_100_000), // 75% LTV on 2,800,000 ₪ purchase
    currentBalance: ils(1_958_000), // ~4 years into 25-year term
    loanType: "mortgage" as const,
    interestRate: "2.75", // Prime + 0.75%
    monthlyPayment: ils(8_200),
    startDate: "2022-05-01",
    endDate: "2047-05-01",
    nextPaymentDate: "2026-05-01",
    notes:
      "25-year prime-linked mortgage. Loan #74-382910. Auto-debit 1st of every month from account 12-345-678901.",
    repayments: [],
  },
  {
    name: "Parents Loan",
    lender: "Abba & Ima (Parents)",
    originalAmount: ils(150_000), // 150,000 ₪ total
    currentBalance: ils(80_000), // Outstanding: 80,000 ₪
    loanType: "other" as const,
    interestRate: "0.00",
    startDate: "2022-02-01",
    endDate: "2027-02-01",
    nextPaymentDate: "2026-06-01",
    notes:
      "Down-payment supplement. Informal agreement — repay when possible. No fixed schedule.",
    repayments: [
      { date: "2023-01-15", amount: ils(10_000) },
      { date: "2023-07-10", amount: ils(10_000) },
      { date: "2024-01-20", amount: ils(10_000) },
      { date: "2024-08-05", amount: ils(10_000) },
      { date: "2025-02-12", amount: ils(15_000) },
      { date: "2025-09-01", amount: ils(15_000) },
      // Repaid so far: 70,000 ₪ · Outstanding: 80,000 ₪
    ],
  },
];

// ─── Wishlist ─────────────────────────────────────────────────────────────────

export const mockWishlist: Seed<InsertWishlistItem>[] = [
  {
    name: "Split AC — bedroom 2",
    notes:
      "Second bedroom has no AC. Summer in Tel Aviv is unbearable without it. Target: 12,000 BTU inverter unit.",
    estimatedPrice: ils(6_500),
    category: "Appliance" as const,
    priority: "high" as const,
    status: "wanted" as const,
  },
  {
    name: "Dishwasher (Bosch Series 4, 60cm)",
    notes:
      "Built-under. Space was left during kitchen renovation. Just need to connect the pre-installed water line.",
    estimatedPrice: ils(3_800),
    category: "Appliance" as const,
    priority: "high" as const,
    status: "saved" as const,
  },
  {
    name: "Robot vacuum (Roborock S8 Pro)",
    notes:
      "Stone floors throughout the apartment. Robot vacuum would handle daily dust easily.",
    estimatedPrice: ils(2_400),
    category: "Appliance" as const,
    priority: "medium" as const,
    status: "wanted" as const,
  },
  {
    name: "Mamad (safe room) shelving",
    notes:
      "Metal shelving system to turn the safe room into usable storage (tools, seasonal items, luggage).",
    estimatedPrice: ils(1_100),
    category: "Other" as const,
    priority: "low" as const,
    status: "wanted" as const,
  },
  {
    name: "Electric scooter (Xiaomi Pro 2)",
    notes:
      "For short commutes in Florentin. Avoids parking problems. Can charge on balcony.",
    estimatedPrice: ils(4_200),
    category: "Other" as const,
    priority: "medium" as const,
    status: "wanted" as const,
  },
];

// ─── Purchase Costs ───────────────────────────────────────────────────────────

export const mockPurchaseCosts: Seed<InsertPurchaseCost>[] = [
  {
    name: "Real estate agent fee",
    amount: ils(56_000), // 2% of 2,800,000 ₪
    date: "2022-03-15",
    category: "Agency" as const,
    notes: "Standard 2% buyer-side agent fee",
  },
  {
    name: "Mas Rechisha (purchase tax)",
    amount: ils(38_500),
    date: "2022-04-10",
    category: "Tax" as const,
    notes:
      "First-apartment reduced-rate bracket · paid via lawyer to tax authority",
  },
  {
    name: "Lawyer fee — conveyancing (Adv. Michal Levi)",
    amount: ils(9_200),
    date: "2022-03-28",
    category: "Legal" as const,
    notes: "Includes purchase agreement, title search, and tabu registration",
  },
  {
    name: "Mortgage registration — Land Registry (tabu)",
    amount: ils(1_380),
    date: "2022-05-02",
    category: "Legal" as const,
    notes: "Bank lien registration with Israel Land Authority",
  },
  {
    name: "Bank appraisal (shuma)",
    amount: ils(2_500),
    date: "2022-02-20",
    category: "Other" as const,
    notes: "Bank Hapoalim-required valuation before mortgage approval",
  },
  {
    name: "Moving company (Rahav Moving)",
    amount: ils(4_800),
    date: "2022-05-20",
    category: "Moving" as const,
    notes:
      "Full-service move from Ramat Gan (3-room) · 5-hour job including packing",
  },
  {
    name: "Locksmith — new cylinders (3 locks)",
    amount: ils(1_200),
    date: "2022-05-21",
    category: "Other" as const,
    notes: "Replaced all door lock cylinders on move-in day",
  },
];

// ─── Calendar Events ──────────────────────────────────────────────────────────

export const mockCalendarEvents: Seed<InsertCalendarEvent>[] = [
  {
    title: "Arnona Q2 payment due",
    date: "2026-04-30",
    category: "Payment" as const,
    notes:
      "Pay before April 30 to avoid late fee. Pay via municipal website or Bit.",
  },
  {
    title: "Kitchen countertop delivery (Caesarstone)",
    date: "2026-05-08",
    category: "Renovation" as const,
    notes: "Must be home 08:00–12:00. Clear path from elevator to kitchen.",
  },
  {
    title: "AC annual service — pre-summer",
    date: "2026-05-20",
    category: "Maintenance" as const,
    notes: "Call Roma AC (054-123-4567) to confirm appointment. Both units.",
  },
  {
    title: "Va'ad Bayit annual meeting",
    date: "2026-06-10",
    category: "Other" as const,
    notes:
      "Building committee meeting. Agenda: elevator renovation budget vote (est. ₪180,000 total).",
  },
  {
    title: "Parents loan repayment",
    date: "2026-06-01",
    category: "Payment" as const,
    notes:
      "Planned ₪15,000 transfer. Outstanding balance will be ₪65,000 after.",
  },
  {
    title: "Building insurance renewal (Clal)",
    date: "2027-01-01",
    category: "Other" as const,
    notes: "Get 2 competing quotes in December before auto-renewal date.",
  },
];

// ─── Inventory ──────────────────────────────────────────────────────────────────

export const mockInventory: Seed<InsertInventoryItem>[] = [
  {
    name: "Samsung French Door Refrigerator",
    category: "Appliance" as const,
    room: "Kitchen",
    quantity: 1,
    brand: "Samsung",
    condition: "Good" as const,
    purchasePrice: 499900,
    purchaseDate: "2023-08-15",
    warrantyExpiry: "2026-08-15",
    serialNumber: "RF28T5001SR-001",
    notes: "Extended warranty purchased. Service center: 03-555-1234.",
  },
  {
    name: "Bosch Dishwasher",
    category: "Appliance" as const,
    room: "Kitchen",
    quantity: 1,
    brand: "Bosch",
    condition: "Good" as const,
    purchasePrice: 289900,
    purchaseDate: "2023-08-15",
    warrantyExpiry: "2025-08-15",
  },
  {
    name: "LG Split AC Unit (Bedroom)",
    category: "Appliance" as const,
    room: "Bedroom",
    quantity: 1,
    brand: "LG",
    condition: "Good" as const,
    purchasePrice: 399900,
    purchaseDate: "2023-06-01",
    warrantyExpiry: "2028-06-01",
    notes: "Annual service due May. Technician: Roma AC 054-123-4567.",
  },
  {
    name: "LG Split AC Unit (Living Room)",
    category: "Appliance" as const,
    room: "Living Room",
    quantity: 1,
    brand: "LG",
    condition: "Good" as const,
    purchasePrice: 449900,
    purchaseDate: "2023-06-01",
    warrantyExpiry: "2028-06-01",
    notes: "Annual service due May. Technician: Roma AC 054-123-4567.",
  },
  {
    name: "Dining Table & 6 Chairs",
    category: "Furniture" as const,
    room: "Dining Room",
    quantity: 1,
    brand: "IKEA",
    condition: "Good" as const,
    purchasePrice: 349900,
    purchaseDate: "2023-09-01",
  },
  {
    name: "Couch (3-seater)",
    category: "Furniture" as const,
    room: "Living Room",
    quantity: 1,
    condition: "Good" as const,
    purchasePrice: 599900,
    purchaseDate: "2023-09-01",
  },
  {
    name: 'MacBook Pro 14"',
    category: "Electronics" as const,
    room: "Home Office",
    quantity: 1,
    brand: "Apple",
    condition: "Good" as const,
    purchasePrice: 899900,
    purchaseDate: "2024-01-10",
    warrantyExpiry: "2025-01-10",
    serialNumber: "C02YK1ZXMD6T",
  },
  {
    name: "Washing Machine",
    category: "Appliance" as const,
    room: "Laundry",
    quantity: 1,
    brand: "Bosch",
    condition: "Good" as const,
    purchasePrice: 329900,
    purchaseDate: "2023-08-15",
    warrantyExpiry: "2026-08-15",
  },
  {
    name: "Dish Soap",
    category: "Consumable" as const,
    room: "Kitchen",
    quantity: 3,
    minQuantity: 2,
    unit: "bottles",
    purchasePrice: 1500,
    store: "Shufersal",
  },
  {
    name: "Toilet Paper",
    category: "Consumable" as const,
    room: "Bathroom",
    quantity: 12,
    minQuantity: 6,
    unit: "rolls",
    purchasePrice: 3900,
    store: "Shufersal",
  },
  {
    name: "Power Drill (Bosch)",
    category: "Tool" as const,
    room: "Storage",
    quantity: 1,
    brand: "Bosch",
    condition: "Good" as const,
    purchasePrice: 49900,
    purchaseDate: "2022-03-15",
  },
  {
    name: "Toolbox (assorted)",
    category: "Tool" as const,
    room: "Storage",
    quantity: 1,
    condition: "Good" as const,
  },
];
