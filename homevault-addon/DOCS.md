# HomeVault Home Assistant Add-on

HomeVault is a comprehensive property management solution for homeowners and small investors, now integrated directly into your Home Assistant instance.

## Installation

1. Add this repository URL to your Home Assistant Add-on Store.
2. Find "HomeVault" in the store and click **Install**.
3. Once installed, go to the **Configuration** tab.

## Configuration

The add-on requires a database to store your property data. It is highly recommended to use the **MariaDB Add-on** available in the official Home Assistant store.

### Options:

- `DATABASE_URL`: The connection string for your MySQL/MariaDB database.
  - Default: `mysql://homeassistant:homeassistant@core-mariadb/homeassistant?charset=utf8mb4` (Works out-of-the-box with the official MariaDB add-on).
- `JWT_SECRET`: A secret key for session management. If left empty, one will be generated automatically.
- `OWNER_OPEN_ID`: The unique ID for the primary owner. Default is `owner`.
- `PORT`: The internal port the application runs on (Default: `3005`).

## Usage

1. Start the add-on.
2. Click **Open Web UI** or find **HomeVault** in your Home Assistant sidebar.
3. On first run, the add-on will automatically initialize the database schema.

## Data & Backups

Your configuration and generated secrets are persisted in the `/data` partition of the add-on. Your actual property data resides in the database you provided in the `DATABASE_URL`. Ensure you include your database in your regular Home Assistant backups.

## Support

For issues related to the application logic, please visit the [GitHub Repository](https://github.com/zhenyakn/homevault-web).
