ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "review_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "result" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "student_feedback" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN IF NOT EXISTS "tutor_notes" text;