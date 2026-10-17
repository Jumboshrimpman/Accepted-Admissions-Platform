-- Neel's College Consulting roster: Xavier stays at $200/hour, Eunice is $130/hour.
-- 1.5h and 2h are 1.5x and 2x ($195 and $260 for Eunice, $300 and $400 for Xavier).
-- Merge #161 first. Its files are 0061 (when 1792500000000) and 0062 (when 1792600000000).
-- This file is 0064 so those names stay unique. Its when is 1792650000000, after 0062
-- and before the essay migration at 1792700000000. Applying this before 0061 makes
-- drizzle skip 0061 and 0062 because their timestamps are earlier.
-- ON CONFLICT DO NOTHING so a rerun cannot clear stripe_product_id or stripe_price_id.
-- No users, grants, Clerk invitations, or emails.
-- booking_eligible turns Xavier and Eunice on for Neel's portal. Subjects stay as
-- published. The public Our Team page reads tutor_profiles.subjects, so this
-- migration does not add a College Consulting tag there.

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
    'college-consulting-xavier-hour',
    'College Consulting hour with Xavier Morales',
    'One prepaid 60-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.',
    1,
    20000,
    20000,
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
    'college-consulting-eunice-hour',
    'College Consulting hour with Eunice',
    'One prepaid 60-minute College Consulting credit with Eunice at $130/hour.',
    1,
    13000,
    13000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-eunice-90',
    'College Consulting 1.5 hours with Eunice',
    'One prepaid 90-minute College Consulting credit with Eunice at $130/hour.',
    1.5,
    19500,
    13000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-eunice-120',
    'College Consulting 2 hours with Eunice',
    'One prepaid 120-minute College Consulting credit with Eunice at $130/hour.',
    2,
    26000,
    13000,
    true,
    now(),
    now()
  )
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "booking_eligible" = true,
  "updated_at" = now()
WHERE "active" = true
  AND (
    lower("email") IN ('xaver.rmz6@gmail.com', 'eunice_chon@berkeley.edu')
    OR "name" = 'Eunice Chon'
    OR (
      "name" = 'Xavier Morales'
      AND lower("email") NOT IN ('xavier.rmz6@gmail.com', 'xsfam6@gmail.com')
      AND lower("email") NOT LIKE '%@retired.accepted.local'
    )
  );
--> statement-breakpoint
UPDATE "availability_rules" AS rule
SET
  "booking_notice_minutes" = 240,
  "updated_at" = now()
FROM "tutor_profiles" AS profile
WHERE rule."tutor_profile_id" = profile."id"
  AND profile."active" = true
  AND (
    profile."name" = 'Eunice Chon'
    OR lower(profile."email") = 'eunice_chon@berkeley.edu'
  );
