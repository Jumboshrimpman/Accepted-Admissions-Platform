-- SAT/PSAT canonical question bank, source collections, homework plans, and remediation.

CREATE TABLE IF NOT EXISTS "exam_source_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_family" text NOT NULL,
	"practice_test_number" numeric,
	"form_code" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text,
	"extract_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_source_collections_slug_idx" ON "exam_source_collections" USING btree ("slug");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "exam_source_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"resource_url" text,
	"original_filename" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "exam_source_assets" ADD CONSTRAINT "exam_source_assets_collection_id_exam_source_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."exam_source_collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bank_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"collection_id" uuid NOT NULL,
	"exam_family" text NOT NULL,
	"practice_test_number" numeric,
	"form_code" text,
	"section" text NOT NULL,
	"module" numeric NOT NULL,
	"question_number" numeric NOT NULL,
	"position" numeric NOT NULL,
	"prompt" text NOT NULL,
	"stimulus" text,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_answer" text NOT NULL,
	"official_explanation" text DEFAULT '' NOT NULL,
	"figures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skill" text NOT NULL,
	"domain" text NOT NULL,
	"difficulty" text NOT NULL,
	"question_type" text DEFAULT 'mcq' NOT NULL,
	"estimated_seconds" numeric NOT NULL,
	"source_kind" text DEFAULT 'official_extract' NOT NULL,
	"source_files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_questions_source_key_idx" ON "bank_questions" USING btree ("source_key");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_collection_id_exam_source_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."exam_source_collections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_questions" ADD CONSTRAINT "bank_questions_linked_question_id_questions_id_fk" FOREIGN KEY ("linked_question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bank_question_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_question_id" uuid NOT NULL,
	"asset_id" uuid,
	"kind" text NOT NULL,
	"resource_url" text,
	"page_number" numeric,
	"note" text
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_question_assets" ADD CONSTRAINT "bank_question_assets_bank_question_id_bank_questions_id_fk" FOREIGN KEY ("bank_question_id") REFERENCES "public"."bank_questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_question_assets" ADD CONSTRAINT "bank_question_assets_asset_id_exam_source_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."exam_source_assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bank_ai_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_question_id" uuid NOT NULL,
	"selected_wrong_answer" text,
	"student_feedback" text,
	"tutor_guidance" text,
	"skill_weakness_analysis" text,
	"analogous_problem_prompt" text,
	"generated_by" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_ai_annotations_question_idx" ON "bank_ai_annotations" USING btree ("bank_question_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_ai_annotations" ADD CONSTRAINT "bank_ai_annotations_bank_question_id_bank_questions_id_fk" FOREIGN KEY ("bank_question_id") REFERENCES "public"."bank_questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "session_prework_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"homework_kind" text DEFAULT 'routine' NOT NULL,
	"target_minutes" numeric DEFAULT 60 NOT NULL,
	"estimated_seconds" numeric NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_prework_plans_session_idx" ON "session_prework_plans" USING btree ("session_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_prework_plans" ADD CONSTRAINT "session_prework_plans_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_prework_plans" ADD CONSTRAINT "session_prework_plans_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_prework_plans" ADD CONSTRAINT "session_prework_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "homework_weakness_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"miss_count" numeric NOT NULL,
	"priority" numeric NOT NULL,
	"bank_question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_weakness_groups_session_attempt_idx" ON "homework_weakness_groups" USING btree ("session_id","attempt_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "homework_weakness_groups" ADD CONSTRAINT "homework_weakness_groups_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "homework_weakness_groups" ADD CONSTRAINT "homework_weakness_groups_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "remediation_retries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"source_attempt_id" uuid NOT NULL,
	"source_bank_question_id" uuid,
	"source_question_id" uuid,
	"retry_bank_question_id" uuid,
	"retry_question_id" uuid,
	"source" text NOT NULL,
	"blocked_reason" text,
	"student_answer" text,
	"correct" boolean,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_source_attempt_id_attempts_id_fk" FOREIGN KEY ("source_attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_source_bank_question_id_bank_questions_id_fk" FOREIGN KEY ("source_bank_question_id") REFERENCES "public"."bank_questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_source_question_id_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_retry_bank_question_id_bank_questions_id_fk" FOREIGN KEY ("retry_bank_question_id") REFERENCES "public"."bank_questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "remediation_retries" ADD CONSTRAINT "remediation_retries_retry_question_id_questions_id_fk" FOREIGN KEY ("retry_question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
