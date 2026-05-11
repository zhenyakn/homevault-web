# Lessons Learned

> One entry per session. Format: date, what broke or surprised us, root cause, and what we changed because of it.

---

## 2026-05-06 — Upgrades page broken after schema migration

### What happened
After dropping the `phase` column from the DB (migration `0009_drop_upgrade_phase.sql`) and removing it from `drizzle/schema.ts`, the Upgrades page stopped working. The tRPC endpoint returned a MySQL error: `Unknown column 'phase' in field list`.

### Root cause
Drizzle builds the SQL column list **at module import time**, not at query execution time. The dev server process was started before `schema.ts` was edited, so it had the old table object (with `phase`) frozen in memory. Every query it generated still included `` `phase` ``, which the DB rejected because the column had been dropped.

The error was also invisible at first — plain `curl` returned `"Please login"` (auth guard fires before the DB query). The real SQL error only surfaced after authenticating via `/api/dev/login` and replaying the request with a session cookie.

### What we changed
- Added 3 schema column guard tests in `server/db.business.test.ts` that assert dropped/renamed columns (`phase`, `budget`, `spent`) are absent from the drizzle table object. These fail at test time if a column reappears in `schema.ts` without a corresponding migration.
- Documented the root cause in `trace.md`.

### Rules we carry forward
1. **After any edit to `drizzle/schema.ts`, restart the dev server.** The process does not pick up schema changes automatically.
2. **Always test auth-gated endpoints with a real session.** A `401 Please login` response tells you nothing about the DB.
3. **Schema guards are cheap.** `expect((table as any).droppedColumn).toBeUndefined()` — three lines, catches re-additions in CI before the server ever starts.

---

## 2026-05-07 — P1 type safety: field name mismatches caught by strict typing

### What happened
During the P1 type safety pass (replacing all `any` with `RouterOutputs`-derived types), TypeScript immediately revealed several real bugs that had been silently broken:

1. **`UpgradeOption` field names**: UI was reading `option.name`, `option.totalPrice`, `option.scope`, `option.isSelected` — but DB columns are `title`, `estimatedCost`, `description`, `selected`. Options rendered blank because the fields were undefined.
2. **`UpgradeItem.status` didn't exist**: The component showed a 6-state status dropdown, but the DB only stores `purchased: boolean`. The UI was sending status strings to a server that silently dropped them.
3. **`upgradeItems` server procedures**: `vendorName`, `status`, `eta` fields were accepted by the API but destructured and discarded — never written to DB. The actual DB column is `store`.
4. **`repairQuotes` field names**: UI read `quote.contractorName`, `quote.quotedPrice`, `quote.isSelected`; DB has `contractor`, `amount`, `selected`. Quote cards showed blank contractor names and $0 prices.
5. **`repairQuotes` phantom fields**: `contractorPhone`, `timeline`, `guarantee`, `scope` — accepted by the old API, mapped to nothing, never persisted. Editing a quote always reset these to empty.
6. **Dashboard `l.dueDate`**: Loan cards showed no end date; DB field is `endDate` not `dueDate`.
7. **Dashboard calendar `e.eventType`**: Category chip was blank; DB field is `category` not `eventType`.
8. **`Loans.tsx` submit button**: Called `handleSubmit(e as any)` from a `MouseEvent` handler — a type unsafety antipattern.

### Root cause
All generated code (Perplexity AI) used assumed/invented field names that didn't match the actual DB schema. Without strict types on component props, these were runtime silences — components rendered blank or skipped fields without any error.

### What we changed
- Added `drizzle-zod` and `inferRouterOutputs` to create a type chain from DB schema → server router → client component props.
- Replaced `any` props on all major page components with `RouterOutputs["router"]["procedure"][number]` types.
- Fixed all field name mismatches listed above.
- Aligned `upgradeItems` create/update API to accept `store` and `purchased` directly.
- Extracted `submitLoanForm()` helper to eliminate `e as any` antipattern.

### Rules we carry forward
1. **`RouterOutputs` is the single source of truth for client types.** Never manually declare `type Upgrade = { id: string; title: string; ... }` — derive it from the router.
2. **`any` on a component prop is a bug waiting to happen.** The compiler cannot catch field-name typos at all when the prop is `any`. Strict types are a prerequisite for correctness.
3. **Phantom API fields are invisible without types.** If a server procedure accepts a field and silently drops it, the client will never know unless the return type differs. Use `RouterOutputs` on read and `RouterInputs` on write to detect these.
4. **Field name mismatches between DB and UI are extremely common in AI-generated code.** After any code generation, verify every field access against the schema before shipping.

