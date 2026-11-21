import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assignmentQuestionShape } from "./assignment-visibility.ts";
import { answersMatch } from "./sat-bank-retry.ts";
import {
  T6_MATH_MODULE_PLANS,
  T6_MATH_TIME_LIMIT_MINUTES,
  t6DueAt,
  isT6MathModuleTitle,
  pickT6Session,
  questionMatchesT6Draft,
  sessionMatchesT6Date,
  t6LinkedQuestionsMatchPlan,
} from "./t6-math-content.ts";
import {
  isStudentAnswerableQuizQuestion,
  shouldHideMismatchedQuizFigures,
} from "../../../accepted-admissions/src/lib/quiz-figure-primary.ts";

const mediaRoot = fileURLToPath(
  new URL("../../../accepted-admissions/public", import.meta.url),
);

test("both T6 math modules are 27-question 50-minute sections for Michelle's sessions", () => {
  assert.equal(T6_MATH_MODULE_PLANS.length, 2);
  const [first, second] = T6_MATH_MODULE_PLANS;
  assert.equal(first?.title, "Math Full-Length Practice: Module 1 (Session Nov 22, 2026)");
  assert.equal(second?.title, "Math Full-Length Practice: Module 2 (Session Nov 29, 2026)");
  assert.equal(first?.dateKey, "2026-11-22");
  assert.equal(second?.dateKey, "2026-11-29");
  assert.equal(first?.footnote, "T6 · 6VSL02");
  assert.equal(second?.footnote, "T6 · 6VSL02");
  assert.match(first?.instructions ?? "", /Nov 22, 2026/);
  assert.match(second?.instructions ?? "", /Nov 29, 2026/);
  assert.match(first?.instructions ?? "", /score appear only after you submit/i);
  for (const plan of T6_MATH_MODULE_PLANS) {
    assert.equal(plan.timeLimitMinutes, T6_MATH_TIME_LIMIT_MINUTES);
    assert.equal(plan.questions.length, 27);
    assert.equal(plan.questions.filter((question) => question.questionType === "spr").length, 7);
  }
  assert.equal(t6DueAt("2026-11-22", null).toISOString(), "2026-11-23T04:59:00.000Z");
  const linked = new Date("2026-11-22T19:00:00.000Z");
  assert.equal(t6DueAt("2026-11-22", { dateTime: linked }).toISOString(), linked.toISOString());
});

test("every transcribed question stays answerable and graded, including the Q20 forms", () => {
  const module2 = T6_MATH_MODULE_PLANS[1]!;
  const q20 = module2.questions[19]!;
  assert.equal(q20.questionType, "spr");
  assert.equal(q20.correctAnswer, "7/24;.2916;.2917;0.291;0.292");
  for (const form of ["7/24", ".2916", ".2917", "0.291", "0.292", "0.2916"]) {
    assert.equal(answersMatch(form, q20.correctAnswer), true, form);
  }
  assert.equal(answersMatch("0.219", q20.correctAnswer), false);
  assert.equal(answersMatch("1,677", "1677"), true);

  for (const plan of T6_MATH_MODULE_PLANS) {
    for (const draft of plan.questions) {
      const shaped = assignmentQuestionShape(
        {
          id: draft.key,
          subject: "SAT Math",
          questionType: draft.questionType,
          prompt: draft.prompt,
          stimulus: draft.stimulus,
          choices: draft.choices,
          correctAnswer: draft.correctAnswer,
          explanation: draft.explanation,
          skill: "SAT Math",
          domain: "SAT Math",
          difficulty: "medium",
          tags: ["curated-full-length", draft.key],
        },
        { position: 0 },
      );
      assert.equal(shaped.curated, true, draft.key);
      assert.equal(isStudentAnswerableQuizQuestion(shaped), true, draft.key);
      if (draft.stimulus?.includes("](")) {
        assert.equal(shouldHideMismatchedQuizFigures(shaped), false, draft.key);
      }
      if (draft.questionType === "spr") {
        for (const form of draft.correctAnswer.split(";")) {
          assert.equal(answersMatch(form, draft.correctAnswer), true, `${draft.key} ${form}`);
        }
      } else {
        assert.match(draft.correctAnswer, /^[a-d]$/);
        assert.equal(draft.choices.length, 4);
      }
      for (const choice of draft.choices) {
        if (!choice.image) continue;
        assert.equal(existsSync(mediaRoot + choice.image), true, choice.image);
      }
      for (const match of (draft.stimulus ?? "").matchAll(/\((\/media\/[^)]+)\)/g)) {
        assert.equal(existsSync(mediaRoot + match[1]), true, match[1]);
      }
    }
  }

  const q2 = T6_MATH_MODULE_PLANS[0]!.questions[1]!;
  const q11 = T6_MATH_MODULE_PLANS[0]!.questions[10]!;
  assert.equal(q2.choices.every((choice) => choice.image?.includes("m1-q2-choice") && choice.text === ""), true);
  assert.equal(q11.choices.every((choice) => choice.image?.includes("m1-q11-choice") && choice.text === ""), true);
  const hint = /points rise slowly|most data points below|straight increasing line|peaks near|Curve starting at|vertex \(|line of best fit from about|crossing the y-axis at/;
  for (const plan of T6_MATH_MODULE_PLANS) {
    for (const draft of plan.questions) {
      assert.doesNotMatch(`${draft.prompt}\n${draft.stimulus ?? ""}\n${draft.choices.map((choice) => choice.text).join("\n")}`, hint, draft.key);
      for (const match of (draft.stimulus ?? "").matchAll(/!\[([^\]]*)\]/g)) {
        assert.equal(match[1], "Figure", draft.key);
      }
    }
  }
  assert.equal(
    existsSync(`${mediaRoot}/media/sat-bank/t6-math-full-length/reference-sheet.png`),
    true,
  );
});

