# Migration Scripts

These are one-off SQL migration scripts that were run against the production database during the initial development phase.

> **For new migrations, use Drizzle Kit:**
> ```bash
> pnpm drizzle-kit generate   # generate a new migration from schema changes
> pnpm drizzle-kit migrate    # apply pending migrations
> ```

The scripts in this directory are kept for historical reference only and should not be re-run against an already-migrated database.

| File | Purpose |
|---|---|
| `apply-migration.mjs` | Initial schema setup |
| `apply-migration-v2.mjs` | v2 schema additions |
| `apply-migration-v3.mjs` | v3 schema additions |
| `apply-migration-v4.mjs` | v4 schema additions |
| `apply-migration-v5.mjs` | v5 schema additions |
| `apply-migration-addon.mjs` | HomeVault Addon schema |
