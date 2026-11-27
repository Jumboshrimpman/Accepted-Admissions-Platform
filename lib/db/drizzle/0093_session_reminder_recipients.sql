-- Session reminders are one row per session, recipient, and kind
-- (student or tutor only). Existing Sophia-only rows stay claimed
-- as her student reminder. Additive: no drops of tables or columns.
ALTER TABLE "student_session_reminder_sends" ADD COLUMN IF NOT EXISTS "recipient_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "student_session_reminder_sends" ADD COLUMN IF NOT EXISTS "recipient_email" text;
--> statement-breakpoint
ALTER TABLE "student_session_reminder_sends" ADD COLUMN IF NOT EXISTS "audience" text;
--> statement-breakpoint
UPDATE "student_session_reminder_sends" AS sends
SET
  "recipient_user_id" = COALESCE(sends."recipient_user_id", sessions."client_user_id"),
  "recipient_email" = COALESCE(sends."recipient_email", lower(btrim(users."email"))),
  "audience" = COALESCE(sends."audience", 'student')
FROM "sessions" AS sessions
JOIN "users" AS users ON users."id" = sessions."client_user_id"
WHERE sessions."id" = sends."session_id"
  AND (
    sends."recipient_email" IS NULL
    OR btrim(sends."recipient_email") = ''
    OR sends."audience" IS NULL
  );
--> statement-breakpoint
UPDATE "student_session_reminder_sends"
SET
  "recipient_email" = COALESCE(NULLIF(lower(btrim("recipient_email")), ''), 'sophiasleiman13@gmail.com'),
  "audience" = COALESCE(NULLIF(btrim("audience"), ''), 'student')
WHERE "recipient_email" IS NULL OR btrim("recipient_email") = '' OR "audience" IS NULL;
--> statement-breakpoint
UPDATE "student_session_reminder_sends"
SET "recipient_email" = lower(btrim("recipient_email"))
WHERE "recipient_email" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_session_reminder_sends" ALTER COLUMN "recipient_email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_session_reminder_sends" ALTER COLUMN "audience" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_session_reminder_sends"
    ADD CONSTRAINT "student_session_reminder_sends_recipient_user_id_users_id_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_session_reminder_sends"
    ADD CONSTRAINT "student_session_reminder_sends_audience_check"
    CHECK ("audience" IN ('student', 'tutor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "student_session_reminder_sends"
    ADD CONSTRAINT "student_session_reminder_sends_kind_check"
    CHECK ("kind" IN ('1_day', '1_hour'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_session_reminder_sends_session_recipient_kind_idx"
  ON "student_session_reminder_sends" USING btree ("session_id", "recipient_email", "kind");
--> statement-breakpoint
DROP INDEX IF EXISTS "student_session_reminder_sends_session_kind_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_session_reminder_sends_recipient_user_idx"
  ON "student_session_reminder_sends" USING btree ("recipient_user_id");
