-- Soft-retire the duplicated Xavier Morales Clerk identity.
-- Canonical SAT tutor: xaver.rmz6@gmail.com / user_3IxUfoT1xRnDsqhlx5NN1eGfRg6
-- Retired duplicate: user_3IsvKVDGAg5KdvwHhvODf2VFqtd (wrong email, historically
-- on ACCEPTED_SAT_TUTOR_CLERK_USER_IDS). Do not hard-delete production rows.
-- Historical migrations 0008 / 0026 are left unchanged.

DO $$
DECLARE
  canonical_clerk text := 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6';
  retired_clerk text := 'user_3IsvKVDGAg5KdvwHhvODf2VFqtd';
  canonical_email text := 'xaver.rmz6@gmail.com';
  superseded_note text := 'SUPERSEDED: duplicate Xavier Clerk user. Canonical SAT tutor is user_3IxUfoT1xRnDsqhlx5NN1eGfRg6 / xaver.rmz6@gmail.com.';
  winner_user_id uuid;
  loser_user_id uuid;
  winner_profile_id uuid;
  loser_profile_id uuid;
BEGIN
  SELECT id
  INTO winner_user_id
  FROM users
  WHERE clerk_user_id = canonical_clerk
  ORDER BY created_at, id
  LIMIT 1;

  IF winner_user_id IS NULL THEN
    SELECT id
    INTO winner_user_id
    FROM users
    WHERE lower(email) = canonical_email
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  -- If only the retired Clerk row exists, promote it to the canonical identity
  -- when the canonical email is not already claimed by someone else.
  IF winner_user_id IS NULL THEN
    SELECT id
    INTO winner_user_id
    FROM users
    WHERE clerk_user_id IN (retired_clerk, 'retired:' || retired_clerk)
    ORDER BY created_at, id
    LIMIT 1;

    IF winner_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM users other
        WHERE lower(other.email) = canonical_email
          AND other.id <> winner_user_id
      )
    THEN
      UPDATE users
      SET
        clerk_user_id = canonical_clerk,
        email = canonical_email,
        display_name = 'Xavier Morales',
        role = 'tutor',
        updated_at = now()
      WHERE id = winner_user_id;
    ELSE
      winner_user_id := NULL;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM users other
    WHERE other.clerk_user_id = canonical_clerk
      AND other.id <> winner_user_id
  ) THEN
    UPDATE users
    SET
      clerk_user_id = canonical_clerk,
      email = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM users other
          WHERE lower(other.email) = canonical_email
            AND other.id <> winner_user_id
        ) THEN canonical_email
        ELSE email
      END,
      display_name = 'Xavier Morales',
      role = 'tutor',
      updated_at = now()
    WHERE id = winner_user_id;
  END IF;

  FOR loser_user_id IN
    SELECT id
    FROM users
    WHERE id IS DISTINCT FROM winner_user_id
      AND (
        clerk_user_id IN (retired_clerk, 'retired:' || retired_clerk)
        OR lower(email) IN ('xavier.rmz6@gmail.com', 'xsfam6@gmail.com')
      )
    ORDER BY created_at, id
  LOOP
    IF winner_user_id IS NOT NULL THEN
      UPDATE sessions
      SET tutor_user_id = winner_user_id, updated_at = now()
      WHERE tutor_user_id = loser_user_id;

      UPDATE tutor_assignments AS assignment
      SET tutor_user_id = winner_user_id
      WHERE assignment.tutor_user_id = loser_user_id
        AND NOT EXISTS (
          SELECT 1
          FROM tutor_assignments AS other
          WHERE other.course_id = assignment.course_id
            AND other.tutor_user_id = winner_user_id
            AND other.student_user_id = assignment.student_user_id
            AND other.subject = assignment.subject
        );

      DELETE FROM tutor_assignments
      WHERE tutor_user_id = loser_user_id;

      UPDATE course_memberships AS membership
      SET
        user_id = winner_user_id,
        membership_role = 'tutor'
      WHERE membership.user_id = loser_user_id
        AND NOT EXISTS (
          SELECT 1
          FROM course_memberships AS other
          WHERE other.course_id = membership.course_id
            AND other.user_id = winner_user_id
        );

      DELETE FROM course_memberships
      WHERE user_id = loser_user_id;

      IF to_regclass('tutor_payout_obligations') IS NOT NULL THEN
        UPDATE tutor_payout_obligations
        SET tutor_user_id = winner_user_id, updated_at = now()
        WHERE tutor_user_id = loser_user_id;
      END IF;
    END IF;

    UPDATE tutor_profiles
    SET user_id = NULL, updated_at = now()
    WHERE user_id = loser_user_id;

    UPDATE portal_access_grants
    SET
      user_id = CASE
        WHEN winner_user_id IS NOT NULL AND lower(email) = canonical_email THEN winner_user_id
        ELSE NULL
      END,
      clerk_user_id = CASE
        WHEN lower(email) = canonical_email THEN canonical_clerk
        ELSE 'retired:' || retired_clerk
      END,
      active = CASE
        WHEN lower(email) = canonical_email THEN active
        ELSE false
      END,
      notes = CASE
        WHEN lower(email) = canonical_email THEN notes
        ELSE superseded_note
      END,
      revoked_at = CASE
        WHEN lower(email) = canonical_email THEN revoked_at
        ELSE coalesce(revoked_at, now())
      END,
      updated_at = now()
    WHERE user_id = loser_user_id
       OR clerk_user_id IN (retired_clerk, 'retired:' || retired_clerk);

    UPDATE users
    SET
      clerk_user_id = 'retired:' || retired_clerk || ':' || loser_user_id::text,
      email = 'retired+' || replace(loser_user_id::text, '-', '') || '@retired.accepted.local',
      display_name = CASE
        WHEN display_name ILIKE '%xavier%' THEN 'Xavier Morales (superseded)'
        ELSE display_name
      END,
      updated_at = now()
    WHERE id = loser_user_id;
  END LOOP;

  SELECT profile.id
  INTO winner_profile_id
  FROM tutor_profiles AS profile
  LEFT JOIN users AS owner ON owner.id = profile.user_id
  WHERE lower(profile.email) = canonical_email
     OR owner.clerk_user_id = canonical_clerk
  ORDER BY
    (lower(profile.email) = canonical_email) DESC,
    (owner.clerk_user_id = canonical_clerk) DESC NULLS LAST,
    (profile.active) DESC,
    (profile.user_id IS NOT NULL) DESC,
    profile.created_at,
    profile.id
  LIMIT 1;

  IF winner_profile_id IS NOT NULL THEN
    UPDATE tutor_profiles
    SET
      email = canonical_email,
      name = 'Xavier Morales',
      user_id = coalesce(user_id, winner_user_id),
      active = true,
      booking_eligible = true,
      public_approved = true,
      updated_at = now()
    WHERE id = winner_profile_id
      AND NOT EXISTS (
        SELECT 1 FROM tutor_profiles AS other
        WHERE lower(other.email) = canonical_email
          AND other.id <> winner_profile_id
      );

    FOR loser_profile_id IN
      SELECT profile.id
      FROM tutor_profiles AS profile
      LEFT JOIN users AS owner ON owner.id = profile.user_id
      WHERE profile.id <> winner_profile_id
        AND (
          lower(profile.email) IN ('xavier.rmz6@gmail.com', 'xsfam6@gmail.com', canonical_email)
          OR profile.name = 'Xavier Morales'
          OR owner.clerk_user_id IN (retired_clerk, 'retired:' || retired_clerk)
        )
      ORDER BY profile.created_at, profile.id
    LOOP
      UPDATE calendar_connections AS connection
      SET tutor_profile_id = winner_profile_id, updated_at = now()
      WHERE connection.tutor_profile_id = loser_profile_id
        AND NOT EXISTS (
          SELECT 1
          FROM calendar_connections AS other
          WHERE other.tutor_profile_id = winner_profile_id
            AND other.provider = connection.provider
        );

      UPDATE availability_rules
      SET tutor_profile_id = winner_profile_id, updated_at = now()
      WHERE tutor_profile_id = loser_profile_id
        AND NOT EXISTS (
          SELECT 1
          FROM availability_rules AS other
          WHERE other.tutor_profile_id = winner_profile_id
        );

      UPDATE tutor_compensation_rates
      SET tutor_profile_id = winner_profile_id
      WHERE tutor_profile_id = loser_profile_id;

      IF to_regclass('payments') IS NOT NULL THEN
        UPDATE payments
        SET tutor_profile_id = winner_profile_id, updated_at = now()
        WHERE tutor_profile_id = loser_profile_id;
      END IF;

      IF to_regclass('tutor_payout_obligations') IS NOT NULL THEN
        UPDATE tutor_payout_obligations
        SET tutor_profile_id = winner_profile_id, updated_at = now()
        WHERE tutor_profile_id = loser_profile_id;
      END IF;

      IF to_regclass('stripe_transfers') IS NOT NULL THEN
        UPDATE stripe_transfers
        SET tutor_profile_id = winner_profile_id, updated_at = now()
        WHERE tutor_profile_id = loser_profile_id;
      END IF;

      UPDATE tutor_profiles
      SET
        user_id = NULL,
        active = false,
        booking_eligible = false,
        public_approved = false,
        email = CASE
          WHEN lower(email) = canonical_email
            THEN 'retired+xavier-duplicate-' || substring(id::text, 1, 8) || '@retired.accepted.local'
          ELSE email
        END,
        internal_notes = coalesce(internal_notes || E'\n', '') || superseded_note,
        updated_at = now()
      WHERE id = loser_profile_id;
    END LOOP;
  END IF;

  UPDATE portal_access_grants
  SET
    clerk_user_id = canonical_clerk,
    email = canonical_email,
    display_name = 'Xavier Morales',
    active = true,
    revoked_at = NULL,
    updated_at = now()
  WHERE (
      clerk_user_id = canonical_clerk
      OR lower(email) = canonical_email
    )
    AND clerk_user_id IS DISTINCT FROM 'retired:' || retired_clerk;

  UPDATE portal_access_grants
  SET
    active = false,
    clerk_user_id = coalesce(
      CASE
        WHEN clerk_user_id IN (retired_clerk) THEN 'retired:' || retired_clerk
        ELSE clerk_user_id
      END,
      'retired:' || retired_clerk
    ),
    notes = CASE
      WHEN notes IS NULL OR notes NOT LIKE 'SUPERSEDED:%' THEN superseded_note
      ELSE notes
    END,
    revoked_at = coalesce(revoked_at, now()),
    updated_at = now()
  WHERE clerk_user_id IN (retired_clerk, 'retired:' || retired_clerk)
     OR lower(email) IN ('xavier.rmz6@gmail.com', 'xsfam6@gmail.com');
END $$;
