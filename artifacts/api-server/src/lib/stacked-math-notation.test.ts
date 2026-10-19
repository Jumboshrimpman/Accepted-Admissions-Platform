import assert from "node:assert/strict";
import test from "node:test";
import {
  isMichelleClientEmail,
  quizMathRepairScope,
  repairMichelleQuizMathText,
  repairMichelleQuizQuestionFields,
  repairStackedMathNotation,
  shouldRepairMichelleQuizMath,
} from "./stacked-math-notation.ts";

test("Michelle identity matches both live emails and session titles, never Taito", () => {
  assert.equal(isMichelleClientEmail("makaremmichelle7@gmail.com"), true);
  assert.equal(isMichelleClientEmail("michaelmakarem@gmail.com"), true);
  assert.equal(isMichelleClientEmail("taito0525@gmail.com"), false);
  assert.equal(
    shouldRepairMichelleQuizMath({
      sessionTitle: "Michelle’s SAT Session with Xavier",
      assignmentTitle: "In-session homework completion",
    }),
    true,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({
      assignmentTitle: "SAT pre-work (30–50 questions) — Michelle’s SAT Session with Xavier",
    }),
    true,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({
      clientEmail: "taito0525@gmail.com",
      sessionTitle: "Taito’s SAT Session with Eunice",
      assignmentTitle: "In-session homework completion",
    }),
    false,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({
      assignmentTitle: "SAT pre-work (30–50 questions) — SAT capability test",
    }),
    true,
  );
});

test("rebuilds the live |x+45|=48 explanation stacks and the flattened tutor UI smash", () => {
  const stacked = [
    "Choice A is correct. The given absolute value equation can be rewritten as two",
    "linear equations: x",
    "45",
    "48",
    "+",
    "=",
    " and",
    "x",
    "45",
    "48",
    "-",
    "+",
    "=",
    "^",
    "h",
    ", or x",
    "45",
    "48",
    "+",
    "=-",
    ". Subtracting",
    "45 from both sides of the equation x",
    "45",
    "48",
    "+",
    "=",
    " yields x",
    "3",
    "= . Subtracting 45 from",
    "both sides of the equation x",
    "45",
    "48",
    "+",
    "=-",
    " yields x",
    "93",
    "=-",
    ". Thus, the given equation",
    "has two possible solutions, 3 and",
    "93",
    "-",
    ". Therefore, the positive solution is 3.",
  ].join("\n");
  const repaired = repairStackedMathNotation(stacked);
  assert.match(repaired, /x \+ 45 = 48/);
  assert.match(repaired, /x \+ 45 = -48/);
  assert.match(repaired, /x = 3/);
  assert.match(repaired, /x = -93/);
  assert.doesNotMatch(repaired, /x\n45\n48/);
  assert.equal(
    repairStackedMathNotation("x 45 48 + = or x 45 48 + = - yields x 3 ="),
    "x + 45 = 48 or x + 45 = -48 yields x = 3",
  );
});

test("repairs the shared SAT pre-work perimeter explanation instead of a broken fraction", () => {
  const raw = [
    "the expression",
    "x",
    "4",
    "6",
    "+ + . Since it’s",
    "given that the perimeter of the triangle is 18 centimeters, it follows that",
    "x",
    "4",
    "6",
    "18",
    "+ + =",
    ", or",
    "x",
    "10",
    "18",
    "+ =",
    ". Subtracting 10 from both sides of this equation",
    "yields x",
    "8",
    "= . Therefore",
    "would be 4",
    "6",
    "2",
    "+ + , or",
    "12, not 18.",
  ].join("\n");
  const repaired = repairStackedMathNotation(raw);
  assert.match(repaired, /x \+ 4 \+ 6/);
  assert.match(repaired, /x \+ 4 \+ 6 = 18/);
  assert.match(repaired, /x \+ 10 = 18/);
  assert.match(repaired, /x = 8/);
  assert.match(repaired, /4 \+ 6 \+ 2/);
  assert.doesNotMatch(repaired, /\(6\/4\)x/);
  assert.doesNotMatch(repaired, /\(18\/10\)x/);
  assert.doesNotMatch(repaired, /\+\s*\+/);
});

test("repairs the other broken shared SAT pre-work equations", () => {
  assert.match(
    repairStackedMathNotation("(\n)\n100 300\n75\nx\n=\n, or 3\n75\nx =\n. Dividing both sides of this equation by 3\nyields\n25\nx ="),
    /\(x\/100\)\*300 = 75/,
  );
  assert.match(
    repairStackedMathNotation("or 3\n75\nx =\n. Dividing both sides of this equation by 3\nyields\n25\nx ="),
    /3x = 75[\s\S]*x = 25/,
  );
  assert.equal(
    repairStackedMathNotation("x\ny\n1 440\n+ ="),
    "x + y = 1,440",
  );
  assert.equal(
    repairStackedMathNotation("x\n4 500\n70\n1 700\n-\n="),
    "4,500 - 70x = 1,700",
  );
  assert.match(repairStackedMathNotation("length\n35\nwidth\n10\n=\n, or l\n35\n10\nw ="), /length\/width = 35\/10/);
  assert.match(repairStackedMathNotation("length\n35\nwidth\n10\n=\n, or l\n35\n10\nw ="), /l\/w = 35\/10/);
  assert.equal(repairStackedMathNotation("x/19 = 684"), "19x = 684");
  assert.doesNotMatch(repairStackedMathNotation("Dividing both sides of this equation by 3\nyields\n25\nx ="), /3\/25/);
});

