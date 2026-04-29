# HomeVault - Project TODO

## Phase 1: Core Foundation & Database

### Architecture & Planning
- [x] Initialize web project with tRPC + React + Express + Database
- [x] Design database schema for all entities
- [x] Create Drizzle ORM models and migrations
- [x] Implement tRPC procedures for core operations

### Database Schema
- [x] Users table with profiles and roles
- [x] Properties table with address, purchase details, and settings
- [x] Expenses table with categories and recurring support
- [x] Repairs table with priority and contractor tracking
- [x] Repairs `phase` column (Assessment → Quoting → Scheduled → In Progress → Resolved)
- [x] RepairQuotes table (contractor quotes with payments and receipts per repair)
- [x] Upgrades table with budget vs. spent tracking
- [x] Upgrades `phase` column (Planning → Sourcing → Building → Done)
- [x] UpgradeOptions table (vendor quotes with payments and receipts per upgrade)
- [x] UpgradeItems table (item/product tracking per upgrade project)
- [x] Loans table with repayment history
- [x] WishlistItems table with priority and cost estimates
- [x] PurchaseCosts table for acquisition expenses
- [x] CalendarEvents table for event management
- [x] Property settings configuration

### Backend Setup
- [x] tRPC router for expenses (create, read, update, delete, list)
- [x] tRPC router for repairs (create, read, update, delete, list)
- [x] tRPC router for repairQuotes (list, create, update, select, logPayment, deletePayment, delete, countByRepair)
- [x] tRPC router for upgrades (create, read, update, delete, list)
- [x] tRPC router for upgradeOptions (list, create, update, select, logPayment, deletePayment, delete)
- [x] tRPC router for upgradeItems (list, create, update, delete, countByUpgrade)
- [x] tRPC router for loans (create, read, update, delete, list, add repayment)
- [x] tRPC router for wishlist (create, read, update, delete, list)
- [x] tRPC router for purchase costs (create, read, update, delete, list)
- [x] tRPC router for calendar events (create, read, update, delete, list)
- [x] tRPC router for properties (get, update settings)
- [x] tRPC router for profiles (list, switch, get current)
- [x] Dashboard stats calculation procedure
- [x] File upload support for attachments

## Phase 2: Frontend UI & Dashboard

### Layout & Navigation
- [x] Implement DashboardLayout with sidebar navigation
- [x] Design color scheme and typography for home management tool
- [x] Create navigation menu with all modules
- [x] Implement profile switcher in header
- [x] Add logout functionality
- [x] Refine sidebar with indigo/violet Linear-style accent and CSS variable theming

### Dashboard Overview
- [x] Three-layer dashboard layout: Attention / This Month / Running Context
- [x] Attention zone: unpaid expenses, critical repairs, upgrades needing quote decision
- [x] Mark-as-paid action directly from dashboard attention cards
- [x] Spend card: monthly total, category breakdown with colored mini-bars
- [x] Calendar card: 7-day strip + upcoming events list
- [x] Upgrades panel: active projects with phase dots and budget bars
- [x] Loans panel: per-loan repayment progress bars
- [x] Display upcoming events section
- [x] Add quick action buttons for common tasks

### Expense Tracking Module
- [x] Create expense list view with filters by category and date range
- [x] Implement add expense form with category selection
- [x] Add recurring expense toggle and frequency options
- [x] Implement mark-as-paid action with date tracking
- [x] Create expense detail view with edit/delete options
- [x] Add file attachment support for receipts
- [ ] Display monthly expense summary and trends (summary done; multi-month trend chart not yet built)
- [x] Export expense data to CSV

### Repair Log Module
- [x] Create repair list view — sectioned by Open / Resolved with priority-accent borders
- [x] Phase-based workflow stepper (Assessment → Quoting → Scheduled → In Progress → Resolved)
- [x] Contractor quote tracking per repair: add/edit/select quotes, log payments with receipts
- [x] Quote count chip on list rows (shows selected state vs. unresolved)
- [x] Repair detail page (RepairDetail.tsx): phase stepper, quote cards, edit dialog
- [x] Implement add repair form with priority selection
- [x] Add contractor assignment functionality
- [x] Create repair status workflow (derived from phase)
- [x] Add file attachment support for photos/quotes
- [x] Display repair payment history per contractor quote
- [x] Add cost tracking for repairs (actualCost auto-synced from selected quote payments)
- [ ] Display repair timeline and history (phase history / audit log not yet implemented)
- [x] Export repair data to CSV

### Upgrade Project Tracking
- [x] Create upgrade list view — sectioned by In Progress / Planned / Done
- [x] Phase-based workflow stepper (Planning → Sourcing → Building → Done)
- [x] Vendor option tracking per upgrade: add/edit/select options, log payments with receipts
- [x] Item/product tracking per upgrade project (upgradeItems with status, ETA, costs)
- [x] Upgrade detail page (UpgradeDetail.tsx): phase stepper, options, items, edit dialog
- [x] Implement add upgrade form with budget input
- [x] Add spent amount tracking with visual progress
- [x] Implement status workflow (Planned → In Progress → Done)
- [x] Add file attachment support for plans/quotes
- [x] Display budget vs. spent comparison
- [x] Add cost breakdown by upgrade (per-item actual costs + option payments)