---

## 2026-05-07 — Input validation tests passed for the wrong reasons

### What happened
`homevault.test.ts` had 6 input validation tests, all passing, all misleading. Example:

```ts
it("rejects expense with empty label", async () => {
  await expect(
    caller.expenses.create({ label: "", amount: 1000, date: "2026-01-01", category: "Mortgage" })
  ).rejects.toThrow();
});
```

The field is `name`, not `label`. So Zod never saw an empty `name` — it saw a missing required `name` field, which triggered `ZodError: Required`. The test passed, but it was testing "missing required field" not "empty string is rejected".

The same pattern repeated across all 6 tests: `label`/`budget`/`dateLogged`/`totalAmount` are all pre-v2 schema names that no longer exist. Every test passed by accident, not by design.

### Root cause
The tests were AI-generated alongside the original schemas. When field names were renamed during the v2 schema alignment pass, test inputs were never updated. Because both scenarios (`missing required field` and `invalid value`) raise `ZodError`, the tests stayed green.

### What we changed
- Rewrote all 6 validation tests with correct v2 field names.
- Added new targeted tests for constraints that weren't previously tested: date regex format (`YYYY-MM-DD`), zero/negative numeric amounts, enum rejection, `inventoryItems` validation.
- Added `inventoryItems` to the router structure test (new router added on this branch but missed in the assertion).
- Expanded schema column guards in `db.business.test.ts` to cover `repairQuotes`, `upgradeOptions`, `upgradeItems`, and `expenses` — all tables where P1 revealed AI-invented field names.
- 58 tests total, all passing.

### Rules we carry forward
1. **A test that passes for the wrong reason is worse than no test.** It creates false confidence and masks real regressions. When inheriting AI-generated tests, verify that each test actually exercises the stated constraint by reading the input field names against the current schema.
2. **"Rejects.toThrow" is too broad.** If you only check that *something* throws, you can't tell whether Zod rejected a value or whether a missing required field triggered an unrelated validation error. For constraint-specific tests, consider asserting on the error message or testing the positive path too.
3. **Schema renames must propagate to tests.** Any time a DB field is renamed, search `*.test.ts` for the old name and update immediately. The schema guards now catch this at the schema object level; tests must also be kept in sync.

---

## 2026-05-07 — Security hardening pass (P3/P5/P8/P9/P10)

### What happened
A full security and quality hardening pass across the server layer revealed several concrete issues:

1. **Missing ownership checks on child entities (P3)**: `repairQuotes.update/delete`, `upgradeOptions.update/delete`, and `upgradeItems.update/delete` had NO ownership check. Any authenticated user could mutate any repair quote, upgrade option, or upgrade item by guessing the record UUID. The pattern was: look up the child by ID, get the parent ID, then assert parent ownership. The missing `getRepairQuoteById`, `getUpgradeOptionById`, `getUpgradeItemById` helpers were added to enable this.

2. **Ownership enforced at application layer not DB layer**: The original pattern was SELECT-then-check: fetch the record, compare `ownerId` to `ctx.user.id` in application code, then run a separate UPDATE/DELETE. This means a race condition exists where another request could modify the record between the SELECT and the mutation. Moving `ownerId` into the WHERE clause of the UPDATE/DELETE makes it atomic and eliminates the round-trip.

3. **API field mapping silently swallowed mistakes**: `repairQuotes.create` accepted `contractorName`/`quotedPrice` and mapped them to `contractor`/`amount`. `upgradeOptions.create` accepted `name`/`totalPrice`/`scope` and mapped to `title`/`estimatedCost`/`description`. This worked but meant the client was using wrong field names that could diverge from the schema over time. Eliminated all internal remapping.

4. **tRPC createCaller returns a truthy Proxy for unknown routes**: When testing `caller.inventoryItems` (wrong router name — actual name is `inventory`), the test passed because tRPC's `createCaller` returns a Proxy-like object for any property access, not `undefined`. This means router structure assertions must be tested by calling procedures, not by checking `toBeDefined()` on the caller property.