test("rebuilds other Michelle live stacks without rewriting clean SAT math", () => {
  assert.equal(repairStackedMathNotation("1 yard\n36 inches\n="), "1 yard = 36 inches");
  assert.equal(repairStackedMathNotation("612 yards\n36"), "612/36 yards");
  assert.equal(repairStackedMathNotation("x\n4\n6\n+ +"), "x + 4 + 6");
  assert.equal(repairStackedMathNotation("72\n20\n-"), "72 - 20");
  assert.equal(repairStackedMathNotation("P\ns\n4\n="), "P = 4s");
  assert.equal(repairStackedMathNotation("P\n4 24\n=\n^\nh"), "P = 4(24)");
  assert.equal(repairStackedMathNotation("d\nc\n150\n+ ="), "d + c = 150");
  assert.equal(repairStackedMathNotation("r\n3\n="), "r = 3");
  assert.equal(repairStackedMathNotation("s\n7 3\n27\n+\n=\n^\nh"), "s + 7(3) = 27");
  assert.equal(repairStackedMathNotation(",r s\n^\nh"), "(r, s)");
  assert.equal(repairStackedMathNotation("k\n100\n29"), "(29/100)k");
  assert.equal(
    repairStackedMathNotation("x^2 + 6x − 8"),
    "x^2 + 6x − 8",
  );
  assert.equal(
    repairStackedMathNotation("However signals contrast."),
    "However signals contrast.",
  );
  assert.equal(repairMichelleQuizMathText("x\n3\n=", false), "x\n3\n=");
  assert.equal(repairMichelleQuizMathText("x\n3\n=", true), "x = 3");
});

test("question-field helper repairs prompt, choices, and explanation together", () => {
  const repaired = repairMichelleQuizQuestionFields(
    {
      prompt: "x 45 48 + =",
      stimulus: null,
      explanation: "yields x 3 =",
      choices: [{ text: "x 93 = -" }],
    },
    true,
  );
  assert.equal(repaired.prompt, "x + 45 = 48");
  assert.equal(repaired.explanation, "yields x = 3");
  assert.equal(repaired.choices?.[0]?.text, "x = -93");
  const raw = repairMichelleQuizQuestionFields(
    { prompt: "x 45 48 + =", explanation: "yields x 3 =" },
    false,
  );
  assert.equal(raw.prompt, "x 45 48 + =");
  const stems = repairMichelleQuizQuestionFields(
    {
      prompt: "x/19 = 684",
      stimulus: "4 100\n5 250",
      explanation: "x/19 = 684",
      choices: [{ text: "28%\n50" }, { text: "x/88 = 240" }],
    },
    true,
  );
  assert.equal(stems.prompt, "x/19 = 684");
  assert.equal(stems.stimulus, "4 100\n5 250");
  assert.equal(stems.choices?.[0]?.text, "28%\n50");
  assert.equal(stems.choices?.[1]?.text, "x/88 = 240");
  assert.equal(stems.explanation, "19x = 684");
});

test("shared SAT pre-work repairs the Q2 explanation and leaves real stems alone", () => {
  assert.equal(
    quizMathRepairScope({
      clientEmail: "taito0525@gmail.com",
      sessionTitle: "Taito’s SAT Session with Eunice",
      assignmentTitle: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
    }),
    "explanation",
  );
  assert.equal(
    quizMathRepairScope({
      sessionTitle: "Michelle’s SAT Session with Xavier",
      assignmentTitle: "In-session homework completion",
    }),
    "all",
  );
  const q2 = [
    "x",
    "4",
    "6",
    "18",
    "+ + =",
    ", or",
    "x",
    "10",
    "18",
    "+ =",
  ].join("\n");
  const repaired = repairMichelleQuizQuestionFields(
    {
      prompt: "x/19 = 684",
      stimulus: "4 100\n5 250",
      explanation: q2,
      choices: [{ text: "x/19 = 684" }, { text: "28%\n50" }, { text: "x/88 = 240" }],
    },
    "explanation",
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
  assert.equal(repairStackedMathNotation("x/88 = 240", "stem"), "x/88 = 240");
  assert.equal(repairStackedMathNotation("x/21 = 120", "stem"), "x/21 = 120");
  assert.equal(repairStackedMathNotation("300\n8", "stem"), "300\n8");
  assert.equal(repairStackedMathNotation("28%\n50", "stem"), "28%\n50");
  assert.equal(repairStackedMathNotation("4 100\n5 250", "stem"), "4 100\n5 250");
  assert.equal(repairStackedMathNotation("16\nr =", "stem"), "16\nr =");
  assert.notEqual(repairStackedMathNotation("y\n94\n120 =", "stem"), "y/120 = 94");
  assert.equal(repairStackedMathNotation("y\n94\n120 ="), "y/120 = 94");
  assert.equal(repairStackedMathNotation("x/88 = 240"), "x/240 = 88");
  assert.equal(repairStackedMathNotation("x/21 = 120"), "x = 21,120");
  assert.equal(repairStackedMathNotation("300\n8"), "8/300");
  assert.equal(repairStackedMathNotation("%\n75"), "75%");
});
