/**
 * Lightweight in-memory fixed-window rate limiter. Keyed by an arbitrary string
 * (e.g. `tenant:42` or `auth:login:1.2.3.4`). Single-instance only — a
 * horizontally-scaled SAAS deployment would back this with Redis, but the
 * call-site contract (rateLimitHit / the tRPC middleware) stays the same.
 */
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/**
 * Record one hit against `key` and report whether it's within `limit` for the
 * current `windowMs` window. The window resets lazily on the first hit after it
 * elapses, so there's no background timer.
 */
export function rateLimitHit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Opportunistically drop expired buckets so the map can't grow unbounded under
 * many distinct keys. Cheap; called from the hot path occasionally.
 */
export function sweepExpired(now: number = Date.now()): void {
  for (const key of Array.from(store.keys())) {
    const bucket = store.get(key);
    if (bucket && now >= bucket.resetAt) store.delete(key);
  }
}

/** Test seam: clear all buckets. */
export function _resetRateLimits(): void {
  store.clear();
}

// ── Tuned defaults ─────────────────────────────────────────────────────────────
// Per-tenant: generous — guards against a single workspace monopolising the
// instance, not normal interactive use.
export const TENANT_WINDOW_MS = 60_000;
export const TENANT_MAX_REQUESTS = 600;

// Per-IP on sensitive auth endpoints: tight — brute-force / abuse protection.
export const AUTH_WINDOW_MS = 60_000;
export const AUTH_MAX_ATTEMPTS = 10;

/** Best-effort client IP (honours a single proxy hop) for per-IP throttling. */
export function clientIp(req: {
  headers: Record<string, unknown>;
  socket?: unknown;
}): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]!.trim();
  }
  const sock = req.socket as { remoteAddress?: string } | undefined;
  return sock?.remoteAddress ?? "unknown";
}
