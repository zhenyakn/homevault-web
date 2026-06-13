# HomeVault Automated QA

Browser-driven, Selenium-style end-to-end QA for the HomeVault web app. It
drives the **real** Express/tRPC/Vite stack in a real Chromium: clicking
buttons, switching screens, typing into forms, picking dropdowns, and asserting
what shows up — exactly what a manual tester does, automated.

We use **Playwright Test** rather than Selenium because Selenium isn't installed
in this project's cloud/ephemeral containers and the WebDriver download path is
firewalled, whereas a prebuilt Chromium is baked into the image. Playwright
gives the same "drive a browser" capability plus a runner, auto-waiting,
tracing, screenshots, and projects.

## Layout

```
qa/
  README.md            ← you are here
  global-setup.ts      ← English baseline, wait for server, seed demo property
  fixtures.ts          ← app (Driver) · sandbox (self-clean) · per-screen page objects
  support/
    driver.ts          ← Driver: the Selenium-like action vocabulary
    api.ts             ← tRPC HTTP client for data teardown (cleanupByPrefix)
    factories.ts       ← uniqueId + valid default form payloads per entity
    a11y.ts            ← assertNoA11yViolations (axe-core) + known-issue baseline
    scenarios.ts       ← screenLoadsScenario builder
    app.ts, chromium.ts
  pages/               ← Page Object Model (one per screen / chrome surface)
    BasePage.ts  ExpensesPage.ts  LoansPage.ts  RepairsPage.ts
    RepairDetailPage.ts  UpgradesPage.ts  UpgradeDetailPage.ts
    InventoryPage.ts  WishlistPage.ts  PurchaseCostsPage.ts
    CalendarPage.ts  SettingsPage.ts  DashboardPage.ts
    DocumentsPage.ts  PortfolioPage.ts  PropertyDashboardPage.ts
    SearchPage.ts (global ⌘K modal)  NotificationsPage.ts (bell popover)
  tests/
    screens/*.spec.ts          ← breadth: each screen loads with data  (@responsive)
    flows/*.spec.ts            ← depth: CRUD + validation per screen (desktop)
    flows/navigation.spec.ts   ← every sidebar route + breadcrumb + 404
    flows/dashboard.spec.ts    ← dashboard cards + inline shortcuts
    flows/search.spec.ts       ← global search: states, results, keyboard nav
    flows/notifications.spec.ts← bell popover: feed / empty / settings link
    flows/settings.spec.ts     ← section nav, theme toggle, JSON export, danger zone
    flows/edge-cases.spec.ts   ← dialog cancel, decimals, special chars, empty search
    a11y/accessibility.spec.ts ← axe audit per screen                (@responsive)
    rtl/rtl-smoke.spec.ts      ← Hebrew / RTL rendering + a11y        (@rtl)
  artifacts/           ← screenshots, traces, HTML report (gitignored)
```

The Playwright config is at the repo root: `playwright.config.ts`. The whole
`qa/` folder is **excluded from the build** (not in `tsconfig.json` `include`,
listed in its `exclude`, and `vite build` only bundles `client/`) — same as
`.claude/skills/`: committed, never shipped.

## Architecture (enterprise patterns)

- **Page Object Model** — every screen has a `*Page` in `qa/pages/` exposing
  intention-revealing methods (`loans.addLoan(...)`, `repairs.deleteRepair(...)`).
  Selectors and dialog quirks live there; specs read like manual scripts.
- **Driver** (`support/driver.ts`) — the low-level action vocabulary the page
  objects build on: `goto/clickNav/clickButton/fill/select/check`, plus
  `expectToast`, `acceptConfirm` (native `confirm()`), `dialog()` scoping,
  `rowFor`/`clickRowIcon` (rows are located by text; icon-only action buttons by
  their stable lucide class, e.g. `lucide-trash2`).
- **Self-cleaning tests** — the `sandbox` fixture mints a unique per-test name
  prefix (`QA-…`). Tests create uniquely-named records; on teardown the sandbox
  deletes everything carrying that prefix via the tRPC API
  (`support/api.ts` → `cleanupByPrefix`), so the seeded demo data is never
  disturbed and re-runs stay green — even if a test fails mid-flow. (Verified:
  entity counts are identical before and after a full flow run.)
