import assert from "node:assert/strict";
import test from "node:test";
import {
  quizMathRepairScope,
  repairMichelleQuizQuestionFields,
  repairStackedMathNotation,
  shouldRepairMichelleQuizMath,
} from "./stacked-math-notation.ts";

test("repairs Michelle flattened tutor-UI smash and ignores Taito titles", () => {
  assert.equal(
    shouldRepairMichelleQuizMath({ sessionTitle: "Michelle’s SAT Session with Xavier" }),
    true,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({ sessionTitle: "Taito’s SAT Session with Eunice" }),
    false,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({
      assignmentTitle: "SAT pre-work (30–50 questions) — SAT capability test",
    }),
    true,
  );
  const perimeter = ["x", "4", "6", "18", "+ + =", "or", "x", "10", "18", "+ ="].join("\n");
  const repaired = repairStackedMathNotation(perimeter);
  assert.match(repaired, /x \+ 4 \+ 6 = 18/);
  assert.match(repaired, /x \+ 10 = 18/);
  assert.doesNotMatch(repaired, /\(6\/4\)x/);
  assert.equal(
    repairStackedMathNotation("x 45 48 + = or x 45 48 + = - yields x 3 ="),
    "x + 45 = 48 or x + 45 = -48 yields x = 3",
  );
  const fields = repairMichelleQuizQuestionFields(
    { prompt: "x 45 48 + =", explanation: "yields x 3 =" },
    true,
  );
  assert.equal(fields.prompt, "x + 45 = 48");
  assert.equal(fields.explanation, "yields x = 3");
});

test("shared SAT pre-work repairs the Q2 explanation and leaves real stems alone", () => {
  assert.equal(
    quizMathRepairScope({
      assignmentTitle: "SAT pre-work (30–50 questions) — SAT capability test",
    }),
    "explanation",
  );
  const q2 = ["x", "4", "6", "18", "+ + =", "or", "x", "10", "18", "+ ="].join("\n");
  const repaired = repairMichelleQuizQuestionFields(
    {
      prompt: "x/19 = 684",
      stimulus: "4 100\n5 250",
      explanation: q2,
      choices: [{ text: "x/19 = 684" }, { text: "28%\n50" }, { text: "x/88 = 240" }],
    },
    quizMathRepairScope({
      assignmentTitle: "SAT pre-work (30–50 questions) — SAT capability test",
    }),
  );
  assert.equal(repaired.prompt, "x/19 = 684");
  assert.equal(repaired.stimulus, "4 100\n5 250");
  assert.equal(repaired.choices?.[0]?.text, "x/19 = 684");
  assert.equal(repaired.choices?.[1]?.text, "28%\n50");
  assert.equal(repaired.choices?.[2]?.text, "x/88 = 240");
  assert.match(repaired.explanation ?? "", /x \+ 4 \+ 6 = 18/);
  assert.match(repaired.explanation ?? "", /x \+ 10 = 18/);
  assert.doesNotMatch(repaired.explanation ?? "", /\(6\/4\)x/);
  assert.equal(repairStackedMathNotation("x/19 = 684", "stem"), "x/19 = 684");
  assert.equal(repairStackedMathNotation("4 100\n5 250", "stem"), "4 100\n5 250");
  assert.equal(repairStackedMathNotation("28%\n50", "stem"), "28%\n50");
  const michelle = repairMichelleQuizQuestionFields(
    {
      prompt: "x/19 = 684",
      stimulus: "4 100\n5 250",
      explanation: "x/19 = 684",
      choices: [{ text: "x/88 = 240" }, { text: "28%\n50" }],
    },
    quizMathRepairScope({
      clientEmail: "makaremmichelle7@gmail.com",
      assignmentTitle: "SAT pre-work (30–50 questions) — Michelle’s SAT Session with Xavier",
    }),
    "sat-pt10-math-m1-q25",
  );
  assert.equal(
    quizMathRepairScope({
      clientEmail: "makaremmichelle7@gmail.com",
      assignmentTitle: "SAT pre-work (30–50 questions) — Michelle’s SAT Session with Xavier",
    }),
    "all",
  );
  assert.equal(michelle.prompt, "x/19 = 684");
  assert.equal(michelle.stimulus, "4 100\n5 250");
  assert.equal(michelle.choices?.[0]?.text, "x/88 = 240");
  assert.equal(michelle.choices?.[1]?.text, "28%\n50");
  assert.equal(michelle.explanation, "19x = 684");
  assert.equal(
    repairStackedMathNotation("x/19 = 684", "explanation", "sat-pt11-math-m1-q22"),
    "x/19 = 684",
  );
});
