-- Durable per-client IANA timezone. Admin People can set it; first portal
-- load may persist a browser zone only while timezone_source is still default.
-- Seed Michelle (both known emails) to Asia/Dubai / GST.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone_source" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET
  timezone = 'Asia/Dubai',
  timezone_source = 'admin',
  updated_at = now()
WHERE lower(email) IN (
  'makaremmichelle7@gmail.com',
  'michaelmakarem@gmail.com'
);
