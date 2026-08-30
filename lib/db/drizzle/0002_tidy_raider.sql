ALTER TABLE "session_artifacts" ALTER COLUMN "visibility" SET DEFAULT 'tutor';--> statement-breakpoint
ALTER TABLE "session_artifacts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft' NOT NULL;