# MTE ERP — Pre-launch readiness (go-live week)

Run this checklist **after** pushing latest `main`, `prisma db push`, and `up -d --build web api`.

## Automated smoke

```bash
# API base = origin only (no trailing /api)
node scripts/e2e-test.mjs https://demo.abexcore.co.ke https://demo.abexcore.co.ke
```

```bash
# On VPS after deploy
docker compose -p mte-demo -f docker-compose.yml -f docker-compose.demo-server.yml \
  --env-file .env.demo-server run --rm api npx prisma db push
```

## PWA / mobile UX (4-card default)

- Module KPI rows: **4 cards** on phone/PWA (2×2); cards 5+ hidden until desktop xl.
- Inventory quick links: **2×2** on phone.
- Build string visible in app header after hard refresh.

## Go-live gates (must pass)

| Area | Check |
|------|--------|
| Secrets | `JWT_SECRET` 32+ chars, not template; `LOAD_TEST_KEY` empty on demo |
| DB | `PartSiteStock` table exists; opening stock backfilled to MAIN |
| Sales | New order requires **store** + **warehouseSiteId**; stock deducts per store |
| Transfer | Inventory → edit product → **Move stock to another store** |
| Auth | Logout clears session; roles cannot access finance/audit inappropriately |
| Backup | Demo MySQL volume **not** dropped with `compose down -v` |

## Known gaps (schedule after go-live)

1. **PO goods receipt** — stock still lands on **MAIN** until receiving store is chosen on GRN.
2. **Import Qty** — opening qty applies to store inferred from Location column, not multi-line split.
3. **Quotations without store id** — old drafts fall back to MAIN for conversion.
4. **Offline PWA** — cache may lag; hard refresh after deploy (`mte-static-v*` in service worker).
5. **Demo credentials** — change default passwords before real users; user import allows default `Mte@2026` if password column empty (Super Admin only).

## Security posture

| Control | Status |
|---------|--------|
| JWT sessions + server-side auth on `/api/*` | Yes |
| RBAC per module | Yes |
| Rate limits (login + API) | Yes (Redis) |
| Security headers | Yes |
| Optional `CORS_ORIGINS` (comma-separated) | Set on production reverse proxy host |
| `MTE_ENFORCE_SECRETS=1` or `PUBLIC_APP_URL` | API refuses weak `JWT_SECRET` |
| Share links / PDF | Token HMAC; do not post tokens publicly |

## Manual CEO script (1 hour)

1. Login each role once (Sales, Warehouse, Finance, Admin).
2. **Sales**: New order — pick store, part with duplicate name, bin, convert or save quote.
3. **Warehouse**: Transfer qty between stores; confirm movement on Inventory → Movements.
4. **Procurement**: Receive a PO line; confirm qty on MAIN.
5. **Finance**: Invoice PDF, record payment, P&L loads.
6. **Approvals**: One price/bin change as Admin (non–Super Admin) and approve as Super Admin.
7. **Mobile**: Install PWA; confirm **4 KPI cards** on Sales, Inventory, Finance home rows.

## Deploy command (demo)

```bash
cd ~/MTE_ERP && git pull origin main
docker compose -p mte-demo -f docker-compose.yml -f docker-compose.demo-server.yml \
  --env-file .env.demo-server run --rm api npx prisma db push
docker compose -p mte-demo -f docker-compose.yml -f docker-compose.demo-server.yml \
  --env-file .env.demo-server up -d --build web api worker
```

Set in `.env.demo-server`:

```env
JWT_SECRET=<openssl rand -hex 32>
PUBLIC_APP_URL=https://demo.abexcore.co.ke
CORS_ORIGINS=https://demo.abexcore.co.ke
LOAD_TEST_KEY=
```