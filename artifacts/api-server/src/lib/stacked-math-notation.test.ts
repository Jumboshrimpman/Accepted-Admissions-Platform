import assert from "node:assert/strict";
import test from "node:test";
import {
  isMichelleClientEmail,
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
});
