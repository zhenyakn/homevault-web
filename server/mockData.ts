/**
 * HomeVault — Demo / POC Seed Data
 * Location: Tel Aviv, Israel (Florentin neighbourhood)
 */

export const MOCK_PROPERTY_NAME = "Florentin Apartment";

const ils = (n: number) => Math.round(n * 100);

// ─── Property ─────────────────────────────────────────────────────────────────

export const mockProperty = {
  houseName: MOCK_PROPERTY_NAME,
  houseNickname: "Florentin",
  propertyType: "Apartment",
  address: "Abarbanel St 12, Tel Aviv-Yafo, 6612421",
  latitude: "32.0580",
  longitude: "34.7699",
  purchaseDate: "2022-03-15",
  purchasePrice: ils(2_800_000),
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
//
// category enum: "Maintenance" | "Utilities" | "Insurance" | "Tax" |
//                "Management"  | "Renovation" | "Other"
// recurringInterval enum: "monthly" | "quarterly" | "yearly"

export const mockExpenses = [
  // ── Mortgage (monthly recurring) ──────────────────────────────────────────
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
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
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-02-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-01-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },

  // ── Va'ad Bayit / HOA (monthly) ───────────────────────────────────────────
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-04-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes: "Building committee fee · covers elevator, cleaning, garden, intercom",
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-03-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-02-01",
    category: "Management" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },

  // ── Electricity — IEC (monthly) ───────────────────────────────────────────
  {
    name: "Electricity (IEC)",
    amount: ils(315),
    date: "2026-03-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
    notes: "Israel Electric Corporation · bimonthly billed, split to monthly here",
  },
  {
    name: "Electricity (IEC)",
    amount: ils(295),
    date: "2026-02-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },
  {
    name: "Electricity (IEC)",
    amount: ils(345),
    date: "2026-01-15",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
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
  },
  {
    name: "Water & Sewage",
    amount: ils(162),
    date: "2026-02-01",
    category: "Utilities" as const,
    isRecurring: true,
    recurringInterval: "monthly" as const,
  },

  // ── Arnona — municipal tax (quarterly) ────────────────────────────────────
  {
    name: "Arnona Q2 2026",
    amount: ils(920),
    date: "2026-04-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
    notes: "Tel Aviv-Yafo municipal tax · reduced rate (toshav) · due by 30 Apr",
  },
  {
    name: "Arnona Q1 2026",
    amount: ils(920),
    date: "2026-01-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
  },
  {
    name: "Arnona Q4 2025",
    amount: ils(920),
    date: "2025-10-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "quarterly" as const,
  },

  // ── Insurance (annual) ────────────────────────────────────────────────────
  {
    name: "Building Insurance — Clal",
    amount: ils(2_400),
    date: "2026-01-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "yearly" as const,
    notes: "Policy #CL-2024-48821 · structure only · auto-renews Jan 1",
  },
  {
    name: "Contents & Liability Insurance — Harel",
    amount: ils(1_850),
    date: "2026-02-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "yearly" as const,
    notes: "Home contents + personal liability · auto-renews Feb 1",
  },

  // ── One-time maintenance ──────────────────────────────────────────────────
  {
    name: "Plumber — kitchen drain unclogging",
    amount: ils(850),
    date: "2026-02-20",
    category: "Maintenance" as const,
    notes: "Avi Plumbing Services · 052-344-5566 · 2-hour job",
  },
  {
    name: "Electrician — new grounded outlet (kitchen)",
    amount: ils(680),
    date: "2025-12-10",
    category: "Maintenance" as const,
    notes: "Added outlet near counter for future dishwasher",
  },
  {
    name: "AC units — annual service & cleaning",
    amount: ils(480),
    date: "2025-08-25",
    category: "Maintenance" as const,
    notes: "2 units serviced before summer peak",
  },
  {
    name: "Exterior roller shutter repair",
    amount: ils(1_200),
    date: "2025-11-05",
    category: "Maintenance" as const,
    notes: "Living room shutter motor replaced · Halon Shutters Ltd",
  },
];

