-- Reusable client intake. Additive tables only.
-- Does not insert assignment rows, and does not change users, sessions, or emails.
-- Neel and Sophia see the quiz from the application. A row is written when they submit.
CREATE TABLE IF NOT EXISTS "client_intake_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_intake_assignments" ADD CONSTRAINT "client_intake_assignments_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_intake_assignments" ADD CONSTRAINT "client_intake_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_intake_assignments_client_user_id_idx" ON "client_intake_assignments" USING btree ("client_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_intake_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"client_user_id" uuid NOT NULL,
	"respondent_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"latest_sat_score" integer NOT NULL,
	"latest_gpa" text NOT NULL,
	"school" text NOT NULL,
	"dream_university_1" text NOT NULL,
	"dream_university_2" text NOT NULL,
	"dream_university_3" text NOT NULL,
	"target_safety_school" text,
	"main_focus" text NOT NULL,
	"target_sat_date" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_intake_responses_focus_check" CHECK ("main_focus" IN ('college_consulting', 'essay_help', 'sat_tutoring')),
	CONSTRAINT "client_intake_responses_sat_score_check" CHECK ("latest_sat_score" BETWEEN 400 AND 1600),
	CONSTRAINT "client_intake_responses_sat_date_check" CHECK (
		("main_focus" = 'sat_tutoring' AND "target_sat_date" IS NOT NULL)
		OR ("main_focus" <> 'sat_tutoring' AND "target_sat_date" IS NULL)
	)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_intake_responses" ADD CONSTRAINT "client_intake_responses_assignment_id_client_intake_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."client_intake_assignments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_intake_responses" ADD CONSTRAINT "client_intake_responses_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_intake_responses_assignment_id_idx" ON "client_intake_responses" USING btree ("assignment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_intake_responses_client_user_id_idx" ON "client_intake_responses" USING btree ("client_user_id");
