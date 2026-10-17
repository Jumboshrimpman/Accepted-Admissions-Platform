-- Neel's account email for calendar invites.
-- Idempotent: a second run sets the same address. If another users row already
-- has this email, this statement changes zero rows.
-- Touches users.email for this id only. Alias rows, grants, and access tokens stay.
-- Journal order on this branch: 0061, 0062, 0064, then this file.
-- when 1792680000000, after 0064 (1792650000000) and before the essay migration
-- at 1792700000000.

UPDATE "users"
SET "email" = 'ndharni300@gmail.com'
WHERE "id" = '6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19'
  AND NOT EXISTS (
    SELECT 1
    FROM "users"
    WHERE lower("email") = 'ndharni300@gmail.com'
      AND "id" <> '6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19'
  );
