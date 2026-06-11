import { existsSync } from "node:fs";

/**
 * Resolve a usable Chromium executable.
 *
 * In this project's cloud / ephemeral containers the Playwright browser CDN is
 * firewalled, so `playwright install chromium` fails. A prebuilt Chromium ships
 * in the image instead. We launch it via `executablePath`, which also bypasses
 * Playwright's browser-revision check.
 *
 * Resolution order:
 *   1. $PW_CHROMIUM_PATH (explicit override)
 *   2. the prebuilt Chromium baked into the image
 *   3. undefined → let Playwright use its own downloaded browser (local dev)
 */
const CANDIDATES = [
  process.env.PW_CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
].filter(Boolean) as string[];

export function resolveChromiumPath(): string | undefined {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
