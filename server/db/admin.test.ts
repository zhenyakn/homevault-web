/**
 * Unit tests for the deployment-mode + signups resolution in db/admin. These
 * are pure (app_settings + ENV are mocked), so they avoid the shared-DB races
 * that make global-config assertions flaky as integration tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the (hoisted) vi.mock factories can safely reference them.
const { getSetting, setSetting, ENV } = vi.hoisted(() => ({
  getSetting: vi.fn<(key: string) => Promise<string | null>>(),
  setSetting: vi.fn<(key: string, value: string) => Promise<void>>(),
  ENV: { appMode: "standalone" as "standalone" | "saas" },
}));

vi.mock("./appSettings", () => ({
  getSetting: (key: string) => getSetting(key),
  setSetting: (key: string, value: string) => setSetting(key, value),
  deleteSetting: vi.fn(),
}));

vi.mock("../_core/env", () => ({ ENV }));

// admin.ts pulls getDb at import; these functions don't touch it.
vi.mock("./client", () => ({ getDb: vi.fn() }));

import {
  getAppMode,
  setAppMode,
  getSignupsEnabled,
  getRequireEmailVerification,
  getEmailVerificationGraceHours,
  setEmailVerificationGraceHours,
} from "./admin";

beforeEach(() => {
  getSetting.mockReset();
  setSetting.mockReset();
  ENV.appMode = "standalone";
});

describe("getAppMode", () => {
  it("falls back to the env default when no override is stored", async () => {
    getSetting.mockResolvedValue(null);
    expect(await getAppMode()).toBe("standalone");
    ENV.appMode = "saas";
    expect(await getAppMode()).toBe("saas");
  });

  it("lets a stored override win over the env default", async () => {
    ENV.appMode = "standalone";
    getSetting.mockResolvedValue("saas");
    expect(await getAppMode()).toBe("saas");
  });

  it("ignores a malformed stored value", async () => {
    getSetting.mockResolvedValue("nonsense");
    expect(await getAppMode()).toBe("standalone");
  });
});

describe("setAppMode", () => {
  it("persists the mode under the app.mode key", async () => {
    await setAppMode("saas");
    expect(setSetting).toHaveBeenCalledWith("app.mode", "saas");
  });
});

describe("getSignupsEnabled", () => {
  it("honours an explicit toggle over the mode default", async () => {
    getSetting.mockImplementation(async key =>
      key === "auth.signupsEnabled" ? "true" : null
    );
    expect(await getSignupsEnabled()).toBe(true);

    getSetting.mockImplementation(async key =>
      key === "auth.signupsEnabled" ? "false" : null
    );
    expect(await getSignupsEnabled()).toBe(false);
  });

  it("defaults closed in standalone and open in saas when unset", async () => {
    // No explicit signups row; mode comes from the (mocked) app.mode / env.
    ENV.appMode = "standalone";
    getSetting.mockResolvedValue(null);
    expect(await getSignupsEnabled()).toBe(false);

    getSetting.mockImplementation(async key =>
      key === "app.mode" ? "saas" : null
    );
    expect(await getSignupsEnabled()).toBe(true);
  });
});

describe("getRequireEmailVerification", () => {
  it("defaults from the mode (saas enforces, standalone relaxes) when unset", async () => {
    ENV.appMode = "standalone";
    getSetting.mockResolvedValue(null);
    expect(await getRequireEmailVerification()).toBe(false);

    getSetting.mockImplementation(async key =>
      key === "app.mode" ? "saas" : null
    );
    expect(await getRequireEmailVerification()).toBe(true);
  });

  it("honours an explicit override", async () => {
    ENV.appMode = "saas";
    getSetting.mockImplementation(async key =>
      key === "auth.requireEmailVerification" ? "false" : null
    );
    expect(await getRequireEmailVerification()).toBe(false);
  });
});

describe("email verification grace hours", () => {
  it("defaults to 0 (strict) and clamps malformed / negative values", async () => {
    getSetting.mockResolvedValue(null);
    expect(await getEmailVerificationGraceHours()).toBe(0);

    getSetting.mockResolvedValue("nonsense");
    expect(await getEmailVerificationGraceHours()).toBe(0);

    getSetting.mockResolvedValue("-5");
    expect(await getEmailVerificationGraceHours()).toBe(0);

    getSetting.mockResolvedValue("48");
    expect(await getEmailVerificationGraceHours()).toBe(48);
  });

  it("floors and clamps on write", async () => {
    await setEmailVerificationGraceHours(12.9);
    expect(setSetting).toHaveBeenCalledWith(
      "auth.emailVerificationGraceHours",
      "12"
    );
    await setEmailVerificationGraceHours(-3);
    expect(setSetting).toHaveBeenCalledWith(
      "auth.emailVerificationGraceHours",
      "0"
    );
  });
});
