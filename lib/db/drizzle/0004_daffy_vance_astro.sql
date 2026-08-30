ALTER TYPE "public"."app_role" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"weekly_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"booking_notice_minutes" numeric DEFAULT 1440 NOT NULL,
	"buffer_minutes" numeric DEFAULT 15 NOT NULL,
	"blackout_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"calendar_id" text,
	"encrypted_access_token" text,
	"encrypted_refresh_token" text,
	"connected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_name" text NOT NULL,
	"student_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"grade_or_graduation_year" text NOT NULL,
	"current_school" text NOT NULL,
	"service_requested" text NOT NULL,
	"current_sat_total" text,
	"current_reading_writing" text,
	"current_math" text,
	"target_sat_score" text,
	"planned_test_date" text,
	"goals" text NOT NULL,
	"scheduling_availability" text NOT NULL,
	"referral_source" text NOT NULL,
	"consent_to_contact" boolean NOT NULL,
	"privacy_acknowledged" boolean NOT NULL,
	"source_page" text DEFAULT '/client-request' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_staff_user_id" uuid,
	"follow_up_notes" text,
	"conversion_status" text DEFAULT 'unqualified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"product_id" uuid,
	"session_id" uuid,
	"entry_type" text NOT NULL,
	"hours" numeric NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_invoice_id" text,
	"description" text NOT NULL,
	"subtotal_cents" numeric NOT NULL,
	"discount_cents" numeric DEFAULT 0 NOT NULL,
	"total_cents" numeric NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"approved_for_student" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid,
	"invoice_id" uuid,
	"product_id" uuid,
	"amount_cents" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'stripe' NOT NULL,
	"provider_event_id" text,
	"internal_note" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"page_type" text NOT NULL,
	"title" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sat_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"duration_hours" numeric NOT NULL,
	"total_price_cents" numeric NOT NULL,
	"effective_hourly_rate_cents" numeric NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_compensation_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"hourly_rate_cents" numeric NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT 'Tutor' NOT NULL,
	"photo_url" text,
	"biography" text,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linkedin_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"booking_eligible" boolean DEFAULT false NOT NULL,
	"calendar_status" text DEFAULT 'disconnected' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_user_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"relationship" text DEFAULT 'read-only viewer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_assigned_staff_user_id_users_id_fk" FOREIGN KEY ("assigned_staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_product_id_sat_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."sat_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_records" ADD CONSTRAINT "meeting_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_records" ADD CONSTRAINT "meeting_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_sat_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."sat_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_compensation_rates" ADD CONSTRAINT "tutor_compensation_rates_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_compensation_rates" ADD CONSTRAINT "tutor_compensation_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_links" ADD CONSTRAINT "viewer_links_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_links" ADD CONSTRAINT "viewer_links_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_event_idx" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_content_slug_idx" ON "public_content" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_product_slug_idx" ON "sat_products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profile_email_idx" ON "tutor_profiles" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "viewer_link_unique_idx" ON "viewer_links" USING btree ("viewer_user_id","student_user_id");