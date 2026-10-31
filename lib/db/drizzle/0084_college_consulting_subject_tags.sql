-- The College Consulting tag for the four tutors Sophia Sleiman can book.
-- The public Our Team page strips this subject before rendering, so the published
-- roster is unchanged. Idempotent: a second run appends nothing.
-- No users, grants, sessions, calendar events, or email.

WITH target AS (
  SELECT "id", COALESCE("subjects", '[]'::jsonb) AS "subjects"
  FROM "tutor_profiles"
  WHERE "active" = true
    AND (
      ("name" = 'Xavier Morales' AND lower("email") NOT LIKE '%@retired.accepted.local')
      OR lower("email") = 'eunice_chon@berkeley.edu'
      OR "name" = 'Eunice Chon'
      OR lower("email") = 'nika.raiffe@gmail.com'
      OR "name" = 'Victoria Wijerathnayapa'
      OR "user_id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
    )
)
UPDATE "tutor_profiles" AS profile
SET
  "subjects" = target."subjects" || '["College Consulting"]'::jsonb,
  "updated_at" = now()
FROM target
WHERE profile."id" = target."id"
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(target."subjects") AS subject
    WHERE lower(trim(subject)) = 'college consulting'
  );
