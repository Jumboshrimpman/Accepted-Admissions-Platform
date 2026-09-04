CREATE TABLE IF NOT EXISTS "curriculum_library_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"description" text,
	"resource_url" text,
	"body" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_library_assets" ADD CONSTRAINT "curriculum_library_assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "curriculum_blocks" ADD COLUMN IF NOT EXISTS "library_asset_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "curriculum_blocks" ADD CONSTRAINT "curriculum_blocks_library_asset_id_curriculum_library_assets_id_fk" FOREIGN KEY ("library_asset_id") REFERENCES "public"."curriculum_library_assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_blocks_session_library_asset_idx" ON "curriculum_blocks" USING btree ("session_id","library_asset_id");
