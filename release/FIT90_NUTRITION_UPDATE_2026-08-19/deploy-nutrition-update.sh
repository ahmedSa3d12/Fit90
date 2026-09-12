#!/usr/bin/env bash
# Safe FIT90 nutrition-only production update.
# Usage: bash deploy-nutrition-update.sh /absolute/path/to/fit90-app
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="${1:?Usage: bash deploy-nutrition-update.sh /absolute/path/to/fit90-app}"
APP_ROOT="$(cd "$APP_ROOT" && pwd)"

if [ ! -f "$APP_ROOT/package.json" ]; then
  echo "ERROR: package.json was not found in $APP_ROOT"
  exit 1
fi

if [ ! -f "$APP_ROOT/.env" ]; then
  echo "ERROR: .env was not found in $APP_ROOT. Stop and configure production .env first."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$APP_ROOT/backups/nutrition-$STAMP"
mkdir -p "$BACKUP_DIR" "$APP_ROOT/prisma/migrations" "$APP_ROOT/tmp"

echo "==> Backing up current application files to $BACKUP_DIR"
for ITEM in dist public prisma/schema.prisma; do
  if [ -e "$APP_ROOT/$ITEM" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$ITEM")"
    cp -a "$APP_ROOT/$ITEM" "$BACKUP_DIR/$ITEM"
  fi
done

echo "==> Installing nutrition Prisma schema and migrations"
cp -a "$PATCH_DIR/files/prisma/schema.prisma" "$APP_ROOT/prisma/schema.prisma"
cp -a "$PATCH_DIR/files/prisma/migrations/." "$APP_ROOT/prisma/migrations/"

cd "$APP_ROOT"
echo "==> Checking Prisma migration history"
MIGRATION_STATUS="$(npx prisma migrate status 2>&1 || true)"
if printf '%s\n' "$MIGRATION_STATUS" | grep -q '20260702150000_club_events_phase1'; then
  echo "ERROR: This database has no Prisma migration history."
  echo "Do not continue with this script. Send the Terminal output to the developer first."
  exit 1
fi

echo "==> Applying database migrations (does not import or reset the database)"
npx prisma migrate deploy

echo "==> Updating Prisma client"
npx prisma generate

echo "==> Updating compiled backend and frontend"
mkdir -p "$APP_ROOT/dist" "$APP_ROOT/public"
cp -a "$PATCH_DIR/files/dist/." "$APP_ROOT/dist/"
cp -a "$PATCH_DIR/files/public/." "$APP_ROOT/public/"

touch "$APP_ROOT/tmp/restart.txt"
echo ""
echo "Nutrition update completed."
echo "Backup: $BACKUP_DIR"
echo "Restart FIT90 from cPanel -> Setup Node.js App -> Restart."
