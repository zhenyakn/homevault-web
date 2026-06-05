import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the validation logic in isolation without importing the module
// (which would call process.exit on failure). Instead we replicate the schema.
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
