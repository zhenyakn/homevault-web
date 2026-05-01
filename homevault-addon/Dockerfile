# Global ARG must be declared before the first FROM to be used in any FROM instruction
ARG BUILD_ARCH=amd64

# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install all dependencies (dev included — needed for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build client (Vite) + server (esbuild)
RUN pnpm build

# Production stage
# Re-declare the ARG so it can be used in the FROM instruction
ARG BUILD_ARCH
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.16

# Install Node.js and pnpm
RUN \
    apk add --no-cache \
        nodejs-current \
        npm \
        bash \
    && npm install -g pnpm@8.15.9

WORKDIR /app

# Copy only what's needed at runtime
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY drizzle.config.ts ./
COPY drizzle ./drizzle

# Install production dependencies + drizzle-kit for migrations
RUN pnpm install --frozen-lockfile --prod

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apply-migration-v3.mjs ./

# Copy the run script
COPY homevault-addon/run.sh /run.sh
RUN chmod a+x /run.sh

# Home Assistant Labels
LABEL \
    io.hass.name="HomeVault" \
    io.hass.description="Property management solution for Home Assistant" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="0.1.4"

# Healthcheck using node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3005/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["/run.sh"]
