# MTE ERP on `demo.abexcore.co.ke`

**AbexCore production** stays in `~/Abexcore` (port **8080**). **MTE ERP** runs in a **separate folder**, **separate MySQL volume**, on port **8081**. Production Caddy already proxies `demo.abexcore.co.ke` → `host.docker.internal:8081`.

## 1. Get this code on the server

Your PC copy may have uncommitted work. Either:

**A — Git (recommended after push)**

```bash
cd ~
git clone https://github.com/kimutaicosmas-kck/MTE_ERP.git MTE_ERP
cd MTE_ERP
git pull origin main
```

**B — Upload from Windows** (if not pushed yet): zip `MTE_ERP`, copy to the VPS, unzip to `~/MTE_ERP`.

## 2. Configure secrets

```bash
cd ~/MTE_ERP
cp .env.demo-server.example .env.demo-server
nano .env.demo-server   # set JWT_SECRET + MySQL passwords (not production passwords)
```

Compose still uses default `mte` / `mtepass` in `docker-compose.yml` unless you also override `environment` in a local override — for a real demo, change passwords in **both** `.env.demo-server` and a small override, or edit `docker-compose.yml` env on the server only.

Minimum: set a strong **`JWT_SECRET`**.

## 3. Start MTE (isolated project name)

```bash
docker compose -p mte-demo \
  -f docker-compose.yml -f docker-compose.demo-server.yml \
  --env-file .env.demo-server up -d --build
```

Wait for health checks, then on the server:

```bash
curl -s http://127.0.0.1:8081/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/
```

## 4. Browser

Open **https://demo.abexcore.co.ke**

Demo logins (see README): password **`Mte@2026`**, e.g. `superadmin@mte.local`.

## 5. Updates

```bash
cd ~/MTE_ERP
git pull origin main
docker compose -p mte-demo \
  -f docker-compose.yml -f docker-compose.demo-server.yml \
  --env-file .env.demo-server up -d --build
```

## Do not

- Run this in `~/Abexcore` or use AbexCore’s MySQL volume.
- Run `docker compose down -v` on production.
- Bind MySQL to `0.0.0.0:3306` on the VPS (demo overlay uses `127.0.0.1:3309` only).
