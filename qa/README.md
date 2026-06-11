# HomeVault Automated QA (Phase 1)

Browser-driven, Selenium-style end-to-end QA for the HomeVault web app. It
drives the **real** Express/tRPC/Vite stack in a real Chromium: clicking
buttons, switching screens, typing into forms, picking dropdowns, and asserting
what shows up — exactly what a manual tester does, automated.

We use **Playwright Test** rather than Selenium because Selenium isn't installed
in this project's cloud/ephemeral containers and the Selenium/WebDriver
download path is firewalled, whereas a prebuilt Chromium is already baked into
the image. Playwright gives the same "drive a browser" capability plus a test
runner, auto-waiting, tracing and screenshots out of the box.

## What's here

```
qa/
  README.md            ← you are here
  global-setup.ts      ← waits for server, seeds the demo property once
  fixtures.ts          ← `app` (a Driver) + `propertyId` test fixtures
  support/
    driver.ts          ← Driver: the Selenium-like action vocabulary
    scenarios.ts       ← reusable scenario builders (e.g. "screen loads")
    app.ts             ← seedDemoData / waitForServer / seed-state helpers
    chromium.ts        ← resolves the prebuilt Chromium executable
  tests/               ← one scenario per file
    screens/           ← breadth: each screen loads with data (+ screenshot)
      dashboard.spec.ts  calendar.spec.ts   expenses.spec.ts
      loans.spec.ts      purchase-costs.spec.ts  repairs.spec.ts
      upgrades.spec.ts   inventory.spec.ts  wishlist.spec.ts
      settings.spec.ts
    flows/             ← depth: multi-step user journeys
      add-expense.spec.ts   ← open dialog → fill → select → submit → verify
  artifacts/           ← screenshots, traces, HTML report (gitignored)
```

Every scenario lives in its own `*.spec.ts` file. Screen-load checks share the
`screenLoadsScenario(...)` builder so each file is a thin, declarative
one-liner; richer journeys (forms, drill-ins) get a hand-written `flows/` file.

This whole folder is **excluded from the build** (it's not in `tsconfig.json`'s
`include`, is listed in its `exclude`, and `vite build` only bundles `client/`)
— same treatment as `.claude/skills/`: committed to the repo, never shipped.

The Playwright config lives at the repo root: `playwright.config.ts`.

## The Driver API (Selenium-flavoured actions)

`qa/support/driver.ts` wraps a Playwright `Page` with intention-revealing verbs
so specs read like a manual script. The app ships **no `data-testid`s**, so the
Driver targets accessible roles + visible (i18n) text — the same cues a human
sees.

| Action | Method |
| --- | --- |
| Go to a screen (hash route) | `app.goto("/expenses")` |
| Click a left-nav item | `app.clickNav("Expenses")` |
| Click any button | `app.clickButton(/Add expense/i)` |
| Click visible text | `app.clickText("Kitchen renovation")` |
| Type into a labelled field | `app.fill(/Amount/i, "123.45")` |
| Type by placeholder | `app.fillByPlaceholder(/Search/i, "tax")` |
| Pick a Radix/shadcn `<Select>` | `app.select(/Utilities/i)` |
| Toggle a checkbox | `app.check(/Recurring/i)` |
| Assert text is visible | `app.expectVisible(/Expenses/i)` |
| Assert the route | `app.expectRoute("/expenses")` |
| Screenshot to `qa/artifacts` | `app.screenshot("name")` |
| Escape hatch | `app.page` / `app.locator(css)` |

## Running it

### One-time environment (cloud/ephemeral container)

```bash
pnpm install --frozen-lockfile

# MariaDB (Docker daemon is unavailable here; start mariadbd directly)
apt-get update -q && apt-get install -y -q mariadb-server
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql --datadir=/var/lib/mysql &      # leave running
mysql -u root -e "CREATE DATABASE IF NOT EXISTS homevault;
  CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password';
  GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost'; FLUSH PRIVILEGES;"
```

### Run the suite

```bash
# Point at the prebuilt Chromium (firewalled CDN → no `playwright install`)
export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome

pnpm qa            # run all flows headless
pnpm qa:headed     # watch it drive the browser
pnpm qa:report     # open the HTML report after a run
```

Playwright's `webServer` boots the app under `NO_AUTH=true` automatically (and
reuses an already-running server). `global-setup` then seeds the demo property
("Florentin Apartment" + demo data) via the `data.seedMock` tRPC mutation and
records its id; each test sets that property active in `localStorage` *before*
the SPA loads, so the first navigation already shows seeded data.

## Configuration knobs (env vars)

| Var | Default | Purpose |
| --- | --- | --- |
| `PW_CHROMIUM_PATH` | prebuilt image path | Chromium executable to launch |
| `QA_PORT` | `5000` | port the app is served on |
| `QA_BASE_URL` | `http://127.0.0.1:$QA_PORT` | base URL under test |
| `DATABASE_URL` | local MariaDB | DB the app connects to |
| `JWT_SECRET` | dev default (≥16 chars) | required by the server |

## Adding a flow

```ts
import { test, expect } from "../fixtures";

test("rename the property", async ({ app }) => {
  await app.goto("/settings");
  await app.fill(/Name/i, "QA House");
  await app.expectVisible(/Saved/i);
});
```

Keep specs in `qa/tests/*.spec.ts`. Target visible text / roles (what the user
sees), not brittle CSS. If a screen genuinely needs stable hooks, add
`data-testid`s to the component and prefer them.

## Roadmap (future phases)

- **Phase 2** — deeper per-screen flows (loans, repairs, upgrades drill-ins,
  wishlist, inventory) and edit/delete paths.
- **Phase 3** — mobile viewport + RTL (Hebrew) coverage; visual-diff snapshots.
- **Phase 4** — wire `pnpm qa` into CI with the report uploaded as an artifact.
