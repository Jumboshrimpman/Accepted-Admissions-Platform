-- Victoria Wijerathnayapa's tutor login.
-- Idempotent: if another user, grant, or tutor profile already has this email,
-- or she has more than one active grant or tutor profile, this changes zero rows.
-- Touches users.email, portal_access_grants.email, and tutor_profiles.email
-- for a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63 only.
-- Sessions, calendar connections, login aliases, and Clerk ids stay.
-- No mail is sent.
-- Journal idx 69, when 1792730000000, after 0068 (1792710000000) and after
-- the essay migration reserved at idx 68 / when 1792720000000.

WITH blocked AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM "users"
      WHERE lower("email") = 'victoriawije7@gmail.com'
        AND "id" <> 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    )
    OR EXISTS (
      SELECT 1
      FROM "portal_access_grants"
      WHERE lower("email") = 'victoriawije7@gmail.com'
        AND "user_id" IS DISTINCT FROM 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    )
    OR EXISTS (
      SELECT 1
      FROM "tutor_profiles"
      WHERE lower("email") = 'victoriawije7@gmail.com'
        AND "user_id" IS DISTINCT FROM 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    )
    OR (
      SELECT count(*)
      FROM "portal_access_grants"
      WHERE "user_id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
        AND "active" = true
        AND "revoked_at" IS NULL
    ) > 1
    OR (
      SELECT count(*)
      FROM "tutor_profiles"
      WHERE "user_id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    ) > 1 AS taken
),
updated_user AS (
  UPDATE "users"
  SET
    "email" = 'victoriawije7@gmail.com',
    "updated_at" = now()
  WHERE "id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    AND NOT (SELECT taken FROM blocked)
    AND lower("email") IS DISTINCT FROM 'victoriawije7@gmail.com'
  RETURNING "id"
),
updated_grant AS (
  UPDATE "portal_access_grants" AS portal_grant
  SET
    "email" = 'victoriawije7@gmail.com',
    "updated_at" = now()
  WHERE portal_grant."user_id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    AND portal_grant."active" = true
    AND portal_grant."revoked_at" IS NULL
    AND lower(portal_grant."email") IS DISTINCT FROM 'victoriawije7@gmail.com'
    AND NOT (SELECT taken FROM blocked)
  RETURNING portal_grant."id"
),
updated_profile AS (
  UPDATE "tutor_profiles" AS profile
  SET
    "email" = 'victoriawije7@gmail.com',
    "updated_at" = now()
  WHERE profile."user_id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    AND lower(profile."email") IS DISTINCT FROM 'victoriawije7@gmail.com'
    AND NOT (SELECT taken FROM blocked)
  RETURNING profile."id"
)
SELECT
  (SELECT count(*) FROM updated_user) AS users_updated,
  (SELECT count(*) FROM updated_grant) AS grants_updated,
  (SELECT count(*) FROM updated_profile) AS profiles_updated;
