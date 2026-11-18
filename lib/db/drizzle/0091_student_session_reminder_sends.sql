-- Sophia Sleiman session reminders (1 day and 1 hour before). Additive only.
-- Idempotent claim table keyed on (session_id, kind). Does not send calendar invites.
CREATE TABLE IF NOT EXISTS "student_session_reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_session_reminder_sends" ADD CONSTRAINT "student_session_reminder_sends_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_session_reminder_sends_session_kind_idx" ON "student_session_reminder_sends" USING btree ("session_id","kind");
--> statement-breakpoint
-- Tomorrow's Nov 18 Sophia S 1-day reminder is being sent manually. Do not auto-send it on deploy.
INSERT INTO "student_session_reminder_sends" ("session_id", "kind")
SELECT "id", '1_day'
FROM "sessions"
WHERE "id" = 'c12af998-dd0b-4dd3-a618-d5be14b5ddb2'
ON CONFLICT DO NOTHING;
