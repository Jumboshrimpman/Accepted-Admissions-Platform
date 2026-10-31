-- Clear Eunice Chon's LinkedIn URL: the published link no longer resolves.
-- Matches the same identity keys as 0084 (email or name) so a renamed row is
-- still caught. Only linkedin_url is written. Idempotent: a second run matches
-- no rows. No users, grants, sessions, calendar events, or email.

UPDATE "tutor_profiles"
SET
  "linkedin_url" = NULL,
  "updated_at" = now()
WHERE "linkedin_url" IS NOT NULL
  AND (
    lower("email") = 'eunice_chon@berkeley.edu'
    OR "name" = 'Eunice Chon'
  );
