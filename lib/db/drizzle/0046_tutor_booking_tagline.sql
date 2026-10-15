-- One-line booking tagline. Existing bios stay in biography. Null means no tagline yet.
ALTER TABLE "tutor_profiles" ADD COLUMN IF NOT EXISTS "tagline" text;
