// Probe HomeVault routes for REAL horizontal overflow across a matrix of
// viewport widths × UIs × locales (LTR + Hebrew RTL).
//
// Why: centered/translated containers (e.g. Radix DialogContent, which is
// display:grid) clip symmetrically when a child's min-content exceeds the
// viewport — content shifts off an edge and reads as "misalignment" when it's
// actually scrollWidth > clientWidth. Screenshots hide this; the DOM doesn't.
// RTL is included because mirrored padding/margins surface overflow that LTR
// never shows. (Theme is omitted here — dark mode doesn't change box widths.)
//
// Usage (from the project root so Playwright resolves):
//   node .claude/skills/responsive-audit/scripts/probe-overflow.mjs "/#/portfolio" "/#/expenses"
//
// Env (comma lists) override the matrix:
//   WIDTHS  default "375,768,1280"   (mobile, tablet, desktop)
//   LOCALES default "en,he"          (he = RTL)
//   UIS     default "def,hv"         (default UI + new HomeVault UI)
//   BASE    default http://127.0.0.1:5000
//   PROP    default 2                (active property id)
//
// Output: one compact line per (ui, locale, width, route). "OK (no overflow)"
// means clean; anything else is a real layout bug — note the element classes.

import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:5000";
const PROP = process.env.PROP || "2";
const WIDTHS = (process.env.WIDTHS || "375,768,1280").split(",").map(Number);
const LOCALES = (process.env.LOCALES || "en,he").split(",");
const UIS = (process.env.UIS || "def,hv").split(",");
const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error('Pass one or more hash routes, e.g. "/#/portfolio"');
  process.exit(1);
}

// Expression returning ONLY genuine layout-breaking overflow. Elements that
// clip/scroll by design (truncate, overflow-hidden, scroll areas) are excluded
// — their content is *meant* to be wider than the box. A real bug is an
// element whose overflow-x is `visible` (so it spills into and widens the
// layout) yet whose content exceeds its box by a meaningful margin.
const overflowExpr = (rootSel) => `(() => {
  const root = ${rootSel ? `document.querySelector(${JSON.stringify(rootSel)})` : "document.body"};
  if (!root) return [];
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    const cls = el.className?.toString?.() || "";
    if (cls.includes("sr-only")) continue;
    if (el.clientWidth <= 0) continue;
    if (el.scrollWidth - el.clientWidth <= 4) continue; // sub-pixel / icon noise
    if (getComputedStyle(el).overflowX !== "visible") continue; // intentional clip/scroll
    out.push({ tag: el.tagName, cls: cls.slice(0, 70), scrollW: el.scrollWidth, clientW: el.clientWidth });
  }
  return out;
})()`;

const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

// The UI language follows the *server* profile (a stored pref overrides
// localStorage), so switch it the real way before loading pages. NO_AUTH makes
// every request the admin, so no cookie is needed.
async function setServerLanguage(ctx, lang) {
  await ctx.request
    .post(`${BASE}/api/trpc/profiles.setLanguage?batch=1`, {
      headers: { "Content-Type": "application/json" },
      data: { 0: { json: { language: lang } } },
    })
    .catch(() => {});
}

async function probe(ui, locale, width) {
  const hvUi = ui === "hv";
  const ctx = await browser.newContext({ viewport: { width, height: 760 } });
  await setServerLanguage(ctx, locale);
  await ctx.addInitScript(
    ([p, hv, lang]) => {
      localStorage.setItem("hv_active_property_id", p);
      localStorage.setItem("app-language", lang);
      if (hv) localStorage.setItem("homevault-ui", "true");
      else localStorage.removeItem("homevault-ui");
    },
    [PROP, hvUi, locale]
  );
  const page = await ctx.newPage();
  const tag = `${ui}/${locale}/${width}w`;
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    // Confirm RTL actually took (a server language pref can override local).
    if (locale === "he") {
      const ok = await page
        .waitForFunction(() => document.documentElement.dir === "rtl", { timeout: 2500 })
        .then(() => true)
        .catch(() => false);
      if (!ok) console.log(`[${tag}] WARN: dir did not flip to rtl (server lang pref may override; set it via Settings/profile)`);
    }
    const base = await page.evaluate(overflowExpr());
    console.log(`[${tag}] ${route} →`, base.length ? JSON.stringify(base) : "OK (no overflow)");

    // Best-effort: open the first obvious dialog and re-probe it.
    const opener = page.getByRole("button", { name: /add|new|edit|create/i }).first();
    if (await opener.count().catch(() => 0)) {
      await opener.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(500);
      if (await page.locator('[data-slot="dialog-content"]').count()) {
        const inDlg = await page.evaluate(overflowExpr('[data-slot="dialog-content"]'));
        console.log(`[${tag}] ${route} (dialog) →`, inDlg.length ? JSON.stringify(inDlg) : "OK (no overflow)");
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
  }
  await ctx.close();
}

for (const ui of UIS)
  for (const locale of LOCALES)
    for (const width of WIDTHS) await probe(ui, locale, width);

// Restore the default language so the running app isn't left in Hebrew.
const reset = await browser.newContext();
await setServerLanguage(reset, "en");
await reset.close();
await browser.close();
console.log("DONE");
