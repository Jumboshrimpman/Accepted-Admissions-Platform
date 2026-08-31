ALTER TABLE "attempts" ADD COLUMN "review_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "analysis" jsonb;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "student_feedback" text;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "tutor_notes" text;