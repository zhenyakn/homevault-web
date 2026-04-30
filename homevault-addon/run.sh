#!/usr/bin/env bash

set -e

# Set environment variables from add-on options
export NODE_ENV="production"
export DATABASE_URL="${DATABASE_URL}"
export JWT_SECRET="${JWT_SECRET}"
export OWNER_OPEN_ID="${OWNER_OPEN_ID}"
export VITE_APP_ID="${VITE_APP_ID}"
export OAUTH_SERVER_URL="${OAUTH_SERVER_URL}"
export BUILT_IN_FORGE_API_URL="${BUILT_IN_FORGE_API_URL}"
export BUILT_IN_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY}"
export PORT="${PORT}"

# Navigate to the application directory
cd /app

# Start the HomeVault application
exec node dist/index.js
