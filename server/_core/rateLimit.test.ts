import { describe, it, expect, beforeEach } from "vitest";
import { rateLimitHit, sweepExpired, _resetRateLimits } from "./rateLimit";

beforeEach(() => _resetRateLimits());

describe("rateLimitHit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const limit = 3;
    const win = 1000;
    const t0 = 1_000_000;
    expect(rateLimitHit("k", limit, win, t0).allowed).toBe(true); // 1
    expect(rateLimitHit("k", limit, win, t0).allowed).toBe(true); // 2
    const third = rateLimitHit("k", limit, win, t0); // 3
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(rateLimitHit("k", limit, win, t0).allowed).toBe(false); // 4 — blocked
  });

  it("resets after the window elapses", () => {
    const t0 = 5_000_000;
    rateLimitHit("k", 1, 1000, t0);
    expect(rateLimitHit("k", 1, 1000, t0).allowed).toBe(false);
    // After the window, the counter resets.
    expect(rateLimitHit("k", 1, 1000, t0 + 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    expect(rateLimitHit("a", 1, 1000, 0).allowed).toBe(true);
    expect(rateLimitHit("a", 1, 1000, 0).allowed).toBe(false);
    // A different key has its own budget.
    expect(rateLimitHit("b", 1, 1000, 0).allowed).toBe(true);
  });

  it("reports a stable resetAt for the active window", () => {
    const t0 = 10_000;
    const first = rateLimitHit("k", 5, 2000, t0);
    const second = rateLimitHit("k", 5, 2000, t0 + 500);
    expect(second.resetAt).toBe(first.resetAt);
    expect(first.resetAt).toBe(t0 + 2000);
  });

  it("sweepExpired drops only elapsed buckets", () => {
    rateLimitHit("old", 5, 1000, 0);
    rateLimitHit("fresh", 5, 1000, 900);
    sweepExpired(1500); // old expired at 1000, fresh expires at 1900
    // old was swept → fresh start; fresh persists → second hit counts as 2nd.
    expect(rateLimitHit("old", 1, 1000, 1500).allowed).toBe(true);
    expect(rateLimitHit("fresh", 1, 1000, 1500).allowed).toBe(false);
  });
});
