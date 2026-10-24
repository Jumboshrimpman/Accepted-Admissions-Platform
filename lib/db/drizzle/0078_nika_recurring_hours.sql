-- Add a weekly schedule column for tutors who edit their own hours.
-- Does not read or rewrite date_hours, weekly_hours, or any existing row's windows.
-- Default is an empty object, so current closures and openings stay as they are.
-- Idempotent: a second run does not add the column again.
-- Journal idx 78, when 1792820000000, after 0077 (1792810000000).

ALTER TABLE "availability_rules"
  ADD COLUMN IF NOT EXISTS "recurring_hours" jsonb NOT NULL DEFAULT '{}'::jsonb;
