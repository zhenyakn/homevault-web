#!/usr/bin/env bashio

export DATABASE_URL="${DATABASE_URL:-mysql://homeassistant:homeassistant@core-mariadb/homeassistant?charset=utf8mb4}"
export JWT_SECRET="${JWT_SECRET:-}"
export OWNER_OPEN_ID="${OWNER_OPEN_ID:-owner}"
export VITE_APP_ID="${VITE_APP_ID:-homevault}"
export OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-}"
export NO_AUTH="${NO_AUTH:-true}"
export PORT="${PORT:-3005}"
export HOST="0.0.0.0"
export NODE_ENV="production"

if [ -z "$JWT_SECRET" ]; then
    bashio::log.info "Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

bashio::log.info "Starting HomeVault Add-on on port ${PORT}..."
bashio::log.info "NO_AUTH mode: ${NO_AUTH}"

cd /app

if [ -n "$DATABASE_URL" ]; then
    bashio::log.info "Running database migrations..."
    if node apply-migration-v3.mjs && node apply-migration-v4.mjs && node apply-migration-v5.mjs; then
        bashio::log.info "Database migrations completed."
    else
        bashio::log.warning "Database migration failed. Continuing anyway..."
    fi
fi

exec node dist/index.js 2>&1
