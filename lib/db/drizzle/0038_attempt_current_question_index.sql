-- Persist the student's place in an in-progress quiz so Resume lands on the
-- same question after Save for later, refresh, or leaving the player.
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "current_question_index" numeric DEFAULT 0 NOT NULL;
