import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** localStorage key the app reads to decide which property is active. */
export const ACTIVE_PROPERTY_KEY = "hv_active_property_id";

/** Where global-setup stashes the seeded property id for the fixtures to read. */
const STATE_FILE = "qa/artifacts/.seed-state.json";

/**
 * Seed the demo property ("Florentin Apartment" + all demo data) via the tRPC
 * `data.seedMock` mutation and return its property id.
 *
 * Idempotent enough for QA: each call seeds a fresh demo property and returns
 * the new id, so callers should seed once (global setup) and reuse the id.
 */
export async function seedDemoData(baseURL: string): Promise<number> {
  const res = await fetch(`${baseURL}/api/trpc/data.seedMock?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: null } }),
  });
  if (!res.ok) {
    throw new Error(`seedMock failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as Array<{
    result?: { data?: { json?: { propertyId?: number } } };
  }>;
  const propertyId = body?.[0]?.result?.data?.json?.propertyId;
  if (typeof propertyId !== "number") {
    throw new Error(`seedMock returned no propertyId: ${JSON.stringify(body)}`);
  }
  return propertyId;
}

/** Poll the server until it answers, so setup is independent of boot timing. */
export async function waitForServer(baseURL: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/trpc/system.noAuth?batch=1&input=${encodeURIComponent('{"0":{"json":null}}')}`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`server not ready at ${baseURL}: ${lastErr ?? "timeout"}`);
}

export function saveSeedState(propertyId: number): void {
  writeFileSync(STATE_FILE, JSON.stringify({ propertyId }), "utf8");
}

export function loadSeedState(): { propertyId: number } {
  if (!existsSync(STATE_FILE)) {
    throw new Error(`${STATE_FILE} missing — did global setup run?`);
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
