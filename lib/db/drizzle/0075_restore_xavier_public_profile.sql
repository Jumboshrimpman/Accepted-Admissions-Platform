-- Restore one active public Xavier Morales profile.
-- Prefer the row with a photo, then availability rules, then the oldest
-- created_at. Re-activate that row, retire a blank duplicate, and move
-- rules, the calendar connection, rates, and tutor_profile ids on payments,
-- holds, and payouts off the blank row. Sessions, calendar events, and the
-- login user are not written. A second run changes nothing. Counts only.

DO $$
DECLARE
  keeper uuid;
  blank_ids uuid[];
  canonical_user uuid;
  blank_user uuid;
  source_bio text;
  source_linkedin text;
  source_alt text;
  active_public integer;
  stray integer;
  keeper_bio text;
  keeper_linkedin text;
  keeper_alt text;
  keeper_email text;
  keeper_photo text;
  keeper_status text;
  keeper_active boolean;
  keeper_public boolean;
  keeper_bookable boolean;
  moved_rules integer := 0;
  moved_calendars integer := 0;
  moved_rates integer := 0;
  moved_payments integer := 0;
  moved_holds integer := 0;
  moved_payouts integer := 0;
  moved_transfers integer := 0;
  token_on_keeper boolean;
BEGIN
  SELECT tp.id INTO keeper
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
  ORDER BY
    (NULLIF(btrim(tp."photo_url"), '') IS NOT NULL) DESC,
    (EXISTS (
      SELECT 1 FROM "availability_rules" AS ar
      WHERE ar."tutor_profile_id" = tp."id"
    )) DESC,
    tp."created_at" ASC,
    tp."id" ASC
  LIMIT 1;

  IF keeper IS NULL THEN
    RAISE NOTICE 'xavier_profile_repair profiles=0';
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(tp.id), ARRAY[]::uuid[]) INTO blank_ids
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
    AND tp."id" <> keeper
    AND NULLIF(btrim(tp."photo_url"), '') IS NULL
    AND tp."biography" IS NULL;

  SELECT COUNT(*) INTO active_public
  FROM "tutor_profiles"
  WHERE "name" = 'Xavier Morales'
    AND "active" = true
    AND "public_approved" = true;

  SELECT
    tp."biography",
    tp."linkedin_url",
    NULLIF(btrim(tp."photo_alt_text"), ''),
    lower(tp."email"),
    tp."photo_url",
    tp."calendar_status",
    tp."active",
    tp."public_approved",
    tp."booking_eligible"
  INTO
    keeper_bio,
    keeper_linkedin,
    keeper_alt,
    keeper_email,
    keeper_photo,
    keeper_status,
    keeper_active,
    keeper_public,
    keeper_bookable
  FROM "tutor_profiles" AS tp
  WHERE tp."id" = keeper;

  SELECT EXISTS (
    SELECT 1 FROM "calendar_connections" AS cc
    WHERE cc."tutor_profile_id" = keeper
      AND NULLIF(btrim(cc."encrypted_refresh_token"), '') IS NOT NULL
  ) INTO token_on_keeper;

  SELECT COUNT(*) INTO stray
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
    AND tp."id" <> keeper
    AND (
      tp."active" = true
      OR tp."public_approved" = true
      OR tp."booking_eligible" = true
      OR tp."user_id" IS NOT NULL
      OR lower(tp."email") IN ('xavier.rmz6@gmail.com', 'xaver.rmz6@gmail.com')
      OR (
        EXISTS (
          SELECT 1 FROM "availability_rules" AS ar
          WHERE ar."tutor_profile_id" = tp."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "availability_rules" AS ar
          WHERE ar."tutor_profile_id" = keeper
        )
      )
      OR EXISTS (
        SELECT 1 FROM "calendar_connections" AS cc
        WHERE cc."tutor_profile_id" = tp."id"
          AND NOT EXISTS (
            SELECT 1 FROM "calendar_connections" AS dst
            WHERE dst."tutor_profile_id" = keeper
              AND dst."provider" = cc."provider"
          )
      )
      OR EXISTS (
        SELECT 1 FROM "tutor_compensation_rates" AS rate
        WHERE rate."tutor_profile_id" = tp."id"
      )
      OR EXISTS (
        SELECT 1 FROM "payments" AS payment
        WHERE payment."tutor_profile_id" = tp."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_slot_holds" AS hold
        WHERE hold."tutor_profile_id" = tp."id"
      )
      OR EXISTS (
        SELECT 1 FROM "tutor_payout_obligations" AS payout
        WHERE payout."tutor_profile_id" = tp."id"
      )
      OR EXISTS (
        SELECT 1 FROM "stripe_transfers" AS transfer
        WHERE transfer."tutor_profile_id" = tp."id"
      )
    );

  IF active_public = 1
     AND keeper_active
     AND keeper_public
     AND keeper_bookable
     AND keeper_email = 'xavier.rmz6@gmail.com'
     AND keeper_photo = '/media/team/xavier-morales.jpg'
     AND keeper_alt IS NOT NULL
     AND (keeper_bio IS NOT NULL OR NOT EXISTS (
       SELECT 1 FROM "tutor_profiles"
       WHERE "name" = 'Xavier Morales' AND "biography" IS NOT NULL
     ))
     AND (keeper_linkedin IS NOT NULL OR NOT EXISTS (
       SELECT 1 FROM "tutor_profiles"
       WHERE "name" = 'Xavier Morales' AND "linkedin_url" IS NOT NULL
     ))
     AND (NOT token_on_keeper OR keeper_status = 'connected')
     AND stray = 0
  THEN
    RAISE NOTICE 'xavier_profile_repair already=1';
    RETURN;
  END IF;

  SELECT tp."biography" INTO source_bio
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
    AND tp."biography" IS NOT NULL
  ORDER BY (NULLIF(btrim(tp."photo_url"), '') IS NOT NULL) DESC, tp."created_at" ASC, tp."id" ASC
  LIMIT 1;

  SELECT tp."linkedin_url" INTO source_linkedin
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
    AND tp."linkedin_url" IS NOT NULL
  ORDER BY (NULLIF(btrim(tp."photo_url"), '') IS NOT NULL) DESC, tp."created_at" ASC, tp."id" ASC
  LIMIT 1;

  SELECT NULLIF(btrim(tp."photo_alt_text"), '') INTO source_alt
  FROM "tutor_profiles" AS tp
  WHERE tp."name" = 'Xavier Morales'
    AND NULLIF(btrim(tp."photo_alt_text"), '') IS NOT NULL
  ORDER BY (NULLIF(btrim(tp."photo_url"), '') IS NOT NULL) DESC, tp."created_at" ASC, tp."id" ASC
  LIMIT 1;

  SELECT u."id" INTO canonical_user
  FROM "users" AS u
  WHERE u."clerk_user_id" = 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6'
     OR lower(u."email") = 'xaver.rmz6@gmail.com'
  ORDER BY (u."clerk_user_id" = 'user_3IxUfoT1xRnDsqhlx5NN1eGfRg6') DESC
  LIMIT 1;

  SELECT tp."user_id" INTO blank_user
  FROM "tutor_profiles" AS tp
  WHERE tp."id" = ANY(blank_ids)
    AND tp."user_id" IS NOT NULL
  ORDER BY tp."active" DESC, tp."created_at" DESC
  LIMIT 1;

  UPDATE "tutor_profiles"
  SET
    "email" = 'retired+xavier-duplicate-' || left("id"::text, 8) || '@retired.accepted.local',
    "updated_at" = now()
  WHERE "id" <> keeper
    AND lower("email") IN ('xavier.rmz6@gmail.com', 'xaver.rmz6@gmail.com');

  UPDATE "tutor_profiles"
  SET
    "email" = 'xavier.rmz6@gmail.com',
    "name" = 'Xavier Morales',
    "photo_url" = '/media/team/xavier-morales.jpg',
    "photo_alt_text" = COALESCE(
      NULLIF(btrim("photo_alt_text"), ''),
      source_alt,
      'Xavier Morales, SAT and Math Tutor'
    ),
    "biography" = COALESCE("biography", source_bio),
    "linkedin_url" = COALESCE("linkedin_url", source_linkedin),
    "user_id" = COALESCE("user_id", blank_user, canonical_user),
    "active" = true,
    "booking_eligible" = true,
    "public_approved" = true,
    "updated_at" = now()
  WHERE "id" = keeper;

  UPDATE "availability_rules"
  SET "tutor_profile_id" = keeper, "updated_at" = now()
  WHERE "tutor_profile_id" = ANY(blank_ids)
    AND NOT EXISTS (
      SELECT 1 FROM "availability_rules"
      WHERE "tutor_profile_id" = keeper
    );
  GET DIAGNOSTICS moved_rules = ROW_COUNT;

  UPDATE "calendar_connections" AS src
  SET
    "tutor_profile_id" = keeper,
    "status" = CASE
      WHEN NULLIF(btrim(src."encrypted_refresh_token"), '') IS NOT NULL THEN 'connected'
      ELSE src."status"
    END,
    "updated_at" = now()
  WHERE src."tutor_profile_id" = ANY(blank_ids)
    AND NOT EXISTS (
      SELECT 1 FROM "calendar_connections" AS dst
      WHERE dst."tutor_profile_id" = keeper
        AND dst."provider" = src."provider"
    );
  GET DIAGNOSTICS moved_calendars = ROW_COUNT;

  UPDATE "tutor_profiles"
  SET "calendar_status" = 'connected', "updated_at" = now()
  WHERE "id" = keeper
    AND EXISTS (
      SELECT 1 FROM "calendar_connections"
      WHERE "tutor_profile_id" = keeper
        AND NULLIF(btrim("encrypted_refresh_token"), '') IS NOT NULL
    )
    AND "calendar_status" IS DISTINCT FROM 'connected';

  UPDATE "tutor_compensation_rates"
  SET "tutor_profile_id" = keeper
  WHERE "tutor_profile_id" = ANY(blank_ids);
  GET DIAGNOSTICS moved_rates = ROW_COUNT;

  UPDATE "payments"
  SET "tutor_profile_id" = keeper, "updated_at" = now()
  WHERE "tutor_profile_id" = ANY(blank_ids);
  GET DIAGNOSTICS moved_payments = ROW_COUNT;

  UPDATE "booking_slot_holds"
  SET "tutor_profile_id" = keeper, "updated_at" = now()
  WHERE "tutor_profile_id" = ANY(blank_ids);
  GET DIAGNOSTICS moved_holds = ROW_COUNT;

  UPDATE "tutor_payout_obligations"
  SET "tutor_profile_id" = keeper, "updated_at" = now()
  WHERE "tutor_profile_id" = ANY(blank_ids);
  GET DIAGNOSTICS moved_payouts = ROW_COUNT;

  UPDATE "stripe_transfers"
  SET "tutor_profile_id" = keeper, "updated_at" = now()
  WHERE "tutor_profile_id" = ANY(blank_ids);
  GET DIAGNOSTICS moved_transfers = ROW_COUNT;

  UPDATE "tutor_profiles"
  SET
    "user_id" = NULL,
    "active" = false,
    "booking_eligible" = false,
    "public_approved" = false,
    "updated_at" = now()
  WHERE "name" = 'Xavier Morales'
    AND "id" <> keeper
    AND (
      "active" = true
      OR "public_approved" = true
      OR "booking_eligible" = true
      OR "user_id" IS NOT NULL
    );

  RAISE NOTICE 'xavier_profile_repair active=1 blanks=% rules=% calendars=% rates=% payments=% holds=% payouts=% transfers=%',
    COALESCE(array_length(blank_ids, 1), 0),
    moved_rules,
    moved_calendars,
    moved_rates,
    moved_payments,
    moved_holds,
    moved_payouts,
    moved_transfers;
END $$;
