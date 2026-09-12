#!/usr/bin/env bash
# ============================================================================
# FIT90 — WHM/cPanel deploy (run from extracted ZIP root).
#   1) install deps  2) prisma generate  3) import bundled DB OR seed
#   4) ensure build exists
# Prerequisite: copy .env.production → .env and fill DATABASE_URL + domain.
# Startup file in cPanel Node.js: dist/main.js
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "!! No .env found. Copy .env.production to .env and fill DATABASE_URL + CORS_ORIGINS first."
  exit 1
fi

echo "==> [1/4] Installing dependencies…"
npm install --include=dev

echo "==> [2/4] Generating Prisma client…"
npx prisma generate

DB_DUMP="database/fit90_test_data.sql"

if [ -f "$DB_DUMP" ]; then
  echo "==> [3/4] Importing bundled test database…"
  # shellcheck disable=SC1091
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  export DATABASE_URL

  DB_PARSE="$(
    node -e "
      const raw = process.env.DATABASE_URL;
      const u = new URL(raw.replace(/^mysql:\\/\\//, 'http://'));
      const parts = [
        decodeURIComponent(u.username || ''),
        decodeURIComponent(u.password || ''),
        u.hostname || 'localhost',
        u.port || '3306',
        u.pathname.replace(/^\\//, '').split('?')[0],
      ];
      console.log(parts.join('|'));
    "
  )"
  IFS='|' read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME <<<"$DB_PARSE"

  MYSQL_ARGS=(-h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER")
  [ -n "$DB_PASS" ] && MYSQL_ARGS+=(-p"$DB_PASS")

  mysql "${MYSQL_ARGS[@]}" -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql "${MYSQL_ARGS[@]}" "$DB_NAME" <"$DB_DUMP"
  echo "    Imported into ${DB_NAME}"
else
  echo "==> [3/4] No SQL dump found — creating schema + seeding demo data…"
  npx prisma db push --accept-data-loss
  npm run db:seed
fi

if [ ! -f dist/main.js ]; then
  echo "==> [4/4] Building backend (dist/ missing)…"
  npm run build
else
  echo "==> [4/4] Using pre-built dist/ (skip compile)."
fi

if [ ! -f public/index.html ]; then
  echo "!! public/index.html missing — frontend was not bundled in this ZIP."
  exit 1
fi

echo ""
echo "✅ Deploy complete."
echo "   cPanel → Setup Node.js App → startup file: dist/main.js → Restart"
echo "   Login: admin / one80@123"
