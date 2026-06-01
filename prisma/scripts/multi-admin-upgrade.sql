-- Chạy thủ công trên production khi container chưa có prisma/migrations
-- Backup trước: pg_dump ...

ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "bankCode" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;

ALTER TABLE "weeks" ADD COLUMN IF NOT EXISTS "adminId" TEXT;

INSERT INTO "admins" ("id", "userName", "password", "slug", "displayName", "bankCode", "accountNumber", "accountHolderName", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'admin',
  'admin123',
  'default',
  'An Trua Nao',
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "admins");

UPDATE "admins"
SET
  "slug" = COALESCE(NULLIF(TRIM("slug"), ''), COALESCE(NULLIF(TRIM("userName"), ''), 'default')),
  "displayName" = COALESCE("displayName", 'An Trua Nao')
WHERE "slug" IS NULL OR TRIM("slug") = '';

UPDATE "admins" a
SET "slug" = a."slug" || '-' || LEFT(a."id", 8)
WHERE a."id" IN (
  SELECT a2."id"
  FROM "admins" a2
  INNER JOIN (
    SELECT "slug" FROM "admins" GROUP BY "slug" HAVING COUNT(*) > 1
  ) dup ON dup."slug" = a2."slug"
  AND a2."id" NOT IN (
    SELECT MIN("id") FROM "admins" GROUP BY "slug" HAVING COUNT(*) > 1
  )
);

UPDATE "weeks"
SET "adminId" = (SELECT "id" FROM "admins" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "adminId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "admins_slug_key" ON "admins"("slug");
ALTER TABLE "admins" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "weeks" ALTER COLUMN "adminId" SET NOT NULL;

ALTER TABLE "weeks" DROP CONSTRAINT IF EXISTS "weeks_adminId_fkey";
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "weeks_adminId_idx" ON "weeks"("adminId");
