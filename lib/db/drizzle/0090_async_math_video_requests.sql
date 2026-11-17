-- Asynchronous SAT Math video explanations (draft feature, off by default).
-- Additive and idempotent: CREATE IF NOT EXISTS only. Does not touch users,
-- sessions, assignments, payments, or credit_ledger. No student is enrolled
-- here; an administrator enables a student later from the admin dashboard.
-- Question photos live in Google Drive. These tables only store Drive IDs.

CREATE TABLE IF NOT EXISTS "math_video_enrollments" (
  "client_user_id" uuid PRIMARY KEY NOT NULL,
  "tutor_profile_id" uuid NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "offer_ends_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_enrollments" ADD CONSTRAINT "math_video_enrollments_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_enrollments" ADD CONSTRAINT "math_video_enrollments_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "math_video_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_user_id" uuid NOT NULL,
  "tutor_profile_id" uuid NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "question_count" integer DEFAULT 0 NOT NULL,
  "drive_folder_id" text,
  "submitted_at" timestamp with time zone,
  "due_at" timestamp with time zone,
  "youtube_video_id" text,
  "youtube_url" text,
  "follow_up_assignment_id" uuid,
  "tutor_note" text,
  "delivered_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "math_video_requests_status_check" CHECK ("status" IN ('draft', 'submitted', 'delivered', 'cancelled')),
  CONSTRAINT "math_video_requests_question_count_check" CHECK ("question_count" >= 0 AND "question_count" <= 10)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_requests" ADD CONSTRAINT "math_video_requests_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_requests" ADD CONSTRAINT "math_video_requests_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_requests" ADD CONSTRAINT "math_video_requests_follow_up_assignment_id_assignments_id_fk" FOREIGN KEY ("follow_up_assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "math_video_requests_client_created_idx" ON "math_video_requests" USING btree ("client_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "math_video_requests_tutor_status_idx" ON "math_video_requests" USING btree ("tutor_profile_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "math_video_request_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "item_index" integer NOT NULL,
  "drive_file_id" text NOT NULL,
  "drive_web_view_link" text,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "bytes" integer NOT NULL,
  "uploaded_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "math_video_request_files_item_index_check" CHECK ("item_index" >= 0 AND "item_index" < 10)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_request_files" ADD CONSTRAINT "math_video_request_files_request_id_math_video_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."math_video_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "math_video_request_files_request_idx" ON "math_video_request_files" USING btree ("request_id", "item_index");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "math_video_request_files_drive_file_idx" ON "math_video_request_files" USING btree ("drive_file_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "math_video_credit_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_user_id" uuid NOT NULL,
  "delta" integer NOT NULL,
  "kind" text NOT NULL,
  "request_id" uuid,
  "note" text,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "math_video_credit_entries_kind_check" CHECK ("kind" IN ('grant', 'adjustment', 'debit', 'refund')),
  CONSTRAINT "math_video_credit_entries_delta_check" CHECK ("delta" <> 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_credit_entries" ADD CONSTRAINT "math_video_credit_entries_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "math_video_credit_entries" ADD CONSTRAINT "math_video_credit_entries_request_id_math_video_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."math_video_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "math_video_credit_entries_client_idx" ON "math_video_credit_entries" USING btree ("client_user_id", "created_at");
--> statement-breakpoint
-- One debit and at most one refund per request, so a retried submit or
-- cancel never double-charges or double-refunds.
CREATE UNIQUE INDEX IF NOT EXISTS "math_video_credit_entries_request_kind_idx" ON "math_video_credit_entries" USING btree ("request_id", "kind") WHERE "request_id" IS NOT NULL;
