// Probe HomeVault routes for REAL horizontal overflow at phone width.
//
// Why: centered/translated containers (e.g. Radix DialogContent, which is
// display:grid) clip symmetrically when a child's min-content exceeds the
// viewport — content shifts off the LEFT edge and reads as "misalignment"
// when it's actually scrollWidth > clientWidth. Screenshots hide this; the
// DOM doesn't.
//
// Usage (from the project root so Playwright resolves):
//   node .claude/skills/responsive-audit/scripts/probe-overflow.mjs "/#/portfolio" "/#/apartment-search"
//
// Env overrides: BASE (default http://127.0.0.1:5000), PROP (active property
// id, default 2), WIDTH (default 375). It auto-opens the first dialog-trigger
// it can find per route (best-effort) so dialog overflow is covered too.

import { chromium } from "playwright";

const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:5000";
const PROP = process.env.PROP || "2";
const WIDTH = Number(process.env.WIDTH || 375);
const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error('Pass one or more hash routes, e.g. "/#/portfolio"');
  process.exit(1);
}

// Expression (run in the page via page.evaluate) returning ONLY genuine
// layout-breaking overflow. Elements that clip/scroll by design (truncate,
// overflow-hidden, scroll areas) are excluded — their content is *meant* to be
// wider than the box. A real bug is an element whose overflow-x is `visible`
// (so it spills into and widens the layout) yet whose content exceeds its box
// by a meaningful margin. `root` defaults to body; pass a selector to scope.
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

async function probe(label, hvUi) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 760 } });
  await ctx.addInitScript(
    ([p, hv]) => {
      localStorage.setItem("hv_active_property_id", p);
      if (hv) localStorage.setItem("homevault-ui", "true");
      else localStorage.removeItem("homevault-ui");
    },
    [PROP, hvUi]
  );
  const page = await ctx.newPage();
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const base = await page.evaluate(overflowExpr());
    console.log(`[${label}] ${route} →`, base.length ? JSON.stringify(base) : "OK (no overflow)");

    // Best-effort: open the first obvious dialog and re-probe.
    const opener = page
      .getByRole("button", { name: /add|new|edit|create/i })
      .first();
    if (await opener.count().catch(() => 0)) {
      await opener.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(600);
      const dlg = await page.locator('[data-slot="dialog-content"]').count();
      if (dlg) {
        const inDlg = await page.evaluate(overflowExpr('[data-slot="dialog-content"]'));
        console.log(`[${label}] ${route} (dialog) →`, inDlg.length ? JSON.stringify(inDlg) : "OK (no overflow)");
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
  }
  await ctx.close();
}

await probe("def", false);
await probe("hv", true);
await browser.close();
console.log("DONE");
