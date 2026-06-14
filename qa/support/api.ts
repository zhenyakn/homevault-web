/**
 * Minimal tRPC-over-HTTP client used by the QA harness for **test data
 * teardown** (and lightweight setup). It is intentionally separate from the app
 * code — it speaks the same wire format the browser uses
 * (`/api/trpc/<proc>?batch=1`) so tests can guarantee a clean slate without a
 * database connection.
 *
 * Primary use: {@link cleanupByPrefix} removes every record a self-cleaning test
 * created (all named with the test's unique sandbox prefix), leaving the seeded
 * demo data untouched — even if the test failed mid-flow.
 */

type AnyRecord = Record<string, unknown>;

const DEFAULT_BASE = "http://127.0.0.1:5000";

/** Entities the harness creates and therefore must be able to clean up. */
const ENTITIES: ReadonlyArray<{ proc: string }> = [
  { proc: "expenses" },
  { proc: "loans" },
  { proc: "repairs" },
  { proc: "upgrades" },
  { proc: "inventory" },
  { proc: "wishlist" },
  { proc: "purchaseCosts" },
  { proc: "calendar" },
  { proc: "apartmentSearch" },
];

/** Fields that may hold a human name we match the sandbox prefix against. */
const NAME_FIELDS = ["name", "title", "lender"] as const;

// The server scopes property-owned data by the `x-property-id` request header,
// falling back to the user's FIRST property when it's absent. The seeded demo
// property is not necessarily first, so every call must send this header or it
// would read/delete the wrong property's data.
function headers(propertyId?: number): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (propertyId != null) h["x-property-id"] = String(propertyId);
  return h;
}

async function query(
  baseURL: string,
  proc: string,
  propertyId?: number
): Promise<AnyRecord[]> {
  // List procedures validate their input as an object (e.g. {limit?, offset?}),
  // so send an empty object — `null` is rejected with BAD_REQUEST.
  const input = encodeURIComponent(JSON.stringify({ "0": { json: {} } }));
  const res = await fetch(
    `${baseURL}/api/trpc/${proc}.list?batch=1&input=${input}`,
    {
      headers: headers(propertyId),
    }
  );
  if (!res.ok) return [];
  const body = (await res.json()) as Array<{
    result?: { data?: { json?: unknown } };
  }>;
  const data = body?.[0]?.result?.data?.json;
  return Array.isArray(data) ? (data as AnyRecord[]) : [];
}

async function mutate(
  baseURL: string,
  proc: string,
  json: unknown,
  propertyId?: number
): Promise<void> {
  await fetch(`${baseURL}/api/trpc/${proc}?batch=1`, {
    method: "POST",
    headers: headers(propertyId),
    body: JSON.stringify({ "0": { json } }),
  });
}

function matchesPrefix(record: AnyRecord, prefix: string): boolean {
  return NAME_FIELDS.some(f => {
    const v = record[f];
    return typeof v === "string" && v.startsWith(prefix);
  });
}

/**
 * Delete every record across all entities whose name/title/lender starts with
 * `prefix`. Best-effort and idempotent — failures on one record don't stop the
 * rest.
 */
export async function cleanupByPrefix(
  prefix: string,
  baseURL: string = DEFAULT_BASE,
  propertyId?: number
): Promise<number> {
  let deleted = 0;
  for (const { proc } of ENTITIES) {
    let rows: AnyRecord[];
    try {
      rows = await query(baseURL, proc, propertyId);
    } catch {
      continue;
    }
    for (const row of rows) {
      if (!matchesPrefix(row, prefix)) continue;
      const id = row.id;
      if (id == null) continue;
      try {
        await mutate(baseURL, `${proc}.delete`, { id }, propertyId);
        deleted += 1;
      } catch {
        /* best-effort */
      }
    }
  }

  deleted += await cleanupProperties(prefix, baseURL, propertyId);
  return deleted;
}

/**
 * Properties need special handling: they're keyed on `houseName` (not the
 * name/title/lender fields), deleted by `{ propertyId }` rather than `{ id }`,
 * and the server refuses to delete the user's only property. The Apartment
 * Search convert flow mints a property named after the candidate (prefix-tagged),
 * so without this those leak. Best-effort — the only-property guard just throws
 * and is swallowed.
 */
async function cleanupProperties(
  prefix: string,
  baseURL: string,
  propertyId?: number
): Promise<number> {
  let deleted = 0;
  let rows: AnyRecord[];
  try {
    rows = await query(baseURL, "property", propertyId);
  } catch {
    return 0;
  }
  for (const row of rows) {
    const name = row.houseName;
    if (typeof name !== "string" || !name.startsWith(prefix)) continue;
    const pid = row.id;
    if (pid == null) continue;
    try {
      await mutate(baseURL, "property.delete", { propertyId: pid }, propertyId);
      deleted += 1;
    } catch {
      /* best-effort — e.g. server's "cannot delete your only property" guard */
    }
  }
  return deleted;
}

/** Count records of one entity (used to prove self-cleaning leaves seed intact). */
export async function countEntity(
  proc: string,
  baseURL: string = DEFAULT_BASE,
  propertyId?: number
): Promise<number> {
  return (await query(baseURL, proc, propertyId)).length;
}
