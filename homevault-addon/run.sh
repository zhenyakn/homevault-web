#!/usr/bin/env bashio

# Strip ?charset=... from DATABASE_URL — mysql2 doesn't accept it as a URL param
RAW_DB_URL="${DATABASE_URL:-mysql://homeassistant:homeassistant@core-mariadb/homeassistant?charset=utf8mb4}"
export DATABASE_URL="${RAW_DB_URL%%\?*}"

export JWT_SECRET="${JWT_SECRET:-}"
export OWNER_OPEN_ID="${OWNER_OPEN_ID:-owner}"
export VITE_APP_ID="${VITE_APP_ID:-homevault}"
export OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-}"
export PORT="${PORT:-3005}"
export HOST="0.0.0.0"
export NODE_ENV="production"

# Read boolean options from addon config via bashio (env-block values are
# not guaranteed to arrive as the string "true" on all HA supervisor versions)
if bashio::config.true 'NO_AUTH'; then
  export NO_AUTH="true"
else
  export NO_AUTH="false"
fi

if bashio::config.true 'SEED_MOCK_DATA'; then
  export SEED_MOCK_DATA="true"
else
  export SEED_MOCK_DATA="false"
fi

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

# Seed demo data directly in Node before starting the HTTP server
if [ "${SEED_MOCK_DATA}" = "true" ]; then
    bashio::log.info "Seeding demo data (Florentin Apartment)..."
    if node dist/index.js --seed-mock-only; then
        bashio::log.info "Demo data seeded successfully."
    else
        bashio::log.warning "Demo data seed failed — continuing startup anyway."
    fi
fi

exec node dist/index.js 2>&1
