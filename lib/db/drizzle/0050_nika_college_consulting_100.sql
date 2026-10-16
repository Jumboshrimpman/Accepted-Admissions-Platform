-- Nika's College Consulting hour for Neel is $100. Victoria stays $130.
-- Xavier's College Consulting hour for Neel stays $200.
-- Michelle's SAT catalog hour with Xavier stays $130 and is not in this update.
-- A stored Stripe Price created at the old amount is cleared so the next checkout
-- creates a Price for the current total_price_cents.

UPDATE "sat_products"
SET
  "name" = 'College Consulting hour with Nika',
  "description" = 'One prepaid 60-minute College Consulting credit with Nika at $100/hour.',
  "stripe_price_id" = CASE
    WHEN "total_price_cents" IS DISTINCT FROM 10000 THEN NULL
    ELSE "stripe_price_id"
  END,
  "total_price_cents" = 10000,
  "effective_hourly_rate_cents" = 10000,
  "updated_at" = now()
WHERE "slug" = 'college-consulting-nika-hour';
--> statement-breakpoint
UPDATE "sat_products"
SET
  "name" = 'College Consulting hour with Victoria',
  "description" = 'One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.',
  "updated_at" = now()
WHERE "slug" = 'college-consulting-victoria-hour'
  AND "total_price_cents" = 13000;
