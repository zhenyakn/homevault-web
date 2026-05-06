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
