-- A student can hide a quiz from their own active list.
-- Additive only. Does not change assignments, attempts, responses, scores, or users.
CREATE TABLE IF NOT EXISTS "student_quiz_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_quiz_resolutions" ADD CONSTRAINT "student_quiz_resolutions_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_quiz_resolutions" ADD CONSTRAINT "student_quiz_resolutions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_quiz_resolutions_student_assignment_idx" ON "student_quiz_resolutions" USING btree ("student_user_id","assignment_id");
