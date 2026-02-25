FROM node:22-alpine AS builder

RUN apk upgrade --no-cache

WORKDIR /app

# Enable corepack so the exact pnpm version from packageManager field is used
RUN corepack enable

# Copy workspace package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Optional: pass --build-arg NPM_TOKEN=xxx to authenticate with npm registry
# (avoids rate-limiting on unauthenticated tarball fetches)
ARG NPM_TOKEN=""

# Install dependencies (cache the pnpm store across builds)
# Reduce concurrency to avoid npm rate-limiting; add retries for transient failures
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    if [ -n "$NPM_TOKEN" ]; then \
        echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> ~/.npmrc; \
    fi && \
    pnpm config set fetching-concurrency 8 --global && \
    pnpm config set fetch-retries 5 --global && \
    pnpm config set fetch-retry-mintimeout 10000 --global && \
    pnpm install --frozen-lockfile --filter @monke-say/api...

# Copy source code
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build API
WORKDIR /app/apps/api
RUN pnpm build

# Create standalone deployment with production dependencies
RUN pnpm --filter @monke-say/api deploy --prod --legacy /deploy

# Production stage
FROM node:22-alpine

RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/drizzle ./drizzle
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./

EXPOSE 8000

CMD ["node", "dist/index.js"]
