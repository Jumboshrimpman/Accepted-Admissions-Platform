import assert from "node:assert/strict";
import test from "node:test";
import {
  IELTS_STYLE_COPYRIGHT_NOTICE,
  IELTS_STYLE_PASSAGES,
  IELTS_STYLE_WRITING_TASKS,
  ieltsStyleReadingItems,
} from "./ielts-style-bank-content.ts";
import {
  isStudentUsableQuizItem,
  isStudentUsableServedQuestion,
} from "./sat-bank-diagnostic-quality.ts";
import {
  IELTS_STYLE_DIAGNOSTIC_COUNT,
  IELTS_STYLE_ROUTINE_COUNT,
  canAssignCleanEnglishQuizSet,
  isStudentUsableEnglishQuizItem,
  selectIeltsStylePreworkItems,
} from "./ielts-style-bank-select.ts";

const FORBIDDEN = /cambridge|british council|\bidp\b|official ielts test/i;

test("seeded IELTS-style reading items are original, complete MCQs", () => {
  const items = ieltsStyleReadingItems();
  assert.equal(items.length, 48);
  assert.equal(IELTS_STYLE_PASSAGES.length, 8);
  assert.equal(IELTS_STYLE_WRITING_TASKS.length, 2);
  assert.match(IELTS_STYLE_COPYRIGHT_NOTICE, /Not official IELTS/);
  assert.match(IELTS_STYLE_COPYRIGHT_NOTICE, /Cambridge/);

  const diagnostic = items.filter((item) => item.set === "diagnostic");
  const routine1 = items.filter((item) => item.set === "routine-1");
  const routine2 = items.filter((item) => item.set === "routine-2");
  assert.equal(diagnostic.length, IELTS_STYLE_DIAGNOSTIC_COUNT);
  assert.equal(routine1.length, IELTS_STYLE_ROUTINE_COUNT);
  assert.equal(routine2.length, IELTS_STYLE_ROUTINE_COUNT);

  for (const item of items) {
    assert.doesNotMatch(item.stimulus, FORBIDDEN);
    assert.doesNotMatch(item.prompt, FORBIDDEN);
    assert.ok(item.stimulus.length > 400, item.passageId);
    assert.ok(item.prompt.length > 20, item.prompt);
    assert.equal(item.choices.length, 4);
    assert.deepEqual(
      item.choices.map((choice) => choice.id),
      ["a", "b", "c", "d"],
    );
    for (const choice of item.choices) {
      assert.ok(choice.text.trim().length > 8, choice.text);
    }
    assert.ok(item.choices.some((choice) => choice.id === item.correctAnswer));
    assert.ok(item.explanation.trim().length > 12);
    assert.equal(
      isStudentUsableEnglishQuizItem({
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "mcq",
        correctAnswer: item.correctAnswer,
      }),
      true,
      item.prompt,
    );
    assert.equal(
      isStudentUsableQuizItem({
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "mcq",
        correctAnswer: item.correctAnswer,
        section: "reading",
        subject: "IELTS Reading",
        domain: item.domain,
      }),
      true,
      `SAT live-audit must not drop original IELTS item: ${item.prompt}`,
    );
  }
  assert.equal(
    canAssignCleanEnglishQuizSet(
      diagnostic.map((item) => ({
        id: item.passageId,
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "mcq",
        correctAnswer: item.correctAnswer,
        section: "reading",
        subject: "IELTS Reading",
        domain: item.domain,
        figures: [],
        extractGaps: {},
      })),
    ),
    true,
  );
});

const DIAGNOSTIC_CORRECT_TEXT: Record<string, string> = {
  "What is the main purpose of the passage?":
    "To describe a shared refrigeration model and its practical effects",
  "How is a stall’s weekly cooperative fee determined?":
    "By the cubic metres of space reserved",
  "What change reduced extension cords on the pedestrian lane?":
    "Vendors now collect labelled crates from one loading door",
  "Why did the board add a short-stay shelf with a higher hourly rate?":
    "To address part-time vendors who felt they were subsidising overnight storage",
  "According to the energy officer, why did the harbour underwrite the first year’s maintenance?":
    "Because the cooperative’s demand is steadier than many independent freezers",
  "In the final paragraph, “underwrite” is closest in meaning to":
    "financially guarantee",
  "What problem does the volunteer network mainly try to solve?":
    "Forecast models that miss frost differences inside the valley",
  "When are the volunteer readings taken?": "At 7 a.m. local time",
  "What caused a gauge to under-report for about two weeks?":
    "A snow-laden branch bent the gauge",
  "Why is the western hollow described as the valley’s most sensitive site?":
    "It is consistently the first location to frost",
  "How has the regional agriculture office supported the volunteers?":
    "By replacing cracked gauges and printing waterproof cards",
  "What does Mara Chen believe should come next?":
    "Adding a second observer at the hollow rather than costlier equipment",
  "What is the passage mainly about?":
    "How a city tool-lending service is used and governed",
  "Which items have been borrowed most often?":
    "A tile cutter, a wallpaper steamer, and a soil-testing kit",
  "What happens to a tool that is returned with a cut power cord?":
    "It is tagged and kept out of circulation until a technician signs it off",
  "Why does the tile cutter’s card mention ceramic tile and not pruning trees?":
    "The insurance rider covers intended use, not homemade modifications",
  "Where do borrowers mainly live, according to the housing office data?":
    "In two postcodes with many rented terraces",
  "How does Idris respond to the claim that the library is a gift to hobbyists?":
    "He points to short loans and few repeat names in a month",
  "What change does the passage describe?":
    "A limited night check of high-impact parts to prevent morning cancellations",
  "What problem triggered the new night procedure?":
    "Three morning services were cancelled when a door-seal kit was missing",
  "What do the night technicians confirm about the twenty parts?":
    "That they are physically present, labelled, and not left in a cab",
  "Why was heating the cage part of the compromise with the union?":
    "Because extra walking was unpopular and two cleaning tasks were dropped in exchange",
  "The operations manager’s phrase “a cheap honesty layer” refers to":
    "a simple physical check that exposes false computer stock",
  "How does the manager keep the twenty-part list from going stale?":
    "By comparing cancellation codes with the list each quarter and swapping two items",
};

