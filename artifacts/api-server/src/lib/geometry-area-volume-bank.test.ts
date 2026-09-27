import assert from "node:assert/strict";
import test from "node:test";
import { parseCollegeBoardPayload, type ParsedBankRecord } from "./sat-bank-import.ts";
import { isStudentUsableServedQuestion } from "./sat-bank-diagnostic-quality.ts";
import {
  loadHardGeometryAreaVolumeQuestions,
  selectHardGeometryAreaVolumeItems,
} from "./geometry-area-volume-bank.ts";

const ENGLISH_LINE = JSON.stringify({
  id: "sat-pt4-rw-m1-q1",
  examFamily: "sat",
  examVariant: "sat",
  practiceTestNumber: 4,
  section: "rw",
  module: 1,
  questionNumber: 1,
  questionType: "mcq",
  prompt:
    "Which choice completes the text with the most logical and precise word or phrase about the area of the argument?",
  choices: [
    { label: "A", text: "selecting a narrower claim" },
    { label: "B", text: "inspecting every source" },
    { label: "C", text: "creating a longer passage" },
    { label: "D", text: "deciding the volume of evidence" },
  ],
  correctAnswer: "A",
  officialExplanation: "Choice A is correct because the text discusses a claim.",
});

const EASY_RECTANGLE = JSON.stringify({
  id: "sat-fixture-easy-rectangle",
  examFamily: "sat",
  examVariant: "sat",
  practiceTestNumber: 4,
  section: "math",
  module: 2,
  questionNumber: 3,
  questionType: "mcq",
  prompt:
    "A rectangle has a length of 56 inches and a width of 28 inches. What is the area, in square inches, of the rectangle?",
  choices: [
    { label: "A", text: "28" },
    { label: "B", text: "84" },
    { label: "C", text: "168" },
    { label: "D", text: "1,568" },
  ],
  correctAnswer: "D",
  officialExplanation: "Multiply length by width.",
});

const ALGEBRA = JSON.stringify({
  id: "sat-fixture-algebra",
  examFamily: "sat",
  examVariant: "sat",
  practiceTestNumber: 4,
  section: "math",
  module: 2,
  questionNumber: 9,
  questionType: "mcq",
  prompt: "If 3x − 7 = 14, what is the value of x?",
  choices: [
    { label: "A", text: "5" },
    { label: "B", text: "7" },
    { label: "C", text: "21" },
    { label: "D", text: "3" },
  ],
  correctAnswer: "B",
  officialExplanation: "Add 7, then divide by 3.",
});

const DENSITY = JSON.stringify({
  id: "sat-fixture-density",
  examFamily: "sat",
  examVariant: "sat",
  practiceTestNumber: 7,
  section: "math",
  module: 2,
  questionNumber: 4,
  questionType: "mcq",
  prompt:
    "The number of raccoons in a 131-square-mile area is estimated to be 2,358. What is the estimated population density, in raccoons per square mile, of this area?",
  choices: [
    { label: "A", text: "18" },
    { label: "B", text: "131" },
    { label: "C", text: "149" },
    { label: "D", text: "2,376" },
  ],
  correctAnswer: "A",
  officialExplanation: "Divide the population by the area.",
});

function recordsFrom(text: string): ParsedBankRecord[] {
  return parseCollegeBoardPayload(text, "fixture").records;
}

