-- Date-specific bookable windows. A key replaces weekly hours for that civil date.
-- An empty list closes the date. Missing keys keep weekly hours.
-- Nika's map is the fixed week of Oct 19–25 2026 plus a close through Nov 15.
-- Weekly hours are left unchanged. An administrator can replace date_hours later.

ALTER TABLE "availability_rules" ADD COLUMN "date_hours" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "availability_rules" AS ar
SET "date_hours" = '{
  "2026-10-19": [{"start": "21:00", "end": "22:00"}],
  "2026-10-20": [],
  "2026-10-21": [{"start": "18:05", "end": "19:30"}],
  "2026-10-22": [{"start": "16:00", "end": "17:00"}, {"start": "18:00", "end": "19:00"}],
  "2026-10-23": [{"start": "16:00", "end": "20:00"}],
  "2026-10-24": [{"start": "13:00", "end": "20:00"}],
  "2026-10-25": [{"start": "13:00", "end": "20:00"}],
  "2026-10-26": [],
  "2026-10-27": [],
  "2026-10-28": [],
  "2026-10-29": [],
  "2026-10-30": [],
  "2026-10-31": [],
  "2026-11-01": [],
  "2026-11-02": [],
  "2026-11-03": [],
  "2026-11-04": [],
  "2026-11-05": [],
  "2026-11-06": [],
  "2026-11-07": [],
  "2026-11-08": [],
  "2026-11-09": [],
  "2026-11-10": [],
  "2026-11-11": [],
  "2026-11-12": [],
  "2026-11-13": [],
  "2026-11-14": [],
  "2026-11-15": []
}'::jsonb,
    "updated_at" = now()
FROM "tutor_profiles" AS tp
WHERE ar.tutor_profile_id = tp.id
  AND tp.name = 'Nika Raiffe';
