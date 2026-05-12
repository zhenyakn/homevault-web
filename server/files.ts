import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db/client";
import { files, type FileRecord } from "../drizzle/schema";
import { getActiveBackend, getBackendByName } from "./storage";
import type { StorageBackendName } from "./storage/types";
import { logger } from "./_core/logger";

/**
 * High-level file lifecycle helpers shared by the HTTP routes and the tRPC
 * attachment-diff logic. All operations are owner-scoped — callers MUST pass
 * the requesting user's id, never trust a fileId alone.
 */

const PROXY_PREFIX = "/api/files/";

/** UUID v1/v4 produced by mysql UUID() OR nanoid()-style 21+ chars. We
 * accept both since dev installs may include either. */
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{8,}$/;

/**
 * Build the proxy URL stored in `attachments` JSON arrays.
 * Encoding the original filename in the path is intentional — the existing
 * frontend (FileUpload.tsx) derives display name via url.split("/").pop()
 * so this keeps file names visible without a separate metadata fetch.
 */
export function buildProxyUrl(id: string, originalName: string): string {
  return `${PROXY_PREFIX}${id}/${encodeURIComponent(originalName)}`;
}

/**
 * Parse a proxy URL back to a file id. Returns null for entries that aren't
 * managed by us (e.g. legacy `https://pub-...r2.dev/...` URLs from before
 * the files table existed). Used by attachment-diff to know which entries
 * are safe to delete.
 */
export function parseProxyUrl(url: string): { id: string } | null {
  if (!url || !url.startsWith(PROXY_PREFIX)) return null;
  const rest = url.slice(PROXY_PREFIX.length);
  const id = rest.split("/")[0]?.split("?")[0];
  if (!id || !FILE_ID_PATTERN.test(id)) return null;
  return { id };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createFileRecord(input: {
  backend: StorageBackendName;
  externalId: string;
  originalName: string;
  mimeType: string;
  size: number;
  ownerUserId: number;
}): Promise<FileRecord> {
  const db = await getDb();
  const id = nanoid();
  await db.insert(files).values({
    id,
    backend: input.backend,
    externalId: input.externalId,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size,
    ownerUserId: input.ownerUserId,
  });
  return {
    id,
    backend: input.backend,
    externalId: input.externalId,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size,
    ownerUserId: input.ownerUserId,
    createdAt: new Date(),
    deletedAt: null,
  };
}

/** Load a not-deleted file row owned by `ownerUserId`. Returns null when not
 * found — callers should treat that as "404 or 403", indistinguishable to
 * prevent fileId enumeration. */
export async function getFileForOwner(
  id: string,
  ownerUserId: number,
): Promise<FileRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.ownerUserId, ownerUserId),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Delete a single file: marks the row soft-deleted, then best-effort removes
 * from the storage backend. Backend failures are logged but never thrown so
 * a Drive outage doesn't block the user-facing operation that triggered it.
 *
 * Idempotent — calling for an already-deleted id is a no-op.
 */
export async function deleteFileForOwner(
  id: string,
  ownerUserId: number,
): Promise<{ deleted: boolean; backendError?: string }> {
  const row = await getFileForOwner(id, ownerUserId);
  if (!row) return { deleted: false };

  const db = await getDb();
  await db
    .update(files)
    .set({ deletedAt: new Date() })
    .where(eq(files.id, row.id));

  try {
    const backend = getBackendByName(row.backend as StorageBackendName);
    await backend.delete(row.externalId);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    logger.error({ id: row.id, err: msg }, "[files] backend delete failed");
    return { deleted: true, backendError: msg };
  }
  return { deleted: true };
}

// ─── Attachment-array diff (used by tRPC update mutations) ───────────────────

/**
 * Diff old vs new attachment arrays. Any entry present in `oldList` but
 * absent from `newList` AND that resolves to a homevault-managed file is
 * deleted. External `https://...` URLs are left alone.
 *
 * `newList === undefined` means "no attachment field on this update" — diff
 * is a no-op in that case, matching how the JSON-merge update works today.
 */
export async function syncAttachmentRemovals(opts: {
  oldList: string[] | null | undefined;
  newList: string[] | null | undefined;
  ownerUserId: number;
}): Promise<{ removed: number; errors: number }> {
  if (opts.newList === undefined) return { removed: 0, errors: 0 };
  const oldList = opts.oldList ?? [];
  const newSet = new Set(opts.newList ?? []);

  let removed = 0;
  let errors = 0;
  const seen = new Set<string>();
  for (const entry of oldList) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    if (newSet.has(entry)) continue;
    const parsed = parseProxyUrl(entry);
    if (!parsed) continue; // legacy external URL — not ours to delete
    const result = await deleteFileForOwner(parsed.id, opts.ownerUserId);
    if (result.deleted) removed++;
    if (result.backendError) errors++;
  }
  return { removed, errors };
}

/**
 * Delete every homevault-managed attachment in a list. Used on parent-record
 * deletion (expense, repair, …). Matches the semantics of
 * syncAttachmentRemovals when newList is empty.
 */
export async function deleteAttachmentList(
  list: string[] | null | undefined,
  ownerUserId: number,
): Promise<{ removed: number; errors: number }> {
  return syncAttachmentRemovals({
    oldList: list,
    newList: [],
    ownerUserId,
  });
}

// ─── High-level upload helper ────────────────────────────────────────────────

export async function uploadAndRegister(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ownerUserId: number;
}): Promise<{ record: FileRecord; url: string }> {
  const backend = getActiveBackend();
  const { externalId } = await backend.upload(opts.buffer, {
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    ownerUserId: opts.ownerUserId,
  });
  const record = await createFileRecord({
    backend: backend.name,
    externalId,
    originalName: opts.originalName,
    mimeType: opts.mimeType,
    size: opts.buffer.byteLength,
    ownerUserId: opts.ownerUserId,
  });
  return {
    record,
    url: buildProxyUrl(record.id, record.originalName),
  };
}
