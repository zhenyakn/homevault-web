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
- [x] Upgrades table with budget vs. spent tracking
- [x] Loans table with repayment history
- [x] WishlistItems table with priority and cost estimates
- [x] PurchaseCosts table for acquisition expenses
- [x] CalendarEvents table for event management
- [x] Property settings configuration

### Backend Setup
- [x] tRPC router for expenses (create, read, update, delete, list)
- [x] tRPC router for repairs (create, read, update, delete, list)
- [x] tRPC router for upgrades (create, read, update, delete, list)
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

### Dashboard Overview
- [x] Create KPI grid showing purchase total, monthly recurring, YTD expenses, pending repairs, upgrades spent, wishlist total
- [x] Display upcoming events section (next 30 days)
- [x] Show household members and their activity
- [x] Implement Google Map showing property location
- [x] Add quick action buttons for common tasks

### Expense Tracking Module
- [x] Create expense list view with filters by category and date range
- [x] Implement add expense form with category selection
- [x] Add recurring expense toggle and frequency options
- [x] Implement mark-as-paid action with date tracking
- [x] Create expense detail view with edit/delete options
- [x] Add file attachment support for receipts
- [ ] Display monthly expense summary and trends
- [x] Export expense data to CSV

### Repair Log Module
- [x] Create repair list view with status and priority filters
- [x] Implement add repair form with priority selection
- [x] Add contractor assignment functionality
- [x] Create repair status workflow (Pending → In Progress → Resolved)
- [x] Implement repair detail view with edit/delete options
- [x] Add file attachment support for photos/quotes
- [ ] Display repair timeline and history
- [x] Add cost tracking for repairs

### Upgrade Project Tracking
- [x] Create upgrade list view with status filters
- [x] Implement add upgrade form with budget input
- [x] Add spent amount tracking with visual progress
- [x] Create upgrade detail view with edit/delete options
- [x] Implement status workflow (Planned → In Progress → Done)
- [ ] Add file attachment support for plans/quotes
- [x] Display budget vs. spent comparison
- [ ] Add cost breakdown by upgrade

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
- [ ] Add file attachment support for invoices
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
- [x] Fix data not loading across entire app (dashboard, expenses, all modules)
- [x] Fix database query errors (profileColor column, ownerId type mismatch)
- [x] Ensure all tRPC procedures return data correctly
- [x] Fix missing database tables (migration not applied)
- [x] Fix TiDB JSON default incompatibility
- [x] Fix DashboardLayout showing placeholder Page 1/Page 2 instead of real navigation
