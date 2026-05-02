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
