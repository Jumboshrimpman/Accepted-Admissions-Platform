-- Refresh public tutor bios that still have the pre-2026 seed copy.
-- Do not rewrite 0009; this updates already-applied rows in place.
-- Administrator-edited biographies that no longer match the stale seed text stay unchanged.

UPDATE "tutor_profiles"
SET
  "biography" = 'Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He currently works in finance at Jane Street Capital on Strategy and Product. He was a 2024 Rhodes Scholar and 2026 Oxford graduate, studying Philosophy for his Masters. Xavier is also an incoming member of the 2030 Harvard Law School class.',
  "updated_at" = now()
WHERE "name" = 'Xavier Morales'
  AND "biography" = 'Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He is a 2024 Rhodes Scholar, studying Philosophy for his Masters at Oxford until 2026. Xavier is also an incoming member of the 2029 Harvard Law School class.';
--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "biography" = 'Eunice is a Harvard 2024 graduate in History of Science and Philosophy at Harvard College, where she earned high honors. She is currently a doctoral student in History and a clinical researcher at Harvard Medical School/Massachusetts General Hospital.',
  "updated_at" = now()
WHERE "name" = 'Eunice Chon'
  AND "biography" = 'Eunice Chon is a third-year at Harvard College studying History of Science and Philosophy, with a secondary in Global Health and Health Policy. She is passionate about disability advocacy and law, including mental health justice and activism. She is a Coca-Cola Scholar.';
--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "biography" = 'Nika Raiffe is a senior studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She is currently a summer business analyst in the Goldman Sachs Business Intelligence Group. She previously worked at Columbia''s Irving Medical Center as a Research Intern on Relational Health.',
  "updated_at" = now()
WHERE "name" = 'Nika Raiffe'
  AND "biography" = 'Nika Raiffe is a sophomore studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She grew up in Eastern Europe, before graduating from Stuyvesant High School.';
