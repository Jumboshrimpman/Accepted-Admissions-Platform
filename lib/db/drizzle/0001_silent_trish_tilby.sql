CREATE TABLE IF NOT EXISTS "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"imported_by" uuid NOT NULL,
	"title" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_url" text,
	"original_filename" text,
	"authorization_note" text NOT NULL,
	"extracted_text" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'imported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"visibility" text DEFAULT 'course' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "source_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "generation_method" text DEFAULT 'tutor-authored' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "rejection_reason" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_course_id_courses_id_fk') THEN
    ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_sources_imported_by_users_id_fk') THEN
    ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_artifacts_session_id_sessions_id_fk') THEN
    ALTER TABLE "session_artifacts" ADD CONSTRAINT "session_artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_artifacts_created_by_users_id_fk') THEN
    ALTER TABLE "session_artifacts" ADD CONSTRAINT "session_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_artifact_kind_unique_idx" ON "session_artifacts" USING btree ("session_id","kind");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_source_id_content_sources_id_fk') THEN
    ALTER TABLE "questions" ADD CONSTRAINT "questions_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_reviewed_by_users_id_fk') THEN
    ALTER TABLE "questions" ADD CONSTRAINT "questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;