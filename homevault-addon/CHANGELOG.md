# Changelog

## 0.1.31
- fix: remove environment block from config.yaml and read all vars via bashio in run.sh
- fix: remove isFetching from loading in useAuth to prevent infinite spinner
- fix: don't block AppRouter on noAuth query — prevents infinite spinner on dev VM
- fix: hide SignInPage when server reports NO_AUTH mode
- fix: make auth.me return admin user directly in NO_AUTH mode
- fix: bypass auth-not-configured screen in NO_AUTH (HA addon) mode
- fix: retry auth/me once so NO_AUTH session bootstrap doesn't flash sign-in screen
- fix: read SEED_MOCK_DATA from addon config; remove startup-only seed gate; always register seedMock tRPC route
- ci: auto-generate CHANGELOG.md from commits on every tag build
- addon: fix mock data seeding — call seedMockProperty directly at startup
- addon: add SEED_MOCK_DATA support + wire NO_AUTH env flag
- fix: simplify version bump commit — apply sed after checkout, no stash needed
- fix: correct git checkout order in release workflow to avoid config.yaml conflict
- ci: trigger builds on version tags only; auto-update config.yaml version from tag
- fix: pass BUILD_VERSION build-arg in workflow; clean up Dockerfile migration COPYs
- fix: guard against null array returns from MariaDB in quotes/repairs/upgrades
- fix: use asArray() for payments in RepairDetail to handle MariaDB JSON strings
- Update config.yaml
- fix: add shared asArray helper to utils for MariaDB JSON column normalization
- fix: normalize JSON array fields (payments) from MariaDB string responses
- Update config.yaml
- Update apply-migration-addon.mjs
- Update run.sh
- Update config.yaml
- Update apply-migration-addon.mjs
- Update config.yaml
- Update Dockerfile
- Update run.sh
- Update Dockerfile
- Create apply-migration-addon.mjs
- Update config.yaml
- Update run.sh
- Update Dockerfile
- Update config.yaml
- Update App.tsx
- Update config.yaml
- Update context.ts
- Update config.yaml
- Update apply-migration-v3.mjs
- Update config.yaml
- Update App.tsx
- Update main.tsx
- Update vite.config.ts
- Update config.yaml
- Update oauth.ts
- Update run.sh
- Update config.yaml
- Update index.ts
- Update env.ts
- Update config.yaml
- Update config.yaml
- Update run.sh
- Update config.yaml
- Update index.ts
- Update run.sh
- Update config.yaml
- Update config.yaml
- Update build.yml
- Update package.json
- Update Dockerfile
- Update Dockerfile
- Update config.yaml
- Update build.yml
- Update config.yaml
- Update Dockerfile
- Update build.yml
- Update build.yml
- Update config.yaml
- Update Dockerfile
- Update Dockerfile
- fix(addon): remove runtime drizzle-kit install and use bundled migration script
- fix(addon): pin pnpm to Node 16 compatible version
- fix: move ARG BUILD_ARCH before FROM for proper multi-arch builds
- Update build.yml
- chore: update Home Assistant Add-on to v0.1.3 with multi-arch support and docs
- Update config.yaml
- Update Dockerfile
- Update config.yaml
- Update config.yaml
- Create repository.json
- fix: sync pnpm lockfile overrides with package config
- Pin tar via pnpm override for Dependabot security updates
- Align add-on image with workflow-published GHCR tag
- Auto-bootstrap add-on options and persist generated secrets
- Use Debian Node base image for addon multi-arch build
- Allow patches directory in Docker build context
- Fix add-on Docker build by including pnpm patches
- Fix GHCR tag naming in add-on build workflow
- add build.yaml
- feat: add Home Assistant Add-on configuration
- i18n: fully translate UpgradeDetail page
- fix: move Settings mobile nav from fixed bottom bar to inline top strip
- i18n: translate remaining hardcoded strings in Settings page
- i18n: translate all hardcoded strings across pages and locales
- fix: RTL sidebar — reopen on click, badge alignment, resize handle
- i18n: translate all remaining pages and complete Hebrew locale
- feat: i18n with Hebrew (RTL) support
- chore: update todo.md — mark Repair Studio, dashboard redesign, and upgrade studio items done
- feat: Repair Studio + dashboard redesign
- feat: Upgrade Studio UX overhaul and list page redesign
- feat: Upgrade Studio — options, items, phase tracking (Approach C)
- fix: interestRate must be decimal string not '0%'
- fix: use static import for mockData in db.ts
- feat: demo property with realistic Israeli data + one-click restore
- feat: Phase D — per-property settings UX and delete-property flow
- feat: multi-property support (Phase B + C)
- Phase A: Multi-property foundation
- Remove all Manus platform references
- Initial commit: HomeVault web app
- Checkpoint: File upload support with S3 storage fully wired for Expenses, Repairs, Upgrades, and Purchase Costs. Attachments persist through create/update flows. All schemas updated. 10 tests passing, zero TypeScript errors.
- Checkpoint: Added file upload route (/api/upload) with multer, FileUpload reusable component, wired attachments into Expenses and Repairs create/update payloads with persistence. Google Maps on Dashboard and Property Settings. Multi-profile household display in sidebar. All 10 tests passing, zero TypeScript errors.
- Checkpoint: Added CSV export and category filtering to Expenses module. Improved responsive design across all pages. Added Recent Household Activity section to Dashboard with owner attribution. All 10 tests passing, zero TypeScript errors.
- Checkpoint: Added Recent Household Activity section to Dashboard showing cross-module activity with owner avatars. Implemented multi-profile household member display in sidebar. Google Maps integration on Dashboard and Property Settings. All 10 tests passing, zero TypeScript errors.
- Checkpoint: Added Google Maps integration to Dashboard and Property Settings pages with geocoding support. Added upcoming events section to Dashboard showing next 30 days. Implemented multi-profile household member display in sidebar with colored avatars. All 10 tests passing, zero TypeScript errors.
- Checkpoint: All 9 HomeVault modules fully functional: Dashboard (real data KPIs), Expenses, Repairs, Upgrades, Loans, Wishlist, Purchase Costs, Calendar, Property Settings. All modules load data from backend. 10 vitest tests passing. Zero TypeScript errors.
- Checkpoint: HomeVault Now Working: Navigation sidebar displays all modules (Dashboard, Expenses, Repairs, Upgrades, Loans, Wishlist, Purchase Costs, Calendar, Settings). Dashboard shows KPI metrics with loading states. All routes are functional. App is fully navigable and ready for feature development.
- Checkpoint: HomeVault MVP Complete: Full database schema (9 tables), all tRPC backend procedures, authenticated dashboard with KPI metrics, and fully functional Expenses module with CRUD operations. App is running with proper navigation sidebar and authentication. Ready for production use with foundation for all remaining features.
- Checkpoint: HomeVault Foundation Complete: Full database schema with 9 tables, all tRPC procedures for expenses, repairs, upgrades, loans, wishlist, purchase costs, calendar, profiles, and properties. Dashboard displays KPI metrics (purchase total, monthly recurring, YTD expenses, upgrades spent, pending repairs, wishlist total). Authentication working with Manus OAuth. App is production-ready for feature development.
- Checkpoint: Phase 1 & 2 Complete: Implemented comprehensive database schema with 9 tables (users, properties, expenses, repairs, upgrades, loans, wishlist, purchase costs, calendar events), created all backend tRPC procedures for CRUD operations on all modules, implemented dashboard stats calculation, and created the main dashboard UI with KPI display. App is running and ready for feature development.
- Initial project bootstrap

## 0.1.30
- fix: remove environment block from config.yaml and read all vars via bashio in run.sh

## 0.1.29
- fix: remove isFetching from loading in useAuth to prevent infinite spinner
- fix: don't block AppRouter on noAuth query — prevents infinite spinner on dev VM

## 0.1.28
- Internal improvements and dependency updates

## 0.1.27
- fix: hide SignInPage when server reports NO_AUTH mode

## 0.1.26
- fix: make auth.me return admin user directly in NO_AUTH mode

## 0.1.25b
- Internal improvements and dependency updates

## 0.1.25
- fix: bypass auth-not-configured screen in NO_AUTH (HA addon) mode

## 0.1.24
- fix: retry auth/me once so NO_AUTH session bootstrap doesn't flash sign-in screen

## 0.1.23
- fix: read SEED_MOCK_DATA from addon config; remove startup-only seed gate; always register seedMock tRPC route
- ci: auto-generate CHANGELOG.md from commits on every tag build

## 0.1.22
- addon: fix mock data seeding — call seedMockProperty directly at startup

## 0.1.21
- addon: add SEED_MOCK_DATA support + wire NO_AUTH env flag
