# User Management & Multi-Tenancy — Implementation Plan

> Status: **Proposal / Stage 1 design**
> Scope: Introduce a tenant-based user-management capability so HomeVault can run in two
> deployment modes — **Standalone** (today's single-install experience) and **SAAS**
> (cloud, self-registration, isolated tenants).

---

## 1. Goal & Context

### 1.1 What we want

HomeVault should support two deployment modes:

- **Standalone mode** — essentially what exists today: a self-hosted install (Docker / Home
  Assistant add-on) for one household, optionally behind OAuth or `NO_AUTH`.
- **SAAS mode** — a cloud deployment where anyone can register. Each registration either
  **creates a brand-new tenant** or **joins an existing tenant** and shares access with that
  tenant's other members. A central **admin console** manages all users and global server
  configuration.

This document plans **Stage 1**: the user-management capability (tenant data model,
registration with the new-tenant / join-tenant choice, and the admin console). It also lays
out a forward-looking plan for **Stage 2**: the explicit standalone↔SAAS mode switch and the
SAAS deployment/operational concerns.

### 1.2 Decisions taken (from requirements review)

| Decision | Choice |
|----------|--------|
| Sharing model | **Tenant owns everything.** A `Tenant` entity owns all properties & data; members share access. Per-member roles (`owner` / `admin` / `member` / `viewer`). |
| Auth in SAAS | **Email/password + keep existing OAuth & `NO_AUTH`.** Native email/password with verification and reset for self-signup; OAuth and `NO_AUTH` preserved for standalone. |
| Concept name | **Tenant** (used in code and UI). |
| Stage 1 scope | Tenant/membership data model + data-scoping refactor + registration (create-new / join) + admin console. Stage 2 (mode switch + SAAS infra) is planned but deferred. |

---

## 2. Current Architecture (baseline)

A short summary of what we're building on (verified against the codebase):

- **Stack:** Express + tRPC (SuperJSON), Drizzle ORM on MySQL/MariaDB, React 19 + Vite,
  `wouter` hash router, i18next (`en` / `he` / `ru`, RTL-aware), Tailwind + shadcn/ui.
- **Auth:** JWT session cookie (`app_session_id`, HS256 via `jose`, 1-year expiry). Login via
  Manus OAuth (`server/_core/oauth.ts`) or auto-admin in `NO_AUTH` mode. Dev login endpoint
  in development.
- **User model** (`drizzle/schema.ts` → `users`): `id`, `openId` (unique, OAuth-coupled),
  `name`, `email`, `loginMethod`, `role` (`'user' | 'admin'`), notification fields,
  `language`, timestamps.
- **Data scoping (the crux):** Single-user-per-property. `properties.userId` (one owner per
  property). Every domain entity (`expenses`, `repairs`, `upgrades`, `loans`, `wishlist`,
  `purchaseCosts`, `inventoryItems`, `calendarEvents`, `files`, …) carries `propertyId` +
  `ownerId`. `apartmentSearches` / `apartmentCandidates` are scoped by `userId` only.
- **Request context** (`server/_core/context.ts`): resolves `user` from the session and a
  `propertyId` from the `x-property-id` header, validating ownership via
  `db.checkPropertyOwnership(userId, propertyId)` and falling back to the user's first
  property if the requested one isn't owned.
- **Authorization:** `protectedProcedure` (requires `ctx.user`) and `adminProcedure`
  (requires `role === 'admin'`) in `server/_core/trpc.ts`. Admin today only gates global infra
  (Maps API key, storage backend, broadcast notifications) — there is **no user-management UI**.
- **Config:** Layered — env vars (`server/_core/env.ts`, Zod-validated) for secrets/backends;
  `app_settings` key/value table (`server/db/appSettings.ts`) for runtime toggles; React
  contexts for client UI state.
- **Migrations:** Drizzle Kit; idempotent convergence via `apply-migration-addon.mjs`,
  auto-run on boot when `AUTO_MIGRATE` is set.

### 2.1 Key risks in the current model

- **`ownerId` is denormalized everywhere.** Sharing within a tenant means a record created by
  user A must be visible/editable by user B. The current per-row `ownerId` filter would hide
  it. We must scope by **tenant**, not by individual owner, while keeping `ownerId` for
  attribution/audit.
- **`properties.userId` default `1`** and historical guards like `if (propertyId === 1)` assume
  a single-user install. These must be audited and removed.
- **`openId` is unique and OAuth-coupled.** Email/password users need an `openId`-equivalent
  identity that doesn't depend on an external IdP.
- **`NO_AUTH` auto-admin** caches a single user/property in module scope — fine for standalone,
  must be bypassed/clearly bounded in SAAS.

---

## 3. Stage 1 — Target Architecture

### 3.1 Core concept: the Tenant

Introduce a `Tenant` (a.k.a. workspace/household account) that becomes the **unit of data
ownership and isolation**. Properties belong to a tenant; users are **members** of one or more
tenants with a role per membership.

```
            ┌────────────┐         ┌──────────────────┐         ┌────────────┐
            │   users    │ 1     * │ tenant_members   │ *     1 │  tenants   │
            │ (identity) ├─────────┤ (role, status)   ├─────────┤            │
            └────────────┘         └──────────────────┘         └─────┬──────┘
                                                                      │ 1
                                                                      │
                                                                      * 
                                                                ┌────────────┐
                                                                │ properties │  (tenantId)
                                                                └─────┬──────┘
                                                                      │ 1
                                                                      * 
                                                  expenses / repairs / upgrades / loans /
                                                  wishlist / purchaseCosts / inventory /
                                                  calendarEvents / files ...  (tenantId)
```

- **Ownership flows from the tenant.** Data isolation key becomes `tenantId`, not `userId`.
- A user can belong to multiple tenants (future-friendly); Stage 1 UI can assume "active
  tenant" similar to today's "active property".
- `ownerId` is retained on records purely for attribution ("created by"), **not** for access
  control.

### 3.2 Data model changes (Drizzle / migrations)

**New tables**

```ts
// tenants — the isolation boundary
tenants {
  id            int PK autoincrement
  name          varchar(200)               // "Smith Household"
  slug          varchar(64) unique         // optional, for SAAS URLs
  status        enum('active','suspended') default 'active'
  createdByUserId int FK -> users.id
  createdAt / updatedAt
}

// tenant_members — user ↔ tenant with role
tenant_members {
  id            int PK autoincrement
  tenantId      int FK -> tenants.id
  userId        int FK -> users.id
  role          enum('owner','admin','member','viewer') default 'member'
  status        enum('active','invited','removed') default 'active'
  invitedByUserId int FK -> users.id  null
  joinedAt / createdAt / updatedAt
  UNIQUE (tenantId, userId)
  INDEX (userId), INDEX (tenantId)
}

// tenant_invites — pending invitations to join a tenant
tenant_invites {
  id            int PK autoincrement
  tenantId      int FK -> tenants.id
  email         varchar(320)
  role          enum('admin','member','viewer') default 'member'
  token         varchar(128) unique        // hashed at rest
  invitedByUserId int FK -> users.id
  expiresAt     timestamp
  acceptedAt    timestamp null
  createdAt
  INDEX (tenantId), INDEX (email)
}

// user_credentials — native email/password identities (SAAS)
user_credentials {
  id              int PK autoincrement
  userId          int FK -> users.id unique
  email           varchar(320) unique
  passwordHash    varchar(255)             // argon2id / bcrypt
  emailVerifiedAt timestamp null
  createdAt / updatedAt
}

// email_tokens — verification & password-reset tokens
email_tokens {
  id          int PK autoincrement
  userId      int FK -> users.id
  type        enum('verify_email','reset_password')
  tokenHash   varchar(128)
  expiresAt   timestamp
  consumedAt  timestamp null
  createdAt
  INDEX (userId, type)
}
```

**Altered tables**

- `users`:
  - `openId` → keep, but make it tolerant of non-OAuth identities (e.g. `local:{uuid}` for
    email/password users) so the unique constraint and session model still work unchanged.
  - Add `defaultTenantId int null` (the tenant selected at login when a user has several).
  - Add `globalRole enum('user','superadmin') default 'user'` — **server-wide** admin for the
    admin console (distinct from per-tenant `role`). Migrate the existing
    `role = 'admin'` semantics: the install owner becomes `superadmin`; per-tenant authority
    lives in `tenant_members.role`. (Keep the old `role` column during transition; see §3.6.)
- `properties`: add `tenantId int FK -> tenants.id` (indexed). Backfill from `userId`'s tenant.
- Every property-scoped entity (`expenses`, `repairs`, `repairQuotes`, `upgrades`,
  `upgradeOptions`, `upgradeItems`, `loans`, `loanRepayments`, `wishlist`, `purchaseCosts`,
  `inventoryItems`, `calendarEvents`, `files`, notification tables, …): add `tenantId`,
  backfilled from the parent property/owner. Index `(tenantId, …)` where queries are hot.
- `apartmentSearches` / `apartmentCandidates`: add `tenantId`, backfilled from `userId`.

**Migration strategy**

1. Additive migration: create new tables; add nullable `tenantId` columns.
2. Data backfill (idempotent script, run via `apply-migration-addon.mjs`):
   - For each existing user, create one `tenant` (`"<name>'s Home"`), and one
     `tenant_members` row with `role = 'owner'`.
   - Set `properties.tenantId` from the owning user's tenant; cascade `tenantId` to all child
     records via their property.
   - Set `users.defaultTenantId`.
3. Follow-up migration (after code is reading `tenantId`): make `tenantId` `NOT NULL` and add
   FKs/indexes.
4. Keep the existing single-user/`NO_AUTH` behaviour intact by mapping the auto-admin to a
   single default tenant.

> All backfill must be **idempotent and safe to re-run**, matching the project's existing
> convergence-style migration approach.

### 3.3 Request context & authorization refactor

This is the highest-risk change and must be done carefully and test-covered.

- **Active tenant resolution** (`server/_core/context.ts`):
  - Resolve `tenantId` from an `x-tenant-id` header (mirroring `x-property-id`), validated
    against the user's `tenant_members`. Fall back to `defaultTenantId`, then to the user's
    first active membership.
  - Resolve `propertyId` as today, but validate it belongs to the **active tenant** rather than
    to `userId`.
  - Context shape becomes `{ user, tenantId, tenantRole, propertyId }`.
- **New procedure helpers** (`server/_core/trpc.ts`):
  - `protectedProcedure` — unchanged (requires a user).
  - `tenantProcedure` — requires an active, validated tenant membership; injects `tenantId` &
    `tenantRole`.
  - `tenantAdminProcedure` — requires `tenantRole ∈ {owner, admin}` (manage members/settings).
  - `superAdminProcedure` — replaces today's `adminProcedure` for the global admin console
    (`users.globalRole === 'superadmin'`).
  - A `writeProcedure` guard that rejects `viewer` role on mutations.
- **Scope every query by `tenantId`.** Refactor the `server/db/*.ts` layer so reads/writes
  filter on `tenantId` (the new isolation key) instead of `ownerId`. `ownerId` stays for
  display/attribution only. This touches every entity DB module — do it module-by-module with
  tests.
- **Remove single-user assumptions:** delete `if (propertyId === 1)`-style guards and the
  `properties.userId default 1` reliance; audit `checkPropertyOwnership` → replace with
  `checkPropertyInTenant(tenantId, propertyId)`.

### 3.4 Authentication: native email/password

Add a local-credentials provider alongside OAuth/`NO_AUTH` (all issue the same JWT session
cookie, so downstream code is unchanged).

- **Register** (`POST /api/auth/register` or tRPC `auth.register`):
  1. Validate email + password strength (Zod).
  2. Create `users` row (`openId = "local:{uuid}"`, `loginMethod = "email"`) +
     `user_credentials` (argon2id hash).
  3. Tenant choice (see §3.5).
  4. Send verification email (`email_tokens` type `verify_email`).
  5. Issue session immediately. **In Stage 1 email verification is _not_ enforced** — the
     verification email is sent and the screen exists, but unverified users can still sign in.
     Making verification a hard gate before first login is **deferred to Stage 2** (§4.3).
- **Login** (`auth.loginLocal`): verify hash, issue session token via existing
  `sdk.createSessionToken`.
- **Email verification** (`auth.verifyEmail`) and **password reset**
  (`auth.requestPasswordReset` / `auth.resetPassword`) via `email_tokens`.
- **Email delivery:** reuse the existing SMTP config (`SMTP_*` env already present for
  notifications); add templated transactional emails (verify, reset, invite) with i18n.
- **Security:** argon2id (or bcrypt) hashing; rate-limit auth endpoints (the app already has
  auth rate limiters); generic error messages; hash tokens at rest; short token TTLs.

### 3.5 Registration flow: new tenant vs. join existing

The defining Stage-1 feature. Two paths after account creation:

**Path A — Create a new tenant**
1. User registers, enters a tenant name.
2. Create `tenant` + `tenant_members` (`role = owner`) + a starter property (reuse the existing
   property wizard / `seedProperty`).
3. Set `defaultTenantId`; land in the app scoped to the new tenant.

**Path B — Join an existing tenant**
- **Invite-based (primary, secure):**
  1. A tenant `owner`/`admin` sends an invite to an email (creates `tenant_invites`, emails a
     tokenized link).
  2. Invitee registers (or logs in) via the link → token validated → `tenant_members` row
     created with the invited role → `tenant_invites.acceptedAt` set.
  - If the invitee already has an account, the link simply adds the membership.
- **Request-to-join (optional, behind a tenant setting):** user searches/enters a tenant
  slug/code → request stored as `tenant_members(status='invited')` → tenant admin approves.

> Invite-based joining is recommended as the default because open "join any tenant" is a data-
> leakage risk. Stage 1 ships invite + accept; request-to-join can be a follow-up.

### 3.6 Migrating today's `users.role`

- Existing `role = 'admin'` users → set `globalRole = 'superadmin'` (the install owner / first
  user). All users get an `owner` membership on their backfilled tenant.
- Keep the legacy `role` column readable during the transition; switch all checks to
  `globalRole` (console) and `tenant_members.role` (in-tenant), then drop `role` in a later
  cleanup migration.

### 3.7 Admin console (global / super-admin)

A new admin area, gated by `superAdminProcedure`, surfaced at `#/admin` (lazy-loaded, hidden
from non-superadmins).

**Backend** — new `server/adminRouter.ts`:
- `admin.users.list` (search/paginate), `admin.users.get`, `admin.users.update` (name, status,
  globalRole), `admin.users.disable` / `admin.users.delete`, `admin.users.resetPassword`.
- `admin.tenants.list` / `get` / `update` (rename, suspend), `admin.tenants.members`
  (list/add/remove/change role), `admin.tenants.transferOwnership`.
- `admin.config.get` / `admin.config.set` — global server config (read/write `app_settings`):
  storage backend & credentials, Maps API key, default deployment **mode** flag (§4),
  registration open/closed, allowed email domains, default new-user tenant policy, SMTP status,
  feature flags.
- `admin.stats` — counts (users, tenants, properties), recent signups, storage usage.
- `admin.audit.list` — read the audit log (§3.8).

**Frontend** — `client/src/pages/admin/`:
- `AdminLayout` with sub-nav: **Users**, **Tenants**, **Server Config**, **Audit Log**,
  **Overview**.
- Users table: search, role, status, last-signed-in; row actions (disable, reset password,
  change global role, view tenants).
- Tenants table: members, properties count, status; manage members & roles.
- Server Config: forms over the existing settings keys + the new mode/registration flags
  (reuse Settings.tsx autosave patterns).
- All strings via i18next; add keys to `en/he/ru`; RTL-safe.

### 3.8 Auditing

Add a lightweight `audit_log` table (`actorUserId`, `tenantId?`, `action`, `targetType`,
`targetId`, `metadata json`, `createdAt`) and write entries for security-relevant events:
member added/removed, role changed, invite sent/accepted, password reset, tenant
suspended, global config changed. Surfaced in the admin console.

### 3.9 Frontend changes (beyond the admin console)

- **Auth pages:** registration, login (email/password + existing OAuth button), forgot/reset
  password, email-verification screen, accept-invite screen. (Extends the current `SignIn`.)
- **Tenant context:** a `TenantProvider` (mirroring the property context) holding the active
  tenant; send `x-tenant-id` on every tRPC request (alongside `x-property-id`). **Stage 1
  assumes a single active tenant per user** — the active tenant is resolved from
  `defaultTenantId` / first membership. The in-header **tenant switcher UI for users who belong
  to multiple tenants is deferred to Stage 2** (§4.3). The schema and context already support
  many memberships, so this is purely additive UI later.
- **Tenant settings (in-app, for owners/admins):** a "Tenant / Members" section in Settings —
  invite members, list members, change roles, remove members, rename tenant. Gated by
  `tenantRole`.
- **Role-aware UI:** hide/disable mutating actions for `viewer`; hide member management for
  non-admins.

### 3.10 Testing

- **Unit:** tenant-scoping in each `server/db/*.ts` module; role guards; password hashing;
  token lifecycle.
- **Integration (real MySQL, existing harness):** cross-tenant isolation (user A cannot read/
  write tenant B), invite→accept flow, register→login (+ verify-token lifecycle, not gated in
  Stage 1), role enforcement on mutations, backfill migration idempotency.
- **E2E (Playwright, existing `pnpm qa`):** register-new-tenant, invite-and-join,
  admin-console user/tenant management, across desktop/mobile/RTL.
- **Migration test:** snapshot a single-user DB, run backfill, assert every record gets the
  correct `tenantId` and nothing leaks across tenants.

---

## 4. Stage 2 — Standalone ↔ SAAS mode switch (forward plan)

Planned, not built in Stage 1. The Stage-1 model is designed so this is mostly configuration +
gating rather than another data refactor.

### 4.1 Deployment mode flag

- Introduce `APP_MODE = 'standalone' | 'saas'` (env, validated in `env.ts`; mirrored to the
  client via `systemRouter` like `noAuth` is today; also stored/overridable in `app_settings`
  for the admin console).
- **Standalone** (default; preserves today's behaviour):
  - `NO_AUTH` and OAuth continue to work.
  - Self-registration is **off** by default; effectively one tenant (the install). The tenant
    machinery exists but is invisible unless the admin enables multi-user.
  - The auto-admin maps to the single default tenant.
- **SAAS:**
  - `NO_AUTH` is **forbidden** (hard fail at boot if set) — every request must be an
    authenticated, tenant-scoped user.
  - Self-registration **on** (email/password), with the new-tenant / join-tenant choice.
  - Stronger defaults: email verification required, secure cookies, per-tenant rate limits.

### 4.2 SAAS operational concerns (later sub-stages)

- **Onboarding & limits:** plan tiers / quotas per tenant (properties, storage, members),
  enforced centrally.
- **Billing:** Stripe (or similar) — subscriptions per tenant; webhook → `tenants.status`.
- **Isolation hardening:** per-tenant storage prefixes (S3/Drive), per-tenant rate limiting,
  defense-in-depth tenant checks at the DB layer (consider a query wrapper that *requires* a
  `tenantId`).
- **Custom domains / routing:** tenant `slug` subdomains or path prefixes (optional).
- **Compliance:** per-tenant data export (extend existing export route) and deletion (GDPR),
  email deliverability (SPF/DKIM), audit retention.
- **Scaling:** connection pooling, read replicas, background-job isolation (the reminder
  scheduler must iterate tenants safely).
- **Observability:** per-tenant metrics, error tagging, admin dashboards.

### 4.3 Carried over from Stage 1 (explicitly deferred)

These two items were raised during Stage 1 design and are intentionally **part of Stage 2**:

- **Enforced email verification before first login.** Stage 1 sends the verification email and
  ships the verification screen but does not block unverified sign-in. Stage 2 makes
  verification a hard gate (with a grace-period / resend policy), enabled by default in SAAS
  mode and configurable from the admin console.
- **Multi-tenant switcher UI.** Stage 1 resolves a single active tenant per user. Stage 2 adds
  the in-header tenant switcher for users who belong to multiple tenants. The schema, context,
  and `x-tenant-id` plumbing already support this, so it is purely additive UI plus the
  membership-management flows that let a user end up in more than one tenant.

> Recommendation: ship Stage 1 in **standalone defaults** (registration off, single tenant) so
> existing installs upgrade with zero behavioural change, then flip `APP_MODE=saas` for the
> cloud deployment once Stage 2 hardening lands.

---

## 5. Implementation Phases & Sequencing

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **0. Prep** | Tests around current per-user scoping; document invariants | Safety net before refactor |
| **1. Schema** ✅ | `tenants`, `tenant_members`, `tenant_invites`, `user_credentials`, `email_tokens`, `audit_log`; nullable `tenantId` columns; backfill script | Done — additive & idempotent; verified on MySQL (backfill + 3× re-run = 0 drift); `server/db/tenants.ts` helpers + integration test |
| **2. Context & guards** ✅ | `tenantId`/`tenantRole` in context; `tenantProcedure` / `tenantAdminProcedure` / `superAdminProcedure`; `x-tenant-id` plumbing; read-only `tenant` router | Done — additive (property scoping still by userId until Phase 3); auto-provisions a personal tenant; verified via integration tests + full suite |
| **3. DB scoping refactor** ✅ | Rewrite `server/db/*.ts` to scope by `tenantId`; remove single-user guards; cross-tenant isolation tests | Done — all entity reads/writes, dashboard, documents, search, apartment-search, seed, scheduler & bot now tenant-scoped; context validates property∈tenant; entity routers use `tenantProcedure`; verified by cross-tenant isolation test + full suite. Files/attachments stay owner-scoped (tenant-wide file sharing deferred to Stage 2 per-tenant storage). |
| **4. Native auth** ✅ | Email/password register/login/verify/reset; transactional emails | Done — backend endpoints under `auth.*`; scrypt hashing (no native dep); single-use hashed email/reset tokens; reuses SMTP (best-effort); verification not gated (Stage 2). Verified by unit + real-MySQL integration tests. Auth **UI pages** land with the registration-flow phase. |
| **5. Registration flow** | New-tenant path + invite/accept join path | The headline feature |
| **6. In-app tenant mgmt** | Members section in Settings; role-aware UI | Owners/admins |
| **7. Admin console** | `adminRouter` + `pages/admin/*` (users, tenants, server config, audit, overview) | Super-admin only |
| **8. Harden & finalize** | Make `tenantId` NOT NULL; drop legacy `role`; i18n (en/he/ru); E2E across desktop/mobile/RTL | |
| **9. Stage 2 plan kickoff** | `APP_MODE` flag scaffolding + standalone-safe defaults | Bridges to SAAS |

---

## 6. Key Files To Touch (reference map)

- **Schema/migrations:** `drizzle/schema.ts`, `drizzle/relations.ts`, `drizzle/*.sql`,
  `apply-migration-addon.mjs`
- **Auth/context:** `server/_core/context.ts`, `server/_core/trpc.ts`, `server/_core/sdk.ts`,
  `server/_core/oauth.ts`, `server/_core/env.ts`, `server/_core/systemRouter.ts`,
  `server/_core/index.ts` (`NO_AUTH` middleware)
- **Data layer:** all of `server/db/*.ts` (esp. `users.ts`, `properties.ts`, `appSettings.ts`)
- **Routers:** `server/routers.ts`, new `server/adminRouter.ts`, new auth procedures
- **Email:** new `server/email/*` (templates + send), reuse SMTP config
- **Frontend:** `client/src/App.tsx` (routes/guards), `client/src/main.tsx` & `lib/trpc.ts`
  (`x-tenant-id` header), new `contexts/TenantContext.tsx`, `pages/SignIn` + new auth pages,
  `pages/Settings.tsx` (Members section), new `pages/admin/*`
- **i18n:** `client/src/locales/{en,he,ru}.json`
- **Tests:** `*.test.ts` units, integration suite, `pnpm qa` E2E

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Cross-tenant data leakage during refactor | Tenant-scope at the DB layer; isolation integration tests; consider a query helper that *requires* `tenantId` |
| Backfill corrupts existing single-user installs | Idempotent, re-runnable script; migration test on a real snapshot; nullable-first then NOT-NULL |
| `openId` uniqueness vs. local accounts | Synthetic `local:{uuid}` openIds; keep session model unchanged |
| `NO_AUTH` accidentally enabled in SAAS | Hard boot failure when `APP_MODE=saas && NO_AUTH` |
| Auth abuse (credential stuffing, enumeration) | Argon2id, rate limits (existing), generic errors, hashed/short-lived tokens, email verification |
| Scope creep into billing/quotas | Explicitly deferred to Stage 2 |

---

## 8. Resolved & Open Questions

**Resolved — moved to Stage 2 (§4.3):**

- Enforced email verification before first login → **Stage 2** (Stage 1 sends the email but
  does not gate sign-in).
- Multi-tenant switcher UI → **Stage 2** (Stage 1 assumes one active tenant per user; schema
  already supports many).

**Open (for Stage 2 / refinement):**

- Email-verification grace-period / resend policy specifics (Stage 2).
- Request-to-join (self-service) vs. invite-only. Stage 1 defaults to **invite-only**;
  request-to-join is a candidate follow-up.
- Billing provider and plan tiers for SAAS (Stage 2).
