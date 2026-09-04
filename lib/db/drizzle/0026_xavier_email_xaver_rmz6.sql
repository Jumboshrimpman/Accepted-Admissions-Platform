-- Correct Xavier Morales' live Google / operator email.
-- Migration 0008 historically canonicalized aliases onto xsfam6@gmail.com.
-- Do not rewrite 0008; this updates already-applied rows in place.

UPDATE "tutor_profiles"
SET
  "email" = 'xaver.rmz6@gmail.com',
  "updated_at" = now()
WHERE lower("email") = lower('xsfam6@gmail.com')
  AND NOT EXISTS (
    SELECT 1
    FROM "tutor_profiles" AS other
    WHERE lower(other."email") = lower('xaver.rmz6@gmail.com')
  );--> statement-breakpoint
UPDATE "users"
SET
  "email" = 'xaver.rmz6@gmail.com',
  "updated_at" = now()
WHERE lower("email") = lower('xsfam6@gmail.com')
  AND NOT EXISTS (
    SELECT 1
    FROM "users" AS other
    WHERE lower(other."email") = lower('xaver.rmz6@gmail.com')
  );--> statement-breakpoint
UPDATE "portal_access_grants"
SET
  "email" = 'xaver.rmz6@gmail.com',
  "updated_at" = now()
WHERE lower("email") = lower('xsfam6@gmail.com')
  AND NOT EXISTS (
    SELECT 1
    FROM "portal_access_grants" AS other
    WHERE lower(other."email") = lower('xaver.rmz6@gmail.com')
  );
