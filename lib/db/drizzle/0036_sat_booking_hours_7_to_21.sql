-- Widen SAT tutor bookable hours to 07:00–21:00 America/New_York.
-- Xavier is every civil day (Sun–Sat keys 0–6). Eunice stays Mon–Fri (1–5).
-- Seed previously inserted Xavier Mon–Fri 09:00–17:00 and Eunice 10:00–18:00.
-- Do not rewrite historical seed SQL; this updates already-applied rows.

UPDATE availability_rules AS rules
SET
  timezone = 'America/New_York',
  weekly_hours = '{
    "0": [{"start": "07:00", "end": "21:00"}],
    "1": [{"start": "07:00", "end": "21:00"}],
    "2": [{"start": "07:00", "end": "21:00"}],
    "3": [{"start": "07:00", "end": "21:00"}],
    "4": [{"start": "07:00", "end": "21:00"}],
    "5": [{"start": "07:00", "end": "21:00"}],
    "6": [{"start": "07:00", "end": "21:00"}]
  }'::jsonb,
  updated_at = now()
FROM tutor_profiles AS profile
WHERE rules.tutor_profile_id = profile.id
  AND profile.name = 'Xavier Morales';
--> statement-breakpoint
UPDATE availability_rules AS rules
SET
  timezone = 'America/New_York',
  weekly_hours = '{
    "1": [{"start": "07:00", "end": "21:00"}],
    "2": [{"start": "07:00", "end": "21:00"}],
    "3": [{"start": "07:00", "end": "21:00"}],
    "4": [{"start": "07:00", "end": "21:00"}],
    "5": [{"start": "07:00", "end": "21:00"}]
  }'::jsonb,
  updated_at = now()
FROM tutor_profiles AS profile
WHERE rules.tutor_profile_id = profile.id
  AND profile.name = 'Eunice Chon';
--> statement-breakpoint
-- Existing Google tokens were issued for calendar.events.freebusy (invalid)
-- plus calendar.events.owned. Booking now requires calendar.freebusy +
-- calendar.events, so connected tutors must reconsent from /tutor.
UPDATE calendar_connections
SET
  status = 'disconnected',
  updated_at = now()
WHERE provider = 'google'
  AND status = 'connected';
--> statement-breakpoint
UPDATE tutor_profiles
SET
  calendar_status = 'disconnected',
  updated_at = now()
WHERE calendar_status = 'connected';
