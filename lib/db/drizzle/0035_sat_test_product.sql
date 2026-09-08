-- Temporary $1 / 1 SAT-hour catalog SKU for payment testing.
-- Display name is exactly `test`. Does not change live $130 / $1,300 prices.
-- Stripe Product/Price IDs stay null so Checkout creates them on first purchase.

INSERT INTO "sat_products" (
  "slug",
  "name",
  "description",
  "duration_hours",
  "total_price_cents",
  "effective_hourly_rate_cents",
  "active",
  "created_at",
  "updated_at"
)
VALUES
  (
    'test-sat-hour',
    'test',
    'Temporary $1 test product that grants 1 SAT hour.',
    1,
    100,
    100,
    true,
    now(),
    now()
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "duration_hours" = EXCLUDED."duration_hours",
  "total_price_cents" = EXCLUDED."total_price_cents",
  "effective_hourly_rate_cents" = EXCLUDED."effective_hourly_rate_cents",
  "active" = true,
  "stripe_product_id" = CASE
    WHEN "sat_products"."total_price_cents" IS DISTINCT FROM EXCLUDED."total_price_cents"
      OR "sat_products"."duration_hours" IS DISTINCT FROM EXCLUDED."duration_hours"
    THEN NULL
    ELSE "sat_products"."stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "sat_products"."total_price_cents" IS DISTINCT FROM EXCLUDED."total_price_cents"
      OR "sat_products"."duration_hours" IS DISTINCT FROM EXCLUDED."duration_hours"
    THEN NULL
    ELSE "sat_products"."stripe_price_id"
  END,
  "updated_at" = now();
