-- Xavier Morales' tutor profile email, spelled with an i.
-- Login stays on users.email (xaver.rmz6@gmail.com). This file does not update
-- users, portal_access_grants, calendar_connections, or portal_login_aliases.
-- No-op unless exactly one active Xavier Morales profile still has a known
-- older address, and no other profile already holds xavier.rmz6@gmail.com.
-- No mail is sent.
-- Journal idx 71, when 1792750000000, after 0069 (1792730000000) and after
-- the essay migration reserved at when 1792740000000.

UPDATE "tutor_profiles" AS profile
SET "email" = 'xavier.rmz6@gmail.com', "updated_at" = now()
WHERE profile."name" = 'Xavier Morales'
  AND profile."active" = true
  AND lower(profile."email") IN ('xaver.rmz6@gmail.com', 'xsfam6@gmail.com')
  AND (
    SELECT count(*)
    FROM "tutor_profiles"
    WHERE "name" = 'Xavier Morales'
      AND "active" = true
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "tutor_profiles" AS other
    WHERE other."id" <> profile."id"
      AND lower(other."email") = 'xavier.rmz6@gmail.com'
  );