test("official SAT area and volume set is math only and excludes easy fillers", async () => {
  const selected = await loadHardGeometryAreaVolumeQuestions();
  assert.equal(selected.length, 12);
  assert.deepEqual(
    selected.map((item) => item.sourceKey),
    [
      "sat-pt6-math-m2-q16",
      "sat-pt5-math-m2-q22",
      "sat-pt8-math-m2-q22",
      "sat-pt9-math-m2-q23",
      "sat-pt4-math-m2-q26",
      "sat-pt10-math-m1-q15",
      "sat-pt8-math-m1-q16",
      "sat-pt4-math-m1-q18",
      "sat-pt8-math-m1-q18",
      "sat-pt10-math-m1-q22",
      "sat-pt5-math-m1-q23",
      "sat-pt11-math-m1-q26",
    ],
  );
  for (const item of selected) {
    assert.match(item.sourceKey, /^sat-pt\d+-math-m[12]-q\d+$/);
    assert.equal(/^[a-d]$/.test(item.correctAnswer), true);
    assert.equal(item.choices.length, 4);
    assert.match(item.prompt, /\b(area|volume)\b/i);
    assert.doesNotMatch(item.prompt, /which choice completes the text/i);
    assert.equal(
      isStudentUsableServedQuestion({
        id: item.sourceKey,
        subject: "SAT Math",
        domain: "Geometry and Trigonometry",
        prompt: item.prompt,
        stimulus: item.stimulus,
        choices: item.choices,
        questionType: "multiple_choice",
        correctAnswer: item.correctAnswer,
      }),
      true,
      item.sourceKey,
    );
  }
  assert.match(selected.map((item) => item.prompt).join("\n"), /cylinder/i);
  assert.match(selected.map((item) => item.prompt).join("\n"), /similar/i);
  assert.match(selected.map((item) => item.prompt).join("\n"), /prism/i);
  assert.match(selected.map((item) => item.prompt).join("\n"), /sphere/i);
  assert.equal(
    selected.some((item) => /start referenced content/i.test(item.prompt)),
    false,
  );
  const cube = selected.find((item) => item.sourceKey === "sat-pt8-math-m2-q22");
  assert.match(cube?.prompt ?? "", /not taken up by the sphere/i);
  assert.equal(cube?.correctAnswer, "a");
});

test("content filter drops English, algebra, density, and one-step rectangle area", () => {
  const parsed = recordsFrom(
    [ENGLISH_LINE, EASY_RECTANGLE, ALGEBRA, DENSITY].join("\n"),
  );
  assert.deepEqual(selectHardGeometryAreaVolumeItems(parsed), []);
});

test("content filter keeps a hard similar-rectangle area item and drops PSAT", () => {
  const similar = JSON.stringify({
    id: "sat-pt5-math-m2-q22",
    examFamily: "sat",
    examVariant: "sat",
    practiceTestNumber: 5,
    section: "math",
    module: 2,
    questionNumber: 22,
    questionType: "mcq",
    prompt:
      "Rectangles ABCD and EFGH are similar. The length of each side of EFGH is 6 times the length of the corresponding side of ABCD. The area of ABCD is 54 square units. What is the area, in square units, of EFGH?",
    choices: [
      { label: "A", text: "9" },
      { label: "B", text: "36" },
      { label: "C", text: "324" },
      { label: "D", text: "1,944" },
    ],
    correctAnswer: "D",
    officialExplanation: "Area scales by the square of the side ratio.",
  });
  const psat = JSON.stringify({
    id: "psat8_9-pt3-math-m1-q17",
    examFamily: "psat",
    examVariant: "psat8_9",
    practiceTestNumber: 3,
    section: "math",
    module: 1,
    questionNumber: 17,
    questionType: "mcq",
    prompt:
      "A right square pyramid has a base with side lengths of 13 centimeters. The height of the pyramid is 15 centimeters. What is the volume, in cubic centimeters, of this pyramid?",
    choices: [
      { label: "A", text: "65" },
      { label: "B", text: "130" },
      { label: "C", text: "845" },
      { label: "D", text: "2,535" },
    ],
    correctAnswer: "C",
    officialExplanation: "Use one third base area times height.",
  });
  const selected = selectHardGeometryAreaVolumeItems(
    recordsFrom([similar, psat, EASY_RECTANGLE].join("\n")),
  );
  assert.deepEqual(
    selected.map((item) => item.sourceKey),
    ["sat-pt5-math-m2-q22"],
  );
  assert.equal(selected[0]?.correctAnswer, "d");
});
