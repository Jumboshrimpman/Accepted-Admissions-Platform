CREATE TYPE "public"."provisionable_role_category" AS ENUM('sat_tutor', 'english_tutor', 'tutor', 'student');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"clerk_user_id" text,
	"display_name" text NOT NULL,
	"role_category" "provisionable_role_category" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"provisioned_by_user_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_provisioned_by_user_id_users_id_fk" FOREIGN KEY ("provisioned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_access_grants_email_idx" ON "portal_access_grants" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_access_grants_clerk_user_id_idx" ON "portal_access_grants" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_access_grants_active_created_idx" ON "portal_access_grants" USING btree ("active","created_at");