test("a math session on the date is preferred, and the seed stays off the scrambled pack", () => {
  const date = new Date("2026-11-22T18:00:00.000Z");
  const english = { dateTime: date, subject: "SAT Reading & Writing", title: "Reading" };
  const math = { dateTime: new Date("2026-11-22T20:00:00.000Z"), subject: "SAT Math", title: "Math" };
  assert.equal(pickT6Session([english, math]), math);
  const sophiaMorning = {
    dateTime: new Date("2026-11-22T14:00:00.000Z"),
    subject: "SAT",
    title: "Michelle’s SAT Session with Sophia",
    tutorEmail: "sophia.e.lamas@gmail.com",
    tutorName: "Sophia Lamas",
  };
  const xavierNoon = {
    dateTime: new Date("2026-11-22T17:00:00.000Z"),
    subject: "SAT",
    title: "Michelle’s SAT Session with Xavier",
    tutorEmail: "xavier.rmz6@gmail.com",
    tutorName: "Xavier Morales",
  };
  assert.equal(pickT6Session([sophiaMorning, xavierNoon]), xavierNoon);
  assert.equal(pickT6Session([xavierNoon, sophiaMorning]), xavierNoon);
  assert.equal(pickT6Session([sophiaMorning]), null);
  const sophiaLabeledMath = { ...sophiaMorning, subject: "SAT Math", title: "Math with Sophia" };
  assert.equal(pickT6Session([sophiaLabeledMath, xavierNoon]), xavierNoon);
  assert.equal(pickT6Session([sophiaLabeledMath]), null);
  assert.equal(sessionMatchesT6Date({ dateTime: date, timezone: "America/New_York" }, "2026-11-22"), true);
  const source = readFileSync(new URL("./t6-math-content.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["'][^"']*sat-practice-test-6/);
  const startup = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(startup, /ensureMichelleT6MathModules\(\)/);
  const sql = readFileSync(
    new URL("../../../../lib/db/drizzle/0092_quiz_reference_review_eliminate.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "reference_sheet" text/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "mark_for_review" boolean DEFAULT false NOT NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "eliminate_choices" boolean DEFAULT false NOT NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "eliminated_choice_ids" jsonb/);
  assert.equal(/DROP\s+TABLE/i.test(sql), false);
  const journal = readFileSync(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url), "utf8");
  assert.match(journal, /"tag": "0092_quiz_reference_review_eliminate"/);
});


test("module 1 question 10 is the silo replacement, and a content-matching live set is left unchanged", () => {
  const plan = T6_MATH_MODULE_PLANS[0]!;
  const silo = plan.questions[9]!;
  assert.equal(silo.key, "t6-math-m1-q10");
  assert.match(silo.prompt, /silo holds 6,300 pounds of grain/);
  assert.equal(silo.correctAnswer, "c");
  assert.equal(silo.questionType, "multiple_choice");
  assert.deepEqual(
    silo.choices.map((choice) => choice.text),
    ["18", "24", "30", "36"],
  );
  assert.doesNotMatch(silo.prompt, /shaved ice|paper cups/);
  const marine = plan.questions[8]!;
  assert.match(marine.prompt, /marine mammals/);

  const links = plan.questions.map((draft, index) => ({
    id: index === 9 ? "44637b51-dae2-43af-8e15-bdf78a01d0ba" : `official-${draft.key}`,
    prompt: draft.prompt,
    stimulus: draft.stimulus,
    // Production stored the silo choices as id/text/label; official items use id/label/text.
    choices:
      index === 9
        ? draft.choices.map((choice) => ({ id: choice.id, text: choice.text, label: choice.label }))
        : draft.choices.map((choice) => ({ ...choice })),
    correctAnswer: draft.correctAnswer,
    explanation: draft.explanation,
    questionType: draft.questionType,
  }));
  assert.equal(t6LinkedQuestionsMatchPlan(links, plan), true);
  assert.equal(questionMatchesT6Draft(links[9]!, silo), true);
  assert.equal(
    t6LinkedQuestionsMatchPlan(
      links.map((link, index) => (index === 9 ? { ...link, prompt: "changed" } : link)),
      plan,
    ),
    false,
  );
});

test("hard SAT pre-work classification can recognize official T6 module titles", () => {
  assert.equal(isT6MathModuleTitle(T6_MATH_MODULE_PLANS[0]!.title), true);
  assert.equal(isT6MathModuleTitle(T6_MATH_MODULE_PLANS[1]!.title), true);
  assert.equal(isT6MathModuleTitle("Nov 22 Pre-work SAT Math (Hard) — Michelle x Xavier"), false);
  assert.equal(isT6MathModuleTitle("SAT pre-work (30–50 questions)"), false);
  assert.equal(isT6MathModuleTitle(null), false);
});
