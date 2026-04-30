#!/usr/bin/env bash

set -euo pipefail

DATA_ENV_FILE="/data/homevault.env"
mkdir -p /data

if [[ -f "$DATA_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$DATA_ENV_FILE"
fi

# Home Assistant option values (if provided) should override persisted/generated defaults
DATABASE_URL="${DATABASE_URL:-${HOMEVAULT_DATABASE_URL:-}}"
JWT_SECRET="${JWT_SECRET:-${HOMEVAULT_JWT_SECRET:-}}"
OWNER_OPEN_ID="${OWNER_OPEN_ID:-${HOMEVAULT_OWNER_OPEN_ID:-}}"
VITE_APP_ID="${VITE_APP_ID:-${HOMEVAULT_APP_ID:-homevault}}"
OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-${HOMEVAULT_OAUTH_SERVER_URL:-}}"
BUILT_IN_FORGE_API_URL="${BUILT_IN_FORGE_API_URL:-${HOMEVAULT_FORGE_API_URL:-}}"
BUILT_IN_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY:-${HOMEVAULT_FORGE_API_KEY:-}}"
PORT="${PORT:-${HOMEVAULT_PORT:-3000}}"

# Generate missing secrets/IDs once and persist them in /data
if [[ -z "$JWT_SECRET" ]]; then
  JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi
if [[ -z "$OWNER_OPEN_ID" ]]; then
  OWNER_OPEN_ID="owner-$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

cat > "$DATA_ENV_FILE" <<ENV
HOMEVAULT_DATABASE_URL=${DATABASE_URL}
HOMEVAULT_JWT_SECRET=${JWT_SECRET}
HOMEVAULT_OWNER_OPEN_ID=${OWNER_OPEN_ID}
HOMEVAULT_APP_ID=${VITE_APP_ID}
HOMEVAULT_OAUTH_SERVER_URL=${OAUTH_SERVER_URL}
HOMEVAULT_FORGE_API_URL=${BUILT_IN_FORGE_API_URL}
HOMEVAULT_FORGE_API_KEY=${BUILT_IN_FORGE_API_KEY}
HOMEVAULT_PORT=${PORT}
ENV
chmod 600 "$DATA_ENV_FILE"

export NODE_ENV="production"
export DATABASE_URL JWT_SECRET OWNER_OPEN_ID VITE_APP_ID OAUTH_SERVER_URL BUILT_IN_FORGE_API_URL BUILT_IN_FORGE_API_KEY PORT

cd /app
exec node dist/index.js
