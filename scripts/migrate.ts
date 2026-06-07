/**
 * scripts/migrate.ts — CLI entry for `pnpm db:migrate`.
 *
 * The actual logic lives in server/_core/migrate.ts (shared with the server's
 * boot-time auto-migration). This wrapper just loads env and runs it.
 */

import "dotenv/config";
import { runMigrations } from "../server/_core/migrate";

runMigrations()
  .then(() => {
    console.log("\nMigrations complete.");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
