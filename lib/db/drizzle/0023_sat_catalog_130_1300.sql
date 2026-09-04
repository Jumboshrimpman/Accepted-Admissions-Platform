-- Retarget Accepted Admissions SAT catalog: $130 / 1 hour and $1,300 / 10 hours.
UPDATE "sat_products"
SET
  "total_price_cents" = 13000,
  "effective_hourly_rate_cents" = 13000,
  "stripe_product_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 13000 OR "duration_hours" IS DISTINCT FROM 1
      THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 13000 OR "duration_hours" IS DISTINCT FROM 1
      THEN NULL
    ELSE "stripe_price_id"
  END,
  "active" = true,
  "updated_at" = now()
WHERE "slug" = 'single-sat-session';
--> statement-breakpoint
UPDATE "sat_products"
SET
  "total_price_cents" = 130000,
  "effective_hourly_rate_cents" = 13000,
  "stripe_product_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 130000 OR "duration_hours" IS DISTINCT FROM 10
      THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 130000 OR "duration_hours" IS DISTINCT FROM 10
      THEN NULL
    ELSE "stripe_price_id"
  END,
  "active" = true,
  "updated_at" = now()
WHERE "slug" = 'ten-sat-session-package';
