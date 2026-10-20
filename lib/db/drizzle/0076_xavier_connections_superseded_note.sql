-- The restored public Xavier profile can still carry the SUPERSEDED note
-- written when that row was retired. Connections hides any profile whose
-- notes contain that marker. Clear it on the live public profile only.
-- Inactive duplicates keep the marker. Sessions, invites, and Meet are untouched.
-- A second run changes nothing.

UPDATE "tutor_profiles" AS profile
SET
  "internal_notes" = (
    SELECT NULLIF(string_agg(btrim(line), E'\n' ORDER BY ord), '')
    FROM unnest(string_to_array(profile."internal_notes", E'\n')) WITH ORDINALITY AS lines(line, ord)
    WHERE btrim(line) <> ''
      AND btrim(line) NOT LIKE 'SUPERSEDED:%'
  ),
  "updated_at" = now()
WHERE profile."id" = 'e4022489-00d8-42ca-b1e6-f6742199e1af'
  AND profile."active" = true
  AND profile."public_approved" = true
  AND profile."name" = 'Xavier Morales'
  AND lower(profile."email") <> ''
  AND lower(profile."email") NOT LIKE '%@retired.accepted.local'
  AND profile."internal_notes" LIKE '%SUPERSEDED:%';
