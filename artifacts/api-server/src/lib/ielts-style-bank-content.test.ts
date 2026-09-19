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
