import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { appSettings } from "../../drizzle/schema";

/**
 * Generic key/value store backed by the `app_settings` MySQL table.
 *
 * Used for runtime-configurable state that should not live in env vars:
 *   - Google Drive OAuth refresh token (`gdrive.refreshToken`)
 *   - Cached HomeVault root folder ID in Drive (`gdrive.rootFolderId`)
 *   - Per-user folder IDs (`gdrive.userFolder.<userId>`)
 *
 * Values are stored as TEXT — callers serialize/deserialize as needed.
 */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  // UPSERT semantics — MySQL's ON DUPLICATE KEY UPDATE via drizzle.
  await db
    .insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

/**
 * Convenience helper — useful when several callers need the same value but
 * read it independently. Lifetime is the process lifetime; clear() resets it,
 * which is what the OAuth disconnect flow does so a freshly-connected account
 * isn't masked by a stale cached value.
 */
export function makeSettingCache(key: string) {
  let cached: string | null | undefined; // undefined = not loaded yet

  return {
    async get(): Promise<string | null> {
      if (cached === undefined) cached = await getSetting(key);
      return cached;
    },
    async set(value: string): Promise<void> {
      await setSetting(key, value);
      cached = value;
    },
    async clear(): Promise<void> {
      await deleteSetting(key);
      cached = null;
    },
    invalidate(): void {
      cached = undefined;
    },
  };
}
