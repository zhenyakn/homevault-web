#!/usr/bin/env bashio

set -e

# Use bashio to get configuration options from Home Assistant
export DATABASE_URL=$(bashio::config 'DATABASE_URL')
export JWT_SECRET=$(bashio::config 'JWT_SECRET')
export OWNER_OPEN_ID=$(bashio::config 'OWNER_OPEN_ID')
export VITE_APP_ID=$(bashio::config 'VITE_APP_ID')
export PORT=$(bashio::config 'PORT')
export NODE_ENV="production"

# Fallback for missing secrets
if ! bashio::config.has_value 'JWT_SECRET'; then
    bashio::log.info "Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

bashio::log.info "Starting HomeVault Add-on..."

cd /app

# Run database migrations
if [ -n "$DATABASE_URL" ]; then
    bashio::log.info "Running database migrations..."
    if npx drizzle-kit push; then
        bashio::log.info "Database migrations completed."
    else
        bashio::log.warning "Database migration failed. Checking connection..."
    fi
fi

bashio::log.info "Starting Node.js application on port ${PORT}..."
exec node dist/index.js
