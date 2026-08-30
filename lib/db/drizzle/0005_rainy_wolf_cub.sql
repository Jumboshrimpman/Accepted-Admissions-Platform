ALTER TABLE "calendar_connections" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "client_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "duration_minutes" numeric DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "booking_status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "provider_event_url" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_client_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_client_user_id_users_id_fk"
      FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;