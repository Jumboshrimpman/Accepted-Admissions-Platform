-- Spread the 24 IELTS-style diagnostic reading keys across A–D.
-- Stored letters follow the same choice text, including session copies and
-- submitted result snapshots. Questions whose choice texts differ are left alone.
-- Running this again is a no-op once a row is already in the new order.

DO $spread$
DECLARE
  question_row record;
BEGIN
  DROP TABLE IF EXISTS ielts_diagnostic_letter_spread;
  CREATE TEMP TABLE ielts_diagnostic_letter_spread (
    prompt text PRIMARY KEY,
    source_key text NOT NULL,
    new_choices jsonb NOT NULL,
    new_correct text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO ielts_diagnostic_letter_spread (prompt, source_key, new_choices, new_correct)
  VALUES
    ($ielts$What is the main purpose of the passage?$ielts$, $ielts$ielts-style-original-reading-m1-q1$ielts$, $ielts$[{"id":"a","label":"A","text":"To describe a shared refrigeration model and its practical effects"},{"id":"b","label":"B","text":"To argue that night markets should be banned during heatwaves"},{"id":"c","label":"C","text":"To compare Kell Harbor’s cuisine with other port towns"},{"id":"d","label":"D","text":"To explain how to repair an overloaded household freezer"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$How is a stall’s weekly cooperative fee determined?$ielts$, $ielts$ielts-style-original-reading-m1-q2$ielts$, $ielts$[{"id":"a","label":"A","text":"By the stall’s nightly revenue"},{"id":"b","label":"B","text":"By the number of staff working the stall"},{"id":"c","label":"C","text":"By the cubic metres of space reserved"},{"id":"d","label":"D","text":"By the length of the stall’s extension cord"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What change reduced extension cords on the pedestrian lane?$ielts$, $ielts$ielts-style-original-reading-m1-q3$ielts$, $ielts$[{"id":"a","label":"A","text":"The rowing club banned freezers after 6 p.m."},{"id":"b","label":"B","text":"Vendors now collect labelled crates from one loading door"},{"id":"c","label":"C","text":"The city delivered ice to every stall"},{"id":"d","label":"D","text":"Household freezers were fitted with longer cables"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$Why did the board add a short-stay shelf with a higher hourly rate?$ielts$, $ielts$ielts-style-original-reading-m1-q4$ielts$, $ielts$[{"id":"a","label":"A","text":"To punish vendors who sell fish"},{"id":"b","label":"B","text":"To satisfy the rowing club’s request for a later start"},{"id":"c","label":"C","text":"To increase the harbour’s electricity profit"},{"id":"d","label":"D","text":"To address part-time vendors who felt they were subsidising overnight storage"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$According to the energy officer, why did the harbour underwrite the first year’s maintenance?$ielts$, $ielts$ielts-style-original-reading-m1-q5$ielts$, $ielts$[{"id":"a","label":"A","text":"Because electricity became cheaper for every household"},{"id":"b","label":"B","text":"Because the rowing club agreed to move its races"},{"id":"c","label":"C","text":"Because the cooperative’s demand is steadier than many independent freezers"},{"id":"d","label":"D","text":"Because membership is guaranteed to stay above twenty stalls"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$In the final paragraph, “underwrite” is closest in meaning to$ielts$, $ielts$ielts-style-original-reading-m1-q6$ielts$, $ielts$[{"id":"a","label":"A","text":"financially guarantee"},{"id":"b","label":"B","text":"publicly criticise"},{"id":"c","label":"C","text":"physically rebuild"},{"id":"d","label":"D","text":"temporarily close"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$What problem does the volunteer network mainly try to solve?$ielts$, $ielts$ielts-style-original-reading-m1-q7$ielts$, $ielts$[{"id":"a","label":"A","text":"A lack of paid jobs for retired bus drivers"},{"id":"b","label":"B","text":"A shortage of secondary-school science teachers"},{"id":"c","label":"C","text":"National stations that refuse to share rainfall totals"},{"id":"d","label":"D","text":"Forecast models that miss frost differences inside the valley"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$When are the volunteer readings taken?$ielts$, $ielts$ielts-style-original-reading-m1-q8$ielts$, $ielts$[{"id":"a","label":"A","text":"At sunset"},{"id":"b","label":"B","text":"At 7 a.m. local time"},{"id":"c","label":"C","text":"Whenever a frost warning is issued"},{"id":"d","label":"D","text":"Only on Sundays"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$What caused a gauge to under-report for about two weeks?$ielts$, $ielts$ielts-style-original-reading-m1-q9$ielts$, $ielts$[{"id":"a","label":"A","text":"A snow-laden branch bent the gauge"},{"id":"b","label":"B","text":"Mara transcribed the wrong Sunday sheet"},{"id":"c","label":"C","text":"The agriculture office replaced the wrong instrument"},{"id":"d","label":"D","text":"A leaking gutter overflowed the notebook"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$Why is the western hollow described as the valley’s most sensitive site?$ielts$, $ielts$ielts-style-original-reading-m1-q10$ielts$, $ielts$[{"id":"a","label":"A","text":"It is the only place with a paid observer"},{"id":"b","label":"B","text":"It receives the most rainfall in summer"},{"id":"c","label":"C","text":"It is closest to the national weather station"},{"id":"d","label":"D","text":"It is consistently the first location to frost"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$How has the regional agriculture office supported the volunteers?$ielts$, $ielts$ielts-style-original-reading-m1-q11$ielts$, $ielts$[{"id":"a","label":"A","text":"By paying each observer a weekly wage"},{"id":"b","label":"B","text":"By moving the national station into the valley"},{"id":"c","label":"C","text":"By replacing cracked gauges and printing waterproof cards"},{"id":"d","label":"D","text":"By cancelling orchard warnings on travel days"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What does Mara Chen believe should come next?$ielts$, $ielts$ielts-style-original-reading-m1-q12$ielts$, $ielts$[{"id":"a","label":"A","text":"Buying the most expensive sensors available"},{"id":"b","label":"B","text":"Adding a second observer at the hollow rather than costlier equipment"},{"id":"c","label":"C","text":"Ending Sunday transcription"},{"id":"d","label":"D","text":"Paying volunteers from orchard-warning fees"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$What is the passage mainly about?$ielts$, $ielts$ielts-style-original-reading-m1-q13$ielts$, $ielts$[{"id":"a","label":"A","text":"Why North Barrow closed its reading room"},{"id":"b","label":"B","text":"A comparison of drills and ladders across cities"},{"id":"c","label":"C","text":"Instructions for repairing a cut power cord"},{"id":"d","label":"D","text":"How a city tool-lending service is used and governed"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$Which items have been borrowed most often?$ielts$, $ielts$ielts-style-original-reading-m1-q14$ielts$, $ielts$[{"id":"a","label":"A","text":"A tile cutter, a wallpaper steamer, and a soil-testing kit"},{"id":"b","label":"B","text":"Drills, ladders, and hammers"},{"id":"c","label":"C","text":"Saws that have been modified at home"},{"id":"d","label":"D","text":"Books about becoming a contractor"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$What happens to a tool that is returned with a cut power cord?$ielts$, $ielts$ielts-style-original-reading-m1-q15$ielts$, $ielts$[{"id":"a","label":"A","text":"The borrower is fined and the tool stays on the shelf"},{"id":"b","label":"B","text":"It is tagged and kept out of circulation until a technician signs it off"},{"id":"c","label":"C","text":"It is given to the housing office"},{"id":"d","label":"D","text":"It is cleaned on Saturday and lent again that afternoon"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$Why does the tile cutter’s card mention ceramic tile and not pruning trees?$ielts$, $ielts$ielts-style-original-reading-m1-q16$ielts$, $ielts$[{"id":"a","label":"A","text":"The city wants to sell more trees"},{"id":"b","label":"B","text":"Retired electricians refused to repair garden tools"},{"id":"c","label":"C","text":"The insurance rider covers intended use, not homemade modifications"},{"id":"d","label":"D","text":"The housing office banned all outdoor work"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$Where do borrowers mainly live, according to the housing office data?$ielts$, $ielts$ielts-style-original-reading-m1-q17$ielts$, $ielts$[{"id":"a","label":"A","text":"In newly built suburban villas"},{"id":"b","label":"B","text":"In two postcodes with many rented terraces"},{"id":"c","label":"C","text":"Only in streets next to the library"},{"id":"d","label":"D","text":"In industrial units outside the city"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$How does Idris respond to the claim that the library is a gift to hobbyists?$ielts$, $ielts$ielts-style-original-reading-m1-q18$ielts$, $ielts$[{"id":"a","label":"A","text":"He publishes a list of contractors who donate tools"},{"id":"b","label":"B","text":"He argues late fees should be higher"},{"id":"c","label":"C","text":"He says drills remain the most borrowed item"},{"id":"d","label":"D","text":"He points to short loans and few repeat names in a month"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$What change does the passage describe?$ielts$, $ielts$ielts-style-original-reading-m1-q19$ielts$, $ielts$[{"id":"a","label":"A","text":"A limited night check of high-impact parts to prevent morning cancellations"},{"id":"b","label":"B","text":"Replacing all depot software with a barcode system"},{"id":"c","label":"C","text":"Moving the first driver start time to 4:40 a.m."},{"id":"d","label":"D","text":"Closing the parts cage during winter"}]$ielts$::jsonb, $ielts$a$ielts$),
    ($ielts$What problem triggered the new night procedure?$ielts$, $ielts$ielts-style-original-reading-m1-q20$ielts$, $ielts$[{"id":"a","label":"A","text":"Washer fluid ran out on every bus"},{"id":"b","label":"B","text":"The union demanded heated offices"},{"id":"c","label":"C","text":"Three morning services were cancelled when a door-seal kit was missing"},{"id":"d","label":"D","text":"A consultant refused to quote for software"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$What do the night technicians confirm about the twenty parts?$ielts$, $ielts$ielts-style-original-reading-m1-q21$ielts$, $ielts$[{"id":"a","label":"A","text":"That they are on sale to other depots"},{"id":"b","label":"B","text":"That they have been replaced with barcodes"},{"id":"c","label":"C","text":"That they belong to the union"},{"id":"d","label":"D","text":"That they are physically present, labelled, and not left in a cab"}]$ielts$::jsonb, $ielts$d$ielts$),
    ($ielts$Why was heating the cage part of the compromise with the union?$ielts$, $ielts$ielts-style-original-reading-m1-q22$ielts$, $ielts$[{"id":"a","label":"A","text":"Because the consultant required 12°C for barcodes"},{"id":"b","label":"B","text":"Because extra walking was unpopular and two cleaning tasks were dropped in exchange"},{"id":"c","label":"C","text":"Because door seals freeze below 12°C"},{"id":"d","label":"D","text":"Because day supervisors refused to read notes"}]$ielts$::jsonb, $ielts$b$ielts$),
    ($ielts$The operations manager’s phrase “a cheap honesty layer” refers to$ielts$, $ielts$ielts-style-original-reading-m1-q23$ielts$, $ielts$[{"id":"a","label":"A","text":"a full software rebuild"},{"id":"b","label":"B","text":"a union rule about night pay"},{"id":"c","label":"C","text":"a simple physical check that exposes false computer stock"},{"id":"d","label":"D","text":"a heated waiting room for drivers"}]$ielts$::jsonb, $ielts$c$ielts$),
    ($ielts$How does the manager keep the twenty-part list from going stale?$ielts$, $ielts$ielts-style-original-reading-m1-q24$ielts$, $ielts$[{"id":"a","label":"A","text":"By comparing cancellation codes with the list each quarter and swapping two items"},{"id":"b","label":"B","text":"By replacing the entire list every Monday"},{"id":"c","label":"C","text":"By asking drivers to rewrite the list nightly"},{"id":"d","label":"D","text":"By buying whatever the consultant recommends"}]$ielts$::jsonb, $ielts$a$ielts$);

  UPDATE bank_questions AS bank
  SET choices = target.new_choices,
      correct_answer = target.new_correct,
      updated_at = now()
  FROM ielts_diagnostic_letter_spread AS target
  WHERE bank.source_key = target.source_key
    AND (
      bank.correct_answer IS DISTINCT FROM target.new_correct
      OR bank.choices IS DISTINCT FROM target.new_choices
    );

  FOR question_row IN
    SELECT DISTINCT ON (q.id)
      q.id,
      q.choices AS old_choices,
      target.new_choices,
      target.new_correct
    FROM questions q
    JOIN ielts_diagnostic_letter_spread AS target
      ON q.prompt = target.prompt
      OR EXISTS (
        SELECT 1
        FROM bank_questions AS bank
        WHERE bank.source_key = target.source_key
          AND bank.linked_question_id = q.id
      )
    WHERE q.choices IS DISTINCT FROM target.new_choices
      AND (
        SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
        FROM jsonb_array_elements(q.choices) AS elem
      ) = (
        SELECT array_agg(elem->>'text' ORDER BY elem->>'text')
        FROM jsonb_array_elements(target.new_choices) AS elem
      )
    ORDER BY q.id, (q.prompt = target.prompt) DESC
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
    WHERE response.question_id = question_row.id;

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
