import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { remapStoredChoiceLetter } from "./choice-letter-remap.ts";

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0073_ielts_diagnostic_answer_spread.sql",
  import.meta.url,
);

const prompt = "What is the main purpose of the passage?";
const correctText = "To describe a shared refrigeration model and its practical effects";
const distractorText = "To argue that night markets should be banned during heatwaves";
const oldChoices = [
  { id: "a", label: "A", text: distractorText },
  { id: "b", label: "B", text: correctText },
  { id: "c", label: "C", text: "To compare Kell Harbor’s cuisine with other port towns" },
  { id: "d", label: "D", text: "To explain how to repair an overloaded household freezer" },
];

after(async () => {
  await pool.end();
});

test("remapStoredChoiceLetter keeps the selected choice text", () => {
  const next = [
    { id: "a", text: correctText },
    { id: "b", text: distractorText },
    { id: "c", text: oldChoices[2]!.text },
    { id: "d", text: oldChoices[3]!.text },
  ];
  assert.equal(remapStoredChoiceLetter(oldChoices, next, "b"), "a");
  assert.equal(remapStoredChoiceLetter(oldChoices, next, "B"), "a");
  assert.equal(remapStoredChoiceLetter(oldChoices, next, "a"), "b");
  assert.equal(
    remapStoredChoiceLetter(oldChoices, next, "the cooperative model"),
    "the cooperative model",
  );
  assert.equal(remapStoredChoiceLetter(oldChoices, next, null), null);
});

