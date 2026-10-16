-- Single-use nonces for admin-generated Google Calendar reconnect links.
CREATE TABLE IF NOT EXISTS "calendar_oauth_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"tutor_profile_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calendar_oauth_nonces" ADD CONSTRAINT "calendar_oauth_nonces_tutor_profile_id_tutor_profiles_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "public"."tutor_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_oauth_nonces_nonce_idx" ON "calendar_oauth_nonces" USING btree ("nonce");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_oauth_nonces_tutor_profile_idx" ON "calendar_oauth_nonces" USING btree ("tutor_profile_id");
