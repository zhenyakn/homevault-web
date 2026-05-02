# HomeVault: Your Property, Mastered.

## Overview

HomeVault is a powerful, open-source property management platform designed to give you complete control and insight into your real estate investments. Whether you're a homeowner, landlord, or property manager, HomeVault provides intuitive tools to track expenses, manage repairs, plan upgrades, monitor loans, and organize your property's entire lifecycle. Say goodbye to spreadsheets and scattered documents – with HomeVault, everything you need is in one secure, accessible place.

## Key Features

### Dashboard: Your Property at a Glance

The HomeVault dashboard provides a comprehensive overview of your property's financial health and upcoming events. Quickly see overdue expenses, track monthly spending against your baseline, and get a snapshot of active upgrades and outstanding loans.

![Dashboard Screenshot](./screenshots/01-dashboard.webp)

### Expenses: Track Every Penny

Effortlessly log and categorize all your property-related expenses. From recurring mortgage payments and HOA fees to one-time maintenance costs, HomeVault helps you keep a detailed financial record. Filter by category, mark payments as paid, and export your data for easy accounting.

![Expenses Screenshot](./screenshots/02-expenses.webp)

### Repairs: Stay on Top of Maintenance

Manage all your property repairs with ease. Log new issues, track their status (open, in progress, resolved), assign priorities, and keep notes on contractors and estimated costs. Never let a maintenance issue fall through the cracks again.

![Repairs Screenshot](./screenshots/03-repairs.webp)

### Upgrades: Plan and Execute Renovations

Plan and track property upgrades and renovations from start to finish. Monitor active projects, see your budget allocation, and keep tabs on individual items within each upgrade. HomeVault helps you visualize progress and manage your investment in property improvements.

![Upgrades Screenshot](./screenshots/04-upgrades.webp)

### Loans: Comprehensive Debt Management

Keep a clear record of all loans associated with your property. Track total borrowed, amounts repaid, and outstanding balances. Monitor repayment history and understand your debt progression over time.

![Loans Screenshot](./screenshots/05-loans.webp)

### Wishlist: Dream Big, Plan Smart

Curate a wishlist of future purchases or improvements for your property. Prioritize items, estimate costs, and keep track of potential additions to your home. HomeVault helps you plan for the future, one item at a time.

![Wishlist Screenshot](./screenshots/06-wishlist.webp)

### Calendar: Never Miss an Event

Visualize all your property-related events, appointments, and deadlines in one integrated calendar. From scheduled maintenance to payment due dates, HomeVault ensures you're always informed and prepared.

![Calendar Screenshot](./screenshots/07-calendar.webp)

### Settings: Customize Your HomeVault Experience

Tailor HomeVault to your specific needs. Manage property details, configure regional settings, set up notifications, and handle data management. HomeVault puts customization at your fingertips.

![Settings Screenshot](./screenshots/08-settings.webp)

## Technical Details

### Local Deployment

To run HomeVault locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/zhenyakn/homevault-web.git
    cd homevault-web
    ```

2.  **Install dependencies:**
    HomeVault uses `pnpm` as its package manager. If you don't have it installed, you can install it via npm:
    ```bash
    npm install -g pnpm
    pnpm install
    ```

3.  **Set up the database:**
    HomeVault uses MySQL. Ensure you have a MySQL server running and create a database and user for HomeVault. For example:
    ```bash
    sudo service mysql start
    sudo mysql -e "CREATE DATABASE IF NOT EXISTS homevault;"
    sudo mysql -e "CREATE USER IF NOT EXISTS 'homevault'@'localhost' IDENTIFIED BY 'password';"
    sudo mysql -e "GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost';"
    sudo mysql -e "FLUSH PRIVILEGES;"
    ```

4.  **Configure environment variables:**
    Create a `.env` file in the root of the project with the following content:
    ```dotenv
    DATABASE_URL="mysql://homevault:password@localhost:3306/homevault"
    JWT_SECRET="your_secret_key_here" # Replace with a strong, random secret
    OWNER_OPEN_ID="owner" # Or your preferred owner ID
    NO_AUTH="true" # Set to true for local development without OAuth
    SEED_MOCK_DATA="true" # Set to true to seed mock data on startup
    ```

5.  **Run database migrations:**
    ```bash
    pnpm drizzle-kit push
    ```

6.  **Seed mock data (optional, but recommended for demonstration):**
    ```bash
    pnpm tsx server/_core/index.ts --seed-mock-only
    ```

7.  **Build the client and start the server:**
    ```bash
    pnpm build
    pnpm start
    ```
    The application will be available at `http://localhost:3005`.

### Home Assistant Add-on Deployment

*(Details for Home Assistant Add-on deployment will be added here once available or can be derived from the `homevault-addon` directory.)*

## Contributing

We welcome contributions! Please see our `CONTRIBUTING.md` for more details.

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
