// Renders docs/telegram-bot/mockup.html to PNGs (full board + per-phone crops).
// Uses the container's pre-installed Chromium. Run: node docs/telegram-bot/screenshot.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const exe =
  process.env.CHROME_BIN ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto("file://" + join(here, "mockup.html"));
await page.waitForTimeout(300);

// Whole board.
await page.screenshot({ path: join(here, "enhanced-bot.png") });

// Individual phones for embedding side by side.
const cols = await page.locator(".col-wrap").all();
const names = ["menu-pay", "paid-reads", "add-expense"];
for (let i = 0; i < cols.length; i++) {
  await cols[i].screenshot({
    path: join(here, `enhanced-bot-${names[i]}.png`),
  });
}

await browser.close();
console.log("wrote screenshots to", here);
