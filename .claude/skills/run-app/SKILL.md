---
name: run-app
description: Spin up the full HomeVault stack locally (MariaDB + Express/tRPC/Vite under NO_AUTH) with seeded demo data, and drive the UI with Playwright + the pre-installed Chromium to take screenshots / verify changes. Use when asked to run, start, screenshot, manually test, or verify the app's UI in a fresh cloud/ephemeral container.
---

# Run & screenshot the HomeVault app (local verification runbook)

Battle-tested recipe for standing up this app from a cold clone in an
ephemeral container and driving its UI with a real browser. Follow it in
order; the **Gotchas** are the parts that cost hours the first time.

## Stack facts (so you don't re-research)
- React 19 + Vite + TypeScript client, Express + tRPC server, Drizzle ORM, **MySQL** (MariaDB works).
- Package manager is **pnpm** with `patchedDependencies` (wouter patch) → `npm install`/`npm ci` FAIL. Always use pnpm.
- Dev entry: `tsx watch server/_core/index.ts` (script `npm run dev`). Server serves BOTH API and client (Vite middleware) on one port.
- Router is **hash-based** (`/#/portfolio`, `/#/loans`, …). Active property is stored in `localStorage` key **`hv_active_property_id`**.
- Currency is stored in **agorot** (minor units); UI divides by 100.
- Required env: `DATABASE_URL` and `JWT_SECRET` (≥16 chars). Everything else has defaults.
- **Auth unlock:** `NO_AUTH=true` makes every request an auto-upserted admin — no OAuth needed. This is the single most important flag for local testing.
- Migrations run automatically on boot (`AUTO_MIGRATE` defaults true).

## 0. Install deps
```bash
cd /home/user/homevault-web
pnpm install --frozen-lockfile
```

## 1. Database (MariaDB — Docker daemon is NOT available in this env)
```bash
apt-get update -q                         # REQUIRED: stale index → 404s otherwise
apt-get install -y -q mariadb-server
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
# datadir /var/lib/mysql is pre-initialised by the package. Start the daemon:
mariadbd --user=mysql --datadir=/var/lib/mysql      # run with Bash run_in_background:true
# wait ~6s then confirm:
mysqladmin ping                            # -> "mysqld is alive"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS homevault;
  CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password';
  GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost'; FLUSH PRIVILEGES;"
```
- `service mariadb start` / systemd are DENIED (no init). Start `mariadbd` directly.
- No `mysql` binary preinstalled; apt provides it. `docker` exists but its **daemon is down** — don't try containers.

## 2. Start the app
Start with **Bash `run_in_background: true`**, exporting env inline (see Gotcha #1):
```bash
cd /home/user/homevault-web
export DATABASE_URL='mysql://homevault:password@127.0.0.1:3306/homevault'
export NODE_ENV=development PORT=5000 NO_AUTH=true OWNER_OPEN_ID=owner
export JWT_SECRET='devjwtsecret_at_least_16_chars_long_123456'
export STORAGE_BACKEND=local STORAGE_DIR=/tmp/hv-uploads
exec node_modules/.bin/tsx server/_core/index.ts
```
Wait ~12s, then look for these lines in the background task output:
```
[Auth] NO_AUTH mode enabled
Server running  host 0.0.0.0  port 5000
```
Boot auto-runs the unified migration, so no separate migrate step is needed.

## 3. Seed the demo property ("Florentin Apartment" + all demo data)
The seed is a tRPC mutation `data.seedMock` (NOT `property.seedMock`):
```bash
curl -sS -X POST "http://127.0.0.1:5000/api/trpc/data.seedMock?batch=1" \
  -H "Content-Type: application/json" -d '{"0":{"json":null}}'
# -> [{"result":{"data":{"json":{"propertyId":2}}}}]   ← note the propertyId
```
Use that `propertyId` (e.g. `2`) as the active property in the browser.

## 4. Browser (Playwright) — CDN is blocked, use the pre-installed Chromium
```bash
pnpm add -D playwright        # npm FAILS on this repo's patched deps; use pnpm
# DO NOT run `playwright install chromium` — cdn.playwright.dev returns
# 403 "Host not in allowlist". A prebuilt Chromium already exists at:
#   /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```
Launch via `executablePath` (bypasses the pw-version↔build check) + `--no-sandbox` (root).
The script MUST run from the project dir so `playwright` resolves from node_modules.

Screenshot script template (`node shot.mjs` from project root):
```js
import { chromium } from 'playwright';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:5000';
const PROP = '2';                                   // propertyId from step 3
const routes = [
  ['portfolio', '/#/portfolio'], ['property', '/#/property'],
  ['loans', '/#/loans'], ['expenses', '/#/expenses'],
  ['repairs', '/#/repairs'], ['upgrades', '/#/upgrades'],
  ['inventory', '/#/inventory'], ['purchase-costs', '/#/purchase-costs'],
  ['wishlist', '/#/wishlist'], ['settings', '/#/settings'],
];
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(p => localStorage.setItem('hv_active_property_id', p), PROP); // set BEFORE app loads
const page = await ctx.newPage();
for (const [name, route] of routes) {
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: true });
  console.log('shot', name);
}
await browser.close();
```
Interactions that matter for verification:
- **Radix Select** (month/category filters): `page.getByRole('combobox').first().click()` then `page.getByRole('option', { name: /All time/i }).click()`.
- **Expenses "recurring/month"** is 0 on the default current month (seed data is older) — switch to a month WITH data (e.g. "Apr 2026"); it counts one row per occurrence, so per-single-month is the meaningful view.
- **Drill-in** (e.g. upgrade detail): `page.getByText('Kitchen renovation').first().click()`.
- **Mobile / responsive**: use a `newContext({ viewport: { width: 375, height: 760 } })`.

Deliver screenshots with the **SendUserFile** tool (remote surface — the user can't see `/tmp`).

## 5. Cleanup (keep the repo clean)
`pnpm add -D playwright` edits `package.json`/`pnpm-lock.yaml` — these are
verification-only, do NOT commit them:
```bash
git checkout -- package.json pnpm-lock.yaml
```
A local `.env`, if you create one, is gitignored (harmless).

## Gotchas (the time-sinks)
1. **Env vars / dotenv:** `import "dotenv/config"` did NOT reliably populate `process.env` under the run harness. Don't depend on `.env` — `export` the vars in the SAME command that launches the server.
2. **Background processes get reaped:** a manual `... &` job dies between Bash tool calls. Use Bash **`run_in_background: true`** for `mariadbd` and the dev server. (`npm run dev &` repeatedly "failed" partly for this reason — read the *background task output file*, not a re-run.)
3. **Each Bash call is a fresh shell** — exported vars don't persist across calls. Put export+launch in one call.
4. **pnpm only** — `npm ci` errors out; `npm install` dies on `patchedDependencies`.
5. **apt** — run `apt-get update` first or you get 404s on package fetch.
6. **Playwright Chromium download is firewalled** — never `playwright install`; point `executablePath` at `/opt/pw-browsers/chromium-1194/...`.
7. **Seed path** is `data.seedMock`, not `property.seedMock` (404 otherwise).
8. **Empty pages?** You forgot to set `hv_active_property_id` to the seeded id, so the app shows the empty default property.
