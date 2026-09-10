-- Retire the temporary $1 / 1 SAT-hour payment-test SKU.
-- Historical payments keep their product_id; Checkout and catalog listings exclude it.

UPDATE "sat_products"
SET
  "active" = false,
  "updated_at" = now()
WHERE "slug" = 'test-sat-hour';