- **Negative/validation tests** — each flow asserts the guards: invalid amount
  → error toast (`Please enter a valid amount`), empty required field → submit
  blocked (dialog stays open), etc.
- **Accessibility** — `support/a11y.ts` runs axe (WCAG A/AA) and fails on
  serious/critical violations, except a documented **baseline** of pre-existing
  app-wide issues (`button-name`, `color-contrast`, `scrollable-region-focusable`)
  which are logged but not blocking. New regressions still fail. Shrink
  `KNOWN_ISSUES` as the app team fixes them.

## Projects & tags

| Project   | Runs          | Notes                                           |
| --------- | ------------- | ----------------------------------------------- |
| `desktop` | everything    | deep flows + breadth + a11y (English, 1280×900) |
| `mobile`  | `@responsive` | screen-loads + a11y on a Pixel-7 viewport       |
| `rtl`     | `@rtl`        | Hebrew RTL rendering + a11y (`tests/rtl`)       |

```bash
export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome

pnpm qa            # all projects
pnpm qa:desktop    # deep flows + breadth + a11y (English)
pnpm qa:mobile     # @responsive on mobile viewport
pnpm qa:rtl        # Hebrew / RTL
pnpm qa:a11y       # accessibility specs only
pnpm qa:headed     # watch it drive the browser
pnpm qa:report     # open the HTML report
```

### A note on language (RTL)

The server caches the NO_AUTH user's language per process
(`server/_core/context.ts`), so it can't be flipped per-test from the back end.
`global-setup` resets the DB language to English before the first request (the
English baseline), and the **rtl** project switches to Hebrew at runtime through
the real in-app control (Settings → Appearance), then navigates client-side via
the hash so the Hebrew session sticks (a full reload would re-run the one-time
reconciliation and revert to English).

## Environment

See `ENVIRONMENT.md` (repo root) for the full container runbook (MariaDB, env
vars, prebuilt Chromium), and `.claude/skills/qa-e2e` for the one-shot setup +
run skill. `global-setup` boots the app under `NO_AUTH`, seeds "Florentin
Apartment" via `data.seedMock`, and each test sets that property active in
`localStorage` before the SPA loads.

## Adding coverage

- **A screen that should load** → `qa/tests/screens/<name>.spec.ts`:
  ```ts
  import { screenLoadsScenario } from "../../support/scenarios";
  screenLoadsScenario({
    name: "<name>",
    route: "/<route>",
    heading: /Heading/i,
  });
  ```
- **A CRUD / multi-step flow** → add methods to the relevant `qa/pages/*Page.ts`
  and a `qa/tests/flows/<screen>.spec.ts` using the page-object + `sandbox`
  fixtures. Name created records with `sandbox.name("Thing")` so teardown finds
  them. Target visible text / roles; if a screen needs stable hooks, add
  `data-testid`s to the component and prefer them.

## CI & nightly

Two GitHub Actions workflows run the suite (each spins up a throwaway MySQL,
installs Chromium, runs `pnpm qa`, uploads the HTML report + JUnit + traces):

- **`.github/workflows/qa-e2e.yml`** — per-PR / push gate on `dev`/`main`, plus
  manual dispatch. Publishes a JUnit check on the PR.
- **`.github/workflows/qa-nightly.yml`** — the "is `main` healthy?" runner:
  a daily cron (03:00 UTC) **and** on-demand (`workflow_dispatch`, pick the
  branch). Scheduled runs always execute on the default branch (`main`). On
  failure it opens / updates a tracking GitHub issue so a broken `main` is
  visible without watching the Actions tab.

## Roadmap

- Deepen mobile coverage (drive flows through the mobile nav, not just breadth).
- Visual-diff snapshots; shrink the a11y `KNOWN_ISSUES` baseline as fixes land.
- Swap the nightly failure notification for the team's channel (Slack/email) if
  a GitHub issue isn't the right surface.
