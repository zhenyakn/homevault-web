# Environment & Dev Container — Technical Reference

The canonical description of how to stand up and run HomeVault in a fresh
cloud / ephemeral container (Claude Code on the web, CI, a new local clone).
Read this **first** so the same facts aren't re-derived every session.

> Companion docs: `SKILL.md` (architecture & conventions), `qa/README.md`
> (the automated-QA harness), `.claude/skills/run-app` and
> `.claude/skills/qa-e2e` (executable runbooks).

---

## 1. Stack at a glance

| Layer       | Tech                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| Client      | React 19 + Vite + TypeScript + Tailwind + shadcn/ui (`client/`)          |
| Server      | Express + tRPC v11, serves API **and** client on one port (`server/`)    |
| ORM / DB    | Drizzle ORM → **MySQL / MariaDB**; schema in `shared/schema.ts`          |
| Shared      | types/utils in `shared/` (imported by both sides)                        |
| Router      | **hash-based** — `/#/expenses`, `/#/loans`, … (wouter `useHashLocation`) |
| Pkg manager | **pnpm** (has `patchedDependencies` → `npm install`/`ci` FAIL)           |
| Dev entry   | `tsx watch server/_core/index.ts` (`pnpm dev`)                           |

Other facts worth not re-discovering:

- Money is stored in **minor units** (agorot/cents); the UI divides by 100.
- Active property is stored in `localStorage` key **`hv_active_property_id`**.
- DB migrations run automatically on boot (`AUTO_MIGRATE` defaults true).
- App listens on port **5000** here (prod/HA addon uses **3005** — see SKILL.md).

---

## 2. Container facts (the time-sinks)

- **Ephemeral & fresh-cloned.** Nothing persists between sessions — commit and
  push anything worth keeping. The container is reclaimed after inactivity.
- **No Docker daemon.** `docker` exists but its daemon is **down**; `service` /
  systemd are denied. Start daemons (MariaDB) **directly**, in the background.
- **Background jobs get reaped.** A `... &` job dies between tool calls. Run
  long-lived processes (mariadbd, dev server) with the Bash tool's
  `run_in_background: true`, and read their output file rather than re-running.
- **Each Bash call is a fresh shell.** Exported vars don't persist — put
  `export …` and the launch command in the **same** call.
- **`apt` needs `apt-get update` first** or package fetches 404.
- **Browser CDN is firewalled.** Never `playwright install chromium`
  (cdn.playwright.dev → 403). Use the prebuilt Chromium baked into the image.
- **dotenv is unreliable under the run harness.** Don't depend on `.env`;
  `export` env vars in the same command that launches the server (or pass them
  via Playwright `webServer.env`, which is reliable).

---

## 3. Required environment variables

| Var                               | Value used here                                       | Notes                                                   |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                    | `mysql://homevault:password@127.0.0.1:3306/homevault` | required                                                |
| `JWT_SECRET`                      | any string **≥16 chars**                              | required                                                |
| `NO_AUTH`                         | `true`                                                | bypasses OAuth; every request is an auto-upserted admin |
| `OWNER_OPEN_ID`                   | `owner`                                               | the NO_AUTH identity                                    |
| `NODE_ENV`                        | `development`                                         |                                                         |
| `PORT`                            | `5000`                                                |                                                         |
| `STORAGE_BACKEND` / `STORAGE_DIR` | `local` / `/tmp/hv-uploads`                           | local file uploads                                      |

`NO_AUTH=true` is the single most important flag for local/automated testing.

### Observability (logging / tracing / metrics)

All optional with safe defaults; full reference in `.env.example`. The backend
emits structured, correlated logs (every line auto-stamped with `trace_id` /
`request_id` / `user_id` / `tenant_id` / `route`), in-process traces, and RED
metrics. View them in-app: super-admin console → **Observability** (logs /
traces / metrics, runtime level control, log-file download); tenant admins get
a tenant-scoped log view.

