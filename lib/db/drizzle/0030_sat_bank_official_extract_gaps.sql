-- Honest official-extract gaps: nullable skill/topic/difficulty, exam variant, extract flags.

ALTER TABLE "exam_source_collections" ADD COLUMN IF NOT EXISTS "exam_variant" text;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN IF NOT EXISTS "exam_variant" text;--> statement-breakpoint
ALTER TABLE "bank_questions" ADD COLUMN IF NOT EXISTS "extract_gaps" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ALTER COLUMN "skill" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ALTER COLUMN "domain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_questions" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_questions_dedup_idx" ON "bank_questions" USING btree ("exam_family","exam_variant","practice_test_number","section","module","question_number");
