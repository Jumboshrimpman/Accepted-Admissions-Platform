-- Nika essay editing. Does not rewrite availability, sessions, or users.
-- Async grants no bookable hour. The follow-up grants one hour on
-- college-consulting-nika-hour when the webhook marks the payment paid.
-- PDFs live in this table. The app has no private document bucket.
-- Idempotent: CREATE IF NOT EXISTS, duplicate constraints are ignored,
-- and product inserts use ON CONFLICT DO NOTHING.
--
-- Journal idx 79, when 1792830000000, after 0077_ielts_routine_answer_spread
-- (idx 77, when 1792810000000). Idx 78 belongs to the weekly-hours migration.

CREATE TABLE IF NOT EXISTS "essay_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_user_id" uuid NOT NULL,
  "tutor_profile_id" uuid NOT NULL,
  "product_id" uuid,
  "payment_id" uuid,
  "session_id" uuid,
  "kind" text NOT NULL,
  "status" text DEFAULT 'pending_payment' NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "call_start" timestamp with time zone,
  "original_filename" text NOT NULL,
  "original_pdf" bytea NOT NULL,
  "original_bytes" integer NOT NULL,
  "edited_filename" text,
  "edited_pdf" bytea,
  "edited_bytes" integer,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "essay_requests_kind_check" CHECK ("kind" IN ('async', 'followup')),
  CONSTRAINT "essay_requests_status_check" CHECK ("status" IN ('pending_payment', 'submitted', 'done', 'cancelled')),
  CONSTRAINT "essay_requests_original_bytes_check" CHECK ("original_bytes" > 0 AND "original_bytes" <= 10485760)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "essay_requests" ADD CONSTRAINT "essay_requests_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "essay_requests" ADD CONSTRAINT "essay_requests_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "essay_requests" ADD CONSTRAINT "essay_requests_product_id_sat_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."sat_products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "essay_requests" ADD CONSTRAINT "essay_requests_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "essay_requests" ADD CONSTRAINT "essay_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "essay_requests_client_created_idx" ON "essay_requests" USING btree ("client_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "essay_requests_tutor_status_idx" ON "essay_requests" USING btree ("tutor_profile_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "essay_requests_payment_idx" ON "essay_requests" USING btree ("payment_id");
--> statement-breakpoint
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
    'college-consulting-nika-essay-async',
    'Essay editing, 1 hr (async)',
    'One hour of asynchronous essay editing with Nika. Upload one PDF and choose a due time at least 24 hours later. There is no meeting.',
    1,
    10000,
    10000,
    true,
    now(),
    now()
  ),
  (
    'college-consulting-nika-essay-followup',
    'Essay editing + 1 hr follow-up call, 2 hrs',
    'One hour of asynchronous essay editing with Nika plus a one-hour follow-up call at least 24 hours after the upload. Editing is due when the call starts.',
    2,
    20000,
    10000,
    true,
    now(),
    now()
  )
ON CONFLICT ("slug") DO NOTHING;
