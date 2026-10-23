# MTE ERP — CEO / executive test guide

Use this for a structured walkthrough before go-live feedback. Allow **30–45 minutes** on a phone (PWA) and optionally 15 minutes on desktop.

## Access

| Item | Demo (local Docker) | Hosted demo |
|------|---------------------|-------------|
| URL | http://localhost:5173 | Your IT team’s demo URL (e.g. demo host) |
| Password (all demo users) | `Mte@2026` | Same unless IT changed it |

**Recommended CEO account:** `superadmin@mte.local` (Super Admin — full access)

Other roles for spot checks:

| Email | Role |
|-------|------|
| admin@mte.local | Admin |
| sales@mte.local | Sales |
| warehouse@mte.local | Warehouse |
| finance@mte.local | Finance |

## Before you start (IT / Peter)

1. Rebuild and start: `docker compose up -d --build`
2. Run smoke test: `node scripts/e2e-test.mjs http://localhost:4000 http://localhost:5173` → **0 FAIL**
3. On the phone: install or open in Chrome → **Incognito** first time, or clear site data if the UI looks old
4. Confirm build string under **Good morning … · App · 2026-03-23h-mobile-roles** (or newer) in the mobile header

## Mobile app (primary)

1. **Sign in** as Super Admin.
2. **Bottom bar:** Home · Sales · Finance · More — tap each; confirm no errors.
3. **Home:** KPIs load; **Alerts** below KPIs; no console errors (IT can check F12).
4. **Sales:** Orders list; open one order; back works.
5. **Finance:** Invoices; open one; **Record payment** if shown (optional).
6. **More:** Reports, Approvals, Dispatch — open one link each.
7. **Sign out** (More → Profile → Sign out). Confirm you cannot use the app until sign-in again.

## Desktop (optional)

Same URL in a wide browser: left sidebar, all modules. Use for Finance books and Reports depth.

## What “good” looks like

- Numbers on dashboard and module KPIs match lists (orders, invoices, stock).
- Role users only see their modules (Sales does not get Finance screens in the UI).
- PDFs: Sales order → print/delivery note opens.
- Approvals: pending items can be opened (Super Admin).

## Known demo limits (not bugs)

- **Passwords** are shared demo credentials — change before production.
- **JWT_SECRET** and DB passwords must be set on any public server (see `DEPLOY_DEMO_ABEXCORE.md`).
- **M-Pesa STK** needs Daraja credentials in Settings → Integrations.
- **Offline / PWA:** cached UI may need hard refresh after updates; IT should bump deploy and clear service worker once per release.

## Feedback template for CEO

1. First impression (1–5):
2. Mobile navigation clear? (Y/N)
3. Slow or broken screens (list URLs):
4. Missing for daily use:
5. Ready for staff pilot? (Y/N/With changes)

## Technical smoke (IT)

```bash
node scripts/e2e-test.mjs http://localhost:4000 http://localhost:5173
```

Expect **PASS: 50+**, **FAIL: 0**. Warnings on rate limit after repeated runs are normal; wait 1 minute and retry login tests.
