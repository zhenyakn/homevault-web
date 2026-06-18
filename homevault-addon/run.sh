#!/usr/bin/env bash

# HA supervisor writes the addon config to /data/options.json.
# The environment: block does NOT substitute {{placeholders}} for boolean
# or integer schema types, so we read everything directly from options.json.

OPTIONS="/data/options.json"

RAW_DB_URL=$(jq -r '.DATABASE_URL // "mysql://homeassistant:homeassistant@core-mariadb/homeassistant"' "$OPTIONS")
export DATABASE_URL="${RAW_DB_URL%%\?*}"

export JWT_SECRET=$(jq -r '.JWT_SECRET // ""' "$OPTIONS")
export OWNER_OPEN_ID=$(jq -r '.OWNER_OPEN_ID // "owner"' "$OPTIONS")
export VITE_APP_ID=$(jq -r '.VITE_APP_ID // "homevault"' "$OPTIONS")
export OAUTH_SERVER_URL=$(jq -r '.OAUTH_SERVER_URL // ""' "$OPTIONS")
export PORT=$(jq -r '.PORT // 3005' "$OPTIONS")
export HOST="0.0.0.0"
export NODE_ENV="production"
# The Home Assistant add-on is always a single-install, non-billable deployment.
# Pin standalone mode so every capability is included and no SAAS-only paths
# (native registration, plan gating, billing UI) ever engage — regardless of
# the compiled default. Not exposed as an add-on option on purpose; SAAS also
# requires NO_AUTH=false + authenticated tenants, which the add-on isn't.
export APP_MODE="standalone"
# Silence the DEP0040 punycode deprecation warning. It originates from a deep
# transitive dependency (grammy -> node-fetch@2 -> whatwg-url/tr46) that still
# require()s Node's built-in `punycode`. There is no clean upgrade path
# (node-fetch@3 is ESM-only and breaks grammy), so we suppress only this one
# deprecation code rather than all warnings. Applies to every `node` call below.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=DEP0040"
# The add-on migrates below via apply-migration-addon.mjs, so disable the
# server's boot-time auto-migration to avoid running both mechanisms.
export AUTO_MIGRATE="false"
export LOG_LEVEL=$(jq -r '.LOG_LEVEL // "info"' "$OPTIONS")
export STORAGE_ENDPOINT=$(jq -r '.STORAGE_ENDPOINT // ""' "$OPTIONS")
export STORAGE_BUCKET=$(jq -r '.STORAGE_BUCKET // ""' "$OPTIONS")
export STORAGE_REGION=$(jq -r '.STORAGE_REGION // "auto"' "$OPTIONS")
export STORAGE_ACCESS_KEY_ID=$(jq -r '.STORAGE_ACCESS_KEY_ID // ""' "$OPTIONS")
export STORAGE_SECRET_ACCESS_KEY=$(jq -r '.STORAGE_SECRET_ACCESS_KEY // ""' "$OPTIONS")
export STORAGE_PUBLIC_URL=$(jq -r '.STORAGE_PUBLIC_URL // ""' "$OPTIONS")

# Read booleans as true/false strings
if [ "$(jq -r '.NO_AUTH // false' "$OPTIONS")" = "true" ]; then
  export NO_AUTH="true"
else
  export NO_AUTH="false"
fi

if [ "$(jq -r '.SEED_MOCK_DATA // false' "$OPTIONS")" = "true" ]; then
  export SEED_MOCK_DATA="true"
else
  export SEED_MOCK_DATA="false"
fi

if [ -z "$JWT_SECRET" ]; then
    echo "[INFO] Generating random JWT_SECRET..."
    export JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi

echo "[INFO] Starting HomeVault Add-on on port ${PORT}..."
echo "[INFO] NO_AUTH mode: ${NO_AUTH}"
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
