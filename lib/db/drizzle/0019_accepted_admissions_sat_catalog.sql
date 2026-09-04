-- Accepted Admissions SAT catalog: platform-owned Checkout products.
-- One-time upsert of prices/credits; clears stale Stripe price IDs so runtime GETs never reseeds them.

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
    'single-sat-session',
    'Single SAT Session',
    'One prepaid 60-minute SAT tutoring session credit.',
    1,
    17500,
    17500,
    true,
    now(),
    now()
  ),
  (
    'ten-sat-session-package',
    'Ten SAT Session Package',
    'Ten prepaid 60-minute SAT tutoring session credits.',
    10,
    130000,
    13000,
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
--> statement-breakpoint
UPDATE "sat_products"
SET
  "active" = false,
  "updated_at" = now()
WHERE "slug" NOT IN ('single-sat-session', 'ten-sat-session-package')
  AND "active" = true;
