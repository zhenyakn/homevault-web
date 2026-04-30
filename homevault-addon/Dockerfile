# Build stage
FROM node:22-alpine AS builder

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

# Production stage for the Add-on
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only what's needed at runtime
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apply-migration-v3.mjs ./

# Copy the run script
COPY homevault-addon/run.sh /run.sh
RUN chmod a+x /run.sh

# Non-root user for security
RUN addgroup -S homevault && adduser -S homevault -G homevault
RUN chown -R homevault:homevault /app
USER homevault

EXPOSE 3000

CMD ["/bin/bash", "/run.sh"]
