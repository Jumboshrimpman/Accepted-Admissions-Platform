-- One student booking confirmation email per session.
-- Additive only. Does not change sessions, payments, or users, and does not backfill past bookings.
CREATE TABLE IF NOT EXISTS "student_booking_confirmation_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"payment_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_booking_confirmation_sends" ADD CONSTRAINT "student_booking_confirmation_sends_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_booking_confirmation_sends" ADD CONSTRAINT "student_booking_confirmation_sends_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_booking_confirmation_sends_session_idx" ON "student_booking_confirmation_sends" USING btree ("session_id");
