// Screenshot HomeVault routes at phone width in BOTH UIs.
//
// Usage (from project root):
//   node .claude/skills/responsive-audit/scripts/shoot.mjs "list:/#/apartment-search" "detail:/#/apartment-search/SID"
// Each arg is "label:route". Output: /tmp/shots/{def,hv}-<label>.png
//
// Env: BASE, PROP, WIDTH (default 375), DESKTOP=1 to also shoot at 1280px.
//
// To capture a DIALOG: copy this file next to it, and after page.goto add the
// click that opens the dialog, e.g.
//   await page.getByRole("button", { name: /add candidate/i }).first().click();
//   await page.waitForTimeout(500);
// Click dialog triggers by ROLE+NAME or visible TEXT — a bare `button`
// selector tends to hit the sidebar/hamburger toggle.

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:5000";
const PROP = process.env.PROP || "2";
const WIDTH = Number(process.env.WIDTH || 375);
const DESKTOP = process.env.DESKTOP === "1";
const targets = process.argv.slice(2).map((a) => {
  const i = a.indexOf(":");
  return { label: a.slice(0, i), route: a.slice(i + 1) };
});
if (targets.length === 0) {
  console.error('Pass one or more "label:route" args, e.g. "list:/#/portfolio"');
  process.exit(1);
}
mkdirSync("/tmp/shots", { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

async function run(uiLabel, hvUi, width, suffix) {
  const ctx = await browser.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([p, hv]) => {
      localStorage.setItem("hv_active_property_id", p);
      if (hv) localStorage.setItem("homevault-ui", "true");
      else localStorage.removeItem("homevault-ui");
    },
    [PROP, hvUi]
  );
  const page = await ctx.newPage();
  for (const { label, route } of targets) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const path = `/tmp/shots/${uiLabel}${suffix}-${label}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log("shot", path);
  }
  await ctx.close();
}

await run("def", false, WIDTH, "");
await run("hv", true, WIDTH, "");
if (DESKTOP) {
  await run("def", false, 1280, "-desktop");
  await run("hv", true, 1280, "-desktop");
}
await browser.close();
console.log("DONE");
