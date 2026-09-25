-- Link existing Ryo and Taito app users when both rows already exist.
-- Role, Clerk id, and the portal_access_grants row are upserted on API startup
-- (ensureRyoTaitoParentMirror). Postgres cannot use an enum value added in an
-- earlier migration of the same transaction, so this file does not set
-- app_role or insert a viewer grant. No Clerk invitation is sent.
INSERT INTO "viewer_links" ("viewer_user_id", "student_user_id", "relationship", "active")
SELECT viewer."id", student."id", 'view only mirror of Taito’s client account', true
FROM "users" AS viewer
JOIN "users" AS student
  ON lower(student."email") = 'taito0525@gmail.com'
 AND student."role" = 'student'
WHERE lower(viewer."email") = 'ryo@jaac.co.jp'
ON CONFLICT ("viewer_user_id", "student_user_id") DO UPDATE SET
  "active" = true,
  "relationship" = EXCLUDED."relationship";
--> statement-breakpoint
UPDATE "viewer_links"
SET "active" = false
WHERE "viewer_user_id" IN (
  SELECT "id" FROM "users" WHERE lower("email") = 'ryo@jaac.co.jp'
)
AND "student_user_id" NOT IN (
  SELECT "id" FROM "users"
  WHERE lower("email") = 'taito0525@gmail.com'
    AND "role" = 'student'
);
