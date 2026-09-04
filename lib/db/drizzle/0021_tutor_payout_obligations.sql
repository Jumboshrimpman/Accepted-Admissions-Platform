CREATE TYPE "public"."tutor_payout_obligation_status" AS ENUM('pending', 'due', 'paid', 'reversed');
--> statement-breakpoint
CREATE TABLE "tutor_payout_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"session_date_time" timestamp with time zone NOT NULL,
	"duration_minutes" numeric NOT NULL,
	"payment_id" uuid,
	"purchase_reference" text,
	"tutor_rate_cents" numeric NOT NULL,
	"amount_owed_cents" numeric NOT NULL,
	"status" "tutor_payout_obligation_status" DEFAULT 'due' NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by_user_id" uuid,
	"payment_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tutor_payout_obligations" ADD CONSTRAINT "tutor_payout_obligations_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_obligation_session_unique_idx" ON "tutor_payout_obligations" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "tutor_payout_obligation_tutor_status_idx" ON "tutor_payout_obligations" USING btree ("tutor_user_id","status");
