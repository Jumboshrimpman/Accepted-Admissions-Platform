-- Bookable 1.5h and 2h credits at each existing hourly rate.
-- The 1-hour SAT and College Consulting rows are not updated.
-- sama-live-checkout-test is a $1 Stripe checkout. It is not the retired test-sat-hour slug.
-- Checkout code hides it from real clients. Stripe ids stay null until the first purchase.

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
    'sat-session-90',
    '1.5 Hour SAT Session',
    'One prepaid 90-minute SAT tutoring credit at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-session-120',
    '2 Hour SAT Session',
    'One prepaid 120-minute SAT tutoring credit at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-nika-90',
    'College Consulting 1.5 hours with Nika',
    'One prepaid 90-minute College Consulting credit with Nika at $100/hour.',
    1.5,
    15000,
    10000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-nika-120',
    'College Consulting 2 hours with Nika',
    'One prepaid 120-minute College Consulting credit with Nika at $100/hour.',
    2,
    20000,
    10000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-victoria-90',
    'College Consulting 1.5 hours with Victoria',
    'One prepaid 90-minute College Consulting credit with Victoria at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-victoria-120',
    'College Consulting 2 hours with Victoria',
    'One prepaid 120-minute College Consulting credit with Victoria at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-xavier-90',
    'College Consulting 1.5 hours with Xavier Morales',
    'One prepaid 90-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.',
    1.5,
    30000,
    20000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-xavier-120',
    'College Consulting 2 hours with Xavier Morales',
    'One prepaid 120-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.',
    2,
    40000,
    20000,
    true,
    now(),
    now()
  ),
  (
    'sama-live-checkout-test',
    'Checkout test session',
    'A $1 checkout used to test live Stripe payment. It does not add a bookable tutor hour.',
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
