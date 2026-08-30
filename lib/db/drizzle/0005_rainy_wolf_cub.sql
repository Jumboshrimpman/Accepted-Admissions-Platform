ALTER TABLE "calendar_connections" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client_user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "duration_minutes" numeric DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "booking_status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "provider_event_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "provider_event_url" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;