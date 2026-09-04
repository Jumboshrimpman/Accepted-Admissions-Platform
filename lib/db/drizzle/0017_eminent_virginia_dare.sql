ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'unread' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_notifications_recipient_status_created_idx" ON "admin_notifications" USING btree ("recipient_user_id","status","created_at");