### What we changed
- P3: Added `ownerId` to 14 update/delete DB function signatures; baked into WHERE clauses.
- P3: Added ownership checks to all 6 previously unguarded child entity mutations.
- P5: Split 600-line `server/db.ts` into 11 focused modules under `server/db/`. All imports unchanged.
- P8: Added `express-rate-limit` with two tiers (auth: 20/15min, api: 300/min).
- P9: Added optional `limit`/`offset` to all 9 list procedures (default limit=500, backwards-compatible).
- P10: Added pino structured logging; replaced all `console.*` in server source with `logger.*`.

### Rules we carry forward
1. **Ownership checks belong in the SQL WHERE clause, not in application code.** An UPDATE/DELETE that includes `AND ownerId = ?` is atomic. Application-layer checks are a separate round-trip and can be racy.
2. **Child entities with no `ownerId` column are the most common ownership gap.** Always ask: does this entity's parent have an `ownerId`? If so, the child mutations need a parent-lookup ownership check.
3. **tRPC `createCaller` does not throw on unknown route names.** It returns a Proxy. Router structure tests must actually call a procedure (`.query()` / `.mutate()`) to prove the route exists; `.toBeDefined()` on the caller property proves nothing.
4. **Internal field remapping in the API layer is a smell.** If the input schema accepts `contractorName` but the DB column is `contractor`, the client is silently wrong about the schema. Accept DB column names directly.

---

## 2026-05-07 — Live HA add-on failure: `Unknown column 'name'` after schema migration

### What happened
After pushing v0.2.0 to GitHub and installing it as a Home Assistant add-on, the live server crashed immediately on startup with:

```
Error: Unknown column 'name' in 'INSERT INTO'
  at expenses INSERT
```

The `apply-migration-addon.mjs` script runs first to bring the DB up to date, then `--seed-mock-only` seeds demo data. The seed INSERT used column `name`, but the existing HA database still had `label` (the v1 name). The add-on migration script's convergence section covered only post-v2 additions (isPaid, repayments…) but never included the v1→v2 renames from `drizzle/0007_schema_v2_alignment.sql`.

### Root cause
`apply-migration-addon.mjs` is NOT a sequential migration runner — it's a single unified idempotent script. When we added new tables or columns in sequential drizzle migrations (`0007_schema_v2_alignment.sql` and later), we updated the CREATE TABLE blocks in the add-on script but never added the corresponding ALTER TABLE statements to bring *existing* HA databases forward. Fresh installs worked; upgrades were broken.

### What we changed
- Added 50+ `ALTER TABLE … ADD COLUMN` statements in a "convergence section" at the bottom of `apply-migration-addon.mjs`, one for every column that was added or renamed from v1 onward across all 10 affected tables. `ER_DUP_FIELDNAME` is silently swallowed so the script stays idempotent.
- Tagged `v0.2.1` to trigger a new Docker build.
- Confirmed: no user data exists in the live installation, so no backfills were needed.

### Rules we carry forward
1. **The add-on migration script is a separate artifact from drizzle migrations.** Any change to `drizzle/schema.ts` requires a matching change in `apply-migration-addon.mjs` — both the CREATE TABLE block (for new installs) AND an ALTER TABLE in the convergence section (for upgrades).
2. **Static analysis tests (`server/addon.test.ts`) catch this gap before CI.** They parse schema.ts and apply-migration-addon.mjs with regex and assert every column is present in the script. Always run `pnpm test` before pushing a new tag.
3. **The convergence section must cover all migrations since the add-on was first shipped**, not just the latest one. Any time you add a column, also add it to the convergence section.

---

## 2026-05-07 — HA add-on seed cascade: three separate NOT NULL failures (v0.2.2–v0.2.4)

### What happened
After v0.2.3's schema reset approach was introduced, three sequential seed failures uncovered a broader problem:

1. **v0.2.2**: `loans.attachments` was in schema.ts and the CREATE TABLE but no drizzle migration ever added it to an existing table, and it wasn't in the ALTER TABLE convergence section. The seed INSERT (which includes `attachments: []`) failed. Because the seed inserts in table order and loans comes after expenses/repairs/upgrades, those three tables got seeded but everything after loans (wishlist, purchaseCosts, calendar, inventory) didn't.

2. **v0.2.3**: `Field 'label' doesn't have a default value` on expenses INSERT. Migration 0008 made all v1 NOT NULL columns (label, contractorName, totalAmount, etc.) nullable via MODIFY COLUMN, but that was never replicated in the unified HA migration script. The convergence section only did ADD COLUMN, never MODIFY COLUMN.

