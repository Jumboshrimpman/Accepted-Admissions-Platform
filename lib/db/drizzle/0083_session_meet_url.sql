-- Per-session Google Meet override. Null keeps the existing join-link fallback.
-- Additive and idempotent. Does not create calendar events or send mail.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "meet_url" text;
