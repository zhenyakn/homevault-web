import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the runtime config + DB collaborators so the module imports without a DB
// and we can drive the token through getNotificationConfig. The DB modules are
// only touched inside message handlers, which these tests never invoke.
vi.mock("../notifications/config", () => ({
  getNotificationConfig: vi.fn(() => ({ telegramBotToken: "" })),
}));
vi.mock("../_core/integrationsConfig", () => ({
  getPublicBaseUrl: vi.fn(() => ""),
  getTelegramWebhookSecret: vi.fn(() => ""),
}));
vi.mock("../db/notifications", () => ({
  consumeTelegramLinkCode: vi.fn(),
  setTelegramChatId: vi.fn(),
  getUserByTelegramChatId: vi.fn(),
}));
vi.mock("../db/properties", () => ({ getPropertiesByUser: vi.fn() }));
vi.mock("../db/expenses", () => ({
  getExpenses: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  getExpenseById: vi.fn(),
}));
vi.mock("../db/dashboard", () => ({
  getDashboardStats: vi.fn(),
  getOverdueExpenses: vi.fn(),
}));
vi.mock("../db/calendar", () => ({ getCalendarEvents: vi.fn() }));

import {
  chooseDeliveryMode,
  getBot,
  resetBot,
  getTelegramWebhookHandler,
  syncTelegramDelivery,
} from "./telegram";
import { getNotificationConfig } from "../notifications/config";

const mockedConfig = vi.mocked(getNotificationConfig);

beforeEach(() => {
  resetBot();
  mockedConfig.mockReturnValue({ telegramBotToken: "" } as never);
});

describe("chooseDeliveryMode", () => {
  it("uses webhook for a public HTTPS URL", () => {
    expect(chooseDeliveryMode("https://home.example.com")).toBe("webhook");
    expect(chooseDeliveryMode("https://home.example.com/")).toBe("webhook");
    expect(chooseDeliveryMode("  HTTPS://Home.Example.com  ")).toBe("webhook");
  });

  it("falls back to polling without a usable HTTPS URL", () => {
    expect(chooseDeliveryMode("")).toBe("polling");
    expect(chooseDeliveryMode("http://localhost:3005")).toBe("polling");
    expect(chooseDeliveryMode("homeassistant.local")).toBe("polling");
  });
});

describe("getBot / getTelegramWebhookHandler", () => {
  it("returns nothing when no token is configured", () => {
    expect(getBot()).toBeNull();
    expect(getTelegramWebhookHandler()).toBeNull();
  });

  it("builds a handler once a token is set and caches it until reset", () => {
    mockedConfig.mockReturnValue({ telegramBotToken: "123:ABC" } as never);
    const h1 = getTelegramWebhookHandler();
    expect(typeof h1).toBe("function");
    // Stable across calls while the bot instance + secret are unchanged.
    expect(getTelegramWebhookHandler()).toBe(h1);
    // After reset the bot drops; with the token cleared there's no handler.
    resetBot();
    mockedConfig.mockReturnValue({ telegramBotToken: "" } as never);
    expect(getTelegramWebhookHandler()).toBeNull();
  });
});

describe("syncTelegramDelivery", () => {
  it("reports no-token when the bot isn't configured", async () => {
    await expect(syncTelegramDelivery()).resolves.toEqual({
      ok: false,
      reason: "no-token",
    });
  });
});