// ─── Repairs ──────────────────────────────────────────────────────────────────
//
// status enum: "open" | "in_progress" | "waiting_for_parts" |
//              "waiting_for_contractor" | "completed" | "cancelled"
// priority enum: "low" | "medium" | "high" | "urgent"
// cost: single int field (no estimatedCost/actualCost split)
// No contractorPhone column in schema.

export const mockRepairs = [
  {
    title: "Kitchen sink — slow drain after descaling",
    description: "Water drains slowly. May need pipe replacement section. Plumber did temporary fix in Feb but issue returned.",
    priority: "high" as const,
    status: "in_progress" as const,
    reportedDate: "2026-03-15",
    contractor: "Avi Plumbing Services · 052-344-5566",
    cost: ils(1_200),
    notes: "Second visit scheduled. Contractor suspects partial blockage 80cm in.",
  },
  {
    title: "Bathroom wall tiles — hairline cracks (3 tiles)",
    description: "Hairline cracks above the shower surround. Not leaking yet, but risk of water ingress if not fixed.",
    priority: "medium" as const,
    status: "open" as const,
    reportedDate: "2026-01-20",
    cost: ils(2_800),
    notes: "Got 1 quote (₪2,800). Need a second quote. Low urgency for now.",
  },
  {
    title: "Water heater — pressure drop when multiple taps open",
    description: "Hot water pressure drops noticeably when shower and kitchen tap are both open. Likely mixing valve.",
    priority: "medium" as const,
    status: "waiting_for_parts" as const,
    reportedDate: "2025-12-01",
    contractor: "Avi Plumbing Services · 052-344-5566",
    cost: ils(900),
    notes: "Contractor said it's likely the pressure-balancing valve. Parts on order.",
  },
  {
    title: "AC outdoor unit — unusual noise when starting",
    description: "Compressor makes a grinding sound for the first 30 seconds when starting from off. Worse in cold mornings.",
    priority: "low" as const,
    status: "open" as const,
    reportedDate: "2026-02-10",
    cost: ils(1_500),
    notes: "Technician visit booked for May service — will diagnose then.",
  },
  {
    title: "Master bedroom door — stiff latch",
    description: "Latch didn't retract smoothly, sometimes jammed.",
    priority: "low" as const,
    status: "completed" as const,
    reportedDate: "2025-10-05",
    cost: ils(180),
    notes: "Replaced latch mechanism. Works fine now.",
  },
  {
    title: "Balcony — water seepage into ceiling below",
    description: "Water stain appeared on ceiling of ground-floor storage after heavy rain. Traced to balcony membrane failure.",
    priority: "high" as const,
    status: "completed" as const,
    reportedDate: "2025-09-01",
    contractor: "Roni Waterproofing Ltd · 054-778-2233",
    cost: ils(4_800),
    notes: "Applied new bitumen membrane + drainage mat. 5-year workmanship warranty. Tested through two rain events — no recurrence.",
  },
];

// ─── Upgrades ─────────────────────────────────────────────────────────────────
//
// upgrades.status: "idea" | "planning" | "in_progress" | "completed" | "cancelled"
//
// upgradeOptions columns: id, upgradeId, title (notNull), description,
//   estimatedCost, pros, cons, selected
//
// upgradeItems columns: id, upgradeId, name (notNull), quantity, unit,
//   estimatedCost, actualCost, store, purchased, notes

