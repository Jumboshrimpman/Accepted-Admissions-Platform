import assert from "node:assert/strict";
import test from "node:test";
import { MAX_IN_SESSION_HOMEWORK_QUESTIONS } from "./session-homework.ts";
import { isStudentUsableServedQuestion } from "./sat-bank-diagnostic-quality.ts";
import {
  IN_SESSION_PRACTICE_TITLE,
  deterministicPracticeQuestion,
  selectHomeworkForPracticePrep,
  selectPracticeQuestionsFromHomeworkMisses,
} from "./in-session-practice.ts";

test("in-session practice is chosen from the newest homework that has results", () => {
  const archived = {
    id: "archived-diagnostic",
    deliveryPhase: "before_session" as const,
    status: "archived",
  };
  const olderLive = {
    id: "older-live",
    deliveryPhase: "before_session" as const,
    status: "published",
  };
  const current = {
    id: "october-prework",
    deliveryPhase: "before_session" as const,
    status: "published",
  };
  const during = {
    id: "during-generic",
    deliveryPhase: "during_session" as const,
    status: "published",
  };
  const submitted = new Set(["archived-diagnostic", "october-prework"]);
  assert.equal(
    selectHomeworkForPracticePrep([archived, olderLive, during, current], submitted)?.id,
    "october-prework",
  );
  assert.equal(
    selectHomeworkForPracticePrep([archived, olderLive, current], new Set())?.id,
    "october-prework",
  );
  assert.equal(IN_SESSION_PRACTICE_TITLE, "In-session practice");
});

test("missed homework skills map to original bank items, not an unrelated quiz", () => {
  const plan = selectPracticeQuestionsFromHomeworkMisses({
    missed: [
      { questionId: "miss-transitions", skill: "Transitions" },
      { questionId: "miss-evidence", skill: "Evidence" },
      { questionId: "miss-transitions-2", skill: "Transitions" },
    ],
    sessionSubject: "SAT Math",
    usedQuestionIds: new Set(["already-used"]),
    bank: [
      { id: "miss-transitions", skill: "Transitions", subject: "SAT" },
      { id: "algebra-hard", skill: "Algebra", subject: "SAT" },
      { id: "already-used", skill: "Transitions", subject: "SAT" },
      { id: "ielts-transition", skill: "Transitions", subject: "IELTS" },
      { id: "practice-transitions", skill: "transitions", subject: "SAT Reading" },
      { id: "practice-evidence", skill: "Evidence", subject: "SAT" },
      { id: "practice-transitions-2", skill: "Transitions", subject: "SAT" },
    ],
  });

  assert.deepEqual(
    plan.mapping.map((row) => ({
      skill: row.skill,
      missedQuestionIds: row.missedQuestionIds,
      practiceQuestionId: row.practiceQuestionId,
    })),
    [
      {
        skill: "Transitions",
        missedQuestionIds: ["miss-transitions", "miss-transitions-2"],
        practiceQuestionId: "practice-transitions",
      },
      {
        skill: "Evidence",
        missedQuestionIds: ["miss-evidence"],
        practiceQuestionId: "practice-evidence",
      },
    ],
  );
  assert.ok(plan.questionIds.includes("practice-transitions"));
  assert.ok(plan.questionIds.includes("practice-evidence"));
  assert.ok(plan.extraQuestionIds.includes("practice-transitions-2"));
  assert.equal(plan.questionIds.includes("algebra-hard"), false);
  assert.equal(plan.questionIds.includes("miss-transitions"), false);
  assert.equal(plan.questionIds.includes("ielts-transition"), false);
  assert.equal(plan.questionIds.includes("already-used"), false);
});

test("in-session practice stays within the 15-question cap", () => {
  const missed = Array.from({ length: 20 }, (_, index) => ({
    questionId: `miss-${index}`,
    skill: `Skill ${index}`,
  }));
  const bank = missed.map((item, index) => ({
    id: `practice-${index}`,
    skill: item.skill,
    subject: "SAT",
  }));
  const plan = selectPracticeQuestionsFromHomeworkMisses({
    missed,
    bank,
    sessionSubject: "SAT",
  });
  assert.equal(plan.mapping.length, MAX_IN_SESSION_HOMEWORK_QUESTIONS);
  assert.equal(plan.questionIds.length, MAX_IN_SESSION_HOMEWORK_QUESTIONS);
  assert.equal(plan.extraQuestionIds.length, 0);
  assert.equal(plan.mapping[0]?.practiceQuestionId, "practice-0");
  assert.equal(plan.mapping[14]?.skill, "Skill 14");
});

test("original practice items generated for missed skills are student-usable", () => {
  for (const skill of ["Transitions", "Evidence", "Boundaries"]) {
    const template = deterministicPracticeQuestion(skill);
    assert.equal(
      isStudentUsableServedQuestion({
        id: `generated-${skill}`,
        subject: "SAT",
        domain: "Adaptive practice",
        skill,
        questionType: "multiple_choice",
        prompt: template.prompt,
        stimulus: template.stimulus,
        choices: template.choices,
        correctAnswer: template.correctAnswer,
      }),
      true,
      skill,
    );
  }
});

test("a missed skill with no bank item stays unfilled for an original generated item", () => {
  const plan = selectPracticeQuestionsFromHomeworkMisses({
    missed: [{ questionId: "miss-boundaries", skill: "Boundaries" }],
    bank: [{ id: "algebra-hard", skill: "Algebra", subject: "SAT" }],
    sessionSubject: "SAT",
  });
  assert.equal(plan.questionIds.length, 0);
  assert.equal(plan.mapping[0]?.practiceQuestionId, null);
  assert.deepEqual(plan.mapping[0]?.missedQuestionIds, ["miss-boundaries"]);
});