test("0073 spreads diagnostic letters without changing which text was selected", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  assert.match(sql, /ielts-style-original-reading-m1-q1/);
  assert.match(sql, /ielts-style-original-reading-m1-q24/);
  assert.doesNotMatch(sql, /SET "weekly_hours"/);
  const client = await pool.connect();
  const suffix = `ielts-spread-${Date.now()}`;
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, email, display_name)
       values ($1, $2, 'Student Example')
       returning id`,
      [`clerk-${suffix}`, `${suffix}@example.invalid`],
    );
    const course = await client.query<{ id: string }>(
      `insert into courses (title, subject, term)
       values ('English', 'IELTS', '2026')
       returning id`,
    );
    const assignment = await client.query<{ id: string }>(
      `insert into assignments (
         course_id, title, subject, instructions, status, time_limit_minutes
       )
       values ($1, 'IELTS-style diagnostic reading — example', 'IELTS', 'Read', 'published', 35)
       returning id`,
      [course.rows[0]!.id],
    );
    const linked = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'The passage centres on the cooperative.'
       )
       returning id`,
      [prompt, JSON.stringify(oldChoices)],
    );
    const copy = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation, generation_method, tags
       )
       values (
         'IELTS', 'IELTS Reading', 'Main idea', 'mcq', 'medium', $1, $2::jsonb, 'b', 'The passage centres on the cooperative.',
         'session-copy', '["session-copy"]'::jsonb
       )
       returning id`,
      [prompt, JSON.stringify(oldChoices)],
    );
    const decoy = await client.query<{ id: string }>(
      `insert into questions (
         subject, domain, skill, question_type, difficulty, prompt, choices, correct_answer, explanation
       )
       values (
         'IELTS', 'IELTS Reading', 'Other', 'mcq', 'medium', 'Which sentence is unrelated?',
         $1::jsonb, 'c', 'Leave this row alone.'
       )
       returning id`,
      [JSON.stringify([{ id: "c", label: "C", text: "leave this choice" }])],
    );
    const collection = await client.query<{ id: string }>(
      `insert into exam_source_collections (exam_family, title, slug)
       values ('ielts', 'IELTS-style spread test', $1)
       returning id`,
      [`ielts-spread-${suffix}`],
    );
    await client.query(
      `insert into bank_questions (
         source_key, collection_id, exam_family, section, module, question_number, position,
         prompt, choices, correct_answer, question_type, estimated_seconds, source_kind, linked_question_id
       )
       values (
         'ielts-style-original-reading-m1-q1', $1, 'ielts', 'reading', 1, 1, 1,
         $2, $3::jsonb, 'b', 'mcq', 90, 'original', $4
       )
       on conflict (source_key) do update
       set choices = excluded.choices,
           correct_answer = excluded.correct_answer,
           prompt = excluded.prompt,
           linked_question_id = excluded.linked_question_id`,
      [collection.rows[0]!.id, prompt, JSON.stringify(oldChoices), linked.rows[0]!.id],
    );
    const attempt = await client.query<{ id: string }>(
      `insert into attempts (assignment_id, user_id, status, result)
       values ($1, $2, 'paused', $3::jsonb)
       returning id`,
      [
        assignment.rows[0]!.id,
        user.rows[0]!.id,
        JSON.stringify({
          correctCount: 1,
          items: [
            {
              questionId: linked.rows[0]!.id,
              finalAnswer: "b",
              correctAnswer: "b",
              prediction: "b",
              correct: true,
              choices: oldChoices,
              prompt,
            },
            {
              questionId: decoy.rows[0]!.id,
              finalAnswer: "c",
              correctAnswer: "c",
              choices: [{ id: "c", label: "C", text: "leave this choice" }],
              prompt: "Which sentence is unrelated?",
            },
          ],
        }),
      ],
    );
    await client.query(
      `insert into responses (attempt_id, question_id, final_answer, prediction, correct)
       values ($1, $2, 'b', 'because the cooperative', true),
              ($1, $3, 'a', 'B', false)`,
      [attempt.rows[0]!.id, linked.rows[0]!.id, copy.rows[0]!.id],
    );

    await client.query(sql);
    await client.query(sql);

    const linkedRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [linked.rows[0]!.id],
    );
    assert.equal(linkedRow.rows[0]?.correct_answer, "a");
    assert.equal(
      linkedRow.rows[0]?.choices.find((choice) => choice.id === "a")?.text,
      correctText,
    );
    const copyRow = await client.query<{ correct_answer: string; choices: Array<{ id: string; text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [copy.rows[0]!.id],
    );
    assert.equal(copyRow.rows[0]?.correct_answer, "a");
    assert.equal(
      copyRow.rows[0]?.choices.find((choice) => choice.id === "b")?.text,
      distractorText,
    );
    const decoyRow = await client.query<{ correct_answer: string; choices: Array<{ text: string }> }>(
      `select correct_answer, choices from questions where id = $1`,
      [decoy.rows[0]!.id],
    );
    assert.equal(decoyRow.rows[0]?.correct_answer, "c");
    assert.equal(decoyRow.rows[0]?.choices[0]?.text, "leave this choice");

    const answers = await client.query<{ question_id: string; final_answer: string; prediction: string; correct: boolean }>(
      `select question_id, final_answer, prediction, correct
       from responses
       where attempt_id = $1
       order by final_answer`,
      [attempt.rows[0]!.id],
    );
    const byQuestion = new Map(answers.rows.map((row) => [row.question_id, row]));
    const linkedAnswer = byQuestion.get(linked.rows[0]!.id);
    assert.equal(linkedAnswer?.final_answer, "a");
    assert.equal(linkedAnswer?.prediction, "because the cooperative");
    assert.equal(linkedAnswer?.correct, true);
    const copyAnswer = byQuestion.get(copy.rows[0]!.id);
    assert.equal(copyAnswer?.final_answer, "b");
    assert.equal(copyAnswer?.prediction, "a");

    const bank = await client.query<{ correct_answer: string; linked_question_id: string }>(
      `select correct_answer, linked_question_id
       from bank_questions
       where source_key = 'ielts-style-original-reading-m1-q1'`,
    );
    assert.equal(bank.rows[0]?.linked_question_id, linked.rows[0]!.id);
    assert.equal(bank.rows[0]?.correct_answer, "a");

    const stored = await client.query<{ result: { correctCount: number; items: Array<Record<string, unknown>> } }>(
      `select result from attempts where id = $1`,
      [attempt.rows[0]!.id],
    );
    const items = stored.rows[0]?.result.items ?? [];
    const reviewed = items.find((item) => item.questionId === linked.rows[0]!.id);
    const untouched = items.find((item) => item.questionId === decoy.rows[0]!.id);
    assert.equal(reviewed?.finalAnswer, "a");
    assert.equal(reviewed?.correctAnswer, "a");
    assert.equal(reviewed?.prediction, "a");
    assert.equal(reviewed?.correct, true);
    assert.equal(stored.rows[0]?.result.correctCount, 1);
    const reviewedChoices = reviewed?.choices as Array<{ id: string; text: string }>;
    assert.equal(reviewedChoices.find((choice) => choice.id === "a")?.text, correctText);
    assert.equal(untouched?.finalAnswer, "c");
    assert.equal((untouched?.choices as Array<{ text: string }>)[0]?.text, "leave this choice");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
