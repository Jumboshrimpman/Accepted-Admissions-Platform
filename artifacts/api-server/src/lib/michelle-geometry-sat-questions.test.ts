import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { repairStackedMathNotation } from "./stacked-math-notation.ts";
import {
  hasSolvableCitedVisual,
  stemCitesVisual,
  studentFacingFigurePrimaryFields,
} from "./sat-bank-figure-primary.ts";
import {
  GEOMETRY_SAT_FIGURE_NOTE,
  GEOMETRY_SAT_FOLLOW_UP_TAG,
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_SAT_QUESTIONS,
  auditGeometrySatQuestions,
  geometryQuestionContentMatches,
  geometryQuestionsNeedingRefresh,
  geometrySatQuestionCount,
  type GeometryQuestionSnapshot,
} from "./michelle-geometry-sat-questions.ts";

const publicRoot = fileURLToPath(
  new URL("../../../accepted-admissions/public", import.meta.url),
);

const CORRECT_TEXT: Record<string, string> = {
  "q01-composite-l-polygon": "210",
  "q02-regular-hexagon-area": "54√3",
  "q03-apothem-decagon": "240",
  "q04-similar-prism-volume": "1024",
  "q05-cylinder-cone-volume": "240π",
  "q06-rectangle-semicircle": "60 + 18π",
  "q07-rectangle-triangle-polygon": "184",
  "q08-similar-spheres": "288π",
  "q09-inscribed-square": "50",
  "q10-prism-surface-from-volume": "236",
  "q11-similar-polygon-area": "300",
  "q12-cylinder-with-hole": "108π",
};

const SPOON_FED_FORMULA =
  /four-thirds|square root of|one-half pi|one-third|the area of a (?:regular|square|semicircle)|the volume of a (?:cylinder|sphere|cone)/i;

test("Geometry SAT Questions is a 12-item original hard set with keys and no solutions", () => {
  assert.equal(GEOMETRY_SAT_FOLLOW_UP_TITLE, "Geometry SAT Questions");
  assert.equal(geometrySatQuestionCount(), 12);
  const keys = new Set(GEOMETRY_SAT_QUESTIONS.map((item) => item.key));
  assert.equal(keys.size, 12);
  for (const item of GEOMETRY_SAT_QUESTIONS) {
    assert.equal(item.choices.length, 4);
    assert.ok(item.choices.some((choice) => choice.id === item.correctAnswer));
    assert.equal(/because|explanation|solution|rationale/i.test(item.prompt), false);
    assert.equal(SPOON_FED_FORMULA.test(item.prompt), false);
    assert.equal(SPOON_FED_FORMULA.test(item.stimulus), false);
    for (const choice of item.choices) {
      assert.equal(/because|explanation|solution/i.test(choice.text), false);
    }
    assert.equal(repairStackedMathNotation(item.prompt), item.prompt);
    assert.equal(repairStackedMathNotation(item.stimulus), item.stimulus);
    for (const choice of item.choices) {
      assert.equal(repairStackedMathNotation(choice.text), choice.text);
    }
    const correct = item.choices.find((choice) => choice.id === item.correctAnswer);
    assert.equal(correct?.text, CORRECT_TEXT[item.key]);
  }
  const skills = GEOMETRY_SAT_QUESTIONS.map((item) => item.skill).join(" ");
  assert.match(skills, /polygon/i);
  assert.match(skills, /volume/i);
  assert.match(skills, /area/i);
});

test("correct letters are balanced and the numeric distractor sets are unchanged", () => {
  const counts = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of GEOMETRY_SAT_QUESTIONS) {
    counts[item.correctAnswer as "a" | "b" | "c" | "d"] += 1;
  }
  assert.deepEqual(counts, { a: 3, b: 3, c: 3, d: 3 });

  const sets = Object.fromEntries(
    GEOMETRY_SAT_QUESTIONS.map((item) => [
      item.key,
      item.choices.map((choice) => choice.text).sort(),
    ]),
  );
  assert.deepEqual(sets["q01-composite-l-polygon"], ["168", "196", "210", "252"]);
  assert.deepEqual(sets["q02-regular-hexagon-area"], ["108√3", "18√3", "27√3", "54√3"]);
  assert.deepEqual(sets["q03-apothem-decagon"], ["160", "240", "480", "80"]);
  assert.deepEqual(sets["q04-similar-prism-volume"], ["1024", "2048", "400", "640"]);
  assert.deepEqual(sets["q05-cylinder-cone-volume"], ["120π", "180π", "240π", "360π"]);
  assert.deepEqual(sets["q06-rectangle-semicircle"], ["60 + 18π", "60 + 36π", "60 + 9π", "72 + 18π"]);
  assert.deepEqual(sets["q07-rectangle-triangle-polygon"], ["144", "164", "184", "224"]);
  assert.deepEqual(sets["q08-similar-spheres"], ["144π", "288π", "72π", "864π"]);
  assert.deepEqual(sets["q09-inscribed-square"], ["100", "25", "25π", "50"]);
  assert.deepEqual(sets["q10-prism-surface-from-volume"], ["118", "196", "236", "280"]);
  assert.deepEqual(sets["q11-similar-polygon-area"], ["120", "192", "300", "750"]);
  assert.deepEqual(sets["q12-cylinder-with-hole"], ["108π", "144π", "36π", "72π"]);
});

