-- Close Nika from 2026-10-26 onward. 0072 removed those keys, so weekly
-- hours filled every later date. Restore the 0062 closed span: empty lists
-- from Oct 26 through Nov 15, plus 2099-12-31. A missing key inside the
-- first-to-last listed dates is closed, so nothing after Oct 25 stays open.
-- Keys before 2026-10-26 are copied unchanged. Sessions, calendar events,
-- and weekly hours are not written. Nika Raiffe only.

UPDATE "availability_rules" AS ar
SET "date_hours" = COALESCE((
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(ar."date_hours") AS entry(key, value)
      WHERE entry.key < '2026-10-26'
    ), '{}'::jsonb) || '{
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
  "2026-11-15": [],
  "2099-12-31": []
}'::jsonb,
    "updated_at" = now()
FROM "tutor_profiles" AS tp
WHERE ar."tutor_profile_id" = tp."id"
  AND tp."name" = 'Nika Raiffe';
