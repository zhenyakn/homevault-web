# 🏠 HomeVault

**HomeVault** is a comprehensive, open-source property management platform designed to centralize everything about your home. From financial tracking to maintenance logs and future planning, HomeVault provides a unified dashboard to master your property's lifecycle.

---

## ✨ Key Features

### 📊 Intelligent Dashboard
Get a high-level overview of your property's health. Monitor overdue expenses, monthly spending baselines, active upgrades, and loan statuses in a single, beautiful view.
![Dashboard](./screenshots/01-dashboard.png)

### 💸 Expense Management
Track every cent spent on your property. Categorize expenses like mortgages, utilities, and taxes. Support for recurring payments ensures you never miss a baseline cost.
![Expenses](./screenshots/02-expenses.png)

### 🛠️ Maintenance & Repairs
Log issues, assign priorities, and track repair status from "Assessment" to "Resolved." Keep a detailed history of contractors and costs to maintain your property's value.
![Repairs](./screenshots/03-repairs.png)

### 🚀 Property Upgrades
Plan renovations with precision. Manage project budgets, track actual spending, and monitor progress across planning, sourcing, and building phases.
![Upgrades](./screenshots/04-upgrades.png)

### 🏦 Loan Tracking
Stay on top of your property debt. Monitor multiple loans, track repayment history, and visualize your progress toward full ownership.
![Loans](./screenshots/05-loans.png)

### 📋 Wishlist & Planning
Dream and plan for the future. Keep a prioritized list of desired purchases or improvements with estimated costs and priority levels.
![Wishlist](./screenshots/06-wishlist.png)

### 📅 Integrated Calendar
A unified view of all property events. See upcoming maintenance, delivery dates, and expense deadlines in a clean, interactive calendar.
![Calendar](./screenshots/07-calendar.png)

---

## 🛠️ Technical Setup

### Local Deployment

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/zhenyakn/homevault-web.git
    cd homevault-web
    ```

2.  **Install Dependencies**
    HomeVault uses `pnpm`. If you don't have it, install it via `npm install -g pnpm`.
    ```bash
    pnpm install
    ```

3.  **Database Configuration**
    HomeVault requires a MySQL database. Create a database and user:
    ```sql
    CREATE DATABASE homevault;
    CREATE USER 'homevault'@'localhost' IDENTIFIED BY 'your_password';
    GRANT ALL PRIVILEGES ON homevault.* TO 'homevault'@'localhost';
    ```

4.  **Environment Variables**
    Create a `.env` file in the root:
    ```env
    DATABASE_URL="mysql://homevault:your_password@localhost:3306/homevault"
    JWT_SECRET="your_random_secret"
    NO_AUTH="true" # For local development without OAuth
    ```

5.  **Initialize Database**
    ```bash
    pnpm drizzle-kit push
    ```

6.  **Run the App**
    ```bash
    pnpm build
    pnpm start
    ```
    Access the app at `http://localhost:3005`.

### Home Assistant Add-on
HomeVault can be deployed as a Home Assistant add-on. Refer to the `homevault-addon` directory for specific configuration and installation steps.

---

## 🤝 Contributing
Contributions are welcome! Please check our issues page or submit a pull request.

## 📄 License
This project is licensed under the **HomeVault Personal Use License**. It is free for personal, non-commercial use. Commercial use, redistribution for profit, or incorporation into paid products is strictly prohibited. See the [LICENSE](./LICENSE) file for full details.
