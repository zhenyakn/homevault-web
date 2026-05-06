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
