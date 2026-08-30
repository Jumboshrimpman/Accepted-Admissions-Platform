DO $$
DECLARE
  winner_id uuid;
BEGIN
  SELECT profile.id
  INTO winner_id
  FROM tutor_profiles AS profile
  LEFT JOIN users AS owner ON owner.id = profile.user_id
  WHERE
    lower(profile.email) IN (
      lower('xaver.rmz6@gmail.com'),
      lower('xsfam6@gmail.com')
    )
    OR profile.name = 'Xavier Morales'
  ORDER BY
    (owner.role = 'tutor') DESC NULLS LAST,
    (lower(profile.email) = lower('xsfam6@gmail.com')) DESC,
    (profile.user_id IS NOT NULL) DESC,
    profile.created_at,
    profile.id
  LIMIT 1
  FOR UPDATE OF profile;

  IF winner_id IS NULL THEN
    INSERT INTO tutor_profiles (
      email,
      name,
      title,
      subjects,
      active,
      booking_eligible,
      calendar_status
    )
    VALUES (
      'xsfam6@gmail.com',
      'Xavier Morales',
      'SAT Tutor',
      '["SAT"]'::jsonb,
      true,
      true,
      'disconnected'
    )
    RETURNING id INTO winner_id;
  ELSE
    UPDATE tutor_profiles AS winner
    SET
      photo_url = coalesce(
        winner.photo_url,
        (
          SELECT candidate.photo_url
          FROM tutor_profiles AS candidate
          WHERE
            candidate.id <> winner_id
            AND (
              lower(candidate.email) IN (
                lower('xaver.rmz6@gmail.com'),
                lower('xsfam6@gmail.com')
              )
              OR candidate.name = 'Xavier Morales'
            )
            AND candidate.photo_url IS NOT NULL
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      ),
      biography = coalesce(
        winner.biography,
        (
          SELECT candidate.biography
          FROM tutor_profiles AS candidate
          WHERE
            candidate.id <> winner_id
            AND (
              lower(candidate.email) IN (
                lower('xaver.rmz6@gmail.com'),
                lower('xsfam6@gmail.com')
              )
              OR candidate.name = 'Xavier Morales'
            )
            AND candidate.biography IS NOT NULL
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      ),
      linkedin_url = coalesce(
        winner.linkedin_url,
        (
          SELECT candidate.linkedin_url
          FROM tutor_profiles AS candidate
          WHERE
            candidate.id <> winner_id
            AND (
              lower(candidate.email) IN (
                lower('xaver.rmz6@gmail.com'),
                lower('xsfam6@gmail.com')
              )
              OR candidate.name = 'Xavier Morales'
            )
            AND candidate.linkedin_url IS NOT NULL
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      ),
      internal_notes = coalesce(
        winner.internal_notes,
        (
          SELECT candidate.internal_notes
          FROM tutor_profiles AS candidate
          WHERE
            candidate.id <> winner_id
            AND (
              lower(candidate.email) IN (
                lower('xaver.rmz6@gmail.com'),
                lower('xsfam6@gmail.com')
              )
              OR candidate.name = 'Xavier Morales'
            )
            AND candidate.internal_notes IS NOT NULL
          ORDER BY candidate.created_at, candidate.id
          LIMIT 1
        )
      ),
      updated_at = now()
    WHERE winner.id = winner_id;

    UPDATE calendar_connections
    SET tutor_profile_id = winner_id
    WHERE tutor_profile_id IN (
      SELECT profile.id
      FROM tutor_profiles AS profile
      WHERE
        profile.id <> winner_id
        AND (
          lower(profile.email) IN (
            lower('xaver.rmz6@gmail.com'),
            lower('xsfam6@gmail.com')
          )
          OR profile.name = 'Xavier Morales'
        )
    );

    UPDATE availability_rules
    SET tutor_profile_id = winner_id
    WHERE tutor_profile_id IN (
      SELECT profile.id
      FROM tutor_profiles AS profile
      WHERE
        profile.id <> winner_id
        AND (
          lower(profile.email) IN (
            lower('xaver.rmz6@gmail.com'),
            lower('xsfam6@gmail.com')
          )
          OR profile.name = 'Xavier Morales'
        )
    );

    UPDATE tutor_compensation_rates
    SET tutor_profile_id = winner_id
    WHERE tutor_profile_id IN (
      SELECT profile.id
      FROM tutor_profiles AS profile
      WHERE
        profile.id <> winner_id
        AND (
          lower(profile.email) IN (
            lower('xaver.rmz6@gmail.com'),
            lower('xsfam6@gmail.com')
          )
          OR profile.name = 'Xavier Morales'
        )
    );

    DELETE FROM tutor_profiles AS profile
    WHERE
      profile.id <> winner_id
      AND (
        lower(profile.email) IN (
          lower('xaver.rmz6@gmail.com'),
          lower('xsfam6@gmail.com')
        )
        OR profile.name = 'Xavier Morales'
      );
  END IF;

  UPDATE tutor_profiles AS winner
  SET
    email = 'xsfam6@gmail.com',
    name = 'Xavier Morales',
    title = 'SAT Tutor',
    subjects = CASE
      WHEN jsonb_array_length(winner.subjects) = 0 THEN '["SAT"]'::jsonb
      ELSE winner.subjects
    END,
    active = true,
    booking_eligible = CASE
      WHEN winner.user_id IS NULL THEN true
      ELSE EXISTS (
        SELECT 1
        FROM users AS owner
        WHERE owner.id = winner.user_id
          AND owner.role = 'tutor'
      )
    END,
    calendar_status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM calendar_connections AS connection
        WHERE connection.tutor_profile_id = winner.id
          AND connection.status = 'connected'
      ) THEN 'connected'
      ELSE 'disconnected'
    END,
    updated_at = now()
  WHERE winner.id = winner_id;
END $$;