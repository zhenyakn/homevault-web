# HomeVault — Engineering Trace

> **Ground rule:** Every observation, discovery, architectural decision, known issue, or implementation detail is logged here. This file is the single source of truth for anyone reading the codebase. Update it whenever something is discovered, changed, or decided.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Running Locally](#4-running-locally)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Database](#6-database)
7. [Data Flow: DB → Server → Client](#7-data-flow-db--server--client)
8. [API Layer (tRPC)](#8-api-layer-trpc)
9. [Client Architecture](#9-client-architecture)
10. [Internationalization (i18n)](#10-internationalization-i18n)
11. [Mock Data & Seeding](#11-mock-data--seeding)
12. [Known Issues & Technical Debt](#12-known-issues--technical-debt)
13. [Schema History (v1 → v2 Field Renames)](#13-schema-history-v1--v2-field-renames)
14. [Security Assessment](#14-security-assessment)
15. [Planned Improvements](#15-planned-improvements)
16. [Change Log](#16-change-log)

---

## 1. Project Overview

HomeVault is a self-hosted property management web application. It tracks:

- **Expenses** — recurring and one-off property costs
- **Repairs** — repair jobs with status progression and contractor quotes
- **Upgrades** — home improvement projects with budget tracking and item lists
- **Loans** — mortgages and other property-related loans with repayment tracking
- **Wishlist** — future purchase items with priority and estimated cost
- **Purchase Costs** — one-time costs associated with buying the property
- **Calendar** — scheduled events and reminders
- **Inventory** — household item inventory
- **Dashboard** — aggregated summary of all the above

The app is designed to run as a Home Assistant addon (single-user, no-auth mode) or as a standalone web app with OAuth authentication.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24 |
| Language | TypeScript | 5.9.3 |
| Package manager | pnpm | 10 |
| Web framework | Express | 4 |
| API | tRPC | 11 |
| ORM | Drizzle ORM | 0.44 |
| Database | MySQL | 8.4 |
| Frontend framework | React | 19 |
| Build tool | Vite | 7 |
| Routing (client) | wouter | 3 |
| UI components | Radix UI + shadcn/ui | — |
| Styling | Tailwind CSS | 4 |
| Forms | react-hook-form | 7 |
| State / data fetching | TanStack Query (via tRPC) | 5 |
| Auth tokens | jose (JWT) | 6 |
| i18n | react-i18next / i18next | 17 / 26 |
| File uploads | multer + AWS S3 | — |
| Testing | Vitest | 2 |
| Validation | Zod | 4 |

### Key architectural decisions

- **tRPC** is used for all client↔server communication. There is no REST API; every data operation goes through a tRPC procedure.
- **Drizzle ORM** is used for all DB access. Raw SQL is not used anywhere.
- **wouter** is the client-side router (lightweight React alternative to React Router).
- **Dates are stored as `varchar(20)` strings** in `YYYY-MM-DD` format, not as MySQL `DATE` or `DATETIME` types. This avoids timezone conversion issues in MySQL but means the application is responsible for all date ordering and comparison.
- **Monetary values are stored as integers (cents/agorot)**, never as floats. All amounts are multiplied by 100 on write and divided by 100 on display.

---

## 3. Repository Structure

```
homevault-web-main/
│
├── client/                        # React frontend (Vite)
│   └── src/
│       ├── components/            # Shared UI components
│       │   └── ui/                # shadcn/ui primitives
│       ├── pages/                 # One file per route/page
│       ├── locales/               # i18n translation files
│       │   ├── en.json
│       │   └── he.json
│       ├── lib/
│       │   ├── trpc.ts            # tRPC client setup
│       │   └── utils.ts           # formatCurrency, formatDate, cn()
│       └── main.tsx               # React entry point
│
├── server/
│   ├── _core/                     # Framework boilerplate (do not modify casually)
│   │   ├── index.ts               # Express server entry, port binding
│   │   ├── context.ts             # tRPC context: resolves user + propertyId per request
│   │   ├── env.ts                 # ENV config object (no Zod validation yet — see §14)
│   │   ├── sdk.ts                 # JWT token creation/verification
│   │   ├── oauth.ts               # OAuth flow
│   │   └── vite.ts                # Vite dev middleware integration
│   ├── routers.ts                 # All tRPC procedures (single file — see §12)
│   ├── db.ts                      # All DB functions (single file — see §12)
│   ├── mockData.ts                # Mock data for demo/seeding
│   ├── uploadRoute.ts             # File upload endpoint (multer → S3)
│   └── searchRouter.ts            # Global search across all entities
│
├── drizzle/
│   ├── schema.ts                  # !! Single source of truth for DB structure !!
│   ├── relations.ts               # Drizzle relation definitions
│   ├── 0001_*.sql ... 0008_*.sql  # Migration files (run in order)
│   └── 0007_schema_v2_alignment.sql  # The large v1→v2 migration (see §13)
│
├── shared/                        # Code shared between client and server
│   └── const.ts                   # COOKIE_NAME, ONE_YEAR_MS, etc.
│
├── .env                           # Local secrets — never commit real credentials
├── .env.example                   # Template for required env vars
├── package.json
├── drizzle.config.ts              # Drizzle Kit configuration
└── trace.md                       # This file
```

---

## 4. Running Locally

### Prerequisites

- Node 24
- MySQL 8.4 running on `localhost:3306`
- pnpm 10

### Setup

```bash
# Install dependencies
pnpm install

# Copy env and configure
cp .env.example .env
# Edit .env — set DATABASE_URL to your local MySQL connection

# Run all pending migrations
pnpm db:migrate

# Start dev server (hot reload on both client and server)
pnpm dev
```

The server starts on port **3005** by default, scanning upward if that port is busy.

### Dev Login Bypass

In development (`NODE_ENV=development`), a mock login endpoint is exposed at `POST /api/dev/login`. The `MockLogin.tsx` page calls this. It creates or upserts a user with `openId = OWNER_OPEN_ID` (from `.env`, defaults to `"local-admin"`) and sets a session cookie valid for one year.

**This bypass is not available in production.** It is guarded by `if (process.env.NODE_ENV === "development")` in `server/_core/index.ts`.

### NO_AUTH Mode

Setting `NO_AUTH=true` in the environment auto-authenticates every request as the owner user. Designed for Home Assistant addon usage (single-user, trusted network). The user session is cached in memory after the first request to avoid a DB round-trip on every tRPC call (`_noAuthUserCache` in `context.ts`).

### Migration Command

```bash
pnpm db:migrate
# runs: tsx scripts/migrate.ts
```

Migrations are applied in numeric order. The file `0007_schema_v2_alignment.sql` is the most significant — it aligns the DB with the v2 schema field names (see §13).

---

## 5. Authentication & Authorization

### Authentication Flow

1. Client calls `POST /api/dev/login` (dev) or completes OAuth flow (production).
2. Server creates a JWT via `sdk.createSessionToken()` (uses `jose` library).
3. JWT is stored in an `httpOnly` cookie named by `COOKIE_NAME` (from `shared/const.ts`).
4. Every tRPC request passes the cookie automatically. `createContext()` in `server/_core/context.ts` calls `sdk.authenticateRequest()` to verify and decode it.
5. The decoded user object (`User` from Drizzle schema) is attached to `ctx.user`.

### Property Authorization (Multi-Tenancy)

Every user can own one or more properties. The active property is communicated from the client via the `x-property-id` HTTP header on every tRPC request.

`createContext()` validates that the requested property actually belongs to the authenticated user:

```ts
const ownedProperties = await db.getPropertiesByUser(user.id)
const isOwned = ownedProperties.some(p => p.id === requestedId)
if (!isOwned) {
  propertyId = ownedProperties[0]?.id ?? requestedId  // fall back to first owned
}
```

This prevents a logged-in user from spoofing another user's `propertyId` header to access their data.

### Row-Level Authorization

tRPC procedures use a `protectedProcedure` middleware that throws `UNAUTHORIZED` if `ctx.user` is null.

Individual resource ownership (e.g. "does this expense belong to this user?") is checked via helper functions like `assertExpenseOwner(id, userId)`. **These are separate DB lookups after the fact** — a known weakness. The preferred pattern (encode ownership into the query WHERE clause) is documented in §15 as a planned improvement.

---

## 6. Database

### Connection

Drizzle ORM connects via `mysql2`. Connection string is read from `DATABASE_URL` in `.env`.

```
mysql://homevault:homevault_dev@localhost:3306/homevault
```

### Tables

| Table | Primary Key | Notes |
|---|---|---|
| `users` | `int` autoincrement | Auth, openId from OAuth/HA |
| `properties` | `int` autoincrement | One per household |
| `expenses` | `varchar(36)` nanoid | Recurring + one-off costs |
| `repairs` | `varchar(36)` nanoid | Repair jobs |
| `repairQuotes` | `varchar(36)` nanoid | Quotes per repair |
| `upgrades` | `varchar(36)` nanoid | Home improvement projects |
| `upgradeOptions` | `varchar(36)` nanoid | Options/alternatives per upgrade |
| `upgradeItems` | `varchar(36)` nanoid | Shopping list per upgrade |
| `loans` | `varchar(36)` nanoid | Mortgages and other loans |
| `wishlistItems` | `varchar(36)` nanoid | Future purchase wishlist |
| `purchaseCosts` | `varchar(36)` nanoid | One-time buying costs |
| `calendarEvents` | `varchar(36)` nanoid | Scheduled events |
| `inventoryItems` | `varchar(36)` nanoid | Household inventory |

Note: `users` and `properties` use auto-increment integer IDs. All other tables use `nanoid()` string IDs for portability.

### Important Column Conventions

- **Monetary amounts**: stored as `int` in the smallest currency unit (agorot for ILS, cents for USD). Never stored as float. Divide by 100 for display.
- **Dates**: stored as `varchar(20)` in `YYYY-MM-DD` format. No timezone conversion. Never use `new Date(dateString)` directly — use `date-fns` or string comparison.
- **JSON columns**: `attachments`, `repayments`, `payments`, `tags`, `pros`, `cons` are stored as MySQL `json` columns typed via Drizzle's `.$type<T>()`.
- **Enums**: all stored as MySQL `mysqlEnum`. Values are **lowercase with underscores** for status fields (`open`, `in_progress`, `waiting_for_parts`) and **Title Case** for category fields (`Maintenance`, `Plumbing`).

### Migrations

Migration files live in `drizzle/`. They are applied in order by `scripts/migrate.ts` via `pnpm db:migrate`.

| File | Purpose |
|---|---|
| `0001_*.sql` ... `0006_*.sql` | Initial schema creation |
| `0007_schema_v2_alignment.sql` | Major v1→v2 field renames (see §13) |
| `0008_expenses_paid_status.sql` | Adds `isPaid boolean` and `paidDate varchar(20)` to expenses |

**Never edit existing migration files.** Always create a new numbered file for any schema change.

---

## 7. Data Flow: DB → Server → Client

```
MySQL DB
  ↓ Drizzle ORM query (db.ts)
  ↓ tRPC procedure handler (routers.ts)
  ↓ HTTP (JSON over /api/trpc)
  ↓ TanStack Query cache (trpc client)
  ↓ React component render
```

### Critical Rule: No Field Aliasing

DB query results must reach the client with the **same field names the DB column has**. Do not rename fields between the DB and client (e.g. `label: u.title` is wrong — send `title` as `title`).

When aliasing was present (it was in `db.ts` for the dashboard query — `label: u.title`, `budget: u.estimatedCost`, `spent: u.actualCost`, `phase: u.phase`), it caused client-side bugs where the client read field names that didn't match what arrived. The aliasing has been removed from the active upgrades mapping; `Dashboard.tsx` now reads `u.label` (which is correctly aliased in the `getRecentActivity` helper — see observation below).

**Observation (2026-05):** `db.ts` `getRecentActivity` still uses `label: u.title` aliasing for the recent activity feed in the Dashboard. This is acceptable only because `Dashboard.tsx` explicitly reads `.label` from that specific response. It is isolated and documented. Do not extend this pattern.

---

## 8. API Layer (tRPC)

### Router structure

All procedures are defined in `server/routers.ts` as a single `appRouter`. Sub-routers:

- `data` — export, seedMock, deleteAll
- `property` — get, update
- `expenses` — list, create, update, delete, markAsPaid
- `repairs` — list, create, update, delete, updateStatus
- `upgrades` — list, create, update, delete, updateStatus, options, items
- `loans` — list, create, update, delete
- `wishlist` — list, create, update, delete
- `purchaseCosts` — list, create, update, delete
- `calendar` — list, create, update, delete
- `inventory` — list, create, update, delete
- `dashboard` — get
- `search` — query

### Input Validation

All mutation procedures have Zod input schemas. These are hand-written in `routers.ts` and must be kept in sync with `drizzle/schema.ts` manually. This is the primary source of field-name drift bugs. (See §15 for the planned `drizzle-zod` fix.)

### protectedProcedure

All procedures use `protectedProcedure` which throws `TRPCError({ code: "UNAUTHORIZED" })` if `ctx.user` is null. There is no public/unauthenticated tRPC endpoint.

### markAsPaid (expenses)

Sets `isPaid = true` and `paidDate = input.paidDate` on the expense record. **Note:** Earlier implementation incorrectly wrote to `notes` field instead. Fixed 2026-05.

---

## 9. Client Architecture

### Routing

wouter is used for client-side routing. Routes are defined in the main app component. Each route maps to a page component in `client/src/pages/`.

Key routes:
- `/` — Dashboard
- `/expenses` — Expenses list
- `/repairs` — Repairs list
- `/repairs/:id` — Repair detail
- `/upgrades` — Upgrades list
- `/upgrades/:id` — Upgrade detail
- `/loans` — Loans
- `/wishlist` — Wishlist
- `/purchase-costs` — Purchase costs
- `/calendar` — Calendar
- `/inventory` — Inventory
- `/settings` — Property settings

### Data Fetching

All server data is fetched via tRPC hooks (`trpc.expenses.list.useQuery()`, etc.). TanStack Query handles caching and invalidation. After a mutation succeeds, the relevant query is invalidated to trigger a refetch:

```ts
const utils = trpc.useUtils()
// after successful mutation:
utils.expenses.list.invalidate()
```

### Currency Display

`formatCurrency(amountInCents)` from `client/src/lib/utils.ts` handles display. It reads the property's `currency` symbol and `currencyCode`. All amounts passed to it must be integers (cents).

### Status & Priority Visual Conventions

Across all pages, status and priority states follow consistent visual patterns:

- **Unpaid / open / active** items appear at the **top** of lists, full opacity
- **Paid / completed / cancelled** items appear at the **bottom**, `opacity-60`, `text-muted-foreground`
- A labeled divider separates the two groups when both exist

Badge color conventions (defined per-page as `STATUS_BADGE`, `PRIORITY_BADGE` constants):
- Repairs: open=blue, in_progress=amber, waiting_*=orange, completed=green, cancelled=zinc
- Upgrades: idea=slate, planning=violet, in_progress=amber, completed=green, cancelled=zinc
- Priority: urgent=red, high=orange, medium=yellow, low=slate

### Expenses: Paid/Unpaid Sorting

The `Expenses.tsx` page sorts items client-side: unpaid first (newest first within group), paid last (newest first within group). Paid items display with `opacity-60` and a "Paid ✓" indicator. A divider row labeled "Paid" separates the groups.

---

## 10. Internationalization (i18n)

Translation files: `client/src/locales/en.json` and `he.json` (Hebrew).

The app supports RTL (Hebrew) and LTR (English). Layout uses `ltr:`/`rtl:` Tailwind variants and `me-` / `ms-` (margin-end / margin-start) instead of `mr-` / `ml-` to support both directions.

### Translation Key Conventions

- `status.open`, `status.in_progress`, `status.completed`, etc. — repair and upgrade statuses
- `priority.low`, `priority.medium`, `priority.high`, `priority.urgent`
- `frequency.monthly`, `frequency.quarterly`, `frequency.yearly`
- `categories.Maintenance`, `categories.Tax`, etc.

**Important:** Status keys use underscore (`status.in_progress`), not spaces or dashes. Enum values in the DB (`in_progress`) match the i18n key suffix exactly.

---

## 11. Mock Data & Seeding

Mock data lives in `server/mockData.ts`. It is seeded by `db.seedMockProperty()` in `server/db.ts`.

### Triggering a Seed

- **Via UI:** Settings page has a "Seed Demo Data" button that calls `trpc.data.seedMock`
- **Via CLI:** `node dist/index.js --seed-mock-only` (used in deployment scripts)
- **Via MockLogin:** `MockLogin.tsx` calls `seedMock` after the dev login

### Seeding behavior

`seedMockProperty` first deletes all existing data for the property, then re-inserts from `mockData.ts`. It is idempotent but destructive — calling it twice wipes any real data entered.

### Mock Data Paid Status (expenses)

Expenses in `mockData.ts` are authored with `isPaid: true` / `isPaid: false` to reflect realistic state. The rule: expenses with dates before the current month are marked `isPaid: true` with a plausible `paidDate`. Current-month recurring expenses are left unpaid to demonstrate the "Needs Attention" dashboard section.

**As of 2026-05:** Only 3 expenses are unpaid in the mock data: Mortgage April 2026, Va'ad Bayit April 2026, Arnona Q2 2026. The "Needs Attention" dashboard section should show exactly these.

### mockData.ts is untyped (known issue)

Mock data objects are not typed against `InsertExpense`, `InsertRepair`, etc. This means TypeScript will not catch missing or renamed fields at compile time. Fixing this is in §15.

---

## 12. Known Issues & Technical Debt

### HIGH — `routers.ts` and `db.ts` are monolithic single files

`routers.ts` (~600 lines) and `db.ts` (~950 lines) contain all procedures and all DB functions respectively. Finding a specific function requires grep. Business logic, data access, and data transformation are all mixed in `db.ts`.

### HIGH — No end-to-end type safety

tRPC output types are not inferred on the client. All page components use `any` for data from tRPC queries. Field name errors only surface at runtime as blank screens, not at compile time.

### HIGH — Hand-written Zod schemas can drift from Drizzle schema

Input validation Zod schemas in `routers.ts` are hand-maintained. When a column is renamed in `drizzle/schema.ts`, the Zod schema and all client code must be manually updated. This has caused multiple bugs (see §13).

### MEDIUM — `assertExpenseOwner` pattern is inefficient and incomplete

The pattern of fetching a record then checking ownership (`assertExpenseOwner`, `assertRepairOwner`, etc.) makes 2 DB queries where 1 would suffice. The WHERE clause approach is more correct. Also: not all entities have consistent ownership assertion patterns.

### MEDIUM — No rate limiting on any endpoint

Auth endpoints and all mutation procedures accept unlimited requests. No brute-force protection.

### MEDIUM — ENV object has no validation

`server/_core/env.ts` reads env vars with `?? ""` fallbacks. A missing `JWT_SECRET` or `DATABASE_URL` fails silently (or fails later with a confusing error). No startup validation.

### MEDIUM — `upgrades` table still has orphaned `phase` column

The `phase varchar(100)` column exists in the schema and DB but is not used anywhere in the application. The concept of "phase" was removed in favor of `status`. The column should be dropped in a future migration.

### LOW — No pagination

All list endpoints return every record for the property. With real long-term data (years of monthly expenses, many repairs), this will cause performance problems.

### LOW — `getRecentActivity` aliasing

`db.ts` `getRecentActivity` maps `expenses.name` → `label`, `repairs.title` → `label`, `upgrades.title` → `label` for the activity feed. This is intentional for the dashboard's "recent activity" component but is isolated and inconsistent with the no-aliasing rule. Should be refactored when splitting `db.ts`.

### LOW — Soft deletes not implemented

Deleting an expense, repair, or loan is permanent. For a financial tracking app, this means losing historical data with no recovery path.

---

## 13. Schema History (v1 → v2 Field Renames)

**Context:** An AI assistant (Perplexity) rewrote `drizzle/schema.ts` to use improved field names without updating the server or client code. This caused a cascade of bugs where fields stored under new names were read by old names, producing blank displays throughout the app.

The fixes were applied manually over multiple sessions (2026-05).

### Field name changes

| Table | v1 name | v2 name | Notes |
|---|---|---|---|
| expenses | `label` | `name` | |
| expenses | `recurringFrequency` | `recurringInterval` | |
| repairs | `label` | `title` | |
| upgrades | `label` | `title` | |
| upgrades | `budget` | `estimatedCost` | |
| upgrades | `spent` | `actualCost` | |
| loans | — | `originalAmount` | replaces `totalAmount` |
| loans | — | `currentBalance` | new field |
| loans | — | `endDate` | replaces `dueDate` |
| wishlistItems | `label` | `name` | |
| wishlistItems | `estimatedCost` | `estimatedPrice` | |
| wishlistItems | `description` | `notes` | |
| purchaseCosts | `label` | `name` | |

### Enum value changes

| Table | Field | v1 values | v2 values |
|---|---|---|---|
| repairs | `priority` | `Low`, `Medium`, `High`, `Critical` | `low`, `medium`, `high`, `urgent` |
| repairs | `status` | `Assessment`, `Quoting`, `Scheduled`, `In Progress`, `Resolved` | `open`, `in_progress`, `waiting_for_parts`, `waiting_for_contractor`, `completed`, `cancelled` |
| upgrades | `status` | `Planning`, `Sourcing`, `Building`, `Done` | `idea`, `planning`, `in_progress`, `completed`, `cancelled` |
| loans | `loanType` | `Family`, `Bank`, `Friend`, `Other` | `mortgage`, `heloc`, `personal`, `construction`, `other` |
| wishlistItems | `priority` | `Low`, `Medium`, `High` | `low`, `medium`, `high` |

### Phase concept removed

Repairs and upgrades previously had a UI concept of "Phase" (Assessment/Quoting/Scheduled for repairs; Planning/Sourcing/Building/Done for upgrades). **These never existed as DB columns** — they were invented by the v1 UI and mapped to status values. The v2 UI removes Phase entirely and uses the `status` column directly with a status stepper UI component.

The `upgrades` table still has a `phase varchar(100)` column (legacy, unused).

---

## 14. Security Assessment

### What is in place

- JWT session tokens via `jose`, stored in `httpOnly` cookies
- `protectedProcedure` middleware on all tRPC procedures
- Property ownership validated in `createContext()` on every request
- Parameterized queries via Drizzle ORM (no raw SQL, no injection risk)
- Dev-only login bypass guarded by `NODE_ENV` check

### What is missing or weak

| Issue | Risk | Status |
|---|---|---|
| `assertOwner` is a post-fetch check, not in WHERE clause | IDOR possible if check logic has a bug | Not fixed |
| No rate limiting | Brute force / DoS | Not implemented |
| ENV vars not validated at startup | Silent misconfiguration | Not implemented |
| JWT secret defaults to `"local-dev-secret-change-in-production"` in example | Trivial to break if not changed in prod | Documented |
| No structured error logging | Operational blind spot | Not implemented |
| No dependency vulnerability scanning in CI | Vulnerable packages go undetected | Not implemented |
| Soft deletes not implemented | No audit trail for financial data | Not implemented |
| Mock login session valid for 1 year | Overly permissive for dev | Low risk (dev only) |

---

## 15. Planned Improvements

Listed in priority order. Do not implement without updating this file.

### P1 — Type safety end-to-end (drizzle-zod + tRPC output types)

- Install `drizzle-zod`
- Replace hand-written Zod schemas in `routers.ts` with `createInsertSchema(table).omit({id, ownerId, propertyId, createdAt, updatedAt})`
- Export `RouterOutputs` from the server router and import in client pages
- Replace all `any` in page components with inferred types
- **Effect:** Field renames in schema.ts produce TypeScript compile errors everywhere they're used. Bugs caught at build time, not runtime.

### ~~P2 — ENV validation at startup~~ ✅ DONE (2026-05)

- `server/_core/env.ts` rewritten with Zod schema
- `server/_core/env.test.ts` — 9 tests
- `server/test-setup.ts` + `vitest.config.ts` setupFiles added

### P3 — Authorization: encode ownership in queries

- Remove `assertExpenseOwner`, `assertRepairOwner`, etc.
- Add `ownerId` / `propertyId` to every query WHERE clause
- Single DB round-trip instead of two, and no separate ownership check that can be missed

### ~~P4 — Unit tests for business logic~~ ✅ DONE (2026-05)

- `server/db.business.test.ts` — 19 tests covering `getOverdueExpenses`, `calcMonthlyStats`, `buildLoanSummary`
- The three functions exported from `db.ts` to make them testable
- Includes a named regression test: "excludes paid expenses — the critical bug that was fixed"

### P5 — Split `db.ts` into per-entity files

```
server/db/
  client.ts        ← drizzle connection
  expenses.ts
  repairs.ts
  upgrades.ts
  loans.ts
  wishlist.ts
  purchaseCosts.ts
  dashboard.ts
  seed.ts
```

### ~~P6 — Type mock data~~ ✅ DONE (2026-05)

- `server/mockData.ts` — `Seed<T>` helper type strips server-assigned fields (`id`, `ownerId`, `propertyId`, `createdAt`, `updatedAt`)
- All 9 mock arrays typed against `InsertExpense`, `InsertRepair`, etc. from `drizzle/schema.ts`
- **Bug found and fixed by typing:** `upgradeOptions` objects had `notes` fields that were silently never persisted (column doesn't exist). Notes folded into `description`. 4 stale `phase:` fields also removed from `mockUpgrades`.

### ~~P7 — Drop orphaned `upgrades.phase` column~~ ✅ DONE (2026-05)

- `drizzle/0009_drop_upgrade_phase.sql` — migration applied
- `drizzle/schema.ts` — `phase` field removed from upgrades table definition

### P8 — Rate limiting

Apply to auth endpoints and mutation procedures. `express-rate-limit` or similar.

### P9 — Pagination

Add `limit` / `offset` or cursor-based pagination to all `list` procedures.

### P10 — Structured logging

Replace `console.log/error` with `pino`. Log userId, propertyId, procedure name, duration on every request.

---

## 16. Change Log

> Append an entry whenever a meaningful change is made to the codebase. Format: `YYYY-MM-DD | What changed | Why`

| Date | Change | Reason |
|---|---|---|
| 2026-05 | v1→v2 field rename fixes across all pages and routers | Perplexity AI renamed schema fields without updating server/client code, causing blank displays |
| 2026-05 | Removed Phase concept from Repairs and Upgrades UI | Phase never existed as a DB column; replaced with status stepper |
| 2026-05 | `getOverdueExpenses` — added `!e.isPaid` filter | Paid expenses were appearing in Dashboard "Needs Attention" section |
| 2026-05 | `markAsPaid` handler — fixed to write `isPaid`/`paidDate` fields | Handler was writing to `notes` instead of the actual DB columns |
| 2026-05 | `drizzle/schema.ts` — added `isPaid boolean`, `paidDate varchar(20)` to expenses | Columns existed in DB but were missing from schema type definition |
| 2026-05 | `drizzle/0008_expenses_paid_status.sql` — migration for isPaid/paidDate | Formal migration file for the above columns |
| 2026-05 | Expenses page — unpaid items sort to top, paid items grey out at bottom | UX improvement for readability; matches Repairs/Upgrades pattern |
| 2026-05 | Dashboard `PHASE_DOT` → `STATUS_DOT`, `u.phase` → `u.status` | `phase` field doesn't exist on Upgrade; was always `undefined` |
| 2026-05 | `db.ts` activeUpgrades mapping — `phase: u.phase` → `status: u.status` | Same as above — sending non-existent field to client |
| 2026-05 | Mock data — historical expenses marked `isPaid: true` | All past expenses appeared as overdue in dashboard |
| 2026-05 | DB patched live — 18 historical expenses set `isPaid = true` | Sync existing seeded data with the new mock data intent |
| 2026-05 | `trace.md` created | Ground rule: all observations and changes documented in one place |
| 2026-05 | ENV validation at startup — `server/_core/env.ts` rewritten with Zod schema | Missing DATABASE_URL or JWT_SECRET now causes a clear startup failure instead of silent misconfiguration. Added `server/test-setup.ts` and `vitest.config.ts` setupFiles so all tests have required env vars. 9 new tests in `env.test.ts`. |
| 2026-05 | Dropped `upgrades.phase` column — migration `0009_drop_upgrade_phase.sql` | Column was never written to; Phase concept was removed in v2. Dead column removed from schema and DB. |
| 2026-05 | Unit tests for business logic — `server/db.business.test.ts` | 19 tests for `getOverdueExpenses`, `calcMonthlyStats`, `buildLoanSummary`. Includes named regression test for the isPaid bug. Functions exported from db.ts to enable testing. |
| 2026-05 | Typed mock data — `server/mockData.ts` | Added `Seed<T>` helper and typed all 9 mock arrays against schema insert types. Discovered and fixed: `upgradeOptions` had `notes` fields never persisted (no column); 4 stale `phase:` fields removed. |
| 2026-05 | Schema column guard tests — `db.business.test.ts` | Upgrades page broke because a stale server process (started before schema.ts was changed) generated SQL still referencing the dropped `phase` column. Root cause: drizzle builds SQL at import time, so any running process must be restarted after schema.ts changes. Added 3 schema guard tests asserting `phase`, `budget`, and `spent` are absent from the schema object — these would have caught any re-addition at test time rather than at runtime. |
| 2026-05 | P1 type safety — `drizzle-zod` insert schemas in `server/routers.ts` | Replaced all manual `z.object()` input schemas with `createInsertSchema(table)` from `drizzle-zod`. Schema is now single-sourced from Drizzle table definitions. `SERVER_FIELDS` constant ensures `id/ownerId/propertyId/createdAt/updatedAt` are always omitted from insert schemas. |
| 2026-05 | P1 type safety — `RouterOutputs`/`RouterInputs` exported from `server/routers.ts` | Added `inferRouterOutputs<AppRouter>` and `inferRouterInputs<AppRouter>` exports; re-exported from `client/src/lib/trpc.ts`. Client pages can now derive types from the router instead of maintaining separate type declarations. |
| 2026-05 | P1 type safety — `UpgradeDetail.tsx` typed end-to-end | Replaced all `any` with `RouterOutputs["upgrades"]["list"][number]`, `RouterOutputs["upgradeOptions"]["list"][number]`, `RouterOutputs["upgradeItems"]["list"][number]`. Discovered and fixed field name mismatches: `UpgradeOption` uses `title/estimatedCost/description/selected` (not `name/totalPrice/scope/isSelected`); `UpgradeItem` uses `purchased: boolean` (not 6-state status enum). |
| 2026-05 | `upgradeItems` router procedures — align with DB schema | Updated `upgradeItems.create` and `upgradeItems.update` to accept `store`/`purchased` instead of legacy `vendorName`/`status`/`eta`. The old mapping was silently discarding `vendorName` and never persisting it to DB. |
| 2026-05 | `lessonslearned.md` created at repo root | Retro/lessons-learned file; appended after every session per new ground rule. |
| 2026-05-07 | P1 type safety — remaining pages typed end-to-end | Dashboard.tsx: introduced `Stats`, `OverdueExpense`, `StaleRepair`, `ActiveUpgrade`, `LoanSummaryItem`, `CalEvent` from `RouterOutputs`; fixed `l.dueDate` → `l.endDate` (DB field), `e.eventType` → `e.category` (calendar schema field). Expenses.tsx: `Expense` type, fixed `category` nullable guard. RepairDetail.tsx: `Repair`/`RepairQuote` types; fixed `isSelected`→`selected`, `contractorName`→`contractor`, `quotedPrice`→`amount`; removed phantom fields (phone, timeline, guarantee, scope) not persisted to DB. Repairs.tsx: `Repair` type, typed sort/filter/CSV. Loans.tsx: `Loan`/`Repayment` types, extracted `submitLoanForm` to avoid `e as any` in button handler. Upgrades.tsx: `Upgrade` type on `UpgradeRow`. |
| 2026-05-07 | Rewrote `server/homevault.test.ts` — all 6 stale input validation tests fixed | All tests used pre-v2 field names (`label`/`budget`/`dateLogged`/`totalAmount`) — they passed for the wrong reason (missing required field, not the intended constraint). Rewrote with correct v2 field names (`name`/`title`/`estimatedCost`/`originalAmount`). Added `inventoryItems` to router structure test. Added new tests: expense date format regex, expense zero amount, upgrade negative estimatedCost, loan negative originalAmount, loan malformed startDate, calendar invalid eventType, inventory item name/quantity validation. 58 tests total, all passing. |
| 2026-05-07 | Expanded schema column guards — `db.business.test.ts` | Added guards for `repairQuotes` (contractor/amount/selected present; contractorName/quotedPrice/isSelected absent), `upgradeOptions` (title/estimatedCost/description/selected present; name/totalPrice/scope/isSelected absent), `upgradeItems` (store/purchased present; vendorName/status/eta absent), `expenses` (name/isPaid/paidDate present; label absent). Guards now cover all tables where P1 revealed AI-generated field name mismatches. |
| 2026-05-07 | P3 authorization — ownerId baked into all update/delete WHERE clauses | All 14 direct-entity update/delete DB functions now accept `ownerId` and include `AND ownerId = ?` in the WHERE clause. Removes the SELECT → check → mutate round-trip. Discovered and fixed 6 child-entity security holes: `repairQuotes.update/delete`, `upgradeOptions.update/delete`, `upgradeItems.update/delete` had NO ownership check — any authenticated user could mutate any record. Added `getRepairQuoteById`, `getUpgradeOptionById`, `getUpgradeItemById` for parent-lookup ownership checks. |
| 2026-05-07 | P3 API field alignment — repairQuotes and upgradeOptions | `repairQuotes.create` was mapping `contractorName`→`contractor` / `quotedPrice`→`amount` internally. `upgradeOptions.create` was mapping `name`→`title` / `totalPrice`→`estimatedCost` / `scope`→`description`. Both now accept DB column names directly, eliminating the silent re-mapping. |
| 2026-05-07 | P5 DB module split — `server/db.ts` → `server/db/` directory | Monolithic 600-line `db.ts` split into 11 focused modules: `client.ts`, `users.ts`, `properties.ts`, `expenses.ts`, `repairs.ts`, `upgrades.ts`, `loans.ts`, `wishlist.ts`, `purchaseCosts.ts`, `inventory.ts`, `dashboard.ts`, `seed.ts`. `index.ts` re-exports all. All 3 existing import sites (`import from "./db"`) work unchanged — TypeScript resolves the directory to `index.ts`. |
| 2026-05-07 | P8 rate limiting — `express-rate-limit` added | Two tiers: `authLimiter` (20 req / 15 min) applied to `/api/trpc/auth` and `/api/dev/login`; `apiLimiter` (300 req / min) applied to all `/api/trpc` routes. Protects auth endpoints from brute force. |
| 2026-05-07 | P9 pagination — optional limit/offset on all list procedures | All 9 list tRPC procedures accept optional `{ limit?: number, offset?: number }` input; all corresponding DB functions accept `limit = 500, offset = 0` defaults. Existing clients see no behavioral change. |
| 2026-05-07 | P10 structured logging — pino replaces console.* | Added `pino` + `pino-pretty`; `server/_core/logger.ts` exports singleton logger. Replaced all `console.log/warn/error` calls in 8 server source files with `logger.info/warn/error` carrying structured JSON context. `env.ts` fatal-exit path uses `process.stderr.write` to avoid init-order risk. JSON output in production, colorized human-readable in development. |
| 2026-05-07 | HA add-on alignment — `apply-migration-addon.mjs`, `config.yaml`, `run.sh` | Migration script: removed dead `phase` column from upgrades CREATE TABLE; added `repayments` to loans, `payments` to repairQuotes and upgradeOptions CREATE TABLE (were missing — Drizzle SELECTs them); added convergence ALTER TABLE section covering all columns that may be missing in existing installations (expenses.isPaid/paidDate, loans.repayments, repairQuotes.payments, upgradeOptions v2 renames from v5 field names, upgradeItems v2 renames). Backfill query copies legacy `name` → `title` for upgradeOptions. `config.yaml`: version bumped 0.1.51→0.2.0; added LOG_LEVEL and STORAGE_* options. `run.sh`: exports all new env vars from options.json. `pnpm-lock.yaml` committed with pino/express-rate-limit. |
