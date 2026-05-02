# Global ARGs must be declared before the first FROM
ARG BUILD_ARCH=amd64
ARG BUILD_VERSION

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install ALL dependencies (dev included — needed for build & vite runtime import)
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ── Production stage ───────────────────────────────────────────────────────────
ARG BUILD_ARCH
ARG BUILD_VERSION
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.21

# Install Node.js and bash (runtime only, no pnpm/npm needed)
RUN apk add --no-cache nodejs bash

WORKDIR /app

# Copy built output and full node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy migration scripts
COPY --from=builder /app/apply-migration-v3.mjs ./apply-migration-v3.mjs
COPY --from=builder /app/apply-migration-v4.mjs ./apply-migration-v4.mjs
COPY --from=builder /app/apply-migration-v5.mjs ./apply-migration-v5.mjs
COPY --from=builder /app/apply-migration-addon.mjs ./apply-migration-addon.mjs

# Copy drizzle schema folder, if used by runtime
COPY drizzle ./drizzle

# Copy the run script
COPY homevault-addon/run.sh /run.sh
RUN chmod a+x /run.sh

# Home Assistant labels
ENV BUILD_VERSION="${BUILD_VERSION}"

LABEL \
    io.hass.name="HomeVault" \
    io.hass.description="Property management solution for Home Assistant" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    org.opencontainers.image.title="HomeVault" \
    org.opencontainers.image.description="Property management solution for Home Assistant" \
    org.opencontainers.image.vendor="Home Assistant Add-ons" \
    org.opencontainers.image.authors="Evgeni Konstantinovsky" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/zhenyakn/homevault-web" \
    org.opencontainers.image.source="https://github.com/zhenyakn/homevault-web" \
    org.opencontainers.image.documentation="https://github.com/zhenyakn/homevault-web/blob/main/README.md"

# Healthcheck uses the built-in /health endpoint on the ingress port
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3005/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["/run.sh"]
