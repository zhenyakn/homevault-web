#!/usr/bin/env bashio

set -e

# Read config with fallbacks in case Supervisor API is unavailable
export DATABASE_URL=$(bashio::config 'DATABASE_URL' 2>/dev/null || echo "")
export JWT_SECRET=$(bashio::config 'JWT_SECRET' 2>/dev/null || echo "")
export OWNER_OPEN_ID=$(bashio::config 'OWNER_OPEN_ID' 2>/dev/null || echo "owner")
export VITE_APP_ID=$(bashio::config 'VITE_APP_ID' 2>/dev/null || echo "homevault")
export OAUTH_SERVER_URL=$(bashio::config 'OAUTH_SERVER_URL' 2>/dev/null || echo "")
export PORT=$(bashio::config 'PORT' 2>/dev/null || echo "3005")
export HOST="0.0.0.0"
export NODE_ENV="production"

# Fallback for missing JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    bashio::log.info "Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

bashio::log.info "Starting HomeVault Add-on on port ${PORT}..."

cd /app

# Run database migrations
if [ -n "$DATABASE_URL" ]; then
    bashio::log.info "Running database migrations..."
    if node apply-migration-v3.mjs; then
        bashio::log.info "Database migrations completed."
    else
        bashio::log.warning "Database migration failed. Continuing anyway..."
    fi
fi

exec node dist/index.js
