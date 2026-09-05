-- Stop sending students and tutors to Google Drive from course records.

UPDATE "courses"
SET "drive_url" = NULL
WHERE "drive_url" ILIKE '%drive.google.com%'
   OR "drive_url" ILIKE '%docs.google.com%';
