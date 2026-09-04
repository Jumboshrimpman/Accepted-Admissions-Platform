ALTER TABLE "admin_notifications" ALTER COLUMN "guidance_request_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "session_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "admin_notifications"
    ADD CONSTRAINT "admin_notifications_session_id_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
