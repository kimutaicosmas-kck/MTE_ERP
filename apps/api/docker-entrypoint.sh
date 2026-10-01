#!/bin/sh
set -e
cd /app/apps/api

if [ "${SKIP_DB_SETUP}" != "1" ]; then
  echo "Waiting for MySQL and applying schema…"
  npx prisma db push --accept-data-loss
  npx tsx prisma/maybe-seed.ts
fi

exec "$@"
