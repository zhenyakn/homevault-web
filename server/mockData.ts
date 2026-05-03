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

export const mockProperty = {
  houseName: MOCK_PROPERTY_NAME,
  houseNickname: "Florentin",
  propertyType: "Apartment",
  address: "Abarbanel St 12, Tel Aviv-Yafo, 6612421",
  latitude: "32.0580",
  longitude: "34.7699",
  purchaseDate: "2022-03-15",
  purchasePrice: ils(2_800_000),   // 2,800,000 ₪
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
// Tip: duplicate a row and change the date to simulate historical months.

export const mockExpenses = [
  // ── Mortgage (monthly recurring) ──────────────────────────────────────────
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),                     // 8,200 ₪/month
    date: "2026-04-01",
    category: "Mortgage" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: false,
    notes: "Loan #74-382910 · 25-year fixed · linked to prime rate",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-03-01",
    category: "Mortgage" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-03-03",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-02-01",
    category: "Mortgage" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-02-04",
  },
  {
    name: "Mortgage — Bank Hapoalim",
    amount: ils(8_200),
    date: "2026-01-01",
    category: "Mortgage" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-01-05",
  },

  // ── Va'ad Bayit / HOA (monthly) ───────────────────────────────────────────
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),                        // 450 ₪/month
    date: "2026-04-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: false,
    notes: "Building committee fee · covers elevator, cleaning, garden, intercom",
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-03-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-03-06",
  },
  {
    name: "Va'ad Bayit (HOA)",
    amount: ils(450),
    date: "2026-02-01",
    category: "Other" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-02-08",
  },

  // ── Electricity — IEC (monthly) ───────────────────────────────────────────
  {
    name: "Electricity (IEC)",
    amount: ils(315),
    date: "2026-03-15",
    category: "Utility" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-03-18",
    notes: "Israel Electric Corporation · bimonthly billed, split to monthly here",
  },
  {
    name: "Electricity (IEC)",
    amount: ils(295),
    date: "2026-02-15",
    category: "Utility" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-02-19",
  },
  {
    name: "Electricity (IEC)",
    amount: ils(345),
    date: "2026-01-15",
    category: "Utility" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-01-17",
  },

  // ── Water & sewage (monthly) ──────────────────────────────────────────────
  {
    name: "Water & Sewage",
    amount: ils(175),
    date: "2026-03-01",
    category: "Utility" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-03-10",
    notes: "Tel Aviv municipality · meter reading 1st of month",
  },
  {
    name: "Water & Sewage",
    amount: ils(162),
    date: "2026-02-01",
    category: "Utility" as const,
    isRecurring: true,
    recurringInterval: "Monthly" as const,
    isPaid: true,
    paidDate: "2026-02-11",
  },

  // ── Arnona — municipal tax (quarterly) ────────────────────────────────────
  {
    name: "Arnona Q2 2026",
    amount: ils(920),                        // 920 ₪/quarter · 3-room reduced rate
    date: "2026-04-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "Quarterly" as const,
    isPaid: false,
    notes: "Tel Aviv-Yafo municipal tax · reduced rate (toshav) · due by 30 Apr",
  },
  {
    name: "Arnona Q1 2026",
    amount: ils(920),
    date: "2026-01-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "Quarterly" as const,
    isPaid: true,
    paidDate: "2026-01-15",
  },
  {
    name: "Arnona Q4 2025",
    amount: ils(920),
    date: "2025-10-01",
    category: "Tax" as const,
    isRecurring: true,
    recurringInterval: "Quarterly" as const,
    isPaid: true,
    paidDate: "2025-10-12",
  },

  // ── Insurance (annual) ────────────────────────────────────────────────────
  {
    name: "Building Insurance — Clal",
    amount: ils(2_400),                      // 2,400 ₪/year
    date: "2026-01-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "Annual" as const,
    isPaid: true,
    paidDate: "2026-01-08",
    notes: "Policy #CL-2024-48821 · structure only · auto-renews Jan 1",
  },
  {
    name: "Contents & Liability Insurance — Harel",
    amount: ils(1_850),                      // 1,850 ₪/year
    date: "2026-02-01",
    category: "Insurance" as const,
    isRecurring: true,
    recurringInterval: "Annual" as const,
    isPaid: true,
    paidDate: "2026-02-03",
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

export const mockRepairs = [
  {
    title: "Kitchen sink — slow drain after descaling",
    description: "Water drains slowly. May need pipe replacement section. Plumber did temporary fix in Feb but issue returned.",
    priority: "High" as const,
    status: "in_progress" as const,
    reportedDate: "2026-03-15",
    contractor: "Avi Plumbing Services",
    contractorPhone: "052-344-5566",
    estimatedCost: ils(1_200),
    notes: "Second visit scheduled. Contractor suspects partial blockage 80cm in.",
  },
  {
    title: "Bathroom wall tiles — hairline cracks (3 tiles)",
    description: "Hairline cracks above the shower surround. Not leaking yet, but risk of water ingress if not fixed.",
    priority: "Medium" as const,
    status: "pending" as const,
    reportedDate: "2026-01-20",
    estimatedCost: ils(2_800),
    notes: "Got 1 quote (₪2,800). Need a second quote. Low urgency for now.",
  },
  {
    title: "Water heater — pressure drop when multiple taps open",
    description: "Hot water pressure drops noticeably when shower and kitchen tap are both open. Likely mixing valve.",
    priority: "Medium" as const,
    status: "pending" as const,
    reportedDate: "2025-12-01",
    contractor: "Avi Plumbing Services",
    contractorPhone: "052-344-5566",
    estimatedCost: ils(900),
    notes: "Contractor said it's likely the pressure-balancing valve. Parts on order.",
  },
  {
    title: "AC outdoor unit — unusual noise when starting",
    description: "Compressor makes a grinding sound for the first 30 seconds when starting from off. Worse in cold mornings.",
    priority: "Low" as const,
    status: "pending" as const,
    reportedDate: "2026-02-10",
    estimatedCost: ils(1_500),
    notes: "Technician visit booked for May service — will diagnose then.",
  },
  {
    title: "Master bedroom door — stiff latch",
    description: "Latch didn't retract smoothly, sometimes jammed.",
    priority: "Low" as const,
    status: "resolved" as const,
    reportedDate: "2025-10-05",
    actualCost: ils(180),
    notes: "Replaced latch mechanism. Works fine now.",
  },
  {
    title: "Balcony — water seepage into ceiling below",
    description: "Water stain appeared on ceiling of ground-floor storage after heavy rain. Traced to balcony membrane failure.",
    priority: "High" as const,
    status: "resolved" as const,
    reportedDate: "2025-09-01",
    contractor: "Roni Waterproofing Ltd",
    contractorPhone: "054-778-2233",
    estimatedCost: ils(5_500),
    actualCost: ils(4_800),
    notes: "Applied new bitumen membrane + drainage mat. 5-year workmanship warranty. Tested through two rain events — no recurrence.",
  },
];

// ─── Upgrades (with embedded options & items) ─────────────────────────────────
//
// Each upgrade has:
//   options[] — vendor quotes. Set isSelected: true on the chosen one.
//               payments[] logs actual transfers to that vendor.
//   items[]   — individual products / tasks. Status advances left → right:
//               "need_to_find" → "researching" → "quoted" → "ordered" → "delivered" → "installed"
//
// status: "idea" | "planning" | "in_progress" | "completed" | "cancelled"

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
        name: "IKEA + Rami Installation",
        vendorPhone: "052-344-1188",
        totalPrice: ils(17_100),           // cabinets + installation
        timeline: "8 weeks",
        warranty: "1 year (installation)",
        scope: "IKEA Metod cabinets supply, handles, full installation by Rami. Countertop and sink ordered separately.",
        isSelected: true,
        notes: "Very professional. Rami does IKEA kitchen installs full-time.",
        payments: [
          { date: "2026-02-10", amount: ils(5_000), notes: "Deposit" },
          { date: "2026-03-20", amount: ils(6_900), notes: "Cabinets delivery + start" },
        ],
      },
      {
        name: "Yossi Cabinets",
        vendorPhone: "054-221-8800",
        totalPrice: ils(16_200),
        timeline: "8 weeks",
        warranty: "1 year",
        scope: "Custom cabinets + installation. Countertop and handles excluded.",
        isSelected: false,
        notes: "Cheaper but slower communication. Didn't include handles in quote.",
      },
      {
        name: "Local Carpenter (Shlomo)",
        vendorPhone: "050-987-6543",
        totalPrice: ils(19_800),
        timeline: "6 weeks",
        warranty: "2 years",
        scope: "All-inclusive: custom cabinets, countertop, handles, installation, cleanup.",
        isSelected: false,
        notes: "Most expensive but best warranty and fastest timeline. Good reviews from neighbour.",
      },
    ],

    items: [
      { name: "Kitchen cabinets (IKEA Metod)", vendorName: "IKEA", estimatedCost: ils(8_400), actualCost: ils(8_100), status: "installed" as const },
      { name: "Backsplash tiles (Porcelanosa, 30×60)", vendorName: "Porcelanosa", estimatedCost: ils(3_600), actualCost: ils(3_400), status: "installed" as const },
      { name: "Cabinet handles ×24 (IKEA Eneryda)", vendorName: "IKEA", estimatedCost: ils(400), actualCost: ils(380), status: "installed" as const },
      { name: "Plumber — pipe relocation", vendorName: "Avi Plumbing", estimatedCost: ils(1_800), actualCost: ils(1_800), status: "installed" as const },
      { name: "Countertop — Caesarstone Statuario", vendorName: "Caesarstone", estimatedCost: ils(4_200), status: "ordered" as const, eta: "2026-05-08", notes: "Must arrive before Rami starts installation" },
      { name: "LED strip under cabinets (5m)", vendorName: "Amazon", estimatedCost: ils(280), status: "ordered" as const, eta: "2026-04-30" },
      { name: "Undermount sink (Franke MRG 110-52)", estimatedCost: ils(1_100), status: "researching" as const, notes: "Must fit 60cm cabinet. Check Hashkiya and Rami's supplier." },
      { name: "Kitchen faucet (pull-out spray)", estimatedCost: ils(600), status: "need_to_find" as const, notes: "Coordinate finish colour with handles (brushed nickel)" },
      { name: "Built-in oven (60cm)", estimatedCost: ils(3_200), status: "researching" as const, notes: "Needs dedicated 32A circuit — confirm with electrician first" },
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
        name: "Roni Tiling Works",
        vendorPhone: "052-771-4490",
        totalPrice: ils(20_000),
        timeline: "3 weeks",
        warranty: "1 year",
        scope: "Full demo, waterproofing membrane, wall + floor tiles (supply & lay). Vanity installation excluded.",
        isSelected: false,
        notes: "Did the balcony waterproofing — reliable. Will give discount as repeat customer.",
      },
      {
        name: "Dan Renovations",
        vendorPhone: "054-882-3311",
        totalPrice: ils(24_500),
        timeline: "2.5 weeks",
        warranty: "2 years",
        scope: "Full demo, waterproofing, wall + floor tiles, vanity + mirror installation included.",
        isSelected: false,
        notes: "More expensive but includes vanity install and shorter timeline.",
      },
    ],

    items: [
      { name: "Floor tiles — Atlas Concorde 60×60 (7 sqm)", vendorName: "Porcelanosa", estimatedCost: ils(3_200), status: "quoted" as const, notes: "Grey marble-look. Got price from Porcelanosa — comparing online." },
      { name: "Wall tiles — Atlas Concorde 30×60 (18 sqm)", vendorName: "Porcelanosa", estimatedCost: ils(2_800), status: "quoted" as const },
      { name: "IKEA Godmorgon vanity 80cm (white)", vendorName: "IKEA", estimatedCost: ils(2_400), status: "need_to_find" as const, notes: "Check if 80cm fits. Measure again before ordering." },
      { name: "Shower mixer (Grohe Euphoria)", estimatedCost: ils(1_800), status: "researching" as const },
      { name: "Toilet (Roca Meridian)", estimatedCost: ils(1_600), status: "need_to_find" as const },
      { name: "Towel rail — heated electric", estimatedCost: ils(900), status: "need_to_find" as const },
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
        name: "DIY + Electrician (Eli)",
        vendorPhone: "053-600-1234",
        totalPrice: ils(1_800),           // labour only — parts bought separately
        timeline: "1 day",
        scope: "Eli installs 8x Shelly relays + wires to existing switches. We supply parts.",
        isSelected: true,
        notes: "Eli is licensed and familiar with Shelly. Half-day job.",
        payments: [
          { date: "2026-04-01", amount: ils(500), notes: "Deposit" },
        ],
      },
    ],

    items: [
      { name: "Shelly 1PM relays ×8", vendorName: "AliExpress", estimatedCost: ils(1_120), actualCost: ils(1_120), status: "delivered" as const, notes: "Arrived. Tested 1 unit — works with Google Home." },
      { name: "Electrician labour (Eli)", vendorName: "Eli Electric", estimatedCost: ils(1_800), status: "quoted" as const, notes: "Booked May 15 during kitchen phase" },
      { name: "Switch cover plates ×8 (white)", estimatedCost: ils(240), status: "need_to_find" as const, notes: "Current covers may not refit after relay — measure first" },
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
        name: "Yossi Amsalem Carpentry",
        vendorPhone: "050-432-1188",
        totalPrice: ils(8_200),
        timeline: "2 weeks",
        warranty: "1 year",
        scope: "Custom melamine wardrobe, push-to-open hinges, internal shelving, full installation.",
        isSelected: true,
        notes: "Excellent work. Would use again. Finished 3 days ahead of schedule.",
        payments: [
          { date: "2025-03-15", amount: ils(4_000), notes: "Deposit 50%" },
          { date: "2025-04-10", amount: ils(4_200), notes: "Final payment on completion" },
        ],
      },
    ],

    items: [
      { name: "Custom wardrobe unit (2.4m)", vendorName: "Yossi Amsalem", estimatedCost: ils(7_800), actualCost: ils(7_800), status: "installed" as const },
      { name: "Push-to-open hinges ×6 (Blum)", estimatedCost: ils(280), actualCost: ils(280), status: "installed" as const },
      { name: "Internal shelving hardware", estimatedCost: ils(120), actualCost: ils(120), status: "installed" as const },
    ],
  },
];

