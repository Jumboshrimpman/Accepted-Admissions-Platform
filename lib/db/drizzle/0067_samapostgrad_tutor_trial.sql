-- Sama's test student can book College Consulting on the real course.
-- The reviewed identity is Clerk user user_3IxQY4GUjQGp9wT1WXzbyCVH67G with
-- email samapostgrad@gmail.com. Each statement uses that pair to find one
-- users.id and does not change the user row.
-- Idempotent: course_member_unique_idx and tutor_assignment_unique_idx make a
-- second run insert nothing.
-- when 1792690000000 sits after 0065 (1792680000000) and before #162's
-- 0066_nika_essay_editing (1792700000000). Apply this file before that one.
-- If 1792700000000 is already recorded in drizzle.__drizzle_migrations, this
-- earlier timestamp would be skipped and must be renumbered above it first.

INSERT INTO "course_memberships" ("course_id", "user_id", "membership_role", "subject")
SELECT
  'c3b8e1a4-7d2f-4b6a-8e15-9a0c4d7e2f31',
  student."id",
  'student',
  'College Consulting'
FROM "users" AS student
WHERE student."clerk_user_id" = 'user_3IxQY4GUjQGp9wT1WXzbyCVH67G'
  AND lower(student."email") = 'samapostgrad@gmail.com'
  AND student."role" = 'student'
  AND EXISTS (
    SELECT 1
    FROM "courses"
    WHERE "courses"."id" = 'c3b8e1a4-7d2f-4b6a-8e15-9a0c4d7e2f31'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "tutor_assignments" (
  "course_id",
  "tutor_user_id",
  "student_user_id",
  "subject"
)
SELECT
  'c3b8e1a4-7d2f-4b6a-8e15-9a0c4d7e2f31',
  tutor."id",
  student."id",
  'College Consulting'
FROM "users" AS student
JOIN "users" AS tutor
  ON tutor."id" = 'a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63'
  OR lower(tutor."email") IN (
    'nika.raiffe@gmail.com',
    'xaver.rmz6@gmail.com',
    'eunice_chon@berkeley.edu'
  )
WHERE student."clerk_user_id" = 'user_3IxQY4GUjQGp9wT1WXzbyCVH67G'
  AND lower(student."email") = 'samapostgrad@gmail.com'
  AND student."role" = 'student'
  AND EXISTS (
    SELECT 1
    FROM "courses"
    WHERE "courses"."id" = 'c3b8e1a4-7d2f-4b6a-8e15-9a0c4d7e2f31'
  )
ON CONFLICT DO NOTHING;
