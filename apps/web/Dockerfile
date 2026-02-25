FROM node:22-alpine AS builder

RUN apk upgrade --no-cache

WORKDIR /app

# Enable corepack so the exact pnpm version from packageManager field is used
RUN corepack enable

# Copy workspace package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Optional: pass --build-arg NPM_TOKEN=xxx to authenticate with npm registry
ARG NPM_TOKEN=""

# Install dependencies (cache the pnpm store across builds)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    if [ -n "$NPM_TOKEN" ]; then \
        echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> ~/.npmrc; \
    fi && \
    pnpm config set fetching-concurrency 8 --global && \
    pnpm config set fetch-retries 5 --global && \
    pnpm config set fetch-retry-mintimeout 10000 --global && \
    pnpm install --frozen-lockfile --filter @monke-say/web...

# Copy source code
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Accept build args
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build web app
WORKDIR /app/apps/web
RUN pnpm build

# Production image
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
