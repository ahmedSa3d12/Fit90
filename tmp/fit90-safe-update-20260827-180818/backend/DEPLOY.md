# FIT90 — WHM / cPanel Deployment

Single **Node.js** app: NestJS serves the API (`/api/*`) and the React SPA (`public/`).
One domain — no separate frontend host or CORS proxy.

## Requirements

- WHM/cPanel with **Setup Node.js App** (Node **18+** recommended).
- **MySQL** database + user (cPanel → MySQL® Databases).
- SSH or cPanel **Terminal** (to run `deploy.sh`).

## Quick steps

1. **Upload** `FIT90-WHM-deploy.zip` to your account (e.g. `~/fit90`).
2. **Extract** the ZIP in File Manager or: `unzip FIT90-WHM-deploy.zip -d ~/fit90`
3. **Create MySQL DB** — new database + user, grant **ALL PRIVILEGES**.
4. **Configure env:**
   ```bash
   cp .env.production .env
   nano .env   # fill DATABASE_URL + CORS_ORIGINS
   ```
   - `DATABASE_URL` — `mysql://USER:PASSWORD@localhost:3306/DBNAME`
   - URL-encode password symbols: `^`→`%5E`, `@`→`%40`, `#`→`%23`
   - `CORS_ORIGINS` — `https://your-domain.com`
5. **Setup Node.js App** (cPanel):
   - Application root: folder you extracted to
   - Startup file: **`dist/main.js`**
   - Node version: **18+**
6. **Deploy** (Terminal, from app folder):
   ```bash
   bash deploy.sh
   ```
   Imports the **bundled test database** (`database/fit90_test_data.sql`) from your dev export.
7. **Restart** the Node.js app in cPanel. Open your domain.

## Login (test data)

| User | Password | Role |
|------|----------|------|
| `admin` | `fit90@123` | Super admin → `/dashboard` |
| `hrmanager` | `fit90@123` | HR manager |
| `men.manager`, `women.manager` | `fit90@123` | Branch managers |
| `emp1005`, … | `fit90@123` | Staff |

## Re-build ZIP locally

From the project repo:

```bash
bash scripts/build-deploy-zip.sh
```

Creates `FIT90-WHM-deploy.zip` with fresh frontend build, backend build, and a MySQL dump of your local `DATABASE_URL` database.

## Notes

- **Passenger** injects `PORT` automatically; leave `PORT` in `.env` as fallback.
- **Uploads** are stored in `./uploads` (created on first upload).
- **Swagger** (`/api/docs`) is disabled in production.
- If `database/fit90_test_data.sql` is missing, `deploy.sh` falls back to `prisma db push` + `npm run db:seed`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank page | Check `public/index.html` exists; restart Node app |
| 502 / app won't start | Run `node dist/main.js` in terminal to see errors |
| DB import fails | Verify `DATABASE_URL`, user privileges, empty DB name |
| Login fails | Re-run `bash deploy.sh` or check import completed |

## fit90.metacodecx.com (example mapping)

Old separate env vars → FIT90 `.env`:

| Old variable | FIT90 variable |
|--------------|----------------|
| `DATABASE` + `DATABASE_USER` + `DATABASE_PASSWORD` + host/port | `DATABASE_URL` (single MySQL URL; **URL-encode** password) |
| `JWT_SECRET` | `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` |
| `JWT_EXPIRES_IN=90d` | `JWT_REFRESH_TTL=90d` |
| `UPLOAD_PATH` | `UPLOAD_DIR` |
| `CORS_ORIGINS` | same name (use `https://fit90.metacodecx.com` only in prod) |

A ready file for this host is bundled as `.env.fit90.metacodecx` — on the server:

```bash
cp .env.fit90.metacodecx .env
bash deploy.sh
```

**Password note:** if your cPanel password is `=g)6jV!NKd24UG41` (starts with `=`), it must be URL-encoded in `DATABASE_URL` as `%3Dg%29jV%21NKd24UG41`. If login to MySQL fails, confirm the exact password in cPanel (no extra `=`).