test("diagnostic reading keys are spread across A–D without lettered explanations", () => {
  const diagnostic = ieltsStyleReadingItems().filter((item) => item.set === "diagnostic");
  assert.equal(diagnostic.length, 24);
  const counts = { a: 0, b: 0, c: 0, d: 0 };
  let run = 0;
  let previous = "";
  for (const item of diagnostic) {
    counts[item.correctAnswer] += 1;
    run = item.correctAnswer === previous ? run + 1 : 1;
    previous = item.correctAnswer;
    assert.ok(run < 3, `correct-letter run of ${run} at ${item.prompt}`);
    assert.doesNotMatch(
      item.explanation,
      /\b(?:option|choice|answer|letter)\s+[A-D]\b/i,
      item.explanation,
    );
    const correct = item.choices.find((choice) => choice.id === item.correctAnswer);
    assert.equal(correct?.text, DIAGNOSTIC_CORRECT_TEXT[item.prompt], item.prompt);
    assert.equal(new Set(item.choices.map((choice) => choice.text)).size, 4);
  }
  assert.deepEqual(counts, { a: 6, b: 6, c: 6, d: 6 });
});

test("English assign selects diagnostic module 1 and later routine modules without overlap", () => {
  const pool = ieltsStyleReadingItems().map((item, index) => ({
    id: `${item.passageId}-${index}`,
    module: item.module,
    questionType: "mcq",
    formCode: item.set,
  }));
  const diagnostic = selectIeltsStylePreworkItems(pool, { homeworkKind: "diagnostic" });
  const routine1 = selectIeltsStylePreworkItems(pool, { homeworkKind: "routine", setIndex: 1 });
  const routine2 = selectIeltsStylePreworkItems(pool, { homeworkKind: "routine", setIndex: 2 });
  assert.equal(diagnostic.length, 24);
  assert.equal(routine1.length, 12);
  assert.equal(routine2.length, 12);
  assert.ok(diagnostic.every((row) => row.module === 1));
  assert.ok(routine1.every((row) => row.module === 2));
  assert.ok(routine2.every((row) => row.module === 3));
  const ids = [...diagnostic, ...routine1, ...routine2].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("student GET keeps original IELTS items; SAT OCR smash does not apply", () => {
  const item = ieltsStyleReadingItems()[0]!;
  assert.equal(
    isStudentUsableServedQuestion({
      prompt: item.prompt,
      stimulus: item.stimulus,
      choices: item.choices,
      questionType: "mcq",
      correctAnswer: item.correctAnswer,
      subject: "IELTS Reading",
      section: "reading",
      examFamily: "ielts",
    }),
    true,
    "served IELTS identity must use the English usable gate",
  );

  const tableCite = {
    prompt: "Which statement is supported by the table?",
    stimulus: "The harbour night-market fee schedule is described in prose only.",
    choices: [
      { id: "a", label: "A", text: "Vendors pay a fee scaled to reserved space" },
      { id: "b", label: "B", text: "The harbour banned all overnight storage" },
      { id: "c", label: "C", text: "The rowing club owns the refrigeration loft" },
      { id: "d", label: "D", text: "Membership is free for every stallholder" },
    ],
    questionType: "mcq",
    correctAnswer: "a",
  };
  assert.equal(
    isStudentUsableServedQuestion({
      ...tableCite,
      subject: "IELTS Reading",
      section: "reading",
      examFamily: "ielts",
    }),
    true,
    "SAT table-cite / figure gates must not hide original English items",
  );
  assert.equal(
    isStudentUsableServedQuestion(tableCite),
    false,
    "the same table-cite stem without IELTS identity stays on the SAT live-audit path",
  );
});
