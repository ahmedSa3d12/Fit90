#!/usr/bin/env bash
# FIT90 safe incremental update — SPA and personal-training scheduling.
# Usage: bash deploy.sh /home/CPANEL_USER/APP_DIRECTORY
#
# This update intentionally does NOT import the database, seed data, run
# prisma db push, replace .env, or copy uploads.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${1:-}"

if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
  echo "Usage: bash deploy.sh /home/CPANEL_USER/APP_DIRECTORY"
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: Existing app .env was not found at $APP_DIR/.env. Stopping without changes."
  exit 1
fi

if [ ! -f "$SOURCE_DIR/backend/package.json" ] || [ ! -f "$SOURCE_DIR/frontend/package.json" ]; then
  echo "ERROR: This folder is not a complete FIT90 update package."
  exit 1
fi

if find "$SOURCE_DIR" -type f -name '.env*' ! -name '.env.example' -print -quit | grep -q .; then
  echo "ERROR: Update package contains an environment file. Stopping without changes."
  exit 1
fi

echo "==> [1/5] Building frontend from the uploaded source"
cd "$SOURCE_DIR/frontend"
npm ci --include=dev
npm run build

echo "==> [2/5] Copying backend update"
cp -a "$SOURCE_DIR/backend/." "$APP_DIR/"

echo "==> [3/5] Installing backend dependencies without changing package.json"
cd "$APP_DIR"
npm ci --include=dev

echo "==> [4/5] Generating Prisma client and building backend"
npx prisma generate
npm run build

echo "==> [5/5] Publishing frontend assets and restarting Passenger"
mkdir -p "$APP_DIR/public"
cp -a "$SOURCE_DIR/frontend/dist/." "$APP_DIR/public/"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

echo ""
echo "Update completed safely. Database, .env, and uploads were not changed."
echo "If your cPanel Node.js App does not restart automatically, click Restart in Setup Node.js App."
