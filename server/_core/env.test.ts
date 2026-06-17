import { describe, it, expect } from "vitest";
import { validateEnvConfig, type EnvConfigInput } from "./env";

// We test the per-field schema in isolation (without importing the module's
// process.exit-on-failure parse) by replicating it.
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  VITE_APP_ID: z.string().default(""),
  OAUTH_SERVER_URL: z.string().default(""),
  OWNER_OPEN_ID: z.string().default(""),
  BUILT_IN_FORGE_API_URL: z.string().default(""),
  BUILT_IN_FORGE_API_KEY: z.string().default(""),
  NO_AUTH: z.string().default("false"),
  SEED_MOCK_DATA: z.string().default("false"),
  PORT: z.string().default("3005"),
  HOST: z.string().default("0.0.0.0"),
});

const validEnv = {
  DATABASE_URL: "mysql://user:pass@localhost:3306/db",
  JWT_SECRET: "a-secret-that-is-long-enough",
  NODE_ENV: "development" as const,
};

describe("ENV validation schema", () => {
  it("accepts a valid environment", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("rejects missing DATABASE_URL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      DATABASE_URL: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty DATABASE_URL", () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing JWT_SECRET", () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects JWT_SECRET shorter than 16 characters", () => {
    const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: "tooshort" });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 16-character JWT_SECRET", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      JWT_SECRET: "1234567890123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });

  it("defaults NODE_ENV to development when omitted", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("development");
  });

  it("defaults optional vars to empty string / false", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NO_AUTH).toBe("false");
      expect(result.data.SEED_MOCK_DATA).toBe("false");
      expect(result.data.OAUTH_SERVER_URL).toBe("");
    }
  });
});

// ── Cross-field runtime validation (APP_MODE / session / email config) ─────────

const cfgBase: EnvConfigInput = {
  NODE_ENV: "production",
  APP_MODE: "standalone",
  NO_AUTH: "false",
  VITE_APP_ID: "app-123",
  PUBLIC_BASE_URL: "https://home.example.com",
};
const check = (over: Partial<EnvConfigInput>) =>
  validateEnvConfig({ ...cfgBase, ...over });

describe("validateEnvConfig", () => {
  it("passes a valid standalone config", () => {
    const { fatal, warn } = check({});
    expect(fatal).toHaveLength(0);
    expect(warn).toHaveLength(0);
  });

  it("passes a valid saas config", () => {
    expect(check({ APP_MODE: "saas" }).fatal).toHaveLength(0);
  });

  it("forbids NO_AUTH in saas", () => {
    expect(
      check({ APP_MODE: "saas", NO_AUTH: "true" }).fatal.join(" ")
    ).toMatch(/NO_AUTH/i);
  });

  it("requires VITE_APP_ID when sessions are enabled (fatal in production/saas)", () => {
    expect(check({ VITE_APP_ID: "" }).fatal.join(" ")).toMatch(/VITE_APP_ID/);
    expect(
      check({ APP_MODE: "saas", VITE_APP_ID: "" }).fatal.join(" ")
    ).toMatch(/VITE_APP_ID/);
  });

  it("only warns about a missing VITE_APP_ID in development", () => {
    const { fatal, warn } = check({ NODE_ENV: "development", VITE_APP_ID: "" });
    expect(fatal).toHaveLength(0);
    expect(warn.join(" ")).toMatch(/VITE_APP_ID/);
  });

  it("does not require VITE_APP_ID when NO_AUTH bypasses sessions", () => {
    const { fatal, warn } = check({ NO_AUTH: "true", VITE_APP_ID: "" });
    expect(fatal).toHaveLength(0);
    expect(warn).toHaveLength(0);
  });

  it("requires PUBLIC_BASE_URL in saas", () => {
    expect(
      check({ APP_MODE: "saas", PUBLIC_BASE_URL: "" }).fatal.join(" ")
    ).toMatch(/PUBLIC_BASE_URL/);
  });

  it("skips all checks under NODE_ENV=test", () => {
    const { fatal, warn } = check({
      NODE_ENV: "test",
      APP_MODE: "saas",
      NO_AUTH: "true",
      VITE_APP_ID: "",
      PUBLIC_BASE_URL: "",
    });
    expect(fatal).toHaveLength(0);
    expect(warn).toHaveLength(0);
  });
});