| Var                           | Default     | Notes                                                        |
| ----------------------------- | ----------- | ------------------------------------------------------------ |
| `LOG_LEVEL`                   | env-derived | `trace…fatal\|silent`; runtime-adjustable in the UI          |
| `LOG_FORMAT`                  | env-derived | `pretty` (dev) / `json` (prod)                               |
| `LOG_DIR`                     | `logs`      | rotating NDJSON files; gzip + size/age retention             |
| `LOG_FILE_ENABLED`            | `true`      | auto-off under `NODE_ENV=test`                               |
| `LOG_RETENTION_DAYS`          | `30`        | daily prune of rotated files; `0` disables                   |
| `LOG_BUFFER_SIZE`             | `2000`      | in-memory entries backing the viewer                         |
| `LOG_SAMPLE_RATE`             | `1`         | sample successful access logs; errors always kept            |
| `TRACE_ENABLED`               | `true`      | in-process OTel-shaped spans                                 |
| `METRICS_ENDPOINT_ENABLED`    | `false`     | serve Prometheus `GET /metrics` (guard with `METRICS_TOKEN`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _empty_     | reserved seam for remote export (disabled today)             |

Log files are written under `LOG_DIR` (relative to cwd unless absolute); for the
Home Assistant add-on point this at the persistent `/data` volume.

---

## 4. Prebuilt Chromium (for Playwright / browser-driven QA)

The CDN is blocked, so a Chromium is pre-installed in the image. Launch it via
Playwright's `executablePath` (this also bypasses the browser-revision check):

```
/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Also present: `chromium`, `chromium_headless_shell-1194`, `ffmpeg-1011` under
`/opt/pw-browsers/`. Always launch with `--no-sandbox` (running as root).
The QA harness resolves this automatically (`qa/support/chromium.ts`) and honours
a `PW_CHROMIUM_PATH` override.

---

## 5. Cold-start runbook (copy/paste)

```bash
cd /home/user/homevault-web

# 1. Deps (pnpm only)
pnpm install --frozen-lockfile

# 2. MariaDB — start the daemon directly (no Docker/systemd here)
apt-get update -q && apt-get install -y -q mariadb-server
mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld
mariadbd --user=mysql --datadir=/var/lib/mysql      # run_in_background: true
sleep 6 && mysqladmin ping                          # -> "mysqld is alive"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS homevault;
  CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password';
  GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost'; FLUSH PRIVILEGES;"

# 3. Start the app (export env in the SAME call; run_in_background: true)
export DATABASE_URL='mysql://homevault:password@127.0.0.1:3306/homevault'
export NODE_ENV=development PORT=5000 NO_AUTH=true OWNER_OPEN_ID=owner
export JWT_SECRET='devjwtsecret_at_least_16_chars_long_123456'
export STORAGE_BACKEND=local STORAGE_DIR=/tmp/hv-uploads
node_modules/.bin/tsx server/_core/index.ts
# Ready when the log shows: "[Auth] NO_AUTH mode enabled" + "Server running … port 5000"
```

---

## 6. Seeding demo data

The seed is a tRPC mutation **`data.seedMock`** (NOT `property.seedMock` → 404).
It creates the "Florentin Apartment" demo property (Tel Aviv address, ILS,
Hebrew-flavoured data) and returns its `propertyId`:

```bash
curl -sS -X POST "http://127.0.0.1:5000/api/trpc/data.seedMock?batch=1" \
  -H "Content-Type: application/json" -d '{"0":{"json":null}}'
# -> [{"result":{"data":{"json":{"propertyId":2}}}}]
```

Then set `localStorage['hv_active_property_id'] = <propertyId>` in the browser
**before** the SPA loads, or every screen shows the empty default property.

---

## 7. Useful commands

| Command       | What it does                                                  |
| ------------- | ------------------------------------------------------------- |
| `pnpm dev`    | start dev server (API + client) on `:5000`                    |
| `pnpm build`  | `vite build` (client → `dist/public`) + esbuild server bundle |
| `pnpm check`  | `tsc --noEmit` (typecheck; excludes tests + `qa/`)            |
| `pnpm test`   | vitest unit/integration tests (`server/**/*.test.ts`)         |
| `pnpm qa`     | Playwright browser-driven QA suite (see `qa/README.md`)       |
| `pnpm format` | **Prettier write — run before committing** (CI checks this)   |

---

## 8. Common gotchas (quick index)

1. Empty screens → forgot to set `hv_active_property_id` to the seeded id.
2. `npm` errors → use **pnpm** (patched deps).
3. Seed 404 → path is `data.seedMock`, not `property.seedMock`.
4. Playwright "browser not found" → point at the prebuilt Chromium (§4); never
   `playwright install`.
5. Env vars empty in server → `export` them in the same command as the launch.
6. Daemon "died" → it was reaped; use `run_in_background: true` and read its
   output file.
7. CI "quality gate" fails but tests/typecheck pass → it's **Prettier**. The
   `ci.yml` gate runs `pnpm exec prettier --check .` across the **whole repo**
   (`qa/` included). Always run `pnpm format` (or `pnpm exec prettier --write .`)
   before committing; verify with `pnpm exec prettier --check .`.
