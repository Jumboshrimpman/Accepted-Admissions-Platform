-- One send record per student and pre-work assignment.
-- Additive only. Does not change assignments, attempts, sessions, or users.
CREATE TABLE IF NOT EXISTS "prework_reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"session_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prework_reminder_sends" DROP CONSTRAINT IF EXISTS "prework_reminder_sends_assignment_id_assignments_id_fk";
--> statement-breakpoint
ALTER TABLE "prework_reminder_sends" DROP CONSTRAINT IF EXISTS "prework_reminder_sends_student_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "prework_reminder_sends" DROP CONSTRAINT IF EXISTS "prework_reminder_sends_session_id_sessions_id_fk";
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prework_reminder_sends" ADD CONSTRAINT "prework_reminder_sends_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prework_reminder_sends" ADD CONSTRAINT "prework_reminder_sends_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prework_reminder_sends" ADD CONSTRAINT "prework_reminder_sends_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prework_reminder_sends_assignment_student_idx" ON "prework_reminder_sends" USING btree ("assignment_id","student_user_id");
