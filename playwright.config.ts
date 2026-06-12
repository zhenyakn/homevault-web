import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumPath } from "./qa/support/chromium";

/**
 * Playwright Test configuration for the HomeVault automated-QA suite (phase 1).
 *
 * Design notes:
 *  - Specs live in `qa/tests`; reusable helpers in `qa/support`.
 *  - `webServer` boots the real Express/tRPC/Vite stack under NO_AUTH so no
 *    OAuth is needed. It reuses an already-running server if you started one.
 *  - The browser CDN is firewalled in CI/cloud containers, so we point at the
 *    prebuilt Chromium via `executablePath` (see qa/support/chromium.ts).
 *  - A database must be reachable at $DATABASE_URL before the suite runs; see
 *    qa/README.md for the one-liner to start MariaDB locally.
 */
const PORT = Number(process.env.QA_PORT ?? 5000);
const baseURL = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const chromiumPath = resolveChromiumPath();

export default defineConfig({
  testDir: "./qa/tests",
  globalSetup: "./qa/global-setup.ts",
  outputDir: "./qa/artifacts/test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // One retry in CI smooths over rare animation/timing flakes; none locally so
  // failures surface immediately.
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa/artifacts/report", open: "never" }],
    ["junit", { outputFile: "qa/artifacts/results/junit.xml" }],
  ],
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: chromiumPath,
      args: ["--no-sandbox"],
    },
  },
  projects: [
    // Desktop runs the whole suite (deep flows + breadth + a11y).
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mobile + RTL run only the breadth/a11y checks tagged @responsive
    // (deep CRUD flows assume the desktop nav chrome).
    {
      name: "mobile",
      grep: /@responsive/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "rtl",
      grep: /@rtl/,
      // Hebrew is RTL; the `app` fixture sets the server language + app-language
      // to "he" for this project. Runs the locale-agnostic a11y + rtl-smoke specs.
      use: { ...devices["Desktop Chrome"], locale: "he-IL" },
    },
  ],
  webServer: {
    command: "node_modules/.bin/tsx server/_core/index.ts",
    // Health-check the SPA root, not a tRPC route: the first tRPC request seeds
    // the server's NO_AUTH user-language cache, and we want that to be the seed
    // call (after global-setup resets the language) — see qa/global-setup.ts.
    url: `${baseURL}/`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "mysql://homevault:password@127.0.0.1:3306/homevault",
      NODE_ENV: "development",
      PORT: String(PORT),
      NO_AUTH: "true",
      OWNER_OPEN_ID: "owner",
      JWT_SECRET:
        process.env.JWT_SECRET ?? "devjwtsecret_at_least_16_chars_long_123456",
      STORAGE_BACKEND: "local",
      STORAGE_DIR: "/tmp/hv-uploads",
      // Define the analytics placeholders (Vite picks up VITE_* from process.env)
      // so index.html's `%VITE_ANALYTICS_ENDPOINT%/umami` script resolves instead
      // of producing a literal, undecodable URL that spams the server log with
      // "Malformed URI sequence" on every page load. Empty = analytics disabled.
      VITE_ANALYTICS_ENDPOINT: "",
      VITE_ANALYTICS_WEBSITE_ID: "",
    },
  },
});
