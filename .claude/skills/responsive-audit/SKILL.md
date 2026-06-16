---
name: responsive-audit
description: Audit and fix responsive/layout problems on ANY HomeVault page, dialog, or sub-page — misaligned, clipped, overflowing, uneven, cramped, or theme/RTL-broken UI. Drives the real app with Playwright across a matrix of viewport widths (mobile/tablet/desktop) × both UIs (default + new HomeVault UI) × locales (English LTR + Hebrew RTL) × themes (light + dark), measures the DOM for actual overflow instead of eyeballing, applies known fix patterns, and re-verifies. Use when asked to review/fix how pages "look", fix alignment/responsiveness/RTL/dark-mode, make something "look professional", or clean up dialogs/forms on small screens.
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
dialog"). Translate that into **routes** and the **dimensions** to sweep. The
bundled scripts are matrix-driven, so "any page in any combination" is cheap.

- **Routes** to audit (hash routes, e.g. `/#/portfolio`, `/#/apartment-search`).
- **Dialogs / sub-screens** reached by interaction (Add candidate, the
  Add-Property wizard, mobile drill-in detail screens).
- **Dimensions** (the scripts cross-product these; override via env lists):
  - **Width:** `375` mobile, `768` tablet, `1280` desktop. Most bugs are mobile,
    but tablet catches breakpoint-boundary issues.
  - **UI:** `def` (default) **and** `hv` (new HomeVault UI). Most feature pages
    are shared — same component, different layout wrapper (`DashboardLayout` vs
    `HomeVaultLayout`, chosen by `useHomeVaultUI`). **A fix to a shared page
    must be checked in both.** Toggle: `localStorage["homevault-ui"]="true"`.
  - **Locale / direction:** `en` (LTR) **and** `he` (Hebrew **RTL**). RTL is
    where mirrored-padding / `rtl:` / text-alignment bugs live — never skip it
    in a bilingual app. (`ru` also exists.) Direction follows the **server**
    profile, not just localStorage — the scripts switch it for you (see §2).
  - **Theme:** `light` and `dark` (catches contrast/border-only issues).

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
clip *symmetrically* — content shifts off an edge and looks like a
"misalignment" when it's actually `scrollWidth > clientWidth`. Measure it
across the whole width × locale × UI matrix (cheap, text-only):

```bash
node .claude/skills/responsive-audit/scripts/probe-overflow.mjs \
  "/#/portfolio" "/#/apartment-search/SEARCH_ID"
```
Defaults: widths `375,768,1280` × locales `en,he` × UIs `def,hv`, auto-opening
any detected dialog. It prints one line per combo; **"OK (no overflow)" = clean**,
anything else is a real bug — note its classes; that's your fix target. The
probe reports **only genuine layout-breaking overflow** (`overflow-x:visible`,
`>4px`); it deliberately ignores `truncate`/scroll containers that clip by
design. Narrow with env lists, e.g. `WIDTHS=375 LOCALES=he`.

It switches the UI language the *real* way (server profile — see Gotchas) and
restores `en` when done.

**Dialogs are opened locale-independently** (so RTL/Hebrew dialogs are probed
too): the opener tries the Radix `[data-slot="dialog-trigger"]`, then a content
action-icon button (`svg.lucide-plus` / `lucide-pencil`, scoped to `<main>` so
nav/sidebar icons are ignored, enabled only), then English text as a last
resort. If a route's dialog has an unusual trigger, pass an explicit selector
per route via `OPENERS` (`||`-separated, index-aligned), e.g.
`OPENERS='||main button:has(svg.lucide-download)'`. For a dialog that needs a
multi-step interaction to reach, use the inline snippet in
`scripts/probe-snippet.md` after opening it by hand.

## 2.5 Static RTL sweep FIRST (the probe is blind to most RTL bugs)
When the task is RTL (Hebrew), grep **before** you probe. The overflow probe
and screenshots miss the highest-impact RTL bugs entirely, because they aren't
overflow and they *render fine* — just mirrored the wrong way: a toggle thumb
sliding the wrong direction, a dialog close `X` stuck top-right, a non-mirrored
chevron, `text-left` on a value. The whole class is **statically detectable**:
```bash
grep -rEn "(?<![\w-])(?<!ltr:)(?<!rtl:)(text-(left|right)|(ml|mr|pl|pr)-(auto|[0-9])|(left|right)-[0-9])" \
  client/src --include=*.tsx        # logical-utility offenders (ltr:/rtl: are OK)
grep -rEn "(Chevron|Arrow)(Left|Right)" client/src --include=*.tsx   # icons to check for rtl:rotate-180
```
**Audit `client/src/components/ui/**` too, not just pages.** The biggest wins
are in the shared shadcn primitives — one fix cascades app-wide: `switch` (thumb
`translate-x` needs an `rtl:` counterpart), `dialog`/`sheet` close button
(`right-4`→`end-4`), `select`/menu check indicators (`left-2`/`right-2` + their
`pl-8`/`pr-8` reservation), menu `data-[inset]:pl-8`, submenu chevrons, toggle
group corners. But **check the import graph first** — `carousel`, `table`,
`accordion` paths, `navigation-menu`, `field`, `input-group`, `ui/calendar`,
`resizable` are vendored-but-unused here; don't spend effort mirroring dead code.

There are regression guards for this now (see §5): a vitest test that fails on
physical utilities in app code, and behavioural `@rtl` Playwright assertions for
the toggle thumb, dialog close side, and chevron rotation. Run them after fixing.

