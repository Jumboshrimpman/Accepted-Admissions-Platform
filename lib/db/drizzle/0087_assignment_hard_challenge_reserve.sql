-- Marks the tutor-held hard reserve so resolvers do not treat it as the
-- session's during-session practice assignment. Existing quizzes stay unmarked.
-- Additive and idempotent.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "hard_challenge_reserve" boolean DEFAULT false NOT NULL;

UPDATE "assignments"
SET "hard_challenge_reserve" = true
WHERE "hard_challenge_reserve" = false
  AND "delivery_phase" = 'during_session'
  AND "title" ILIKE 'Hard challenge set (%';
