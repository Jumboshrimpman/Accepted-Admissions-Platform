-- Align SAT catalog to $130 per prepaid hour (1 credit = 1 hour).
-- Clears Stripe price IDs when the unit amount changes so Checkout recreates prices.

UPDATE "sat_products"
SET
  "name" = 'Single SAT Session',
  "description" = 'One prepaid 60-minute SAT tutoring credit. Book any open hour on Xavier or Eunice''s calendar.',
  "duration_hours" = 1,
  "total_price_cents" = 13000,
  "effective_hourly_rate_cents" = 13000,
  "stripe_product_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 13000 THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 13000 THEN NULL
    ELSE "stripe_price_id"
  END,
  "active" = true,
  "updated_at" = now()
WHERE "slug" = 'single-sat-session';
--> statement-breakpoint
UPDATE "sat_products"
SET
  "name" = 'Ten SAT Session Package',
  "description" = 'Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on Xavier or Eunice''s available calendar.',
  "duration_hours" = 10,
  "total_price_cents" = 130000,
  "effective_hourly_rate_cents" = 13000,
  "stripe_product_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 130000
      OR "effective_hourly_rate_cents" IS DISTINCT FROM 13000
    THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 130000
      OR "effective_hourly_rate_cents" IS DISTINCT FROM 13000
    THEN NULL
    ELSE "stripe_price_id"
  END,
  "active" = true,
  "updated_at" = now()
WHERE "slug" = 'ten-sat-session-package';