### Family Loan Tracking
- [x] Create loan list view with outstanding balance display
- [x] Implement add loan form with lender and amount
- [x] Add repayment logging functionality
- [x] Create loan detail view with repayment history
- [x] Display total borrowed, total repaid, and outstanding balance
- [ ] Implement repayment schedule visualization
- [x] Add edit/delete functionality for loans

### Wishlist Module
- [x] Create wishlist view with priority sorting
- [x] Implement add wishlist item form with cost and priority
- [x] Create wishlist item detail view with edit/delete options
- [x] Display total wishlist value and priority breakdown
- [ ] Add ability to convert wishlist items to upgrade projects
- [x] Implement wishlist filtering by priority

### Purchase Cost Tracker
- [x] Create purchase cost list view
- [x] Implement add purchase cost form with date and amount
- [x] Create purchase cost detail view with edit/delete options
- [x] Display total purchase costs and breakdown by category
- [x] Add file attachment support for invoices
- [ ] Display purchase cost timeline

### Calendar View
- [x] Create calendar component showing all events
- [x] Implement event filtering by type (expense, repair, loan, etc.)
- [x] Add event detail modal with linked entity information
- [x] Implement event creation from calendar view
- [ ] Add upcoming events sidebar
- [ ] Display event reminders (configurable days before)

### Property Settings & Map
- [x] Create property settings form with address, purchase price, details
- [x] Implement Google Map integration for property location
- [x] Add address search and geocoding
- [x] Display property details (square meters, rooms, year built, etc.)
- [x] Add currency and timezone configuration
- [x] Implement settings save and validation

### Multi-Profile Support
- [x] Implement profile list in sidebar
- [x] Add profile menu with list of household members
- [ ] Create profile management interface
- [ ] Implement per-entry ownership attribution with owner display on records
- [ ] Display profile info on all records
- [ ] Add profile-based filtering and views

## Phase 3: Advanced Features & Polish

### Data Management
- [ ] Implement data export functionality (CSV, JSON)
- [ ] Add data import for bulk operations
- [ ] Create backup and restore functionality
- [ ] Implement data validation and error handling

### Analytics & Reporting
- [ ] Create expense analytics dashboard
- [ ] Add spending trends visualization
- [ ] Implement budget vs. actual comparison
- [ ] Create maintenance cost analysis
- [ ] Add property value tracking

### Notifications & Reminders
- [ ] Implement reminder notifications for upcoming events
- [ ] Add expense due date reminders
- [ ] Create repair follow-up reminders
- [ ] Implement loan repayment reminders

### Mobile Optimization
- [x] Ensure responsive design for all modules
- [x] Optimize touch interactions for mobile
- [x] Implement mobile-friendly forms
- [x] Add mobile-specific navigation

### Testing & Quality
- [x] Write unit tests for backend procedures
- [ ] Write integration tests for critical flows
- [ ] Perform end-to-end testing
- [ ] Conduct accessibility audit
- [ ] Performance optimization and monitoring

## Deferred Features (Post-Launch)

- [ ] AI-powered expense categorization
- [ ] Predictive maintenance scheduling
- [ ] Property value estimation
- [ ] Integration with calendar apps (Google Calendar, Outlook)
- [ ] Mobile native apps (iOS/Android)
- [ ] Real estate market insights
- [ ] Contractor marketplace integration
- [ ] Insurance claim documentation
- [ ] Multi-property portfolio management
- [ ] Collaborative household notes
- [ ] Document storage and organization
- [ ] Property inspection checklists

## Bug Fixes (Critical)

- [x] **TiDB JSON default incompatibility** → `drizzle/0001` rewritten; `apply-migration-v3.mjs` added
- [x] **Missing database tables** → `apply-migration-v3.mjs` is idempotent, safe to re-run on any state
- [x] **Data not loading across entire app** → `server/db.ts` throws on missing DB instead of silently returning `[]`
- [x] **profileColor column error** → column removed from schema in updated migration 0001
- [x] **DashboardLayout placeholder navigation** → real module routes already implemented
- [x] **Empty relations.ts** → `drizzle/relations.ts` now has proper one/many definitions
- [x] **Dashboard NaN values** → added `?? 0` guards for `remaining`, `pct`, `repaid` fields on new server fields
- [x] **Dashboard not full-screen** → removed `max-w-5xl` constraint; layout now fills `SidebarInset`
- [x] **Sidebar active color hardcoded** → removed `text-primary` from active icon, now inherits from CSS vars
- [ ] **QA pass**: verify all tRPC procedures return real data with live `DATABASE_URL` after running `apply-migration-v3.mjs`
