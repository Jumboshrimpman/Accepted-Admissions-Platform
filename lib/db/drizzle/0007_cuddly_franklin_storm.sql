ALTER TABLE "credit_ledger" ADD COLUMN "fulfillment_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_fulfillment_key_idx" ON "credit_ledger" USING btree ("fulfillment_key");