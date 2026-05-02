#!/usr/bin/env bashio

# Strip ?charset=... from DATABASE_URL — mysql2 doesn't accept it as a URL param
RAW_DB_URL="${DATABASE_URL:-mysql://homeassistant:homeassistant@core-mariadb/homeassistant?charset=utf8mb4}"
export DATABASE_URL="${RAW_DB_URL%%\?*}"

export JWT_SECRET="${JWT_SECRET:-}"
export OWNER_OPEN_ID="${OWNER_OPEN_ID:-owner}"
export VITE_APP_ID="${VITE_APP_ID:-homevault}"
export OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-}"
export NO_AUTH="${NO_AUTH:-true}"
export SEED_MOCK_DATA="${SEED_MOCK_DATA:-false}"
export PORT="${PORT:-3005}"
export HOST="0.0.0.0"
export NODE_ENV="production"

if [ -z "$JWT_SECRET" ]; then
    bashio::log.info "Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

bashio::log.info "Starting HomeVault Add-on on port ${PORT}..."
bashio::log.info "NO_AUTH mode: ${NO_AUTH}"
bashio::log.info "SEED_MOCK_DATA: ${SEED_MOCK_DATA}"
bashio::log.info "DATABASE_URL (sanitized): ${DATABASE_URL}"

cd /app

bashio::log.info "Running unified database migration..."
if ! node apply-migration-addon.mjs; then
    bashio::log.error "Database migration FAILED — check logs above. Addon will not start."
    exit 1
fi
bashio::log.info "Database migration completed."

# Start server in background so we can run the seed, then keep it alive
node dist/index.js 2>&1 &
SERVER_PID=$!

# Wait for the server to become healthy (up to 30s)
bashio::log.info "Waiting for server to become healthy..."
ATTEMPTS=0
until curl -sf "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ $ATTEMPTS -ge 30 ]; then
        bashio::log.warning "Server did not become healthy in 30s — continuing anyway"
        break
    fi
    sleep 1
done

if curl -sf "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
    bashio::log.info "Server is healthy."

    # Auto-seed demo data if requested
    if [ "${SEED_MOCK_DATA}" = "true" ]; then
        bashio::log.info "SEED_MOCK_DATA=true — seeding demo property (Florentin Apartment)..."

        # Warm up the session cookie via the NO_AUTH middleware
        curl -sf "http://127.0.0.1:${PORT}/api/trpc/auth.me?batch=1&input=%7B%7D" \
            -c /tmp/hv_cookies.txt -b /tmp/hv_cookies.txt > /dev/null 2>&1 || true

        # Call the seedMock tRPC mutation
        SEED_RESULT=$(curl -sf -X POST \
            "http://127.0.0.1:${PORT}/api/trpc/data.seedMock?batch=1" \
            -H "Content-Type: application/json" \
            -d '{"0":{"json":null,"meta":{"values":["undefined"]}}}' \
            -b /tmp/hv_cookies.txt \
            -c /tmp/hv_cookies.txt 2>&1 || echo "SEED_FAILED")

        rm -f /tmp/hv_cookies.txt

        if echo "${SEED_RESULT}" | grep -q '"result"'; then
            bashio::log.info "Demo data seeded successfully."
        else
            bashio::log.warning "Seed returned unexpected response: ${SEED_RESULT}"
        fi
    fi
fi

# Wait on the server process — keeps the addon alive
wait ${SERVER_PID}
