-- From 2026-10-26, Nika uses weekly hours minus Google free/busy.
-- 0062 closed every date from 2026-10-26 through 2099-12-31, and a missing
-- key inside that span is closed too. Drop only keys on or after 2026-10-26.
-- Leave 2026-10-17 through 2026-10-25, including the Oct 19 21:00–22:00 window.
-- Do not write weekly_hours. If they have no open window, change nothing.
-- Touches Nika Raiffe only.

UPDATE "availability_rules" AS ar
SET "date_hours" = COALESCE((
      SELECT jsonb_object_agg(entry.key, entry.value)
      FROM jsonb_each(ar."date_hours") AS entry(key, value)
      WHERE entry.key < '2026-10-26'
    ), '{}'::jsonb),
    "updated_at" = now()
FROM "tutor_profiles" AS tp
WHERE ar."tutor_profile_id" = tp."id"
  AND tp."name" = 'Nika Raiffe'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(ar."weekly_hours") AS day(key, windows)
    WHERE jsonb_typeof(windows) = 'array'
      AND jsonb_array_length(windows) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(windows) AS hour_window
        WHERE hour_window->>'start' ~ '^[0-2][0-9]:[0-5][0-9]$'
          AND hour_window->>'end' ~ '^[0-2][0-9]:[0-5][0-9]$'
          AND (hour_window->>'start') < (hour_window->>'end')
      )
  );
