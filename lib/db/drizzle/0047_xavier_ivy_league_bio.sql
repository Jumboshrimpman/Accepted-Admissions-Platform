-- Add Xavier's Ivy League admissions sentence to the published bio.
-- Only rows that still have the previous site biography are updated.
-- A biography an administrator already changed is left as stored.

UPDATE "tutor_profiles"
SET
  "biography" = 'Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He was admitted to multiple Ivy League schools before choosing Harvard. He currently works in finance at Jane Street Capital on Strategy and Product. He was a 2024 Rhodes Scholar and 2026 Oxford graduate, studying Philosophy for his Masters. Xavier is also an incoming member of the 2030 Harvard Law School class.',
  "updated_at" = now()
WHERE "name" = 'Xavier Morales'
  AND "biography" = 'Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He currently works in finance at Jane Street Capital on Strategy and Product. He was a 2024 Rhodes Scholar and 2026 Oxford graduate, studying Philosophy for his Masters. Xavier is also an incoming member of the 2030 Harvard Law School class.';
