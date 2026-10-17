-- Set Eunice Chon's stored biography to EUNICE_PUBLIC_BIOGRAPHY.
-- That constant in artifacts/api-server/src/lib/public-team-roster.ts is the sentence to edit.
-- Journal idx 67, when 1792710000000, after 0066_nika_essay_editing (idx 66, when 1792700000000).
-- Idempotent: her profile only, and only when the stored biography differs.

UPDATE "tutor_profiles"
SET
  "biography" = 'Harvard Class of 2025 with a background in History of Science. Incoming PhD Student at UC Berkeley.',
  "updated_at" = now()
WHERE "email" = 'eunice_chon@berkeley.edu'
  AND "name" = 'Eunice Chon'
  AND "biography" IS DISTINCT FROM 'Harvard Class of 2025 with a background in History of Science. Incoming PhD Student at UC Berkeley.';
