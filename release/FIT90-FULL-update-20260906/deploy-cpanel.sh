#!/usr/bin/env bash
# FIT90 full code update for cPanel Terminal (non-root).
# This script deliberately does NOT restart PM2 and does NOT change the database.
set -euo pipefail

export PATH="/opt/cpanel/ea-nodejs20/bin:$PATH"

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${1:-}"

if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
  echo "Usage: bash deploy-cpanel.sh /home/CPANEL_USER/APP_DIRECTORY"
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: Existing app .env was not found at $APP_DIR/.env. Stopping."
  exit 1
fi

if [ ! -f "$SOURCE_DIR/backend/package.json" ] || [ ! -f "$SOURCE_DIR/frontend/package.json" ]; then
  echo "ERROR: The release folder is incomplete."
  exit 1
fi

if find "$SOURCE_DIR" -type f \( -name '.env' -o -name '.env.local' -o -name '.env.production' \) -print -quit | grep -q .; then
  echo "ERROR: The release contains an environment file. Stopping."
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "ERROR: Node.js 20 or newer is required. Current version: $(node -v 2>/dev/null || echo unavailable)"
  exit 1
fi

echo "==> [1/4] Building frontend with Node $(node -v)"
cd "$SOURCE_DIR/frontend"
npm ci --include=dev --no-audit --no-fund
npm run build

echo "==> [2/4] Copying backend source (database, .env, uploads, and node_modules are untouched)"
cp -a "$SOURCE_DIR/backend/." "$APP_DIR/"

echo "==> [3/4] Generating Prisma client and building backend"
cd "$APP_DIR"
if [ ! -x node_modules/.bin/nest ] || [ ! -x node_modules/.bin/prisma ]; then
  echo "ERROR: Existing backend dependencies are missing. Ask the root administrator to run npm install --include=dev here."
  exit 1
fi
npx prisma generate
npm run build

echo "==> [4/4] Publishing frontend assets"
mkdir -p "$APP_DIR/public"
cp -a "$SOURCE_DIR/frontend/dist/." "$APP_DIR/public/"

echo
echo "Code deployment finished. The live PM2 process has NOT been restarted."
echo "Give ROOT-PM2-COMMAND.txt to the root administrator, then test the website."
