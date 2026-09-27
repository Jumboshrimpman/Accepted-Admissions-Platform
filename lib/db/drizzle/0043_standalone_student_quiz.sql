-- Student to-dos that are not before-session prep for one meeting.
-- assigned_tutor_user_id is who receives the existing quiz-result review.

ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "assigned_student_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "assigned_tutor_user_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignments_assigned_student_idx" ON "assignments" USING btree ("assigned_student_user_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_student_user_id_users_id_fk" FOREIGN KEY ("assigned_student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_tutor_user_id_users_id_fk" FOREIGN KEY ("assigned_tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
