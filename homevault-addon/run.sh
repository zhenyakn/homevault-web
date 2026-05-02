#!/usr/bin/env bash

# HA supervisor injects real values via the environment: block in config.yaml.
# Booleans may arrive as 'true', 'True', or '1' depending on supervisor version.

# Strip ?charset=... from DATABASE_URL - mysql2 doesn't accept it
RAW_DB_URL="${DATABASE_URL:-mysql://homeassistant:homeassistant@core-mariadb/homeassistant}"
export DATABASE_URL="${RAW_DB_URL%%\?*}"

export JWT_SECRET="${JWT_SECRET:-}"
export OWNER_OPEN_ID="${OWNER_OPEN_ID:-owner}"
export VITE_APP_ID="${VITE_APP_ID:-homevault}"
export OAUTH_SERVER_URL="${OAUTH_SERVER_URL:-}"
export PORT="${PORT:-3005}"
export HOST="0.0.0.0"
export NODE_ENV="production"

# Normalise NO_AUTH - accept true/True/1
NO_AUTH_RAW="${NO_AUTH:-false}"
if [[ "${NO_AUTH_RAW,,}" == "true" || "${NO_AUTH_RAW}" == "1" ]]; then
  export NO_AUTH="true"
else
  export NO_AUTH="false"
fi

# Normalise SEED_MOCK_DATA - accept true/True/1
SEED_RAW="${SEED_MOCK_DATA:-false}"
if [[ "${SEED_RAW,,}" == "true" || "${SEED_RAW}" == "1" ]]; then
  export SEED_MOCK_DATA="true"
else
  export SEED_MOCK_DATA="false"
fi

if [ -z "$JWT_SECRET" ]; then
    echo "[INFO] Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

echo "[INFO] Starting HomeVault Add-on on port ${PORT}..."
echo "[INFO] NO_AUTH raw value: '${NO_AUTH_RAW}' -> normalised: '${NO_AUTH}'"
echo "[INFO] SEED_MOCK_DATA: ${SEED_MOCK_DATA}"
echo "[INFO] DATABASE_URL (sanitized): ${DATABASE_URL}"

cd /app

echo "[INFO] Running unified database migration..."
if ! node apply-migration-addon.mjs; then
    echo "[ERROR] Database migration FAILED - check logs above. Addon will not start."
    exit 1
fi
echo "[INFO] Database migration completed."

if [ "${SEED_MOCK_DATA}" = "true" ]; then
    echo "[INFO] Seeding demo data..."
    if node dist/index.js --seed-mock-only; then
        echo "[INFO] Demo data seeded successfully."
    else
        echo "[WARN] Demo data seed failed - continuing startup anyway."
    fi
fi

exec node dist/index.js 2>&1
