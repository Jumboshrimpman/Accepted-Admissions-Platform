-- Minimum booking notice: 8 hours for Nika Raiffe, 4 hours for every other active tutor.
-- Inactive tutors other than Nika keep their current notice.
-- New rows default to 4 hours. The column change does not rewrite existing rows;
-- the UPDATE below is the live change, in one statement.

ALTER TABLE "availability_rules" ALTER COLUMN "booking_notice_minutes" SET DEFAULT 240;
--> statement-breakpoint
UPDATE "availability_rules" AS ar
SET "booking_notice_minutes" = CASE WHEN tp.name = 'Nika Raiffe' THEN 480 ELSE 240 END,
    "updated_at" = now()
FROM "tutor_profiles" AS tp
WHERE ar.tutor_profile_id = tp.id
  AND (tp.name = 'Nika Raiffe' OR tp.active IS TRUE);
