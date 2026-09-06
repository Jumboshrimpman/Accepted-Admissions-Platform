-- Persist each signed-in user's editable chrome title and avatar on the app user.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