export const mockUpgrades = [
  // ── 1. Kitchen renovation ─────────────────────────────────────────────────
  {
    title: "Kitchen renovation",
    description: "Full gut-and-replace: new cabinets (Egger board), quartz countertop (Caesarstone Statuario), undermount sink, and backsplash tiles. Existing layout kept.",
    status: "in_progress" as const,
    estimatedCost: ils(48_000),
    actualCost: ils(29_500),
    notes: "Countertop delivery ETA May 8 — Rami can only start installation after it arrives. Electrician phase follows.",

    options: [
      {
        title: "IKEA + Rami Installation",
        estimatedCost: ils(17_100),
        description: "IKEA Metod cabinets supply, handles, full installation by Rami. Countertop and sink ordered separately. Timeline: 8 weeks. Warranty: 1 year.",
        selected: true,
        notes: "Very professional. Rami does IKEA kitchen installs full-time. Phone: 052-344-1188",
      },
      {
        title: "Yossi Cabinets",
        estimatedCost: ils(16_200),
        description: "Custom cabinets + installation. Countertop and handles excluded. Timeline: 8 weeks. Warranty: 1 year.",
        selected: false,
        notes: "Cheaper but slower communication. Didn't include handles in quote. Phone: 054-221-8800",
      },
      {
        title: "Local Carpenter (Shlomo)",
        estimatedCost: ils(19_800),
        description: "All-inclusive: custom cabinets, countertop, handles, installation, cleanup. Timeline: 6 weeks. Warranty: 2 years.",
        selected: false,
        notes: "Most expensive but best warranty and fastest timeline. Good reviews from neighbour. Phone: 050-987-6543",
      },
    ],

    items: [
      { name: "Kitchen cabinets (IKEA Metod)", store: "IKEA", estimatedCost: ils(8_400), actualCost: ils(8_100), purchased: true },
      { name: "Backsplash tiles (Porcelanosa, 30×60)", store: "Porcelanosa", estimatedCost: ils(3_600), actualCost: ils(3_400), purchased: true },
      { name: "Cabinet handles ×24 (IKEA Eneryda)", store: "IKEA", estimatedCost: ils(400), actualCost: ils(380), purchased: true },
      { name: "Plumber — pipe relocation", store: "Avi Plumbing", estimatedCost: ils(1_800), actualCost: ils(1_800), purchased: true },
      { name: "Countertop — Caesarstone Statuario", store: "Caesarstone", estimatedCost: ils(4_200), purchased: false, notes: "Ordered. ETA May 8. Must arrive before Rami starts installation" },
      { name: "LED strip under cabinets (5m)", store: "Amazon", estimatedCost: ils(280), purchased: false, notes: "Ordered. ETA Apr 30" },
      { name: "Undermount sink (Franke MRG 110-52)", estimatedCost: ils(1_100), purchased: false, notes: "Must fit 60cm cabinet. Check Hashkiya and Rami's supplier." },
      { name: "Kitchen faucet (pull-out spray)", estimatedCost: ils(600), purchased: false, notes: "Coordinate finish colour with handles (brushed nickel)" },
      { name: "Built-in oven (60cm)", estimatedCost: ils(3_200), purchased: false, notes: "Needs dedicated 32A circuit — confirm with electrician first" },
    ],
  },

  // ── 2. Main bathroom retiling ─────────────────────────────────────────────
  {
    title: "Main bathroom retiling",
    description: "Remove all existing wall + floor tiles. Lay 60×60 large-format porcelain (Atlas Concorde). Include new vanity unit (IKEA Godmorgon).",
    status: "planning" as const,
    estimatedCost: ils(22_000),
    actualCost: 0,
    notes: "Starting after kitchen is fully done. Need to choose tile colour and vanity finish before deciding on contractor.",

    options: [
      {
        title: "Roni Tiling Works",
        estimatedCost: ils(20_000),
        description: "Full demo, waterproofing membrane, wall + floor tiles (supply & lay). Vanity installation excluded. Timeline: 3 weeks. Warranty: 1 year.",
        selected: false,
        notes: "Did the balcony waterproofing — reliable. Will give discount as repeat customer. Phone: 052-771-4490",
      },
      {
        title: "Dan Renovations",
        estimatedCost: ils(24_500),
        description: "Full demo, waterproofing, wall + floor tiles, vanity + mirror installation included. Timeline: 2.5 weeks. Warranty: 2 years.",
        selected: false,
        notes: "More expensive but includes vanity install and shorter timeline. Phone: 054-882-3311",
      },
    ],

    items: [
      { name: "Floor tiles — Atlas Concorde 60×60 (7 sqm)", store: "Porcelanosa", estimatedCost: ils(3_200), purchased: false, notes: "Grey marble-look. Got price from Porcelanosa — comparing online." },
      { name: "Wall tiles — Atlas Concorde 30×60 (18 sqm)", store: "Porcelanosa", estimatedCost: ils(2_800), purchased: false },
      { name: "IKEA Godmorgon vanity 80cm (white)", store: "IKEA", estimatedCost: ils(2_400), purchased: false, notes: "Check if 80cm fits. Measure again before ordering." },
      { name: "Shower mixer (Grohe Euphoria)", estimatedCost: ils(1_800), purchased: false },
      { name: "Toilet (Roca Meridian)", estimatedCost: ils(1_600), purchased: false },
      { name: "Towel rail — heated electric", estimatedCost: ils(900), purchased: false },
    ],
  },

  // ── 3. Smart lighting — Shelly relays ────────────────────────────────────
  {
    title: "Smart lighting — Shelly relays",
    description: "Replace all switches with Shelly 1PM relays (behind existing switches, no rewiring needed). All rooms + kitchen + hallway. Google Home integration.",
    status: "in_progress" as const,
    estimatedCost: ils(4_500),
    actualCost: ils(1_120),
    notes: "Shelly relays delivered. Electrician booked for May 15 to install during kitchen electrician phase.",

    options: [
      {
        title: "DIY + Electrician (Eli)",
        estimatedCost: ils(1_800),
        description: "Eli installs 8x Shelly relays + wires to existing switches. We supply parts. Timeline: 1 day.",
        selected: true,
        notes: "Eli is licensed and familiar with Shelly. Half-day job. Phone: 053-600-1234",
      },
    ],

    items: [
      { name: "Shelly 1PM relays ×8", store: "AliExpress", estimatedCost: ils(1_120), actualCost: ils(1_120), purchased: true, notes: "Arrived. Tested 1 unit — works with Google Home." },
      { name: "Electrician labour (Eli)", store: "Eli Electric", estimatedCost: ils(1_800), purchased: false, notes: "Booked May 15 during kitchen phase" },
      { name: "Switch cover plates ×8 (white)", estimatedCost: ils(240), purchased: false, notes: "Current covers may not refit after relay — measure first" },
    ],
  },

  // ── 4. Hallway built-in storage ───────────────────────────────────────────
  {
    title: "Hallway built-in storage",
    description: "Custom floor-to-ceiling wardrobe in entrance hallway (2.4m wide). Melamine board, push-to-open hinges.",
    status: "completed" as const,
    estimatedCost: ils(8_500),
    actualCost: ils(8_200),
    notes: "Completed April 2025. Very satisfied with result. Small scratch on top shelf was repaired on-site.",

    options: [
      {
        title: "Yossi Amsalem Carpentry",
        estimatedCost: ils(8_200),
        description: "Custom melamine wardrobe, push-to-open hinges, internal shelving, full installation. Timeline: 2 weeks. Warranty: 1 year.",
        selected: true,
        notes: "Excellent work. Would use again. Finished 3 days ahead of schedule. Phone: 050-432-1188",
      },
    ],

    items: [
      { name: "Custom wardrobe unit (2.4m)", store: "Yossi Amsalem", estimatedCost: ils(7_800), actualCost: ils(7_800), purchased: true },
      { name: "Push-to-open hinges ×6 (Blum)", estimatedCost: ils(280), actualCost: ils(280), purchased: true },
      { name: "Internal shelving hardware", estimatedCost: ils(120), actualCost: ils(120), purchased: true },
    ],
  },
];

