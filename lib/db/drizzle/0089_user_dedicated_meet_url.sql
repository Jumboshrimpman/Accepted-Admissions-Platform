-- Per-student dedicated Google Meet room (Neel's own room after his next booking).
-- Null means none has been created yet. Additive and idempotent. Does not
-- invent a URL, create calendar events, or send mail.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dedicated_meet_url" text;
