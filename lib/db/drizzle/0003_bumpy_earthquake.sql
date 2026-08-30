CREATE TABLE IF NOT EXISTS "tutor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sources" ADD COLUMN IF NOT EXISTS "subject" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_memberships" ADD COLUMN IF NOT EXISTS "subject" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tutor_assignments_course_id_courses_id_fk') THEN
    ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tutor_assignments_tutor_user_id_users_id_fk') THEN
    ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tutor_assignments_student_user_id_users_id_fk') THEN
    ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tutor_assignment_unique_idx" ON "tutor_assignments" USING btree ("course_id","tutor_user_id","student_user_id","subject");