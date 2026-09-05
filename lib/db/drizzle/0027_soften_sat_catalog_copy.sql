-- Soften public SAT catalog copy so product cards do not name individual tutors.
-- Prices and Stripe IDs stay unchanged.

UPDATE "sat_products"
SET
  "description" = 'One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.',
  "updated_at" = now()
WHERE "slug" = 'single-sat-session'
  AND "description" ILIKE '%Xavier or Eunice%';
--> statement-breakpoint
UPDATE "sat_products"
SET
  "description" = 'Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on our SAT tutors’ available calendar.',
  "updated_at" = now()
WHERE "slug" = 'ten-sat-session-package'
  AND "description" ILIKE '%Xavier or Eunice%';