3. **v0.2.4**: After v0.2.3's new `dropIfLegacyV1()` approach reset 9 tables, `upgradeItems` was missed — it was the 10th table in migration 0008 and wasn't included in the reset list.

### Root cause
The unified HA migration script (`apply-migration-addon.mjs`) has been maintained by copying individual changes forward, but without a systematic audit against ALL sequential drizzle migrations. Migration 0008 (MODIFY COLUMN for NOT NULL removal) was never carried over at all.

### What we changed
- **v0.2.2**: Added `loans.attachments` and `wishlistItems.attachments` to the ALTER TABLE convergence section.
- **v0.2.3**: Replaced the MODIFY COLUMN problem entirely with a `dropIfLegacyV1(table, canaryColumn)` helper. It queries `information_schema.COLUMNS` for columns that are still `NOT NULL`, drops the table, and lets `CREATE TABLE IF NOT EXISTS` recreate it clean. Safe because no real data is stored in HA installs. Fires exactly once per table — after recreation the canary is nullable or gone.
- **v0.2.4**: Added `upgradeItems` (canary: `ownerId`) to complete all 10 tables from migration 0008.

### Rules we carry forward
1. **When a new drizzle migration runs, audit it against apply-migration-addon.mjs immediately.** Ask: does it ADD COLUMN? → add to convergence. Does it MODIFY COLUMN to make things nullable? → add a `dropIfLegacyV1` canary. Does it DROP COLUMN? → the unified script's CREATE TABLE won't include it, but old tables might still have it (harmless for SELECTs/INSERTs but worth noting).
2. **The seed INSERT order determines which tables get data when a failure occurs.** If a seed fails on table N, tables 1…N-1 already have data. Check seed.ts insertion order when debugging partial data issues.
3. **`dropIfLegacyV1` is the right pattern for schema version detection in the HA add-on.** Checking `information_schema` for a NOT NULL canary is cheap, precise, and idempotent. Prefer it over maintaining a list of MODIFY COLUMN statements.

---

## 2026-05-07 — Second security pass: gaps found by reading actual code, not summaries

### What happened
A deep code-reading pass (not relying on the agent survey) found six security holes and three structural bugs that the previous hardening session missed:

**Security — four unguarded mutations:**
1. `repairQuotes.logPayment` and `.deletePayment` — neither checked ownership. Any authenticated user could log or delete payments on any repair quote by knowing the quote ID.
2. `upgradeOptions.logPayment` and `.deletePayment` — same gap.
3. `upgradeItems.create` — the mutation didn't destructure `ctx` at all. Any authenticated user could add items to any upgrade by guessing its nanoid.
4. `calendar.delete` — called `db.deleteCalendarEvent(input.id)` with no `ownerId` filter. Any user could delete any calendar event.

**Data integrity — loan currentBalance drift:**
`loans.addRepayment` stored the repayment in the JSON array but never updated the `currentBalance` column. The dashboard's `buildLoanSummary` was computing the correct remaining balance from the array (independently), while `currentBalance` in the DB silently fell out of sync after the first repayment. Two sources of truth for the same derived value.

**Logic bug — property.delete guarded by ID 1:**
The guard `if (propertyId === 1)` was correct only for a single-user install where the first created property happens to be ID 1 (autoincrement). For any multi-user deployment, user A's primary property could be ID 5 — the guard doesn't protect them.

### Root cause
All of these were invisible during the first security pass (P3) because that pass focused on *top-level entity* update/delete procedures. The four security holes were all in *child entity payment* paths and one *create* path — the assumption was that mutations need a `ctx` destructure to do anything harmful, but `protectedProcedure` already ensures the user is authenticated; the missing check was *whose* records they could touch.

The `currentBalance` drift was invisible because `buildLoanSummary` happened to compute the balance correctly from the array — there was no observable UI bug, just a silent column divergence that would confuse future code reading `loan.currentBalance`.

