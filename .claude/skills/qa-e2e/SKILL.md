---
name: qa-e2e
description: Spin up the Chromium-based automated-QA framework and run the Playwright E2E suite against the real HomeVault stack. Use when asked to run/execute the automated QA, run the e2e / selenium / browser tests, set up or prepare the test framework, add a test scenario, or verify the app via the QA harness in a fresh cloud/ephemeral container.
---

# Run the HomeVault automated-QA suite (Chromium / Playwright)

Brings the browser-driven QA framework (`qa/`, built in phase 1) from a cold
clone to **green tests**, then shows how to extend it. The harness drives the
**real** Express/tRPC/Vite stack in a real Chromium — clicking, typing,
switching screens, asserting — i.e. Selenium-style E2E.

> Authoritative environment facts (ports, env vars, container quirks, seed
> endpoint, Chromium path) live in **`ENVIRONMENT.md`** at the repo root. This
> skill is the QA-specific runbook on top of it. The harness itself is
> documented in **`qa/README.md`**.

## TL;DR

```bash
# 0. deps (pnpm only — patched deps make npm fail)
pnpm install --frozen-lockfile
pnpm ls @playwright/test >/dev/null 2>&1 || pnpm add -D @playwright/test @axe-core/playwright

# 1. database (no Docker/systemd here → start mariadbd directly, in background)
apt-get update -q && apt-get install -y -q mariadb-server
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql --datadir=/var/lib/mysql        # Bash run_in_background:true
sleep 6 && mysqladmin ping                            # -> "mysqld is alive"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS homevault;
  CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password';
  GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost'; FLUSH PRIVILEGES;"

# 2. prebuilt Chromium (CDN is firewalled → never `playwright install`)
export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome

# 3. run
pnpm qa                       # all projects (desktop + mobile + rtl), headless
```

That's it. `pnpm qa` (Playwright) **auto-starts the app** via its `webServer`
config under `NO_AUTH=true` and reuses an already-running server; `global-setup`
seeds the demo property and the fixtures set it active before the SPA loads.
You do **not** need to start the dev server or seed by hand.

## What each step is doing (and why)

1. **Deps** — `@playwright/test` is a committed devDependency; `pnpm install`
   restores it. Use **pnpm**, never npm (patched `wouter`).
2. **DB** — the app needs `DATABASE_URL`. The Docker daemon is down and
   systemd is denied, so launch `mariadbd` directly with Bash
   `run_in_background: true` (a plain `&` job gets reaped between tool calls).
3. **Chromium** — `cdn.playwright.dev` returns 403 here. A prebuilt Chromium is
   baked into the image; `qa/support/chromium.ts` finds it automatically and
   honours `PW_CHROMIUM_PATH`. Launched with `--no-sandbox` (root).
4. **Run** — `playwright.config.ts` (repo root) boots
   `tsx server/_core/index.ts` on port 5000 with the right env, waits for the
   `system.noAuth` endpoint, then runs everything in `qa/tests/`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm qa` | run the whole suite (desktop + mobile + rtl) headless |
| `pnpm qa:desktop` | deep CRUD flows + breadth + a11y (English) |
| `pnpm qa:mobile` | `@responsive` breadth + a11y on a mobile viewport |
| `pnpm qa:rtl` | Hebrew / RTL rendering + a11y |
| `pnpm qa:a11y` | accessibility specs only |
| `pnpm qa:headed` | watch it drive the browser |
| `pnpm qa:report` | open the HTML report after a run |
| `pnpm exec playwright test qa/tests/flows/loans.spec.ts` | run one spec |
| `pnpm exec playwright test -g "add an"` | run by title |

## Architecture (what to know before extending)

- **Page Object Model** in `qa/pages/*` (one `*Page` per screen) over the
  `Driver` (`qa/support/driver.ts`). Specs call page-object methods; selectors
  live in the page objects. The app has **no `data-testid`s** — target visible
  i18n text + roles; icon-only buttons by their lucide class (`lucide-trash2`).
- **Self-cleaning** via the `sandbox` fixture: tests create records named
  `sandbox.name("Thing")` and teardown deletes everything with that prefix via
  the tRPC API (`qa/support/api.ts`). The seeded demo data is never disturbed.
- **Accessibility** (`qa/support/a11y.ts`) fails on serious/critical axe
  violations except a documented `KNOWN_ISSUES` baseline (pre-existing app debt).
- **Projects** (`playwright.config.ts`): `desktop` runs everything; `mobile`
  greps `@responsive`; `rtl` greps `@rtl` and switches to Hebrew via the in-app
  control. `global-setup` resets the DB language to English first — the server
  caches the NO_AUTH language per process, so this baseline matters.

## Artifacts & delivering results

- Screenshots, traces and the HTML report land in **`qa/artifacts/`**
  (gitignored). Per-scenario screenshots are named `screen-<name>.png` /
  `flow-<name>.png`.
- On a remote/cloud surface the user can't see `qa/artifacts/` — deliver PNGs
  with the **SendUserFile** tool.

## Adding a scenario (extend the framework)

One scenario per file under `qa/tests/`:

- **A screen that should load** → `qa/tests/screens/<name>.spec.ts`:
  ```ts
  import { screenLoadsScenario } from "../../support/scenarios";
  screenLoadsScenario({ name: "<name>", route: "/<route>", heading: /Heading/i });
  ```
- **A CRUD / multi-step journey** → add methods to the relevant
  `qa/pages/<Screen>Page.ts` (encapsulate the dialog/row selectors there) and a
  `qa/tests/flows/<screen>.spec.ts` that uses the page-object + `sandbox`
  fixtures, e.g.:
  ```ts
  import { test } from "../../fixtures";
  test("create → delete", async ({ loans, sandbox }) => {
    await loans.open();
    const lender = sandbox.name("Lender");        // unique, auto-cleaned
    await loans.addLoan({ lender, amount: "50000" });
    await loans.expectRow(lender);
    await loans.deleteLoan(lender);
  });
  ```

The `qa/` folder is **excluded from the build** (not in `tsconfig` `include`,
listed in its `exclude`, and `vite build` only bundles `client/`) — same as
this skills directory: committed, never shipped.

## Gotchas (quick index)

1. `npm` errors → use **pnpm** (patched deps).
2. Browser "not found" → set `PW_CHROMIUM_PATH` to the prebuilt Chromium; never
   `playwright install`.
3. Empty screens / no data → the seed step failed, or `hv_active_property_id`
   wasn't set (the fixtures handle this; check `global-setup` logged a
   `propertyId`).
4. Seed 404 → the endpoint is `data.seedMock`, not `property.seedMock`.
5. Daemon "died" between calls → it was reaped; use `run_in_background: true`.
6. Server won't boot → `DATABASE_URL` unreachable or `JWT_SECRET` <16 chars.
