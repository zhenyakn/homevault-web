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
