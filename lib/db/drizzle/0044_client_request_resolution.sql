-- Track when an administrator resolves a public form submission.
-- Existing rows stay unresolved unless they were already closed.

ALTER TABLE "client_requests" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "client_requests" ADD COLUMN IF NOT EXISTS "resolved_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "client_requests"
SET "resolved_at" = "created_at"
WHERE "status" = 'closed' AND "resolved_at" IS NULL;
