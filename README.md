# HomeVault

> The operating system for your property — from the day you decide to buy to the day you sell.

HomeVault is a full-stack property management app for homeowners and small investors. Track expenses, repairs, upgrades, family loans, a wish list, purchase costs, and calendar events — all in one place, for your whole household.

---

## Features

- **Overview dashboard** — KPIs, recent activity, property map
- **Expenses** — recurring and one-time, with category filters and CSV export
- **Repairs** — priority/status tracking, contractor details, photo uploads
- **Upgrades** — project planning, budget vs. actual spend
- **Family loans** — repayment history, per-lender progress
- **Wish list** — prioritised future projects with cost estimates
- **Purchase costs** — full acquisition cost breakdown
- **Calendar** — month view with colour-coded event types
- **Settings** — property details, currency, timezone, sync toggles
- **Multi-profile** — per-entry ownership attribution for households
- **Dark / light / system** theme

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind v4, shadcn/ui, Radix UI |
| Backend | Node.js, Express, tRPC |
| Database | MySQL 8 / TiDB Cloud via Drizzle ORM |
| Auth | Manus OAuth (self-hosted option planned) |
| File storage | Cloudflare R2 / AWS S3 / any S3-compatible |
| Language | TypeScript throughout |

---

## Quick start

### Prerequisites

- Node.js 22+
- pnpm (`npm install -g pnpm`)
- MySQL 8 database (local, TiDB Cloud, or PlanetScale)

### 1. Clone and install

```bash
git clone https://github.com/zhenyakn/homevault-web.git
cd homevault-web
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:
- `DATABASE_URL` — your MySQL connection string
- Auth vars (`OAUTH_SERVER_URL`, `OWNER_OPEN_ID`) if running on Manus platform
- Storage vars (`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, etc.) for file uploads

See `.env.example` for full documentation of every variable.

### 3. Run the database migration

```bash
node apply-migration-v3.mjs
```

This creates all tables and seeds the default property row. Safe to run multiple times — every step is idempotent.

### 4. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

### Docker Compose (recommended for self-hosted)

```bash
cp .env.example .env
# Edit .env — set MYSQL_PASSWORD and any auth/storage vars
docker compose up -d
```

The `migrate` service runs automatically on first start.

### Proxmox / Ubuntu VM

See the full step-by-step guide including GitHub auto-deploy setup:
→ `homevault-proxmox-deploy.md`

### Cloud (Railway / GCP Cloud Run)

See the cloud deployment guide:
→ `homevault-deployment-guide.md`

---

## File storage setup (Cloudflare R2 — free)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **R2** → **Create bucket** → name it `homevault`
3. **Settings → Public access → Allow access**
4. **Manage API Tokens → Create Token** (Object Read & Write on `homevault`)
5. Add to `.env`:

```
STORAGE_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
STORAGE_BUCKET=homevault
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret
STORAGE_PUBLIC_URL=https://pub-XXXXXXXX.r2.dev
```

10 GB free storage, zero egress fees.

---

## Project structure

```
├── client/src/
│   ├── pages/          # One file per module (Dashboard, Expenses, Repairs…)
│   ├── components/     # Shared components (DashboardLayout, FileUpload, Map…)
│   └── lib/            # tRPC client, utilities
├── server/
│   ├── _core/          # Express server, auth, OAuth, tRPC setup
│   ├── db.ts           # All database queries
│   ├── routers.ts      # All tRPC procedures
│   ├── storage.ts      # File storage (Forge / S3-compatible)
│   └── uploadRoute.ts  # POST /api/upload endpoint
├── drizzle/
│   ├── schema.ts       # Drizzle table definitions + TypeScript types
│   └── relations.ts    # Drizzle relation definitions
├── apply-migration-v3.mjs  # Idempotent DB setup script
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Development commands

```bash
pnpm dev          # start dev server with hot reload
pnpm build        # build for production (Vite + esbuild)
pnpm start        # start production build
pnpm check        # TypeScript type check
pnpm test         # run tests (vitest)
pnpm format       # format with prettier
```

---

## Roadmap

See [todo.md](./todo.md) for the full feature roadmap across three phases:
- **Phase 1** — personal app (stable daily use)
- **Phase 2** — SaaS launch (multi-tenant, billing, integrations)
- **Phase 3** — scale and AI features

---

## License

Private — all rights reserved.