## 3. Screenshot the matrix (for human-judgement issues)
```bash
node .claude/skills/responsive-audit/scripts/shoot.mjs \
  "list:/#/apartment-search" "detail:/#/apartment-search/SEARCH_ID"
```
Defaults: widths `375,1280` × locales `en,he` × themes `light,dark` × UIs
`def,hv`. Output: `/tmp/shots/<ui>-<locale>-<theme>-<width>w-<label>.png` (e.g.
`hv-he-dark-375w-list.png`). Env lists narrow/expand (`WIDTHS`, `LOCALES`,
`THEMES`, `UIS`); add `768` for tablet.

A full matrix is many images. **The §2 probe already found overflow across all
widths/locales — use screenshots to judge cramping/alignment/contrast, and Read
back a representative cross-section (always at least one RTL and one dark shot,
plus any combo the probe flagged) rather than all of them.** fullPage shots of
fixed-position dialogs can look odd — trust the probe for overflow. To capture a
dialog, copy `shoot.mjs` and add the click that opens it (see its header).

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

6. **RTL (Hebrew) breakage.** → Use **logical** utilities, not physical ones:
   `ms-/me-/ps-/pe-/start-/end-` instead of `ml-/mr-/pl-/pr-/left-/right-`, and
   `text-start/end` instead of `text-left/right`. Directional icons/chevrons
   need `rtl:rotate-180`. Absolute-positioned adornments (e.g. a currency
   prefix at `left-3`) must mirror (`start-3`, or `ltr:left-3 rtl:right-3`).
   Note: English text inside an RTL page (addresses, URLs) combined with
   `truncate` clips at the *start* — usually pre-existing and cosmetic; the
   probe correctly ignores it (it's an intentional `truncate`). Don't chase it
   unless asked.
   Gotchas that cost real time here:
   - **Toggles:** a `Switch` thumb moved by `data-[state=checked]:translate-x-…`
     needs an `rtl:data-[state=checked]:-translate-x-…` counterpart, else it
     slides the wrong way. Verify by **measuring the thumb's box vs the track
     centre**, not the computed transform — **Tailwind v4 emits the `translate`
     and `rotate` CSS properties, so `getComputedStyle(el).transform` is `"none"`
     even when translated/rotated** (read `.translate` / `.rotate`; `rtl:rotate-180`
     → `rotate: 180deg`).
   - **Collapsible/expander chevrons:** use a single conditional class —
     `open ? "rotate-90" : "rtl:rotate-180"` — never `rtl:rotate-180` *and* a
     conditional `rotate-90` together (they both set the transform and fight over
     specificity).
   - **Moving an absolute indicator to `start/end` requires flipping its
     sibling's reserved padding too** (the `pl-8`/`pr-8` that makes room for it),
     or the icon mirrors but the gap doesn't.

7. **Dark-mode only issues** (invisible borders, low-contrast text/badges that
   look fine in light). → Pair every color with a `dark:` variant and prefer
   semantic tokens (`border-border`, `text-muted-foreground`, `bg-card`) over
   raw palette colors so both themes are covered automatically.

General rules: prefer **mobile-first responsive utilities** (`base` = mobile,
`sm:` = ≥640px) so desktop stays byte-identical; use **logical** spacing/
alignment utilities so RTL works for free; lean on **semantic color tokens**
so dark mode works for free; reach for `min-w-0`, `truncate`, `flex-wrap`,
`shrink-0` deliberately; never introduce a fixed width that can exceed
375px − padding.

## 5. Re-verify, then clean up
- Re-run §2 probe (expect empty lists) and §3 screenshots; Read them back.
- `npx tsc --noEmit` must be clean.
- **Run the RTL regression guards** (they encode this skill's findings, so
  green ≈ the RTL work holds):
  ```bash
  npx vitest run client/src/__tests__/rtl-logical-utilities.test.ts   # static: no physical utilities in app code
  node_modules/.bin/playwright test --project=rtl                     # behavioural: toggle thumb, dialog close side, chevron rotation
  ```
  If you intentionally need a physical value per-direction, use an `ltr:`/`rtl:`
  variant (the static guard ignores those); only add to its small allowlist for
  genuinely direction-neutral cases (symmetric pairs, an `isRTL ? …` ternary).
  Note: the repo pins `@playwright/test` — run the bundled binary, not a freshly
  `pnpm add`-ed `playwright`, or you'll hit a two-versions error.
- The scripts reset the server language to `en` when they finish. If a run was
  interrupted mid-matrix, reset it yourself so the app isn't stuck in Hebrew:
  ```bash
  curl -sS -X POST "http://127.0.0.1:5000/api/trpc/profiles.setLanguage?batch=1" \
    -H "Content-Type: application/json" -d '{"0":{"json":{"language":"en"}}}'
  ```
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
- **Set `homevault-ui` / `app-language` / `homevault-theme` /
  `hv_active_property_id` in `addInitScript`** (before the app loads).
- **Language follows the SERVER profile, not localStorage.** Once
  authenticated the app reconciles with the stored profile language and that
  *wins*, so setting only `localStorage["app-language"]` does **not** flip RTL.
  The scripts POST `profiles.setLanguage` first (works because `NO_AUTH` makes
  every request the admin) and verify `documentElement.dir` flipped, warning if
  not. Pass `colorScheme` on the context for dark mode (covers theme `system`).
- **Generic `button` selectors hit the sidebar/hamburger.** Click by visible
  text or role+name (`getByText("Allenby investment")`,
  `getByRole("button", { name: /add candidate/i })`).
- **An empty page proves nothing** — seed data first.
- The overflow probe is the source of truth for clipping; screenshots are for
  human-judgement issues (cramping, rhythm, alignment, contrast).