// ─── Loans ────────────────────────────────────────────────────────────────────
//
// loans columns: id, propertyId, ownerId, name (notNull), lender,
//   originalAmount (notNull), currentBalance (notNull), interestRate (decimal string),
//   monthlyPayment, startDate, endDate, nextPaymentDate,
//   loanType: "mortgage"|"heloc"|"personal"|"construction"|"other"

export const mockLoans = [
  {
    name: "Family Loan — Parents",
    lender: "Abba & Ima (Parents)",
    originalAmount: ils(150_000),
    currentBalance: ils(80_000),
    interestRate: "0.00",
    loanType: "other" as const,
    startDate: "2022-02-01",
    endDate: "2027-02-01",
    notes: "Down-payment supplement. Informal agreement — repay when possible. No fixed schedule. Repaid so far: ₪70,000 · Outstanding: ₪80,000",
  },
];

// ─── Wishlist ─────────────────────────────────────────────────────────────────
//
// wishlistItems columns: id, propertyId, ownerId, name (notNull), category,
//   estimatedPrice, priority: "low"|"medium"|"high", status, url, notes

export const mockWishlist = [
  {
    name: "Split AC — bedroom 2",
    description: "Second bedroom has no AC. Summer in Tel Aviv is unbearable without it. Target: 12,000 BTU inverter unit.",
    estimatedPrice: ils(6_500),
    priority: "high" as const,
    category: "Appliance" as const,
  },
  {
    name: "Dishwasher (Bosch Series 4, 60cm)",
    description: "Built-under. Space was left during kitchen renovation. Just need to connect the pre-installed water line.",
    estimatedPrice: ils(3_800),
    priority: "high" as const,
    category: "Appliance" as const,
  },
  {
    name: "Robot vacuum (Roborock S8 Pro)",
    description: "Stone floors throughout the apartment. Robot vacuum would handle daily dust easily.",
    estimatedPrice: ils(2_400),
    priority: "medium" as const,
    category: "Appliance" as const,
  },
  {
    name: "Mamad (safe room) shelving",
    description: "Metal shelving system to turn the safe room into usable storage (tools, seasonal items, luggage).",
    estimatedPrice: ils(1_100),
    priority: "low" as const,
    category: "Other" as const,
  },
  {
    name: "Electric scooter (Xiaomi Pro 2)",
    description: "For short commutes in Florentin. Avoids parking problems. Can charge on balcony.",
    estimatedPrice: ils(4_200),
    priority: "medium" as const,
    category: "Other" as const,
  },
];

