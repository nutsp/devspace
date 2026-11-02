#!/bin/sh
set -eu
cd "$(dirname "$0")"
VITE_LIVE_BASE_PATH=/live VITE_ADMIN_BASE_PATH=/god-mode VITE_SPACE_BASE_PATH=/spaces pnpm exec turbo run build --filter=web
docker build -f Dockerfile.app-rail -t plane-community-workspace-rail:v1.4.3-local apps/web/build/client
docker build -f Dockerfile.wiki-api -t plane-community-wiki-api:v1.4.3-local .
docker build -f Dockerfile.mermaid-live -t plane-community-mermaid-live:v1.4.3-local packages/editor/dist
