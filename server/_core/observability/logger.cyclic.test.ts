import { describe, it, expect } from "vitest";
import { serializeError } from "./logger";

/**
 * Regression: a thrown library error (e.g. grammy's BotError) carries a deeply
 * self-referential payload (the update Context). The serializer must reduce it
 * to safe scalars + a bounded cause chain — never embed the cyclic graph, or the
 * log line (and the full-text search that JSON.stringifies `fields`) blows up
 * with "cannot serialize cyclic structures".
 */
describe("serializeError", () => {
  it("never embeds a cyclic error payload", () => {
    const err = new Error("boom") as Error & { ctx?: unknown; code?: string };
    err.code = "E_TEST";
    const ctx: Record<string, unknown> = { update: {} };
    ctx.self = ctx; // cycle, like grammy's Context referencing itself
    err.ctx = ctx;

    const out = serializeError(err) as Record<string, unknown>;
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(out).toMatchObject({
      type: "Error",
      message: "boom",
      code: "E_TEST",
    });
    // The cyclic payload must not have been copied through.
    expect(out.ctx).toBeUndefined();
  });

  it("preserves a bounded cause chain", () => {
    const root = new Error("root");
    const wrapped = new Error("wrapped", { cause: root });
    const out = serializeError(wrapped) as Record<string, unknown>;
    expect((out.cause as Record<string, unknown>).message).toBe("root");
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});
