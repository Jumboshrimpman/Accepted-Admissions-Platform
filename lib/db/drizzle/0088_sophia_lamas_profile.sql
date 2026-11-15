-- Set Sophia Lamas's stored biography to SOPHIA_LAMAS_PUBLIC_BIOGRAPHY and give her
-- portal tutor profile the square headshot at /media/portal/sophia-lamas.jpg.
-- That constant in artifacts/api-server/src/lib/public-team-roster.ts is the sentence to edit.
-- Rows touched: the public team mirror (public-sophia-lamas@seed.invalid) and her portal
-- tutor profile 5c98f45b-0069-4342-8bdb-163dc49cc531. No other column or tutor is written.
-- Idempotent: each UPDATE only runs when the stored value differs.

UPDATE "tutor_profiles"
SET
  "biography" = 'Sophia Lamas is a 2024 graduate of Stanford with a degree in International Relations and Middle Eastern Studies and 2026 graduate of a Master’s in Middle East Studies at George Washington University, specializing in Arabic and Conflict Resolution. She is currently training to be a pilot.',
  "updated_at" = now()
WHERE "name" = 'Sophia Lamas'
  AND (
    ("email" = 'public-sophia-lamas@seed.invalid' AND "user_id" IS NULL)
    OR "id" = '5c98f45b-0069-4342-8bdb-163dc49cc531'
  )
  AND "biography" IS DISTINCT FROM 'Sophia Lamas is a 2024 graduate of Stanford with a degree in International Relations and Middle Eastern Studies and 2026 graduate of a Master’s in Middle East Studies at George Washington University, specializing in Arabic and Conflict Resolution. She is currently training to be a pilot.';
--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "photo_url" = '/media/portal/sophia-lamas.jpg',
  "updated_at" = now()
WHERE "id" = '5c98f45b-0069-4342-8bdb-163dc49cc531'
  AND "name" = 'Sophia Lamas'
  AND "photo_url" IS DISTINCT FROM '/media/portal/sophia-lamas.jpg';
