#!/bin/sh
set -e

echo "Waiting for database to be ready..."
# Wait a bit for postgres to be fully ready (healthcheck already passed)
sleep 3

echo "Generating Prisma Client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy || npx prisma db push --skip-generate --accept-data-loss || true

echo "Starting application..."
# In production, use 'start', in development use 'dev'
if [ "$NODE_ENV" = "production" ]; then
  exec npm run start
else
  exec npm run dev
fi

