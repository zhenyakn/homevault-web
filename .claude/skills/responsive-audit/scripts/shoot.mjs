// Screenshot HomeVault routes across a matrix of width × UI × locale × theme.
//
// Usage (from project root):
//   node .claude/skills/responsive-audit/scripts/shoot.mjs "list:/#/apartment-search" "detail:/#/apartment-search/SID"
// Each arg is "label:route".
//
// Output: /tmp/shots/<ui>-<locale>-<theme>-<width>w-<label>.png
//   e.g. hv-he-dark-375w-list.png  (new UI, Hebrew RTL, dark, mobile)
//
// Env (comma lists) control the matrix — defaults cover every dimension at the
// two most informative widths; widen/narrow as needed:
//   WIDTHS  default "375,1280"     (add 768 for tablet/breakpoint sweeps)
//   LOCALES default "en,he"        (he = Hebrew RTL)
//   THEMES  default "light,dark"
//   UIS     default "def,hv"
//   BASE, PROP as in probe-overflow.mjs
//
// Tip: a full matrix is many images. The probe (probe-overflow.mjs) finds
// overflow cheaply across all widths/locales — use screenshots to *judge*
// cramping/alignment, reading back a representative cross-section (always at
// least one RTL and one dark shot) rather than all of them.
//
// To capture a DIALOG: copy this file, and after page.goto add the click that
// opens it, e.g. getByRole("button", { name: /add candidate/i }).first().click().
// Click by ROLE+NAME or visible TEXT — a bare `button` selector hits the
// sidebar/hamburger toggle.

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:5000";
const PROP = process.env.PROP || "2";
const WIDTHS = (process.env.WIDTHS || "375,1280").split(",").map(Number);
const LOCALES = (process.env.LOCALES || "en,he").split(",");
const THEMES = (process.env.THEMES || "light,dark").split(",");
const UIS = (process.env.UIS || "def,hv").split(",");
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

// UI language follows the *server* profile (overrides localStorage), so switch
// it the real way before loading. NO_AUTH = every request is the admin.
async function setServerLanguage(ctx, lang) {
  await ctx.request
    .post(`${BASE}/api/trpc/profiles.setLanguage?batch=1`, {
      headers: { "Content-Type": "application/json" },
      data: { 0: { json: { language: lang } } },
    })
    .catch(() => {});
}

async function run(ui, locale, theme, width) {
  const hvUi = ui === "hv";
  const ctx = await browser.newContext({
    viewport: { width, height: 760 },
    deviceScaleFactor: 2,
    colorScheme: theme === "dark" ? "dark" : "light", // covers theme:"system"
  });
  await setServerLanguage(ctx, locale);
  await ctx.addInitScript(
    ([p, hv, lang, th]) => {
      localStorage.setItem("hv_active_property_id", p);
      localStorage.setItem("app-language", lang);
      localStorage.setItem("homevault-theme", th);
      if (hv) localStorage.setItem("homevault-ui", "true");
      else localStorage.removeItem("homevault-ui");
    },
    [PROP, hvUi, locale, theme]
  );
  const page = await ctx.newPage();
  for (const { label, route } of targets) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (locale === "he") {
      const ok = await page
        .waitForFunction(() => document.documentElement.dir === "rtl", { timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      if (!ok) console.log(`WARN [${ui}/${locale}] dir did not flip to rtl (server lang pref may override)`);
    }
    const path = `/tmp/shots/${ui}-${locale}-${theme}-${width}w-${label}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log("shot", path);
  }
  await ctx.close();
}

for (const ui of UIS)
  for (const locale of LOCALES)
    for (const theme of THEMES)
      for (const width of WIDTHS) await run(ui, locale, theme, width);

// Restore the default language so the running app isn't left in Hebrew.
const reset = await browser.newContext();
await setServerLanguage(reset, "en");
await reset.close();
await browser.close();
console.log("DONE");

