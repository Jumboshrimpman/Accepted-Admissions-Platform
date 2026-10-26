-- A per-quiz soft time limit. Existing quizzes stay hard-timed.
-- Additive and idempotent. Does not change attempts, scores, or responses.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "soft_time_limit" boolean DEFAULT false NOT NULL;
