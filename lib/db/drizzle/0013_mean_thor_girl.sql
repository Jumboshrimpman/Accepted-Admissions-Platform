CREATE TABLE "stripe_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"amount_cents" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_transfer_id" text,
	"reversed_amount_cents" numeric DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tutor_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tutor_share_cents" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "platform_share_cents" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "stripe_connect_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "stripe_connect_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "stripe_connect_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_transfers" ADD CONSTRAINT "stripe_transfers_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transfers" ADD CONSTRAINT "stripe_transfers_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_transfer_payment_unique_idx" ON "stripe_transfers" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_transfer_provider_id_idx" ON "stripe_transfers" USING btree ("provider_transfer_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;