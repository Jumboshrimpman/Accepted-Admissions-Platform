-- Opt-in quiz tools: reference sheet, instructions footnote, mark-for-review
-- label, choice elimination, and an optional image on a choice (jsonb, no DDL).
-- Existing quizzes stay unchanged. Additive and idempotent.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "reference_sheet" text;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "instructions_footnote" text;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "mark_for_review" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "eliminate_choices" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN IF NOT EXISTS "eliminated_choice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
