CREATE TABLE IF NOT EXISTS "admin_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"guidance_request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'admin_notifications_recipient_user_id_users_id_fk'
			AND conrelid = 'public.admin_notifications'::regclass
	) THEN
		ALTER TABLE "admin_notifications"
			ADD CONSTRAINT "admin_notifications_recipient_user_id_users_id_fk"
			FOREIGN KEY ("recipient_user_id")
			REFERENCES "public"."users"("id")
			ON DELETE no action
			ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'admin_notifications_guidance_request_id_client_requests_id_fk'
			AND conrelid = 'public.admin_notifications'::regclass
	) THEN
		ALTER TABLE "admin_notifications"
			ADD CONSTRAINT "admin_notifications_guidance_request_id_client_requests_id_fk"
			FOREIGN KEY ("guidance_request_id")
			REFERENCES "public"."client_requests"("id")
			ON DELETE no action
			ON UPDATE no action;
	END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_notifications_recipient_created_idx" ON "admin_notifications" USING btree ("recipient_user_id","created_at");