### What we changed
- Added `getRepairQuoteById` + `assertRepairOwner` chain to `logPayment`/`deletePayment`.
- Added `getUpgradeOptionById` + `assertUpgradeOwner` chain to `logPayment`/`deletePayment`.
- Added `ctx` + `assertUpgradeOwner` to `upgradeItems.create`.
- Added `ownerId` parameter to `db.deleteCalendarEvent`; baked into WHERE clause; router passes `ctx.user.id`.
- `addRepayment` now computes `max(0, originalAmount - totalRepaid)` and writes `currentBalance` atomically with the repayments update.
- `property.delete` guard changed from `propertyId === 1` to `props.length <= 1`.
- `context.ts` property validation changed from full `getPropertiesByUser` list to a targeted `checkPropertyOwnership(userId, propertyId)` (single SELECT id). Full list only on fallback path.

### Rules we carry forward
1. **Every tRPC mutation that accepts an entity ID must answer: who can own this ID?** If it's a child entity (no `ownerId` column), walk to the parent. If it's a top-level entity, bake `ownerId` into the WHERE clause. Never leave a mutation that ignores `ctx.user.id`.
2. **"Logged in" is not "authorized."** `protectedProcedure` ensures authentication. Authorization — *whose* data can this user touch — is a separate, explicit check that must appear in every mutation. It cannot be assumed.
3. **Two sources of truth for the same value will diverge.** `currentBalance` and `sum(repayments)` both represent the outstanding balance. Pick one as canonical (the computed value from repayments) and keep the denormalized column in sync on every write.
4. **Hardcoded IDs in guards are accidents.** `propertyId === 1` works on a single-user dev install by coincidence. The guard should always express the intended semantic: "can't delete the only property."

---

## 2026-05-07 — Architectural migration: JSON arrays → relational payment tables

### What happened

Three tables (`loans`, `repairQuotes`, `upgradeOptions`) stored payment sub-records as JSON arrays in a column. This is a common early-prototype pattern that creates several real problems:

1. **No FK integrity.** Deleting a parent record left orphaned JSON blobs. The only protection was application-level logic in the delete path.
2. **Index-based deletion is semantically wrong.** `deletePayment` took `paymentIndex: number` — the array index of the payment to delete. If two clients race, they can delete the wrong payment. Worse, this breaks completely with pagination.
3. **Dashboard aggregation required full table loads.** `getDashboardStats` was loading every expense, repair, upgrade, and loan into Node.js memory, filtering in JS. On a long-lived installation this becomes a serious performance issue.
4. **Denormalized `currentBalance` silently diverged.** After logging a repayment, the `currentBalance` column was never updated. `buildLoanSummary` computed the correct balance from the JSON array; `currentBalance` was stale.

### Root cause
All three patterns (JSON sub-records, index-based mutations, in-memory aggregation) were introduced by AI-generated code that optimized for "works on first try" rather than correctness or scalability. No code review of the persistence layer was done at generation time.

### What we changed
- Created three relational tables: `repairQuotePayments`, `upgradeOptionPayments`, `loanRepayments` — each with `ON DELETE CASCADE` FK to the parent.
- Rewrote `server/db/repairs.ts`, `upgrades.ts`, `loans.ts`: `attachPayments()` / `attachRepayments()` batch-fetches child rows in one query, maps in JS (no N+1).
- Changed `deletePayment` input from `paymentIndex: number` to `paymentId: string` on all three payment paths. Updated `RepairDetail.tsx` and `UpgradeDetail.tsx`.
- Rewrote `getDashboardStats` and `getPortfolioSummary` with SQL `SUM`/`COUNT`/`GROUP BY` aggregates — no full-table loads.
- `addRepayment` now updates `currentBalance` atomically.
- Migration `drizzle/0010_payment_tables.sql` uses `JSON_TABLE` to copy existing data before dropping the JSON columns.
- `apply-migration-addon.mjs` updated: Phase 2 creates the 3 new tables; Phase 4 (new) runs best-effort JSON→relational data copy (try/catch for MariaDB), then `DROP COLUMN IF EXISTS` for the old JSON columns.
- `server/db/seed.ts` updated to insert repayments/payments into the new relational tables instead of passing them as JSON in parent inserts.

---

## 2026-05-07 — Migration runner silently dropped SQL; `DROP COLUMN IF EXISTS` not supported on MySQL 8.4 Windows

### What happened
`pnpm run db:migrate` failed with `ER_PARSE_ERROR` on `DROP COLUMN IF EXISTS`. Before reaching that, the runner was silently skipping three SQL statements entirely — `CREATE TABLE loanRepayments`, the data migration INSERT for it, and `ALTER TABLE loans DROP COLUMN repayments`. None of these were executed, and no error was logged. The runner reported "6 statements" but there should have been 10.

