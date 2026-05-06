# HomeVault Environment Setup Skill

This skill provides instructions for quickly setting up the HomeVault development environment, including cloning the repository, installing dependencies, configuring the database, and seeding mock data.

## Setup Steps

To set up the HomeVault environment, execute the following commands in a shell session:

1.  **Clone the repository:**
    ```bash
    gh repo clone zhenyakn/homevault-web /home/ubuntu/homevault-web
    cd /home/ubuntu/homevault-web
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Install and configure MySQL:**
    ```bash
    sudo apt-get update
    sudo apt-get install -y mysql-server
    sudo service mysql start
    sudo mysql -e "CREATE DATABASE IF NOT EXISTS homevault; CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password'; GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost'; FLUSH PRIVILEGES;"
    ```

4.  **Configure environment variables:**
    ```bash
    echo "DATABASE_URL=mysql://homevault:password@localhost:3306/homevault" > .env
    echo "JWT_SECRET=secret" >> .env
    echo "OWNER_OPEN_ID=owner" >> .env
    echo "NO_AUTH=true" >> .env
    echo "SEED_MOCK_DATA=true" >> .env
    ```

5.  **Run database migrations and seed mock data:**
    ```bash
    pnpm drizzle-kit push
    pnpm tsx server/_core/index.ts --seed-mock-only
    ```

6.  **Build the client and start the server:**
    ```bash
    pnpm build
    pnpm start &
    ```

7.  **Expose the application port:**
    ```bash
    manus-expose 3005
    ```

    The application will be accessible via the provided public URL.

---

## Architecture & Conventions

### Stack
- **Frontend:** React + Vite + Tailwind + shadcn/ui (`client/`)
- **Backend:** Express + Drizzle ORM (`server/`)
- **Database:** MySQL/MariaDB — schema defined in `shared/schema.ts`
- **Shared types/utils:** `shared/` (imported by both client and server)

### Database Schema Changes — Mandatory Checklist
This project uses `drizzle-kit push` (no migration files). Whenever you add or modify a column/table in `shared/schema.ts`, you **must** also update `apply-migration-addon.mjs`:
1. Add the column to the relevant `CREATE TABLE IF NOT EXISTS` DDL.
2. Add a corresponding `ALTER TABLE ... ADD COLUMN ...` legacy upgrade statement below the CREATE TABLE block — the `run()` helper handles `ER_DUP_FIELDNAME` as a no-op so it's safe to re-run.

Failing to do this breaks the Home Assistant addon for existing installs.

### JSON Columns in Drizzle
JSON columns (e.g. `attachments`) must be passed as serializable values. When inserting in bulk seed/restore functions that bypass the `create*` helpers in `db.ts`, wrap array/object values with `JSON.stringify()` explicitly — Drizzle's batch insert path does not auto-serialize the way individual inserts do.

### API / Routing Conventions
- All API routes live in `server/routers.ts` or dedicated router files (e.g. `searchRouter.ts`). Follow the existing pattern: validate with Zod, authenticate with the `auth` middleware, keep business logic in `db.ts`.
- New features need both a server route **and** a corresponding `db.ts` function — don't inline DB queries in routers.
- `shared/schema.ts` types are the single source of truth for request/response shapes — reuse them on both client and server sides.

### Internationalisation (i18n)
All user-visible strings must use the i18n system — never hardcode display text in components. Translation files live in `client/src/locales/`. Currently supported locales: **`en`** and **`he`**. When adding new UI strings:
1. Add the key + English value to `en.json`.
2. Add the same key with a Hebrew translation to `he.json`.

Never add a key to one locale file without updating the other.

### RTL Layout
The app supports Hebrew which is RTL. Always use logical CSS properties (`margin-inline-start` not `margin-left`, `text-align: start` not `text-align: left`) or Tailwind's RTL variants when adding layout-sensitive components. Test visually in both LTR and RTL modes.

### Money / Currency
All monetary values are stored as **integers in the smallest currency unit** (agorot for ILS, cents for USD, etc.). The `ils()` helper in `shared/utils.ts` converts human-readable amounts. Never store floats for money.

### Mock Data (`server/mockData.ts`)
- Mock data is Israel-flavoured by default (Hebrew names, Tel Aviv addresses, ILS amounts). When adding new mock data, keep it consistent — don't mix in generic English placeholder data.
- All mock monetary values use `ils()`. Mock dates should be realistic (recent past, not Unix epoch 0 or far future).
- After adding a new entity to the seed, always test the full restore-demo flow end to end before merging.

### File Uploads / Attachments
Attachments are handled via `server/storage.ts` and `server/uploadRoute.ts`. Files are stored at the path configured in `.env`. When modifying attachment logic, remember the HA addon mounts a persistent volume — paths must stay stable across container restarts.

### `NO_AUTH` / Dev Mode
`NO_AUTH=true` bypasses JWT entirely and uses `OWNER_OPEN_ID` as the authenticated user. Never write code that assumes `NO_AUTH` is always false — all auth-sensitive logic must work correctly in both modes.

### Port / Deployment
The app runs on port `3005`. The HA addon exposes it via Ingress. Do not change the port without also updating `homevault-addon/config.yaml` and `docker-compose.yml`.

The HA addon pulls from the Docker image tagged `latest`, which tracks `main`. Anything merged to `main` ships to users on their next addon restart.

---

## Git Workflow

### Branching
- All feature development happens on a dedicated `feat/<feature-name>` branch cut from `main`.
- **Never push directly to `main`** unless explicitly instructed to do so. `main` is the production branch — it ships to users immediately via the HA addon.
- Bug fixes that are isolated and low-risk may use `fix/<description>` branches.

### Commits
- Every logical change gets its own dedicated commit with a clear message (e.g. `feat: add wishlist sort order`, `fix: json serialization in seed`, `docs: update SKILL.md`).
- Aim for **few, meaningful commits** per feature rather than one giant commit or many micro-commits. A good rule of thumb: one commit per distinct concern (schema change, server logic, client UI, tests). This makes rollbacks surgical rather than all-or-nothing.
- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.

### Pull Requests
- Once a feature is fully built and tested, open a PR from the feature branch into `main`.
- The PR description should summarise what changed, why, and any migration/deployment considerations (e.g. "requires addon restart to apply migration").
- Do not merge the PR without explicit user approval.