test("original geometry figures are cited, solvable, and still show the stem", () => {
  const required = [
    "q01-composite-l-polygon",
    "q02-regular-hexagon-area",
    "q06-rectangle-semicircle",
    "q09-inscribed-square",
    "q12-cylinder-with-hole",
  ];
  for (const key of required) {
    assert.ok(GEOMETRY_SAT_QUESTIONS.some((item) => item.key === key));
  }
  for (const item of GEOMETRY_SAT_QUESTIONS) {
    assert.equal(item.figures.length, 1);
    assert.match(
      item.stimulus,
      /!\[[^\]]+\]\(https:\/\/app\.acceptedadmissions\.org\/media\/geometry\/michelle-sat\/[a-z0-9-]+-question-block\.svg\)/,
    );
    assert.equal(stemCitesVisual(`${item.prompt}\n${item.stimulus}`), true);
    assert.equal(
      hasSolvableCitedVisual({
        prompt: item.prompt,
        stimulus: item.stimulus,
        figures: item.figures,
      }),
      true,
    );
    const facing = studentFacingFigurePrimaryFields({
      prompt: item.prompt,
      stimulus: item.stimulus,
      choices: item.choices,
      figures: item.figures,
      questionType: "multiple_choice",
      correctAnswer: item.correctAnswer,
    });
    assert.match(facing.prompt, /^In the figure,/);
    assert.match(facing.stimulus ?? "", /michelle-sat\/[a-z0-9-]+-question-block\.svg/);
    assert.equal(facing.choices?.length, 4);
    const url = new URL(item.figures[0]?.url ?? "https://app.acceptedadmissions.org/");
    assert.equal(url.pathname.startsWith("/media/geometry/michelle-sat/"), true);
    assert.equal(existsSync(path.join(publicRoot, url.pathname.replace(/^\//, ""))), true);
  }
  const noted = GEOMETRY_SAT_QUESTIONS.filter((item) =>
    item.stimulus.includes(GEOMETRY_SAT_FIGURE_NOTE),
  ).map((item) => item.key);
  assert.deepEqual(noted, [
    "q03-apothem-decagon",
    "q04-similar-prism-volume",
    "q05-cylinder-cone-volume",
    "q10-prism-surface-from-volume",
    "q12-cylinder-with-hole",
  ]);
});

test("every Geometry SAT question passes the student-usable math gate", () => {
  assert.deepEqual(auditGeometrySatQuestions(), []);
});

function snapshotFrom(
  draft: (typeof GEOMETRY_SAT_QUESTIONS)[number],
  patch: Partial<GeometryQuestionSnapshot> = {},
): GeometryQuestionSnapshot {
  return {
    id: draft.key,
    tags: [GEOMETRY_SAT_FOLLOW_UP_TAG, draft.key, "session-copy"],
    prompt: draft.prompt,
    stimulus: draft.stimulus,
    choices: draft.choices.map((item) => ({ ...item })),
    correctAnswer: draft.correctAnswer,
    explanation: "",
    skill: draft.skill,
    ...patch,
  };
}

test("Michelle geometry refresh rewrites drifted rows and ignores other clients", () => {
  const current = GEOMETRY_SAT_QUESTIONS.map((draft) => snapshotFrom(draft));
  assert.deepEqual(geometryQuestionsNeedingRefresh(current), []);
  assert.equal(
    geometryQuestionContentMatches(current[0]!, GEOMETRY_SAT_QUESTIONS[0]!),
    true,
  );

  const stale = GEOMETRY_SAT_QUESTIONS.map((draft, index) =>
    snapshotFrom(draft, index === 0 ? { prompt: "stale stem", explanation: "old solution" } : {}),
  );
  const updates = geometryQuestionsNeedingRefresh(stale);
  assert.deepEqual(
    updates.map((update) => update.draft.key),
    ["q01-composite-l-polygon"],
  );
  assert.equal(updates[0]?.draft.prompt.startsWith("In the figure,"), true);
  assert.match(updates[0]?.draft.stimulus ?? "", /question-block\.svg/);

  const foreign: GeometryQuestionSnapshot[] = [
    {
      id: "taito-row",
      tags: ["taito-diagnostic", "q01-composite-l-polygon"],
      prompt: "do not touch",
      stimulus: null,
      choices: [],
      correctAnswer: "c",
      explanation: "keep",
      skill: "other",
    },
  ];
  assert.deepEqual(geometryQuestionsNeedingRefresh(foreign), []);
});
