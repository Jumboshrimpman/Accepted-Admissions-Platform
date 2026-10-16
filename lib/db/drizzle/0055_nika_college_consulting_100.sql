-- Nika's College Consulting hour for Neel is $100. Victoria stays $130.
-- Xavier's College Consulting hour for Neel stays $200.
-- Michelle's SAT catalog hour with Xavier stays $130 and is not in this update.
-- When the name, description, or price differ, clear both Stripe ids so the next
-- checkout creates a Product and Price for the current first-name catalog copy.

UPDATE "sat_products"
SET
  "stripe_product_id" = CASE
    WHEN "name" IS DISTINCT FROM 'College Consulting hour with Nika'
      OR "description" IS DISTINCT FROM 'One prepaid 60-minute College Consulting credit with Nika at $100/hour.'
      OR "total_price_cents" IS DISTINCT FROM 10000
    THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "name" IS DISTINCT FROM 'College Consulting hour with Nika'
      OR "description" IS DISTINCT FROM 'One prepaid 60-minute College Consulting credit with Nika at $100/hour.'
      OR "total_price_cents" IS DISTINCT FROM 10000
    THEN NULL
    ELSE "stripe_price_id"
  END,
  "name" = 'College Consulting hour with Nika',
  "description" = 'One prepaid 60-minute College Consulting credit with Nika at $100/hour.',
  "total_price_cents" = 10000,
  "effective_hourly_rate_cents" = 10000,
  "updated_at" = now()
WHERE "slug" = 'college-consulting-nika-hour';
--> statement-breakpoint
UPDATE "sat_products"
SET
  "stripe_product_id" = CASE
    WHEN "name" IS DISTINCT FROM 'College Consulting hour with Victoria'
      OR "description" IS DISTINCT FROM 'One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.'
    THEN NULL
    ELSE "stripe_product_id"
  END,
  "stripe_price_id" = CASE
    WHEN "name" IS DISTINCT FROM 'College Consulting hour with Victoria'
      OR "description" IS DISTINCT FROM 'One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.'
    THEN NULL
    ELSE "stripe_price_id"
  END,
  "name" = 'College Consulting hour with Victoria',
  "description" = 'One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.',
  "updated_at" = now()
WHERE "slug" = 'college-consulting-victoria-hour'
  AND "total_price_cents" = 13000;
