import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0077_ielts_routine_answer_spread.sql",
  import.meta.url,
);
const journalUrl = new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url);

const novemberPrompt = "Why does Wren Street Bakery keep fermentation cards?";
const correctText = "To record conditions so staff can see why dough behaves differently";
const distractorText = "To hide a secret recipe from apprentices";
const oldNovemberChoices = [
  { id: "a", label: "A", text: distractorText },
  { id: "b", label: "B", text: correctText },
  { id: "c", label: "C", text: "To satisfy a city hygiene inspector’s weekly visit" },
  { id: "d", label: "D", text: "To advertise supermarket yeast in the window" },
];
const decemberPrompt = "What was wrong with the old twenty-minute clock-face?";
const decemberCorrect = "Small loading delays stacked onto the next departure";
const oldDecemberChoices = [
  { id: "a", label: "A", text: "The crossing never took eleven minutes even in good weather" },
  { id: "b", label: "B", text: decemberCorrect },
  { id: "c", label: "C", text: "The harbour wanted to ban bicycles" },
  { id: "d", label: "D", text: "Factory workers refused to use the ferry" },
];

after(async () => {
  await pool.end();
});

test("0077 journal is newer than the Xavier connections note", async () => {
  const journal = JSON.parse(await readFile(fileURLToPath(journalUrl), "utf8")) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };
  const entry = journal.entries.find((item) => item.tag === "0077_ielts_routine_answer_spread");
  assert.ok(entry);
  assert.equal(entry?.idx, 77);
  assert.ok((entry?.when ?? 0) > 1792800000000);
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  assert.match(sql, /ielts-style-original-reading-m2-q25/);
  assert.match(sql, /ielts-style-original-reading-m3-q48/);
  assert.doesNotMatch(sql, /UPDATE\s+sessions/i);
  assert.doesNotMatch(sql, /UPDATE\s+bank_questions/i);
  assert.doesNotMatch(sql, /UPDATE\s+users/i);
  assert.doesNotMatch(sql, /sendEmail|weekly_hours|provider_event/i);
});