// ─── Purchase Costs ───────────────────────────────────────────────────────────
//
// purchaseCosts.category enum:
//   "Tax" | "Legal" | "Inspection" | "Agency" | "Renovation" | "Moving" | "Other"

export const mockPurchaseCosts = [
  {
    name: "Real estate agent fee",
    amount: ils(56_000),
    date: "2022-03-15",
    category: "Agency" as const,
    notes: "Standard 2% buyer-side agent fee",
  },
  {
    name: "Mas Rechisha (purchase tax)",
    amount: ils(38_500),
    date: "2022-04-10",
    category: "Tax" as const,
    notes: "First-apartment reduced-rate bracket · paid via lawyer to tax authority",
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
    notes: "Full-service move from Ramat Gan (3-room) · 5-hour job including packing",
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
//
// calendarEvents.category enum:
//   "Maintenance" | "Payment" | "Inspection" | "Renovation" | "Legal" | "Other"

export const mockCalendarEvents = [
  {
    title: "Arnona Q2 payment due",
    date: "2026-04-30",
    category: "Payment" as const,
    notes: "Pay before April 30 to avoid late fee. Pay via municipal website or Bit.",
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
    notes: "Building committee meeting. Agenda: elevator renovation budget vote (est. ₪180,000 total). Time: 19:00.",
  },
  {
    title: "Parents loan repayment",
    date: "2026-06-01",
    category: "Payment" as const,
    notes: "Planned ₪15,000 transfer. Outstanding balance will be ₪65,000 after.",
  },
  {
    title: "Building insurance renewal (Clal)",
    date: "2027-01-01",
    category: "Payment" as const,
    notes: "Get 2 competing quotes in December before auto-renewal date.",
  },
];