### Root causes
1. **The runner's comment filter was too aggressive.** The statement-split logic split on `statement-breakpoint`, then filtered any chunk whose first line started with `--`. A chunk structured as `-- comment\nCREATE TABLE ...` was treated as a pure comment and silently discarded. Three out of ten statements in the migration had leading SQL comments and were silently lost.

2. **`DROP COLUMN IF EXISTS` is not supported by MySQL 8.4 on Windows.** The parser rejects the syntax even though MySQL 8.0.29 release notes document this feature. Using plain `DROP COLUMN` is equivalent since the runner's `IGNORABLE` set already includes `ER_CANT_DROP_FIELD_OR_KEY`.

3. **The migration was never run as part of the session that created it.** The session ended after writing the migration file and running `pnpm test`, which passes because unit tests mock the DB. Running `pnpm run db:migrate` was not part of the session-end checklist.

### What we changed
- `scripts/migrate.ts`: changed the filter to strip leading comment lines from each chunk (line-by-line scan for first non-`--` line), preserving SQL that follows comments.
- `drizzle/0010_payment_tables.sql` + `apply-migration-addon.mjs`: replaced `DROP COLUMN IF EXISTS` with plain `DROP COLUMN`.

### Rules we carry forward
1. **Every session that creates or modifies a migration file must run `pnpm run db:migrate` before ending.** `pnpm test` is not a substitute — unit tests don't hit the real DB.
2. **The migration runner's comment filter must strip comment lines, not entire chunks.** A chunk is a multi-line SQL statement with optional header comments. Only discard chunks that are *all* comments.
3. **Write tests before ending a session, not after the bug is found manually.** Adding `server/migrate.test.ts` retroactively confirmed three pre-existing issues (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `loanRepayments.ownerId` schema drift) that had been silently present since 0004/0005. A test written when the migration was first authored would have flagged all three immediately.
4. **Don't assume `IF EXISTS` / `IF NOT EXISTS` DDL syntax works everywhere.** MySQL 8.4 on Windows rejected `DROP COLUMN IF EXISTS` with `ER_PARSE_ERROR`. Use plain DDL and handle the idempotency error in the IGNORABLE set instead.

---

### Rules we carry forward
1. **JSON columns for sub-records are a prototype pattern, not a production pattern.** If a "thing" has a list of "sub-things", the sub-things deserve their own table. The signal to look for: any mutation that takes a list index (`paymentIndex: number`) to identify a specific sub-record.
2. **Aggregation belongs in SQL, not in application code.** `SUM`, `COUNT`, `GROUP BY` exist for a reason. Loading all rows just to sum them in Node.js is O(n) memory and CPU for what the DB can do in a single page-scan pass.
3. **When refactoring JSON columns to relational tables: keep the parent getter shape unchanged.** `getLoans()` still returns `Loan & { repayments: LoanRepayment[] }` — the same shape as before, but now with real objects. Client code that reads `loan.repayments` continues to work. The N+1 avoidance comes from `attachRepayments()` which batch-fetches all children for a list of parent IDs in one query.
4. **`apply-migration-addon.mjs` has four phases now.** Phase 1: detect and drop legacy v1 tables. Phase 2: CREATE TABLE IF NOT EXISTS for current schema. Phase 3: ALTER TABLE convergence for upgrades. Phase 4: new — data migrations and DROP COLUMN for retired JSON columns. Any future column removal follows this pattern.

---

## 2026-05-11 — UI redesign: green brand, grouped nav, bento dashboard

