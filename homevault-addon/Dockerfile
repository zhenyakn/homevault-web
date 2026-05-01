# Global ARG must be declared before the first FROM to be used in any FROM instruction
ARG BUILD_ARCH=amd64

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install ALL dependencies (dev included — needed for build)
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Prune to production deps only AFTER build
RUN pnpm prune --prod

# ── Production stage ───────────────────────────────────────────────────────────
ARG BUILD_ARCH
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.21

# Install Node.js only (no npm/pnpm needed at runtime)
RUN apk add --no-cache nodejs bash

WORKDIR /app

# Copy built output and pruned node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apply-migration-v3.mjs ./
COPY drizzle ./drizzle

# Copy the run script
COPY homevault-addon/run.sh /run.sh
RUN chmod a+x /run.sh

# Home Assistant Labels
LABEL \
    io.hass.name="HomeVault" \
    io.hass.description="Property management solution for Home Assistant" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="0.1.6"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3005/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["/run.sh"]
