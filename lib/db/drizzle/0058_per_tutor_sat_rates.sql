-- Per-tutor SAT hours. Catalog prices are the standard rates.
-- Michelle Makarem's $130 Xavier rate is applied at checkout and is not stored here.
-- Existing shared SAT rows, Stripe ids, and credit ledger rows are left unchanged.
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
    'sat-eunice-60',
    'SAT 1 hour with Eunice',
    'One prepaid 60-minute SAT tutoring credit with Eunice at $130/hour.',
    1,
    13000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-eunice-90',
    'SAT 1.5 hours with Eunice',
    'One prepaid 90-minute SAT tutoring credit with Eunice at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-eunice-120',
    'SAT 2 hours with Eunice',
    'One prepaid 120-minute SAT tutoring credit with Eunice at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-victoria-60',
    'SAT 1 hour with Victoria',
    'One prepaid 60-minute SAT tutoring credit with Victoria at $130/hour.',
    1,
    13000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-victoria-90',
    'SAT 1.5 hours with Victoria',
    'One prepaid 90-minute SAT tutoring credit with Victoria at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-victoria-120',
    'SAT 2 hours with Victoria',
    'One prepaid 120-minute SAT tutoring credit with Victoria at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'sat-xavier-60',
    'SAT 1 hour with Xavier',
    'One prepaid 60-minute SAT tutoring credit with Xavier at $200/hour.',
    1,
    20000,
    20000,
    true,
    now(),
    now()
  ),
  (
    'sat-xavier-90',
    'SAT 1.5 hours with Xavier',
    'One prepaid 90-minute SAT tutoring credit with Xavier at $200/hour.',
    1.5,
    30000,
    20000,
    true,
    now(),
    now()
  ),
  (
    'sat-xavier-120',
    'SAT 2 hours with Xavier',
    'One prepaid 120-minute SAT tutoring credit with Xavier at $200/hour.',
    2,
    40000,
    20000,
    true,
    now(),
    now()
  )
ON CONFLICT ("slug") DO NOTHING;
