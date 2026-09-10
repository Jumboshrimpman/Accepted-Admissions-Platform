CREATE TABLE IF NOT EXISTS "question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_index" numeric DEFAULT 0 NOT NULL,
	"student_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"stem_snippet" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_reports_status_created_idx" ON "question_reports" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_reports_attempt_question_idx" ON "question_reports" USING btree ("attempt_id","question_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
