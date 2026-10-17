-- Nika's SAT hours for Sophia Sleiman and Michelle Makarem.
-- Catalog price is $130/hour. Who can buy the rows is enforced in the app.
-- College Consulting rows (college-consulting-nika-*) stay at Neel's $100 rate.
-- ON CONFLICT DO NOTHING so a rerun cannot clear stripe_product_id or stripe_price_id.

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
    'sat-nika-60',
    'SAT 1 hour with Nika',
    'One prepaid 60-minute SAT tutoring credit with Nika at $130/hour.',
    1,
    13000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-nika-90',
    'SAT 1.5 hours with Nika',
    'One prepaid 90-minute SAT tutoring credit with Nika at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-nika-120',
    'SAT 2 hours with Nika',
    'One prepaid 120-minute SAT tutoring credit with Nika at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  )
ON CONFLICT ("slug") DO NOTHING;
