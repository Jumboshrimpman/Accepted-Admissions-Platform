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
--> statement-breakpoint
-- One-shot at migrate time. Sessions already inside the next 24 hours must not
-- get a day-before email on the first tick. Sophia's student reminder is not
-- claimed here; she keeps the wide window from #268. Later restarts do not
-- repeat this insert.
INSERT INTO "student_session_reminder_sends" ("session_id", "recipient_user_id", "recipient_email", "audience", "kind")
SELECT sessions."id", users."id", lower(btrim(users."email")), 'student', '1_day'
FROM "sessions" AS sessions
JOIN "users" AS users ON users."id" = sessions."client_user_id"
WHERE sessions."date_time" > now()
  AND sessions."date_time" <= now() + interval '24 hours'
  AND sessions."cancelled_at" IS NULL
  AND sessions."booking_status" = 'confirmed'
  AND sessions."status" <> 'archived'
  AND users."role" = 'student'
  AND (
    lower(btrim(users."email")) IN (
      'taito0525@gmail.com',
      'makaremmichelle7@gmail.com',
      'sophiasleiman13@gmail.com'
    )
    OR users."clerk_user_id" = 'user_3JCRGfBj8dgWSjO1r2zeKovFVE7'
    OR users."id" = 'bf530aa6-faaa-43df-b3cf-140026f3313e'
  )
  AND users."id" <> 'bf530aa6-faaa-43df-b3cf-140026f3313e'
  AND lower(btrim(users."email")) <> 'sophiasleiman13@gmail.com'
ON CONFLICT ("session_id", "recipient_email", "kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "student_session_reminder_sends" ("session_id", "recipient_user_id", "recipient_email", "audience", "kind")
SELECT sessions."id", tutors."id", lower(btrim(tutors."email")), 'tutor', '1_day'
FROM "sessions" AS sessions
JOIN "users" AS students ON students."id" = sessions."client_user_id"
JOIN "users" AS tutors ON tutors."id" = sessions."tutor_user_id"
WHERE sessions."date_time" > now()
  AND sessions."date_time" <= now() + interval '24 hours'
  AND sessions."cancelled_at" IS NULL
  AND sessions."booking_status" = 'confirmed'
  AND sessions."status" <> 'archived'
  AND students."role" = 'student'
  AND tutors."role" = 'tutor'
  AND lower(btrim(tutors."email")) <> 'admin@acceptedadmissions.org'
  AND (
    lower(btrim(students."email")) IN (
      'taito0525@gmail.com',
      'makaremmichelle7@gmail.com',
      'sophiasleiman13@gmail.com'
    )
    OR students."clerk_user_id" = 'user_3JCRGfBj8dgWSjO1r2zeKovFVE7'
    OR students."id" = 'bf530aa6-faaa-43df-b3cf-140026f3313e'
  )
ON CONFLICT ("session_id", "recipient_email", "kind") DO NOTHING;