### What happened
Implemented the HomeVault 2.0 redesign from the `homevault-redesign-concept.html` mock:
- Primary color changed from blue → forest green (#2B7A55, oklch)
- Navigation restructured from a flat 10-item list to 4 labeled groups (Overview, Finances, Property, Account)
- Desktop topbar added (breadcrumb + search pill), replacing the navigation-only sidebar topbar that desktop users had before
- Dashboard changed from vertical sections to a 12-column bento grid with an Open Items summary card

### Root cause (nothing broke, but decisions made)
The previous design mixed navigation styles from different UI frameworks (shadcn sidebar + Tailwind colors set to blue) while the brand needed to be green (property app). The flat nav had no hierarchy — all 10 items were equal weight, making the sidebar feel noisy.

### What we changed
- `index.css`: oklch green primary + sidebar-accent; dark mode green variants
- `DashboardLayout.tsx`: grouped nav (`NAV_GROUPS`), `PAGE_META` lookup for breadcrumb, compact `ThemeToggle` in topbar, solid green logo mark
- `Dashboard.tsx`: bento grid, new `OpenItemsCard` using `stats.openRepairs`/`overdueExpenses`/`activeUpgrades` counts, `AttentionCard` as a list inside a single card, `CalendarCard` with date-box style
- `en.json` + `he.json`: `nav.group.*` section labels + 7 new `dashboard.*` keys

### Rules we carry forward
1. **Keep imports at the top of the file.** Attempting a mid-file `import` statement to fix a missing symbol caused a compile error. Always move the import to the top, or include it in the initial import declaration.
2. **When changing color tokens in oklch, update both `:root` (light) and `.dark`.** Missing the dark-mode counterpart causes jarring color shifts when the user switches themes.
3. **`PAGE_META` pattern is cleaner than scanning nav arrays.** A static `Record<path, {sectionKey, pageKey}>` for breadcrumb lookup is O(1) and survives nav restructuring without bugs — scanning `orderedItems.find(...)` would break when the same icon appears in multiple groups.

---

## 2026-05-11 — Mock repair data didn't exercise the quote/payment tables

### What happened
The user pointed out we didn't have good mock data for repairs. On inspection, `mockRepairs` had 6 flat entries — no rows were ever seeded into `repairQuotes` or `repairQuotePayments`, even though the repair UI has full multi-vendor quote support (with payments) since v2. Enum coverage was also patchy: `Electrical` / `Appliance` / `Other` categories were missing, `urgent` priority and `waiting_for_contractor` / `cancelled` statuses had no representative rows.

### Root cause
When the relational payment tables landed (`drizzle/0010_payment_tables.sql`, see trace entry on 2026-05-07), `mockUpgrades` was updated to carry embedded `options[].payments[]` and the seed loop was rewritten to insert them — but `mockRepairs` was left as flat repair rows with no `quotes` field. The seed loop for repairs continued to be a single `db.insert(repairs).values(...)` and never touched `repairQuotes` / `repairQuotePayments`. Result: the demo data exercised the upgrade quote/payment UI but not the parallel repair UI.

A latent bug also surfaced: `repairQuotes.repairId → repairs.id` is **not** `ON DELETE CASCADE` in the schema, but the seed's pre-insert cleanup deletes repairs directly. The path was harmless only because no quotes were ever seeded — the first time someone seeded quotes and then re-seeded, repair rows would be deleted while their `repairQuotes` rows would remain orphaned (with dangling `repairId` references).

### What we changed
- `mockData.ts`: introduced `SeedRepair = Seed<InsertRepair> & { quotes?: ... }`, mirroring the existing `SeedUpgrade` pattern. Rewrote `mockRepairs` to 8 scenarios covering all 6 statuses, all 4 priorities, and all 7 categories. Each repair has 0–2 quotes; some quotes have payments (deposits, completion payments, single-shot payments).
- `server/db/seed.ts`: imported `repairQuotePayments`; added a pre-cleanup step that deletes existing `repairQuotes` (cascades to payments via the payments-table FK, which **does** have `ON DELETE CASCADE`) before deleting repairs — closing the orphaned-quotes hole. Replaced the flat `db.insert(repairs).values(...)` with a per-repair loop that inserts the repair, then its quotes, then each quote's payments — same pattern as the upgrade seed.

### Rules we carry forward
1. **When a parent entity gains a relational child table, check the seed and the mock data — not just the runtime code.** The payment-table migration touched runtime + upgrade seed but missed the parallel repair seed. Demo data is part of the surface area that has to migrate alongside the schema.
2. **Mock data should exercise every enum value at least once.** If a status like `cancelled` has no representative row, no one tests the rendering of cancelled items until a user reports it broken in prod. Treat enum coverage in seeds as a checklist.
3. **Pre-insert cleanup must walk FK dependencies even when the FK is not cascading.** The repair seed's `db.delete(repairs).where(...)` looked symmetric to other table cleanups, but without an explicit `repairQuotes` delete it would orphan quote rows on re-seed. When in doubt, treat the seed cleanup as a manual cascade — list every child table that references the parent, even if the parent's cleanup looks innocent.

---
