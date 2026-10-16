-- Login aliases point a verified Clerk email at an existing user.
-- They do not change users.email, users.role, users.display_name, or users.clerk_user_id.
CREATE TABLE IF NOT EXISTS "portal_login_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid NOT NULL,
	"clerk_user_id" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_login_aliases" ADD CONSTRAINT "portal_login_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_login_aliases_email_idx" ON "portal_login_aliases" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_login_aliases_user_id_idx" ON "portal_login_aliases" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_login_aliases_clerk_user_id_idx" ON "portal_login_aliases" USING btree ("clerk_user_id");
