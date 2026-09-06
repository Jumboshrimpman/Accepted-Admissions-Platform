-- Expand live past-success schoolLogos to the full approved 19-school set.
-- Seed insert uses ON CONFLICT DO NOTHING, so already-published / admin-touched
-- rows would otherwise keep the original 7 logos after deploy.
-- This updates only body.schoolLogos; intro, testimonial, and other copy stay intact.

WITH approved AS (
  SELECT $approved$[
    {"name": "Harvard University", "src": "/media/schools/harvard.png", "alt": "Harvard University logo"},
    {"name": "Princeton University", "src": "/media/schools/princeton.png", "alt": "Princeton University logo"},
    {"name": "MIT", "src": "/media/schools/mit.jpg", "alt": "MIT logo"},
    {"name": "Northeastern University", "src": "/media/schools/northeastern.jpg", "alt": "Northeastern University logo"},
    {"name": "UC San Diego", "src": "/media/schools/uc-san-diego.png", "alt": "UC San Diego logo"},
    {"name": "University of Maryland", "src": "/media/schools/maryland.png", "alt": "University of Maryland logo"},
    {"name": "Harvard Law School", "src": "/media/schools/harvard-law.png", "alt": "Harvard Law School logo"},
    {"name": "Harvard GSAS", "src": "/media/schools/harvard-gsas.jpg", "alt": "Harvard GSAS logo"},
    {"name": "University of Oxford", "src": "/media/schools/oxford.jpg", "alt": "University of Oxford logo"},
    {"name": "Stanford University", "src": "/media/schools/stanford.png", "alt": "Stanford University logo"},
    {"name": "Cornell University", "src": "/media/schools/cornell.png", "alt": "Cornell University logo"},
    {"name": "University of Chicago", "src": "/media/schools/chicago.jpg", "alt": "University of Chicago logo"},
    {"name": "Georgetown University", "src": "/media/schools/georgetown.png", "alt": "Georgetown University logo"},
    {"name": "Pomona College", "src": "/media/schools/pomona.png", "alt": "Pomona College logo"},
    {"name": "Boston University", "src": "/media/schools/boston-university.png", "alt": "Boston University seal"},
    {"name": "Washington University in St. Louis", "src": "/media/schools/washu.png", "alt": "Washington University in St. Louis logo"},
    {"name": "Claremont McKenna College", "src": "/media/schools/claremont-mckenna.png", "alt": "Claremont McKenna College seal"},
    {"name": "University of Virginia", "src": "/media/schools/uva.png", "alt": "University of Virginia logo"},
    {"name": "Pepperdine University", "src": "/media/schools/pepperdine.png", "alt": "Pepperdine University logo"}
  ]$approved$::jsonb AS logos
),
existing AS (
  SELECT
    id,
    body,
    CASE
      WHEN jsonb_typeof(body->'schoolLogos') = 'array' THEN body->'schoolLogos'
      ELSE '[]'::jsonb
    END AS current_logos
  FROM public_content
  WHERE slug = 'past-success'
),
existing_flags AS (
  SELECT
    e.id,
    e.body,
    e.current_logos,
    COALESCE((
      SELECT bool_and(
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(a.logos) AS approved_logo
          WHERE lower(approved_logo->>'name') = lower(logo->>'name')
             OR approved_logo->>'src' = logo->>'src'
        )
      )
      FROM jsonb_array_elements(e.current_logos) AS logo
    ), true) AS only_approved
  FROM existing e
  CROSS JOIN approved a
),
missing AS (
  SELECT
    e.id,
    jsonb_agg(approved_logo ORDER BY ord) AS logos
  FROM existing e
  CROSS JOIN approved a
  CROSS JOIN LATERAL jsonb_array_elements(a.logos) WITH ORDINALITY AS t(approved_logo, ord)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(e.current_logos) AS logo
    WHERE lower(logo->>'name') = lower(approved_logo->>'name')
       OR logo->>'src' = approved_logo->>'src'
  )
  GROUP BY e.id
),
next_rows AS (
  SELECT
    f.id,
    f.body,
    f.current_logos,
    CASE
      WHEN f.only_approved THEN a.logos
      ELSE f.current_logos || COALESCE(m.logos, '[]'::jsonb)
    END AS next_logos
  FROM existing_flags f
  CROSS JOIN approved a
  LEFT JOIN missing m ON m.id = f.id
)
UPDATE public_content AS pc
SET
  body = jsonb_set(COALESCE(n.body, '{}'::jsonb), '{schoolLogos}', n.next_logos, true),
  updated_at = now()
FROM next_rows n
WHERE pc.id = n.id
  AND n.current_logos IS DISTINCT FROM n.next_logos;
