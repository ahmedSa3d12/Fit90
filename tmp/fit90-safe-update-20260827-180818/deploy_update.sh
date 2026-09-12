#!/usr/bin/env bash
# FIT90 safe incremental update for an existing cPanel deployment.
# Run: bash deploy_update.sh /home/CPANEL_USER/APP_DIRECTORY
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${1:-}"

if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
  echo "Usage: bash deploy_update.sh /home/CPANEL_USER/APP_DIRECTORY"
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: Existing app .env was not found at $APP_DIR/.env. Stopping without changes."
  exit 1
fi

if [ -e "$SOURCE_DIR/backend/.env" ] || [ -e "$SOURCE_DIR/frontend/.env" ]; then
  echo "ERROR: Update package must not contain .env files. Stopping without changes."
  exit 1
fi

echo "==> Building updated frontend"
cd "$SOURCE_DIR/frontend"
if [ ! -x node_modules/.bin/vite ] || [ ! -x node_modules/.bin/tsc ]; then
  echo "    Frontend build tools are missing; installing dependencies once."
  npm install --include=dev
fi
npm run build

echo "==> Copying backend update without changing .env, uploads, or the database"
cp -a "$SOURCE_DIR/backend/." "$APP_DIR/"

echo "==> Installing backend dependencies only when build tools are missing"
cd "$APP_DIR"
if [ ! -x node_modules/.bin/nest ] || [ ! -x node_modules/.bin/prisma ]; then
  npm install --include=dev
fi

echo "==> Generating Prisma client and building backend"
npx prisma generate
npm run build

echo "==> Publishing updated frontend assets"
mkdir -p "$APP_DIR/public"
cp -a "$SOURCE_DIR/frontend/dist/." "$APP_DIR/public/"

echo "==> Requesting Passenger restart"
mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"

echo "Update completed safely. No database import, seed, db push, .env, or uploads were changed."
