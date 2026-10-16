-- 0054. Journal idx 54. 0051 (#146), 0052 (#148), and 0053 (#151) are reserved.
-- Additive columns only. Existing event rows stay on the tutor's primary calendar.
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "app_calendar_id" text;
ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "granted_scopes" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "provider_calendar_id" text;
