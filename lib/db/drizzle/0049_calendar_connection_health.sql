-- Health facts for the admin Connections page. Tokens stay in the existing ciphertext columns.
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "google_account_email" text;
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "last_token_refresh_at" timestamp with time zone;
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "last_freebusy_at" timestamp with time zone;
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "last_error_at" timestamp with time zone;
