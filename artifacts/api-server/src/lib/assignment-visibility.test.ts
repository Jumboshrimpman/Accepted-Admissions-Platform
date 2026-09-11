import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  FIGURE_PRIMARY_PRESENTATION,
  assignmentDifficulty,
  assignmentQuestionShape,
  courseIdsForAssignmentList,
  isAssignmentListedForRole,
  isFullLengthDiagnosticAssignment,
  isLetterMultipleChoiceAnswer,
  isUnfinishedHomeworkClientCopy,
  pickDiagnosticKeeper,
  studentSafeAssignmentInstructions,
  stripBankFigureComments,
} from "./assignment-visibility.ts";

test("assignment list queries an explicit course even when the user has no memberships", () => {
  assert.deepEqual(courseIdsForAssignmentList([], "course-1"), ["course-1"]);
  assert.deepEqual(courseIdsForAssignmentList(["a", "b"]), ["a", "b"]);
  assert.deepEqual(courseIdsForAssignmentList(["a", "b"], "course-1"), ["course-1"]);
  assert.deepEqual(courseIdsForAssignmentList([]), []);
});

test("students do not list draft or archived assignments that staff can still open", () => {
  assert.equal(isAssignmentListedForRole("student", "published"), true);
  assert.equal(isAssignmentListedForRole("student", "draft"), false);
  assert.equal(isAssignmentListedForRole("viewer", "archived"), false);
  assert.equal(isAssignmentListedForRole("administrator", "draft"), true);
  assert.equal(isAssignmentListedForRole("tutor", "archived"), true);
});

test("full-length SAT bank questions coerce onto the assignment API schema", () => {
  const shaped = assignmentQuestionShape(
    {
      id: "q-diag-1",
      subject: "SAT",
      questionType: "multiple_choice",
      prompt: "Which choice completes the text?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "however" },
        { value: "therefore" },
      ],
      skill: "Transitions",
      difficulty: "unspecified",
    },
    { position: 0, predictionFirst: false },
  );
  assert.equal(shaped.difficulty, "foundational");
  assert.equal(assignmentDifficulty("hard"), "hard");
  assert.equal(assignmentDifficulty("easy"), "foundational");
  assert.equal(["foundational", "medium", "hard"].includes(shaped.difficulty), true);
  assert.equal(shaped.choices?.[1]?.text, "therefore");
  assert.equal(typeof shaped.choices?.[1]?.id, "string");
  assert.equal(typeof shaped.choices?.[1]?.label, "string");
  assert.equal("correctAnswer" in shaped, false);
  assert.equal("explanation" in shaped, false);
  const keyed = assignmentQuestionShape(
    {
      id: "q-diag-1",
      subject: "SAT",
      questionType: "multiple_choice",
      prompt: "Which choice completes the text?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "however" },
        { value: "therefore" },
      ],
      skill: "Transitions",
      difficulty: "unspecified",
      correctAnswer: "a",
      explanation: "However signals contrast.",
    },
    { position: 0, predictionFirst: false },
    { includeKeys: true },
  );
  assert.equal(keyed.correctAnswer, "a");
  assert.equal(keyed.explanation, "However signals contrast.");
  const emptyKey = assignmentQuestionShape(
    {
      id: "q-diag-empty",
      subject: "SAT",
      questionType: "multiple_choice",
      prompt: "Which choice completes the text?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "however" },
        { id: "b", label: "B", text: "therefore" },
      ],
      skill: "Transitions",
      difficulty: "medium",
      correctAnswer: "   ",
      explanation: "",
    },
    { position: 0, predictionFirst: false },
    { includeKeys: true },
  );
  assert.equal(emptyKey.correctAnswer, "");
});

test("assignment questions hide extract skill placeholders behind the section label", () => {
  const shaped = assignmentQuestionShape(
    {
      id: "q-cb-1",
      subject: "SAT Math",
      domain: "SAT Math",
      questionType: "multiple_choice",
      prompt: "What is the value of x?",
      skill: "Skill not in extract",
      difficulty: "medium",
    },
    { position: 0 },
  );
  assert.equal(shaped.skill, "SAT Math");
  assert.equal(
    assignmentQuestionShape(
      {
        id: "q-cb-2",
        subject: "SAT Reading & Writing",
        domain: "Reading and Writing",
        prompt: "Which choice completes the text?",
        skill: "",
      },
      { position: 1 },
    ).skill,
    "Reading and Writing",
  );
});

