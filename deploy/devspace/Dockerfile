# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
ENV VITE_LIVE_BASE_PATH=/live VITE_ADMIN_BASE_PATH=/god-mode VITE_SPACE_BASE_PATH=/spaces
RUN apk add --no-cache libc6-compat && corepack enable
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
ARG VITE_WEB_BASE_URL=http://localhost:8089
ENV VITE_WEB_BASE_URL=$VITE_WEB_BASE_URL
RUN pnpm exec turbo run build --filter=web --filter=admin --concurrency=1

FROM makeplane/plane-frontend:v1.4.3 AS web
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/web/build/client/ /usr/share/nginx/html/

FROM makeplane/plane-live:v1.4.3 AS live
COPY --from=builder /app/packages/editor/dist/ /app/packages/editor/dist/

FROM makeplane/plane-admin:v1.4.3 AS admin
RUN rm -rf /usr/share/nginx/html/god-mode/*
COPY --from=builder /app/apps/admin/build/client/ /usr/share/nginx/html/god-mode/
