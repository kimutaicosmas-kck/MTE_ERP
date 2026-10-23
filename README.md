# MTE ERP

Operations and books for earth-moving equipment parts: inventory, orders, payments, dispatch, sales, Super Admin approvals, audit, and a double-entry ledger.

Runs on **MySQL** in **Docker**.

## Run with Docker

```bash
docker compose up --build
```

Open **http://localhost:5173**

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:4000/api/health |
| MySQL | localhost:3306 · database `mte_erp` · user `mte` / `mtepass` |

First start applies the schema and seeds demo data.

## Demo sign-in

Password for every account: `Mte@2026`

| Email | Role |
|---|---|
| superadmin@mte.local | Super Admin (Cosmas Kimutai) |
| admin@mte.local | Admin |
| sales@mte.local | Sales |
| warehouse@mte.local | Warehouse |
| finance@mte.local | Finance |

**CEO / executive walkthrough:** see [docs/CEO_TESTING.md](docs/CEO_TESTING.md).

**Smoke test before demo:** `node scripts/e2e-test.mjs http://localhost:4000 http://localhost:5173`

## Production / public demo security

Before any internet-facing deploy: set strong `JWT_SECRET`, MySQL passwords, and demo URLs in `.env` (see `.env.demo-server.example` and `DEPLOY_DEMO_ABEXCORE.md`). Do not use default `Mte@2026` on a public site.

## Local npm (MySQL still from Docker)

```bash
docker compose up mysql -d
cp apps/api/.env.example apps/api/.env
npm install
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run db:push
npm run db:seed
npm run dev
```

`npm run dev` starts the API, a background worker, and Vite. `npm run dev:cluster` runs the API as a Node cluster.

Outgoing webhooks fire on order, payment, stock and approval events. Incoming M-Pesa: `POST /api/webhooks/incoming/mpesa`.

Payments are recorded by hand (cash / M-Pesa reference / bank / credit). Automated M-Pesa STK and eTIMS switch on when Daraja or OSCU credentials are provided.