test("figure-primary quiz items without usable A–D text do not invent letter-only choices", () => {
  const shaped = assignmentQuestionShape(
    {
      id: "q-fig-1",
      subject: "SAT Math",
      questionType: "spr",
      prompt: "<!-- sat-bank-figures -->\nV = i,.r3 V =3£wh",
      stimulus:
        "![Question region](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q1.png)",
      choices: [],
      skill: "SAT Math",
      difficulty: "medium",
      correctAnswer: "C",
    },
    { position: 0, predictionFirst: false },
  );
  assert.equal(shaped.presentation, "text");
  assert.equal(shaped.choices, undefined);
  assert.equal("correctAnswer" in shaped, false);
  const keyed = assignmentQuestionShape(
    {
      id: "q-fig-1",
      subject: "SAT Math",
      questionType: "spr",
      prompt: "<!-- sat-bank-figures -->\nV = i,.r3 V =3£wh",
      stimulus:
        "![Question region](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q1.png)",
      choices: [],
      skill: "SAT Math",
      difficulty: "medium",
      correctAnswer: "C",
      explanation: "Choice C is correct.",
    },
    { position: 0, predictionFirst: false },
    { includeKeys: true },
  );
  assert.equal(keyed.choices, undefined);
  assert.equal(keyed.correctAnswer, "C");
  assert.equal(keyed.explanation, "Choice C is correct.");
});

test("strips SAT bank figure comments and recovers A–D choices from a letter key", () => {
  assert.equal(
    stripBankFigureComments(
      "<!-- sat-bank-figures -->\n![Cone](https://cdn.example/cone.png)\n<!-- /sat-bank-figures -->\nVolume?",
    ),
    "![Cone](https://cdn.example/cone.png)\n\nVolume?",
  );
  assert.equal(isLetterMultipleChoiceAnswer("C"), true);
  assert.equal(isLetterMultipleChoiceAnswer("9; 9.0"), false);
  const recovered = assignmentQuestionShape(
    {
      id: "q-figure-c",
      subject: "SAT Math",
      questionType: "spr",
      prompt: "<!-- sat-bank-figures -->![Graph](/figures/line.png)<!-- /sat-bank-figures -->",
      stimulus: "<!-- sat-bank-figures -->keep the image<!-- /sat-bank-figures -->",
      choices: [],
      correctAnswer: "C",
    },
    { position: 0 },
  );
  assert.equal(recovered.choices, undefined);
  assert.equal(recovered.prompt.includes("sat-bank-figures"), false);
  assert.equal(FIGURE_PRIMARY_PRESENTATION, "figure_primary");
  assert.equal(
    stripBankFigureComments(
      '<!-- figure-primary src="https://cdn.example/full.png" -->\nVolume?',
    ).includes("figure-primary"),
    false,
  );
  assert.equal(
    recovered.presentation === "figure_primary" ||
      recovered.prompt.includes("![Graph](/figures/line.png)"),
    true,
  );
  const spr = assignmentQuestionShape(
    {
      id: "q-spr",
      questionType: "spr",
      prompt: "How many pounds?",
      choices: [],
      correctAnswer: "9; 9.0",
    },
    { position: 1 },
  );
  assert.equal(spr.choices, undefined);
  assert.equal(spr.questionType, "spr");
});

test("unfinished-homework copy is rewritten for students and kept detectable", () => {
  assert.equal(
    isUnfinishedHomeworkClientCopy(
      "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.",
    ),
    true,
  );
  assert.equal(
    studentSafeAssignmentInstructions(
      "Homework was not finished before the meeting. Work up to 15 of these items together.",
    ),
    "Work up to 15 of these items together. You can submit for results without answering every question.",
  );
  assert.equal(studentSafeAssignmentInstructions("Answer the questions."), "Answer the questions.");
});

test("dedupe keeps the published full-length diagnostic with work, not an empty extra", () => {
  assert.equal(
    isFullLengthDiagnosticAssignment({
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      homeworkKind: "diagnostic",
      questionCount: 120,
    }),
    true,
  );
  const keeper = pickDiagnosticKeeper([
    {
      id: "empty-copy",
      status: "published",
      questionCount: 0,
      attemptCount: 0,
    },
    {
      id: "full-length",
      status: "published",
      questionCount: 120,
      attemptCount: 1,
    },
    {
      id: "archived-old",
      status: "archived",
      questionCount: 98,
      attemptCount: 0,
    },
  ]);
  assert.equal(keeper?.id, "full-length");
});