test("0077 remaps only Nov 13 and Dec 4 English question rows", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const client = await pool.connect();
  const suffix = `routine-spread-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const existingTaito = await client.query<{ id: string }>(
      `select id from users where lower(trim(email)) = 'taito0525@gmail.com' limit 1`,
    );
    const taito =
      existingTaito.rows[0] ??
      (
        await client.query<{ id: string }>(
          `insert into users (clerk_user_id, email, display_name)
           values ($1, 'taito0525@gmail.com', 'Taito')
           returning id`,
          [`clerk-taito-${suffix}`],
        )
      ).rows[0]!;
    const other = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Other Student')
       returning id`,
      [`clerk-other-${suffix}`, `${suffix}@example.invalid`],
    );
    const tutor = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Tutor Example')
       returning id`,
      [`clerk-tutor-${suffix}`, `tutor-${suffix}@example.invalid`],
    );
    const course = await client.query<{ id: string }>(
      `insert into courses (title, subject, term)
       values ('English', 'IELTS', '2026')
       returning id`,
    );
    const november = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title,
         provider_event_id, provider_event_url
       )
       values (
         $1, $2, $3, '2026-11-13T12:00:00Z', 'Asia/Tokyo', 'IELTS', 'November English',
         'event-nov', 'https://www.google.com/calendar/event?eid=nov'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const december = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title,
         provider_event_id, provider_event_url
       )
       values (
         $1, $2, $3, '2026-12-04T12:00:00Z', 'Asia/Tokyo', 'English', 'December English',
         'event-dec', 'https://meet.google.com/rih-iayt-okb'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const october = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title,
         provider_event_id, provider_event_url
       )
       values (
         $1, $2, $3, '2026-10-23T12:00:00Z', 'Asia/Tokyo', 'IELTS', 'October English',
         'event-oct', 'https://meet.google.com/rih-iayt-okb'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const otherNovember = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title
       )
       values (
         $1, $2, $3, '2026-11-13T12:00:00Z', 'Asia/Tokyo', 'IELTS', 'Other November English'
       )
       returning id`,
      [course.rows[0]!.id, other.rows[0]!.id, tutor.rows[0]!.id],
    );

    async function assignmentFor(sessionId: string, title: string) {
      const assignment = await client.query<{ id: string }>(
        `insert into assignments (course_id, session_id, title, subject, instructions, status, time_limit_minutes)
         values ($1, $2, $3, 'IELTS', 'Read', 'published', 20)
         returning id`,
        [course.rows[0]!.id, sessionId, title],
      );
      return assignment.rows[0]!.id;
    }

    async function question(prompt: string, choices: unknown, correct: string) {
      const row = await client.query<{ id: string }>(
        `insert into questions (
           subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
         )
         values ('IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, $3, 'Stored explanation.')
         returning id`,
        [prompt, JSON.stringify(choices), correct],
      );
      return row.rows[0]!.id;
    }

    const novemberQuestion = await question(novemberPrompt, oldNovemberChoices, "b");
    const decemberQuestion = await question(decemberPrompt, oldDecemberChoices, "b");
    const octoberQuestion = await question(novemberPrompt, oldNovemberChoices, "b");
    const otherQuestion = await question(novemberPrompt, oldNovemberChoices, "b");
    const sharedQuestion = await question(novemberPrompt, oldNovemberChoices, "b");
    const mismatched = await question(novemberPrompt, [{ id: "a", label: "A", text: "different choice" }], "a");

    const novemberAssignment = await assignmentFor(november.rows[0]!.id, "Nov pre-work");
    const decemberAssignment = await assignmentFor(december.rows[0]!.id, "Dec pre-work");
    const octoberAssignment = await assignmentFor(october.rows[0]!.id, "Oct pre-work");
    const otherAssignment = await assignmentFor(otherNovember.rows[0]!.id, "Other pre-work");
    await client.query(
      `insert into assignment_questions (assignment_id, question_id, position)
       values ($1, $2, 0), ($3, $4, 0), ($5, $6, 0), ($7, $8, 0), ($1, $9, 1), ($5, $9, 1), ($1, $10, 2)`,
      [
        novemberAssignment,
        novemberQuestion,
        decemberAssignment,
        decemberQuestion,
        octoberAssignment,
        octoberQuestion,
        otherAssignment,
        otherQuestion,
        sharedQuestion,
        mismatched,
      ],
    );
    const attempt = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'submitted', $3::jsonb)
       returning id`,
      [
        novemberAssignment,
        taito.id,
        JSON.stringify({
          correctCount: 1,
          items: [
            {
              questionId: novemberQuestion,
              finalAnswer: "b",
              correctAnswer: "b",
              prediction: "b",
              correct: true,
              choices: oldNovemberChoices,
              prompt: novemberPrompt,
            },
            {
              questionId: mismatched,
              finalAnswer: "a",
              correctAnswer: "a",
              choices: [{ id: "a", label: "A", text: "different choice" }],
              prompt: novemberPrompt,
            },
          ],
        }),
      ],
    );
    const octoberAttempt = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'submitted', $3::jsonb)
       returning id`,
      [
        octoberAssignment,
        taito.id,
        JSON.stringify({
          items: [
            {
              questionId: octoberQuestion,
              finalAnswer: "b",
              correctAnswer: "b",
              choices: oldNovemberChoices,
            },
          ],
        }),
      ],
    );
    await client.query(
      `insert into responses (attempt_id, question_id, final_answer, prediction, correct)
       values ($1, $2, 'b', 'because the cards', true),
              ($3, $4, 'b', 'B', false)`,
      [attempt.rows[0]!.id, novemberQuestion, octoberAttempt.rows[0]!.id, octoberQuestion],
    );
    const collection = await client.query<{ id: string }>(
      `insert into exam_source_collections (exam_family, title, slug)
       values ('ielts', 'Routine spread test', $1)
       returning id`,
      [`routine-spread-${suffix}`],
    );
    await client.query(
      `insert into bank_questions (
         source_key, collection_id, exam_family, section, module, question_number, position,
         prompt, choices, correct_answer, question_type, estimated_seconds, source_kind
       )
       values (
         $1, $2, 'ielts', 'reading', 2, 25, 25,
         $3, $4::jsonb, 'b', 'mcq', 90, 'original'
       )`,
      [
        `ielts-style-original-reading-m2-q25-${suffix}`,
        collection.rows[0]!.id,
        novemberPrompt,
        JSON.stringify(oldNovemberChoices),
      ],
    );

    const beforeSession = await client.query(
      `select id, date_time, tutor_user_id, provider_event_id, provider_event_url, subject, timezone
       from sessions
       where id = any($1::uuid[])
       order by id`,
      [[november.rows[0]!.id, december.rows[0]!.id, october.rows[0]!.id]],
    );

    await client.query(sql);
    await client.query(sql);

    const afterSession = await client.query(
      `select id, date_time, tutor_user_id, provider_event_id, provider_event_url, subject, timezone
       from sessions
       where id = any($1::uuid[])
       order by id`,
      [[november.rows[0]!.id, december.rows[0]!.id, october.rows[0]!.id]],
    );
    assert.deepEqual(afterSession.rows, beforeSession.rows);

    const novemberRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [novemberQuestion],
    );
    assert.equal(novemberRow.rows[0]?.correct_answer, "c");
    assert.equal(novemberRow.rows[0]?.choices.find((choice) => choice.id === "c")?.text, correctText);
    assert.equal(novemberRow.rows[0]?.choices.find((choice) => choice.id === "a")?.text, distractorText);

    const decemberRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [decemberQuestion],
    );
    assert.equal(decemberRow.rows[0]?.correct_answer, "d");
    assert.equal(decemberRow.rows[0]?.choices.find((choice) => choice.id === "d")?.text, decemberCorrect);

    for (const id of [octoberQuestion, otherQuestion, sharedQuestion, mismatched]) {
      const row = await client.query<{ correct_answer: string; choices: unknown }>(
        `select correct_answer, choices from questions where id = $1`,
        [id],
      );
      assert.notEqual(row.rows[0]?.correct_answer, "c", id);
    }
    const mismatchedRow = await client.query<{ correct_answer: string }>(
      `select correct_answer from questions where id = $1`,
      [mismatched],
    );
    assert.equal(mismatchedRow.rows[0]?.correct_answer, "a");

    const answers = await client.query<{ attempt_id: string; final_answer: string; prediction: string }>(
      `select attempt_id, final_answer, prediction from responses where question_id = any($1::uuid[])`,
      [[novemberQuestion, octoberQuestion]],
    );
    const novemberAnswer = answers.rows.find((row) => row.attempt_id === attempt.rows[0]!.id);
    const octoberAnswer = answers.rows.find((row) => row.attempt_id === octoberAttempt.rows[0]!.id);
    assert.equal(novemberAnswer?.final_answer, "c");
    assert.equal(novemberAnswer?.prediction, "because the cards");
    assert.equal(octoberAnswer?.final_answer, "b");
    assert.equal(octoberAnswer?.prediction, "B");

    const stored = await client.query<{ result: { correctCount: number; items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [attempt.rows[0]!.id],
    );
    const reviewed = stored.rows[0]?.result.items.find((item) => item.questionId === novemberQuestion);
    const untouched = stored.rows[0]?.result.items.find((item) => item.questionId === mismatched);
    assert.equal(reviewed?.finalAnswer, "c");
    assert.equal(reviewed?.correctAnswer, "c");
    assert.equal(reviewed?.prediction, "c");
    assert.equal(stored.rows[0]?.result.correctCount, 1);
    assert.equal(untouched?.finalAnswer, "a");
    const octoberStored = await client.query<{ result: { items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [octoberAttempt.rows[0]!.id],
    );
    assert.equal(octoberStored.rows[0]?.result.items[0]?.finalAnswer, "b");

    const bank = await client.query<{ correct_answer: string }>(
      `select correct_answer from bank_questions where source_key = $1`,
      [`ielts-style-original-reading-m2-q25-${suffix}`],
    );
    assert.equal(bank.rows[0]?.correct_answer, "b");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("0077 leaves a question shared with a session_id NULL assignment untouched", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const client = await pool.connect();
  const suffix = `routine-null-session-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const existingTaito = await client.query<{ id: string }>(
      `select id from users where lower(trim(email)) = 'taito0525@gmail.com' limit 1`,
    );
    const taito =
      existingTaito.rows[0] ??
      (
        await client.query<{ id: string }>(
          `insert into users (clerk_user_id, email, display_name)
           values ($1, 'taito0525@gmail.com', 'Taito')
           returning id`,
          [`clerk-taito-${suffix}`],
        )
      ).rows[0]!;
    const tutor = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Tutor Example')
       returning id`,
      [`clerk-tutor-${suffix}`, `tutor-${suffix}@example.invalid`],
    );
    const course = await client.query<{ id: string }>(
      `insert into courses (title, subject, term)
       values ('English', 'IELTS', '2026')
       returning id`,
    );
    const november = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title
       )
       values (
         $1, $2, $3, '2026-11-13T12:00:00Z', 'Asia/Tokyo', 'IELTS', 'November English'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const shared = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values ('IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'Stored explanation.')
       returning id`,
      [novemberPrompt, JSON.stringify(oldNovemberChoices)],
    );
    const onlyNovember = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values ('IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'Stored explanation.')
       returning id`,
      [novemberPrompt, JSON.stringify(oldNovemberChoices)],
    );
    const novemberAssignment = await client.query<{ id: string }>(
      `insert into assignments (course_id, session_id, title, subject, instructions, status, time_limit_minutes)
       values ($1, $2, 'Nov pre-work', 'IELTS', 'Read', 'published', 20)
       returning id`,
      [course.rows[0]!.id, november.rows[0]!.id],
    );
    const unscheduled = await client.query<{ id: string }>(
      `insert into assignments (course_id, session_id, title, subject, instructions, status, time_limit_minutes)
       values ($1, null, 'Unscheduled copy', 'IELTS', 'Read', 'published', 20)
       returning id`,
      [course.rows[0]!.id],
    );
    await client.query(
      `insert into assignment_questions (assignment_id, question_id, position)
       values ($1, $2, 0), ($3, $2, 0), ($1, $4, 1)`,
      [novemberAssignment.rows[0]!.id, shared.rows[0]!.id, unscheduled.rows[0]!.id, onlyNovember.rows[0]!.id],
    );
    const nullAttempt = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'submitted', $3::jsonb)
       returning id`,
      [
        unscheduled.rows[0]!.id,
        taito.id,
        JSON.stringify({
          items: [
            {
              questionId: shared.rows[0]!.id,
              finalAnswer: "b",
              correctAnswer: "b",
              choices: oldNovemberChoices,
            },
          ],
        }),
      ],
    );
    await client.query(
      `insert into responses (attempt_id, question_id, final_answer, prediction, correct)
       values ($1, $2, 'b', 'b', true)`,
      [nullAttempt.rows[0]!.id, shared.rows[0]!.id],
    );

    await client.query(sql);
    await client.query(sql);

    const sharedRow = await client.query<{ correct_answer: string; choices: unknown }>(
      `select correct_answer, choices from questions where id = $1`,
      [shared.rows[0]!.id],
    );
    assert.equal(sharedRow.rows[0]?.correct_answer, "b");
    assert.deepEqual(sharedRow.rows[0]?.choices, oldNovemberChoices);
    const sharedResponse = await client.query<{ final_answer: string }>(
      `select final_answer from responses where attempt_id = $1 and question_id = $2`,
      [nullAttempt.rows[0]!.id, shared.rows[0]!.id],
    );
    assert.equal(sharedResponse.rows[0]?.final_answer, "b");
    const stored = await client.query<{ result: { items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [nullAttempt.rows[0]!.id],
    );
    assert.equal(stored.rows[0]?.result.items[0]?.finalAnswer, "b");
    assert.equal(stored.rows[0]?.result.items[0]?.correctAnswer, "b");

    const rewritten = await client.query<{ correct_answer: string }>(
      `select correct_answer from questions where id = $1`,
      [onlyNovember.rows[0]!.id],
    );
    assert.equal(rewritten.rows[0]?.correct_answer, "c");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("0077 leaves a row whose stored key disagrees with the bank untouched", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  const client = await pool.connect();
  const suffix = `routine-key-mismatch-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const existingTaito = await client.query<{ id: string }>(
      `select id from users where lower(trim(email)) = 'taito0525@gmail.com' limit 1`,
    );
    const taito =
      existingTaito.rows[0] ??
      (
        await client.query<{ id: string }>(
          `insert into users (clerk_user_id, email, display_name)
           values ($1, 'taito0525@gmail.com', 'Taito')
           returning id`,
          [`clerk-taito-${suffix}`],
        )
      ).rows[0]!;
    const tutor = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Tutor Example')
       returning id`,
      [`clerk-tutor-${suffix}`, `tutor-${suffix}@example.invalid`],
    );
    const course = await client.query<{ id: string }>(
      `insert into courses (title, subject, term)
       values ('English', 'IELTS', '2026')
       returning id`,
    );
    const november = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title
       )
       values (
         $1, $2, $3, '2026-11-13T12:00:00Z', 'Asia/Tokyo', 'IELTS', 'November English'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const disagreed = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values ('IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'a', 'Stored explanation.')
       returning id`,
      [novemberPrompt, JSON.stringify(oldNovemberChoices)],
    );
    const agreed = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values ('IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'Stored explanation.')
       returning id`,
      [novemberPrompt, JSON.stringify(oldNovemberChoices)],
    );
    const assignment = await client.query<{ id: string }>(
      `insert into assignments (course_id, session_id, title, subject, instructions, status, time_limit_minutes)
       values ($1, $2, 'Nov pre-work', 'IELTS', 'Read', 'published', 20)
       returning id`,
      [course.rows[0]!.id, november.rows[0]!.id],
    );
    await client.query(
      `insert into assignment_questions (assignment_id, question_id, position)
       values ($1, $2, 0), ($1, $3, 1)`,
      [assignment.rows[0]!.id, disagreed.rows[0]!.id, agreed.rows[0]!.id],
    );
    const attempt = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'submitted', $3::jsonb)
       returning id`,
      [
        assignment.rows[0]!.id,
        taito.id,
        JSON.stringify({
          items: [
            {
              questionId: disagreed.rows[0]!.id,
              finalAnswer: "a",
              correctAnswer: "a",
              choices: oldNovemberChoices,
            },
          ],
        }),
      ],
    );
    await client.query(
      `insert into responses (attempt_id, question_id, final_answer, prediction, correct)
       values ($1, $2, 'a', 'a', false)`,
      [attempt.rows[0]!.id, disagreed.rows[0]!.id],
    );

    await client.query(sql);
    await client.query(sql);

    const disagreedRow = await client.query<{ correct_answer: string; choices: unknown }>(
      `select correct_answer, choices from questions where id = $1`,
      [disagreed.rows[0]!.id],
    );
    assert.equal(disagreedRow.rows[0]?.correct_answer, "a");
    assert.deepEqual(disagreedRow.rows[0]?.choices, oldNovemberChoices);
    const disagreedResponse = await client.query<{ final_answer: string; prediction: string }>(
      `select final_answer, prediction from responses where attempt_id = $1 and question_id = $2`,
      [attempt.rows[0]!.id, disagreed.rows[0]!.id],
    );
    assert.equal(disagreedResponse.rows[0]?.final_answer, "a");
    assert.equal(disagreedResponse.rows[0]?.prediction, "a");
    const stored = await client.query<{ result: { items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [attempt.rows[0]!.id],
    );
    assert.equal(stored.rows[0]?.result.items[0]?.finalAnswer, "a");
    assert.equal(stored.rows[0]?.result.items[0]?.correctAnswer, "a");
    assert.deepEqual(stored.rows[0]?.result.items[0]?.choices, oldNovemberChoices);

    const agreedRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [agreed.rows[0]!.id],
    );
    assert.equal(agreedRow.rows[0]?.correct_answer, "c");
    assert.equal(agreedRow.rows[0]?.choices.find((choice) => choice.id === "c")?.text, correctText);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("0077 tolerates invalid timezones and non-array JSON and still spreads good rows", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  assert.match(sql, /pg_timezone_names/);
  assert.match(sql, /ielts_jsonb_array/);
  assert.doesNotMatch(sql, /AT TIME ZONE\s+(COALESCE\(NULLIF\(s\.timezone|s\.timezone)/i);
  const client = await pool.connect();
  const suffix = `routine-bad-shape-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const existingTaito = await client.query<{ id: string }>(
      `select id from users where lower(trim(email)) = 'taito0525@gmail.com' limit 1`,
    );
    const taito =
      existingTaito.rows[0] ??
      (
        await client.query<{ id: string }>(
          `insert into users (clerk_user_id, email, display_name)
           values ($1, 'taito0525@gmail.com', 'Taito')
           returning id`,
          [`clerk-taito-${suffix}`],
        )
      ).rows[0]!;
    const tutor = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Tutor Example')
       returning id`,
      [`clerk-tutor-${suffix}`, `tutor-${suffix}@example.invalid`],
    );
    const course = await client.query<{ id: string }>(
      `insert into courses (title, subject, term)
       values ('English', 'IELTS', '2026')
       returning id`,
    );
    const target = await client.query<{ id: string }>(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title
       )
       values (
         $1, $2, $3, '2026-11-13T12:00:00Z', 'ET', 'IELTS', 'November English'
       )
       returning id`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    await client.query(
      `insert into sessions (
         course_id, client_user_id, tutor_user_id, date_time, timezone, subject, title
       )
       values (
         $1, $2, $3, '2026-01-15T12:00:00Z', 'ET', 'IELTS', 'Unrelated English'
       )`,
      [course.rows[0]!.id, taito.id, tutor.rows[0]!.id],
    );
    const assignment = await client.query<{ id: string }>(
      `insert into assignments (course_id, session_id, title, subject, instructions, status, time_limit_minutes)
       values ($1, $2, 'Nov pre-work', 'IELTS', 'Read', 'published', 20)
       returning id`,
      [course.rows[0]!.id, target.rows[0]!.id],
    );

    const goodQuestionRow = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'Stored explanation.'
       )
       returning id`,
      [novemberPrompt, JSON.stringify(oldNovemberChoices)],
    );
    const goodQuestion = goodQuestionRow.rows[0]!.id;
    const nullChoices = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, 'null'::jsonb, 'b', 'Stored explanation.'
       )
       returning id`,
      [novemberPrompt],
    );
    const objectChoices = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, '{"paused":true}'::jsonb, 'b', 'Stored explanation.'
       )
       returning id`,
      [novemberPrompt],
    );
    const scalarChoices = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, '"saved-and-exit"'::jsonb, 'b', 'Stored explanation.'
       )
       returning id`,
      [novemberPrompt],
    );
    await client.query(
      `insert into assignment_questions (assignment_id, question_id, position)
       values ($1, $2, 0), ($1, $3, 1), ($1, $4, 2), ($1, $5, 3)`,
      [
        assignment.rows[0]!.id,
        goodQuestion,
        nullChoices.rows[0]!.id,
        objectChoices.rows[0]!.id,
        scalarChoices.rows[0]!.id,
      ],
    );

    const goodItem = {
      questionId: goodQuestion,
      finalAnswer: "b",
      correctAnswer: "b",
      prediction: "b",
      choices: oldNovemberChoices,
      prompt: novemberPrompt,
    };
    const nullChoiceItem = {
      questionId: goodQuestion,
      finalAnswer: "b",
      correctAnswer: "b",
      choices: null,
    };
    const scalarChoiceItem = {
      questionId: goodQuestion,
      finalAnswer: "b",
      choices: "saved-and-exit",
    };
    const fallbackItem = {
      questionId: goodQuestion,
      finalAnswer: "b",
      correctAnswer: "b",
      prediction: "b",
    };
    const mixed = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'submitted', $3::jsonb)
       returning id`,
      [
        assignment.rows[0]!.id,
        taito.id,
        JSON.stringify({ items: [goodItem, nullChoiceItem, scalarChoiceItem, fallbackItem] }),
      ],
    );
    const nullItems = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'active', $3::jsonb)
       returning id`,
      [assignment.rows[0]!.id, taito.id, JSON.stringify({ items: null, paused: true })],
    );
    const objectItems = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'active', $3::jsonb)
       returning id`,
      [assignment.rows[0]!.id, taito.id, JSON.stringify({ items: { questionId: goodQuestion } })],
    );
    await client.query(
      `insert into responses (attempt_id, question_id, final_answer, prediction, correct)
       values ($1, $2, 'b', 'b', true)`,
      [mixed.rows[0]!.id, goodQuestion],
    );

    await client.query(sql);
    await client.query(sql);

    const goodRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [goodQuestion],
    );
    assert.equal(goodRow.rows[0]?.correct_answer, "c");
    assert.equal(goodRow.rows[0]?.choices.find((choice) => choice.id === "c")?.text, correctText);

    for (const id of [nullChoices.rows[0]!.id, objectChoices.rows[0]!.id, scalarChoices.rows[0]!.id]) {
      const row = await client.query<{ correct_answer: string }>(
        `select correct_answer from questions where id = $1`,
        [id],
      );
      assert.equal(row.rows[0]?.correct_answer, "b");
    }
    const nullShape = await client.query<{ choices: unknown }>(
      `select choices from questions where id = $1`,
      [nullChoices.rows[0]!.id],
    );
    assert.equal(nullShape.rows[0]?.choices, null);
    const objectShape = await client.query<{ choices: unknown }>(
      `select choices from questions where id = $1`,
      [objectChoices.rows[0]!.id],
    );
    assert.deepEqual(objectShape.rows[0]?.choices, { paused: true });
    const scalarShape = await client.query<{ choices: unknown }>(
      `select choices from questions where id = $1`,
      [scalarChoices.rows[0]!.id],
    );
    assert.equal(scalarShape.rows[0]?.choices, "saved-and-exit");

    const stored = await client.query<{ result: { items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [mixed.rows[0]!.id],
    );
    const items = stored.rows[0]?.result.items ?? [];
    assert.equal(items[0]?.finalAnswer, "c");
    assert.equal(items[0]?.correctAnswer, "c");
    assert.equal(items[0]?.prediction, "c");
    assert.equal(items[1]?.finalAnswer, "b");
    assert.equal(items[1]?.choices, null);
    assert.equal(items[2]?.finalAnswer, "b");
    assert.equal(items[2]?.choices, "saved-and-exit");
    assert.equal(items[3]?.finalAnswer, "c");
    assert.equal(items[3]?.correctAnswer, "c");

    const paused = await client.query<{ result: { items: unknown; paused?: boolean } }>(
      `select result from attempts where id = $1`,
      [nullItems.rows[0]!.id],
    );
    assert.equal(paused.rows[0]?.result.items, null);
    assert.equal(paused.rows[0]?.result.paused, true);
    const objectResult = await client.query<{ result: { items: unknown } }>(
      `select result from attempts where id = $1`,
      [objectItems.rows[0]!.id],
    );
    assert.deepEqual(objectResult.rows[0]?.result.items, { questionId: goodQuestion });

    const answer = await client.query<{ final_answer: string }>(
      `select final_answer from responses where attempt_id = $1 and question_id = $2`,
      [mixed.rows[0]!.id, goodQuestion],
    );
    assert.equal(answer.rows[0]?.final_answer, "c");
    const zones = await client.query<{ timezone: string }>(
      `select timezone from sessions where course_id = $1 order by date_time`,
      [course.rows[0]!.id],
    );
    assert.deepEqual(
      zones.rows.map((row) => row.timezone),
      ["ET", "ET"],
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
