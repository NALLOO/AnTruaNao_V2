#!/bin/sh
set -e

echo "Waiting for database to be ready..."
# Wait a bit for postgres to be fully ready (healthcheck already passed)
sleep 3

echo "Generating Prisma Client..."
npx prisma generate

echo "Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss || true

echo "Starting application..."
exec npm run dev

