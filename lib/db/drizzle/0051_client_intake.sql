-- Reusable client intake. Additive only: new tables and assignments.
-- Does not change users, roles, or emails.
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
	"recording_consent" boolean NOT NULL,
	"recording_consent_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_intake_responses_consent_check" CHECK ("recording_consent" = true),
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
--> statement-breakpoint
INSERT INTO "client_intake_assignments" ("client_user_id")
SELECT "id" FROM "users"
WHERE "id" = '6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19'
  AND "role" = 'student'
ON CONFLICT ("client_user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "client_intake_assignments" ("client_user_id")
SELECT "id" FROM "users"
WHERE "role" = 'student'
  AND "display_name" = 'Sophia Sleiman'
  AND (
    SELECT count(*) FROM "users"
    WHERE "role" = 'student' AND "display_name" = 'Sophia Sleiman'
  ) = 1
ON CONFLICT ("client_user_id") DO NOTHING;
