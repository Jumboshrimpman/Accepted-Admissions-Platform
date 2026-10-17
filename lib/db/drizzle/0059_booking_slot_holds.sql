-- Direct-checkout slot holds. 0053 (#151) stays reserved.
-- An unreleased row blocks the same tutor, start, and length.
-- Overlapping lengths are rejected under the tutor advisory lock.
-- Deleting the payment removes its hold.

CREATE TABLE IF NOT EXISTS "booking_slot_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tutor_profile_id" uuid NOT NULL,
  "client_user_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "start_time" timestamp with time zone NOT NULL,
  "duration_minutes" numeric NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_slot_holds" ADD CONSTRAINT "booking_slot_holds_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_slot_holds" ADD CONSTRAINT "booking_slot_holds_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "booking_slot_holds" ADD CONSTRAINT "booking_slot_holds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_slot_holds_payment_idx" ON "booking_slot_holds" USING btree ("payment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "booking_slot_holds_active_slot_idx" ON "booking_slot_holds" USING btree ("tutor_profile_id", "start_time", "duration_minutes") WHERE "released_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_slot_holds_tutor_expires_idx" ON "booking_slot_holds" USING btree ("tutor_profile_id", "expires_at");
