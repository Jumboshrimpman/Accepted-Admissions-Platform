-- Parent viewers are provisioned from Admin People. Administrator stays
-- environment-only. The new enum value is committed in this migration so the
-- next migration can insert a viewer grant.
ALTER TYPE "public"."provisionable_role_category" ADD VALUE IF NOT EXISTS 'viewer';
--> statement-breakpoint
ALTER TABLE "portal_access_grants" ADD COLUMN IF NOT EXISTS "linked_student_email" text;
