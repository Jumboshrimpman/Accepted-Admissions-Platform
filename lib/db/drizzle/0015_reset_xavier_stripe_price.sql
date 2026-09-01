UPDATE "sat_products"
SET "stripe_price_id" = NULL,
    "updated_at" = now()
WHERE "slug" = 'single-sat-session'
  AND "stripe_price_id" IS NOT NULL;