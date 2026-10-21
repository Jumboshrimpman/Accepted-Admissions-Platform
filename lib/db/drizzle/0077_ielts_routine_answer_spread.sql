-- Spread Nov 13 (module 2) and Dec 4 (module 3) IELTS-style reading keys across A–D.
-- Only question rows attached to those two English sessions are rewritten.
-- Choice text stays the same; letters follow the new order, including responses
-- and submitted result snapshots on those sessions. A second run is a no-op.
-- Sessions, invites, calendar events, tutors, and the question bank are not updated.

DO $spread$
DECLARE
  question_row record;
BEGIN
  DROP TABLE IF EXISTS ielts_routine_letter_spread;
  CREATE TEMP TABLE ielts_routine_letter_spread (
    prompt text PRIMARY KEY,
    source_key text NOT NULL,
    new_choices jsonb NOT NULL,
    new_correct text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO ielts_routine_letter_spread (prompt, source_key, new_choices, new_correct)
  VALUES
    ($ielts$Why does Wren Street Bakery keep fermentation cards?$ielts$, $ielts$ielts-style-original-reading-m2-q25$ielts$, $ielts$[{"id":"a","label":"A","text":"To hide a secret recipe from apprentices"},{"id":"b","label":"B","text":"To satisfy a city hygiene inspector’s weekly visit"},{"id":"c","label":"C","text":"To record conditions so staff can see why dough behaves differently"},{"id":"d","label":"D","text":"To advertise supermarket yeast in the window"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What problem first led Leila to introduce the cards?$ielts$, $ielts$ielts-style-original-reading-m2-q26$ielts$, $ielts$[{"id":"a","label":"A","text":"A humid week produced split, overly acidic loaves"},{"id":"b","label":"B","text":"Customers demanded gluten-free bread"},{"id":"c","label":"C","text":"The HVAC controller broke"},{"id":"d","label":"D","text":"Apprentices refused to work on Tuesdays"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$How did the log reveal the supermarket-yeast shortcut?$ielts$, $ielts$ielts-style-original-reading-m2-q27$ielts$, $ielts$[{"id":"a","label":"A","text":"Customers posted photos of sachets"},{"id":"b","label":"B","text":"The food-science student inspected the mixer"},{"id":"c","label":"C","text":"The city banned sourdough"},{"id":"d","label":"D","text":"The card still said “unfed” while the dough had risen on commercial yeast"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What does Leila choose to do when a sourdough batch is slow?$ielts$, $ielts$ielts-style-original-reading-m2-q28$ielts$, $ielts$[{"id":"a","label":"A","text":"Add supermarket yeast and keep the schedule"},{"id":"b","label":"B","text":"Delay the bake or sell the batch as rolls with an explanation"},{"id":"c","label":"C","text":"Close the bakery for the day"},{"id":"d","label":"D","text":"Raise the room to 30°C immediately"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$Why does Leila prefer cards to a fully automated room?$ielts$, $ielts$ielts-style-original-reading-m2-q29$ielts$, $ielts$[{"id":"a","label":"A","text":"Because HVAC controllers are illegal in bakeries"},{"id":"b","label":"B","text":"Because customers dislike identical loaves"},{"id":"c","label":"C","text":"Because she wants staff to keep noticing the starter before it fails in public"},{"id":"d","label":"D","text":"Because the student asked her to refuse technology"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$In the first paragraph, “sluggish” most nearly describes$ielts$, $ielts$ielts-style-original-reading-m2-q30$ielts$, $ielts$[{"id":"a","label":"A","text":"a starter that is slow to show activity"},{"id":"b","label":"B","text":"a customer who arrives late"},{"id":"c","label":"C","text":"an oven that is too hot"},{"id":"d","label":"D","text":"a loaf that is too sweet"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$What is the club’s main task?$ielts$, $ielts$ielts-style-original-reading-m2-q31$ielts$, $ielts$[{"id":"a","label":"A","text":"To rebuild the cliff-top path each autumn"},{"id":"b","label":"B","text":"To post urgent collapse warnings on social media"},{"id":"c","label":"C","text":"To replace picnic benches for the town"},{"id":"d","label":"D","text":"To record yearly change in the path’s outer edge with a repeatable method"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What condition did the coastal engineer set?$ielts$, $ielts$ielts-style-original-reading-m2-q32$ielts$, $ielts$[{"id":"a","label":"A","text":"Students must pay for a new boardwalk"},{"id":"b","label":"B","text":"Students must not post claims that the cliff is collapsing tomorrow"},{"id":"c","label":"C","text":"Students must stand on the lip to get accurate photos"},{"id":"d","label":"D","text":"Students must replace lost posts the same day"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$What contrast did the first two seasons show?$ielts$, $ielts$ielts-style-original-reading-m2-q33$ielts$, $ielts$[{"id":"a","label":"A","text":"A clay section lost far more ground than a rocky knuckle"},{"id":"b","label":"B","text":"The whole path moved 40 centimetres evenly"},{"id":"c","label":"C","text":"Official maps were more accurate than photographs"},{"id":"d","label":"D","text":"Drone clips were required by the committee"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$Why were the students’ photographs useful in committee?$ielts$, $ielts$ielts-style-original-reading-m2-q34$ielts$, $ielts$[{"id":"a","label":"A","text":"They proved the path should be closed entirely"},{"id":"b","label":"B","text":"They showed students standing on the lip"},{"id":"c","label":"C","text":"They were time-stamped comparisons rather than a dramatic one-off clip"},{"id":"d","label":"D","text":"They replaced the need for an engineer"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What must the club do if a measuring post is lost to a slump?$ielts$, $ielts$ielts-style-original-reading-m2-q35$ielts$, $ielts$[{"id":"a","label":"A","text":"Replace it immediately without waiting"},{"id":"b","label":"B","text":"Mark the gap and wait for the engineer"},{"id":"c","label":"C","text":"Close the high school for a week"},{"id":"d","label":"D","text":"Move the picnic bench back to the old alignment"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$The final sentence suggests the project’s discipline is$ielts$, $ielts$ielts-style-original-reading-m2-q36$ielts$, $ielts$[{"id":"a","label":"A","text":"to turn measurements into panic"},{"id":"b","label":"B","text":"to train students as professional engineers in one term"},{"id":"c","label":"C","text":"to update official maps every week"},{"id":"d","label":"D","text":"to keep the same method and refuse sensational claims"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What was wrong with the old twenty-minute clock-face?$ielts$, $ielts$ielts-style-original-reading-m3-q37$ielts$, $ielts$[{"id":"a","label":"A","text":"The crossing never took eleven minutes even in good weather"},{"id":"b","label":"B","text":"The harbour wanted to ban bicycles"},{"id":"c","label":"C","text":"Factory workers refused to use the ferry"},{"id":"d","label":"D","text":"Small loading delays stacked onto the next departure"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$Why was the :20 sailing the most unreliable?$ielts$, $ielts$ielts-style-original-reading-m3-q38$ielts$, $ielts$[{"id":"a","label":"A","text":"It was the only sailing that carried bicycles"},{"id":"b","label":"B","text":"It coincided with the school boat and a fish-plant shift change"},{"id":"c","label":"C","text":"The ticket scanner did not work at :20"},{"id":"d","label":"D","text":"The pontoon was closed at :20"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$Why did the harbour reject a fourth boat?$ielts$, $ielts$ielts-style-original-reading-m3-q39$ielts$, $ielts$[{"id":"a","label":"A","text":"Passengers preferred a slower crossing"},{"id":"b","label":"B","text":"The school boat already used four berths"},{"id":"c","label":"C","text":"The pontoons cannot berth four vessels, and a spare crew was not funded"},{"id":"d","label":"D","text":"The ticket scanner cannot handle four departures"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$Which morning sailings kept their original time, and why?$ielts$, $ielts$ielts-style-original-reading-m3-q40$ielts$, $ielts$[{"id":"a","label":"A","text":"The :00 sailings, so factory workers would not miss the plant whistle"},{"id":"b","label":"B","text":"The :20 sailings, because students liked the old time"},{"id":"c","label":"C","text":"The :40 sailings, because the ramp is dry then"},{"id":"d","label":"D","text":"All sailings moved by five minutes"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$Why did the operator publish “about 15 minutes including loading”?$ielts$, $ielts$ielts-style-original-reading-m3-q41$ielts$, $ielts$[{"id":"a","label":"A","text":"To make the crossing sound faster than eleven minutes"},{"id":"b","label":"B","text":"To match scanner data instead of an optimistic eleven-minute promise"},{"id":"c","label":"C","text":"To include a stop at the fish plant"},{"id":"d","label":"D","text":"To justify buying a fourth boat"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$What lesson did the harbour record?$ielts$, $ielts$ielts-style-original-reading-m3-q42$ielts$, $ielts$[{"id":"a","label":"A","text":"Passengers will never accept a new timetable"},{"id":"b","label":"B","text":"Bicycles should be banned from wet ramps"},{"id":"c","label":"C","text":"School boats should be cancelled in winter"},{"id":"d","label":"D","text":"A neat clock-face is a poor substitute for real loading time"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What is the hearing mainly trying to decide?$ielts$, $ielts$ielts-style-original-reading-m3-q43$ielts$, $ielts$[{"id":"a","label":"A","text":"Whether to ban all urban bees"},{"id":"b","label":"B","text":"Whether tomatoes need bees to survive"},{"id":"c","label":"C","text":"How to regulate hive placement and neighbour impacts without a total ban"},{"id":"d","label":"D","text":"How to replace casual-trading permits"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What did the original draft require besides registration?$ielts$, $ielts$ielts-style-original-reading-m3-q44$ielts$, $ielts$[{"id":"a","label":"A","text":"A water source on the same lot and a two-metre flyway barrier"},{"id":"b","label":"B","text":"A city-owned honey shop"},{"id":"c","label":"C","text":"Five hives next to every playground"},{"id":"d","label":"D","text":"A ban on rooftop gardens"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$Why did beekeepers object to a rigid two-metre barrier rule?$ielts$, $ielts$ielts-style-original-reading-m3-q45$ielts$, $ielts$[{"id":"a","label":"A","text":"Because they wanted to sell honey without a permit"},{"id":"b","label":"B","text":"Because allergists supported five hives"},{"id":"c","label":"C","text":"Because the chair disliked tomatoes"},{"id":"d","label":"D","text":"Because rooftop hives already launch above head height"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What limit applies to lots adjoining playgrounds in the compromise?$ielts$, $ielts$ielts-style-original-reading-m3-q46$ielts$, $ielts$[{"id":"a","label":"A","text":"No hives at all"},{"id":"b","label":"B","text":"Five hives and a honey stall"},{"id":"c","label":"C","text":"Two hives rather than five"},{"id":"d","label":"D","text":"Unlimited rooftop hives"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$Why did omitting honey sales from the draft make some councillors nervous and others relieved?$ielts$, $ielts$ielts-style-original-reading-m3-q47$ielts$, $ielts$[{"id":"a","label":"A","text":"Because the hearing had mixed nuisance, allergy, and cottage sales into one argument"},{"id":"b","label":"B","text":"Because honey sales were already illegal everywhere"},{"id":"c","label":"C","text":"Because the planning officer wanted to ban tomatoes"},{"id":"d","label":"D","text":"Because registration was removed from the compromise"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$The chair’s kept sentence emphasises that the city is$ielts$, $ielts$ielts-style-original-reading-m3-q48$ielts$, $ielts$[{"id":"a","label":"A","text":"endorsing bees as a hobby for every resident"},{"id":"b","label":"B","text":"regulating pavement flight paths, not requiring residents to like bees"},{"id":"c","label":"C","text":"rewriting the casual-trading permit"},{"id":"d","label":"D","text":"banning ground-level hives entirely"}]$ielts$::jsonb, $ielts$b$ielts$);

  DROP TABLE IF EXISTS ielts_routine_target_sessions;
  CREATE TEMP TABLE ielts_routine_target_sessions ON COMMIT DROP AS
  SELECT s.id
  FROM sessions AS s
  LEFT JOIN users AS client ON client.id = s.client_user_id
  WHERE (
      (s.date_time AT TIME ZONE COALESCE(NULLIF(s.timezone, ''), 'Asia/Tokyo'))::date
        IN (DATE '2026-11-13', DATE '2026-12-04')
      OR (s.date_time AT TIME ZONE 'Asia/Tokyo')::date
        IN (DATE '2026-11-13', DATE '2026-12-04')
      OR (s.date_time AT TIME ZONE 'UTC')::date
        IN (DATE '2026-11-13', DATE '2026-12-04')
    )
    AND (
      lower(trim(s.subject)) LIKE 'ielts%'
      OR lower(trim(s.subject)) LIKE 'english%'
    )
    AND (
      s.client_user_id IS NULL
      OR lower(trim(client.email)) = 'taito0525@gmail.com'
    );

  DROP TABLE IF EXISTS ielts_routine_session_questions;
  CREATE TEMP TABLE ielts_routine_session_questions ON COMMIT DROP AS
  SELECT DISTINCT q.id
  FROM questions AS q
  JOIN assignment_questions AS aq ON aq.question_id = q.id
  JOIN assignments AS a ON a.id = aq.assignment_id
  JOIN ielts_routine_target_sessions AS target ON target.id = a.session_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM assignment_questions AS other_aq
    JOIN assignments AS other_a ON other_a.id = other_aq.assignment_id
    WHERE other_aq.question_id = q.id
      AND other_a.session_id IS NOT NULL
      AND other_a.session_id NOT IN (SELECT id FROM ielts_routine_target_sessions)
  );

  FOR question_row IN
    SELECT DISTINCT ON (q.id)
      q.id,
      q.choices AS old_choices,
      target.new_choices,
      target.new_correct
    FROM questions q
    JOIN ielts_routine_session_questions AS scoped ON scoped.id = q.id
    JOIN ielts_routine_letter_spread AS target ON q.prompt = target.prompt
    WHERE q.choices IS DISTINCT FROM target.new_choices
      AND (
        SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
        FROM jsonb_array_elements(q.choices) AS elem
      ) = (
        SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
        FROM jsonb_array_elements(target.new_choices) AS elem
      )
    ORDER BY q.id
  LOOP
    UPDATE responses AS response
    SET final_answer = COALESCE((
          SELECT next_choice.elem->>'id'
          FROM jsonb_array_elements(question_row.old_choices) AS old_choice(elem)
          JOIN jsonb_array_elements(question_row.new_choices) AS next_choice(elem)
            ON next_choice.elem->>'text' = old_choice.elem->>'text'
          WHERE lower(trim(response.final_answer)) = lower(old_choice.elem->>'id')
          LIMIT 1
        ), response.final_answer),
        prediction = CASE
          WHEN response.prediction IS NULL THEN NULL
          ELSE COALESCE((
            SELECT next_choice.elem->>'id'
            FROM jsonb_array_elements(question_row.old_choices) AS old_choice(elem)
            JOIN jsonb_array_elements(question_row.new_choices) AS next_choice(elem)
              ON next_choice.elem->>'text' = old_choice.elem->>'text'
            WHERE lower(trim(response.prediction)) = lower(old_choice.elem->>'id')
            LIMIT 1
          ), response.prediction)
        END
    WHERE response.question_id = question_row.id
      AND EXISTS (
        SELECT 1
        FROM attempts AS attempt
        JOIN assignments AS assignment ON assignment.id = attempt.assignment_id
        WHERE attempt.id = response.attempt_id
          AND assignment.session_id IN (SELECT id FROM ielts_routine_target_sessions)
      );

    UPDATE attempts AS attempt
    SET result = jsonb_set(
      attempt.result,
      '{items}',
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN item->>'questionId' <> question_row.id::text THEN item
            WHEN (
              SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
              FROM jsonb_array_elements(COALESCE(item->'choices', question_row.old_choices)) AS elem
            ) IS DISTINCT FROM (
              SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
              FROM jsonb_array_elements(question_row.new_choices) AS elem
            ) THEN item
            ELSE item
              || jsonb_build_object(
                'choices', question_row.new_choices,
                'correctAnswer', question_row.new_correct,
                'finalAnswer', COALESCE((
                  SELECT next_choice.elem->>'id'
                  FROM jsonb_array_elements(COALESCE(item->'choices', question_row.old_choices)) AS old_choice(elem)
                  JOIN jsonb_array_elements(question_row.new_choices) AS next_choice(elem)
                    ON next_choice.elem->>'text' = old_choice.elem->>'text'
                  WHERE lower(trim(item->>'finalAnswer')) = lower(old_choice.elem->>'id')
                  LIMIT 1
                ), item->>'finalAnswer'),
                'prediction', COALESCE(
                  (
                    SELECT to_jsonb(next_choice.elem->>'id')
                    FROM jsonb_array_elements(COALESCE(item->'choices', question_row.old_choices)) AS old_choice(elem)
                    JOIN jsonb_array_elements(question_row.new_choices) AS next_choice(elem)
                      ON next_choice.elem->>'text' = old_choice.elem->>'text'
                    WHERE item ? 'prediction'
                      AND item->>'prediction' IS NOT NULL
                      AND lower(trim(item->>'prediction')) = lower(old_choice.elem->>'id')
                    LIMIT 1
                  ),
                  item->'prediction'
                )
              )
          END
          ORDER BY ordinality
        ), '[]'::jsonb)
        FROM jsonb_array_elements(attempt.result->'items') WITH ORDINALITY AS src(item, ordinality)
      )
    )
    WHERE attempt.result ? 'items'
      AND EXISTS (
        SELECT 1
        FROM assignments AS assignment
        WHERE assignment.id = attempt.assignment_id
          AND assignment.session_id IN (SELECT id FROM ielts_routine_target_sessions)
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(attempt.result->'items') AS item
        WHERE item->>'questionId' = question_row.id::text
      );

    UPDATE questions
    SET choices = question_row.new_choices,
        correct_answer = question_row.new_correct
    WHERE id = question_row.id;
  END LOOP;
END
$spread$;
