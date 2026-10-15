-- College Consulting prepaid hours for Neel Dharni, plus shared-room overlap acknowledgements.
-- This migration inserts catalog rows and a resolution table only.
-- It does not create Clerk users, send invitations, send mail, or create calendar events.

INSERT INTO "sat_products" (
  "slug",
  "name",
  "description",
  "duration_hours",
  "total_price_cents",
  "effective_hourly_rate_cents",
  "active"
)
VALUES
  (
    'college-consulting-nika-hour',
    'College Consulting hour with Nika Raiffe',
    'One prepaid 60-minute College Consulting credit with Nika Raiffe at $130/hour.',
    1,
    13000,
    13000,
    true
  ),
  (
    'college-consulting-xavier-hour',
    'College Consulting hour with Xavier Morales',
    'One prepaid 60-minute College Consulting credit with Xavier Morales at $200/hour for Neel Dharni.',
    1,
    20000,
    20000,
    true
  ),
  (
    'college-consulting-victoria-hour',
    'College Consulting hour with Victoria',
    'One prepaid 60-minute College Consulting credit with Victoria at $130/hour. Booking opens after her Google Calendar is connected.',
    1,
    13000,
    13000,
    true
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "duration_hours" = EXCLUDED."duration_hours",
  "total_price_cents" = EXCLUDED."total_price_cents",
  "effective_hourly_rate_cents" = EXCLUDED."effective_hourly_rate_cents",
  "active" = true,
  "updated_at" = now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shared_meet_overlap_resolutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "overlap_key" text NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_by_user_id" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shared_meet_overlap_resolutions_key_idx" ON "shared_meet_overlap_resolutions" USING btree ("overlap_key");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shared_meet_overlap_resolutions" ADD CONSTRAINT "shared_meet_overlap_resolutions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
