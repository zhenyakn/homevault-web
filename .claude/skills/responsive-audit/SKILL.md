---
name: responsive-audit
description: Audit and fix mobile/responsive layout problems in the HomeVault UI — misaligned, clipped, overflowing, uneven, or cramped elements on pages, dialogs, and sub-pages. Drives the real app with Playwright at a phone viewport in BOTH UIs (default + new HomeVault UI), measures the DOM for actual overflow instead of eyeballing, applies known fix patterns, and re-verifies. Use when asked to review/fix how pages "look" on mobile, fix alignment/responsiveness, make something "look professional", or clean up dialogs/forms on small screens.
---

# Responsive / mobile-layout audit & fix

A repeatable runbook for finding and fixing layout defects (misalignment,
clipping, horizontal overflow, crushed text, uneven spacing) — mainly on
mobile — across HomeVault pages, dialogs, and drill-in sub-pages. The point
is to **measure**, not guess: a 30-second DOM probe finds real overflow that
screenshots alone hide, and the fix patterns below resolve ~90% of cases.

> First time through cost a lot of trial and error. Follow this in order and
> it's a quick, mechanical job.

## 0. Decide scope
The user names a page/area ("apartment search and portfolio", "the expenses
dialog"). Translate that into:
- **Routes** to audit (hash routes, e.g. `/#/portfolio`, `/#/apartment-search`).
- **Dialogs / sub-screens** reached by interaction (Add candidate, the
  Add-Property wizard, mobile drill-in detail screens).
- **Both UIs.** Most feature pages are shared by the *default* UI and the
  *new "HomeVault" UI*. The page component is the same; only the layout
  wrapper differs (`DashboardLayout` vs `HomeVaultLayout`, chosen by
  `useHomeVaultUI`). **A fix to a shared page must be checked in both.** Toggle
  the new UI with `localStorage["homevault-ui"] = "true"` (see scripts).

## 1. Bring up the app (delegate to `run-app`)
Do **not** re-derive the stack here. Run the **`run-app`** skill's steps 0–3:
install (pnpm), start MariaDB, start the server under `NO_AUTH=true` on port
5000, and seed (`data.seedMock` → note the `propertyId`, usually `2`).

Then add Playwright if missing (CDN is firewalled — never `playwright install`):
```bash
pnpm add -D playwright            # pre-built Chromium already at /opt/pw-browsers
```
Seed any feature-specific data the audited page needs so rows aren't empty
(empty pages hide every layout bug). Example for apartment search:
`scripts/seed-apartment-search.sh`.

## 2. Probe for real overflow FIRST (the high-value step)
Eyeballing misses horizontal overflow because centered/translated containers
clip *symmetrically* — content shifts off the **left** edge and looks like a
"misalignment" when it's actually `scrollWidth > clientWidth`. Measure it:

```bash
node .claude/skills/responsive-audit/scripts/probe-overflow.mjs \
  "/#/portfolio" "/#/apartment-search/SEARCH_ID"
```
It opens each route at 375px in **both** UIs, opens any auto-detected dialog,
and prints every element whose `scrollWidth > clientWidth` (ignoring
`sr-only`). **An empty list per route = no overflow.** Anything listed is a
real bug — note its classes; that's your fix target.

For a dialog the probe can't reach by itself, use the inline snippet in
`scripts/probe-snippet.md` after navigating/opening it by hand in a custom
script.

## 3. Screenshot both UIs at phone width
```bash
node .claude/skills/responsive-audit/scripts/shoot.mjs \
  "list:/#/apartment-search" "detail:/#/apartment-search/SEARCH_ID"
```
Writes `/tmp/shots/{def,hv}-<label>.png` at 375×760 (`deviceScaleFactor:2`).
Read them back with the Read tool. **fullPage screenshots of fixed-position
dialogs can look odd — trust the §2 probe for overflow; use screenshots for
cramping/alignment/spacing judgement.** To capture a dialog, copy `shoot.mjs`
and add the click that opens it (see its header comment).

## 4. The defect catalogue → fix patterns
Match what you see to these. They cover almost everything found in this app.

1. **Row crushes its title** (list rows packing title + value + control +
   chevron on one line; title truncates to a few chars on mobile).
   → Make the inner nav button stack on mobile, inline on desktop:
   `flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-4`.
   Give the text block `w-full min-w-0 sm:flex-1`; give the value block
   `text-start sm:text-end`. Keep trailing controls (select, chevron) as
   siblings of the button with the outer row at `items-center` so they center
   vertically against the taller stacked content.

2. **Dialog content clipped on the left / shifted** (a `DialogContent` is
   `display:grid`; a child's min-content exceeds the mobile width, so the
   centered dialog overflows and clips). The usual culprit is a footer using
   `flex justify-between` with a long hint sentence next to a button group —
   neither shrinks. → Stack the footer on mobile:
   `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`, and
   make the button group `flex justify-end gap-2`. Confirm with the §2 probe
   that `scrollWidth === clientWidth` afterward.

3. **Dense field grids** (`grid-cols-2`/`grid-cols-3` of inputs cramped on a
   narrow dialog). → `grid-cols-1 sm:grid-cols-2` (or `grid-cols-2
   sm:grid-cols-3`); add `min-w-0` to flex/grid children that won't shrink.
   Note: `grid-cols-2` of *number* inputs is usually fine (they shrink); a
   `grid-cols-2` containing a **native date input** or long text can force
   overflow — verify with the probe.

4. **Hardcoded English strings** (e.g. a literal `" / mo"`, `"rooms"`). These
   read as unprofessional in Hebrew (RTL) and Russian. → Replace with a `t()`
   key added to `client/src/locales/{en,he,ru}.json` (keep the namespace; add
   the key in the same spot in all three). Validate each JSON parses.

5. **Action bars** wrapping awkwardly (a lone `ms-auto` button stranding on
   its own line). Acceptable when it reads intentionally; if not, make the bar
   `flex flex-col sm:flex-row` or give buttons `flex-1` on mobile.

General rules: prefer **mobile-first responsive utilities** (`base` = mobile,
`sm:` = ≥640px) so desktop stays byte-identical; reach for `min-w-0`,
`truncate`, `flex-wrap`, `shrink-0` deliberately; never introduce a fixed
width that can exceed 375px − padding.

## 5. Re-verify, then clean up
- Re-run §2 probe (expect empty lists) and §3 screenshots; Read them back.
- `npx tsc --noEmit` must be clean.
- Revert verification-only churn and remove scratch scripts you copied into
  the repo root:
  ```bash
  git checkout -- package.json pnpm-lock.yaml   # playwright add is dev-only
  rm -f /home/user/homevault-web/*.mjs           # any copied probe/shoot scripts
  ```
  (The bundled scripts under `.claude/skills/responsive-audit/scripts/` stay.)
- Commit only the source/locale changes.

## Gotchas (learned the hard way)
- **Playwright resolves from the project dir** — run scripts from
  `/home/user/homevault-web`, or Node throws `ERR_MODULE_NOT_FOUND`.
- **Set `homevault-ui` and `hv_active_property_id` in `addInitScript`** (before
  the app loads), not after navigation.
- **Generic `button` selectors hit the sidebar/hamburger.** Click by visible
  text or role+name (`getByText("Allenby investment")`,
  `getByRole("button", { name: /add candidate/i })`).
- **An empty page proves nothing** — seed data first.
- The overflow probe is the source of truth for clipping; screenshots are for
  human-judgement issues (cramping, rhythm, alignment).