// ─── Loans ────────────────────────────────────────────────────────────────────

export const mockLoans = [
  {
    lender: "Abba & Ima (Parents)",
    totalAmount: ils(150_000),               // 150,000 ₪ total
    loanType: "Family" as const,
    interestRate: "0",
    startDate: "2022-02-01",
    dueDate: "2027-02-01",
    notes: "Down-payment supplement. Informal agreement — repay when possible. No fixed schedule.",
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

export const mockWishlist = [
  {
    name: "Split AC — bedroom 2",
    description: "Second bedroom has no AC. Summer in Tel Aviv is unbearable without it. Target: 12,000 BTU inverter unit.",
    estimatedCost: ils(6_500),
    priority: "High" as const,
  },
  {
    name: "Dishwasher (Bosch Series 4, 60cm)",
    description: "Built-under. Space was left during kitchen renovation. Just need to connect the pre-installed water line.",
    estimatedCost: ils(3_800),
    priority: "High" as const,
  },
  {
    name: "Robot vacuum (Roborock S8 Pro)",
    description: "Stone floors throughout the apartment. Robot vacuum would handle daily dust easily.",
    estimatedCost: ils(2_400),
    priority: "Medium" as const,
  },
  {
    name: "Mamad (safe room) shelving",
    description: "Metal shelving system to turn the safe room into usable storage (tools, seasonal items, luggage).",
    estimatedCost: ils(1_100),
    priority: "Low" as const,
  },
  {
    name: "Electric scooter (Xiaomi Pro 2)",
    description: "For short commutes in Florentin. Avoids parking problems. Can charge on balcony.",
    estimatedCost: ils(4_200),
    priority: "Medium" as const,
  },
];

// ─── Purchase Costs ───────────────────────────────────────────────────────────

export const mockPurchaseCosts = [
  {
    name: "Real estate agent fee",
    amount: ils(56_000),                     // 2% of 2,800,000 ₪
    date: "2022-03-15",
    category: "Agent",
    notes: "Standard 2% buyer-side agent fee",
  },
  {
    name: "Mas Rechisha (purchase tax)",
    amount: ils(38_500),
    date: "2022-04-10",
    category: "Tax",
    notes: "First-apartment reduced-rate bracket · paid via lawyer to tax authority",
  },
  {
    name: "Lawyer fee — conveyancing (Adv. Michal Levi)",
    amount: ils(9_200),
    date: "2022-03-28",
    category: "Legal",
    notes: "Includes purchase agreement, title search, and tabu registration",
  },
  {
    name: "Mortgage registration — Land Registry (tabu)",
    amount: ils(1_380),
    date: "2022-05-02",
    category: "Legal",
    notes: "Bank lien registration with Israel Land Authority",
  },
  {
    name: "Bank appraisal (shuma)",
    amount: ils(2_500),
    date: "2022-02-20",
    category: "Other",
    notes: "Bank Hapoalim-required valuation before mortgage approval",
  },
  {
    name: "Moving company (Rahav Moving)",
    amount: ils(4_800),
    date: "2022-05-20",
    category: "Other",
    notes: "Full-service move from Ramat Gan (3-room) · 5-hour job including packing",
  },
  {
    name: "Locksmith — new cylinders (3 locks)",
    amount: ils(1_200),
    date: "2022-05-21",
    category: "Other",
    notes: "Replaced all door lock cylinders on move-in day",
  },
];

// ─── Calendar Events ──────────────────────────────────────────────────────────

export const mockCalendarEvents = [
  {
    title: "Arnona Q2 payment due",
    date: "2026-04-30",
    eventType: "Expense" as const,
    notes: "Pay before April 30 to avoid late fee. Pay via municipal website or Bit.",
  },
  {
    title: "Kitchen countertop delivery (Caesarstone)",
    date: "2026-05-08",
    time: "08:00",
    eventType: "Upgrade" as const,
    notes: "Must be home 08:00–12:00. Clear path from elevator to kitchen.",
  },
  {
    title: "AC annual service — pre-summer",
    date: "2026-05-20",
    eventType: "Repair" as const,
    notes: "Call Roma AC (054-123-4567) to confirm appointment. Both units.",
  },
  {
    title: "Va'ad Bayit annual meeting",
    date: "2026-06-10",
    time: "19:00",
    eventType: "Other" as const,
    notes: "Building committee meeting. Agenda: elevator renovation budget vote (est. ₪180,000 total).",
  },
  {
    title: "Parents loan repayment",
    date: "2026-06-01",
    eventType: "Loan" as const,
    notes: "Planned ₪15,000 transfer. Outstanding balance will be ₪65,000 after.",
  },
  {
    title: "Building insurance renewal (Clal)",
    date: "2027-01-01",
    eventType: "Expense" as const,
    notes: "Get 2 competing quotes in December before auto-renewal date.",
  },
];
