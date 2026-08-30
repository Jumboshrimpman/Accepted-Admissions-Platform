CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "hosted_invoice_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount_cents" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sat_products" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "sat_products" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_webhook_event_provider_id_idx" ON "stripe_webhook_events" USING btree ("provider_event_id");