import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canAssignCleanStudentQuizSet,
  composeDiagnosticItems,
  isStudentUsableQuizItem,
} from "./sat-bank-diagnostic-quality.ts";
import {
  isAssignableBankItem,
  isMultipleChoiceQuizItem,
  isTutorQuizMcq,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
  type ParsedBankRecord,
} from "./sat-bank-import.ts";
import { materializedQuestionContent } from "./sat-bank-figures.ts";
import {
  preferSatDiagnosticCollection,
  routinePreworkTimeLimitMinutes,
  selectQuestionsForCountBudget,
} from "./sat-bank-timing.ts";
import {
  HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES,
  HARD_SAT_PREWORK_QUESTIONS,
  SAT_DIFFICULTY_SETTINGS,
  hardSatFacingTextIsGarbled,
  hardSatSectionQuotas,
  hardSatSetIsComplete,
  inSessionQuestionTargetForStudent,
  isHardSatBankItem,
  isOfficialModule2BankItem,
  hardSatStudentFacing,
  isDeveloperSeededSatItem,
  isRenderableHardSatItem,
  planHardSatSessionSets,
  satBankUsageCountsAsSeen,
  satDifficultyForStudent,
  selectHardSatQuestions,
  shouldRefreshUnattemptedHardPrework,
  toRenderableHardSatInput,
  type HardSatCandidate,
  type RenderableHardSatInput,
} from "./sat-set-difficulty.ts";
import { TAITO_STUDENT_EMAIL, taitoSessionDateTime } from "./session-schedule.ts";

function candidate(
  testNumber: number,
  section: "rw" | "math",
  questionNumber: number,
): HardSatCandidate {
  const sourceKey = `sat-pt${testNumber}-${section}-m2-q${questionNumber}`;
  return {
    id: sourceKey,
    sourceKey,
    section,
    module: 2,
    questionNumber,
    practiceTestNumber: testNumber,
  };
}

test("hard difficulty starts the session after Oct 16 and stays reusable", () => {
  const taito = {
    email: TAITO_STUDENT_EMAIL,
    displayName: "Taito Goto",
    sessionTitle: "Taito’s SAT Session with Eunice",
    subject: "SAT",
  };
  assert.equal(
    satDifficultyForStudent({
      ...taito,
      session: { dateTime: taitoSessionDateTime("2026-10-16"), timezone: "Asia/Tokyo" },
    }),
    "standard",
  );
  assert.equal(
    satDifficultyForStudent({
      ...taito,
      session: { dateTime: taitoSessionDateTime("2026-10-30"), timezone: "Asia/Tokyo" },
    }),
    "hard",
  );
  assert.equal(
    satDifficultyForStudent({
      ...taito,
      subject: "IELTS",
      sessionDateKey: "2026-10-30",
    }),
    "standard",
  );
  assert.equal(
    satDifficultyForStudent({
      email: "other-student@example.com",
      displayName: "Taito Goto",
      sessionTitle: "Taito’s SAT Session with Eunice",
      subject: "SAT",
      sessionDateKey: "2026-10-30",
    }),
    "standard",
  );
  assert.equal(
    satDifficultyForStudent({
      sessionTitle: "Taito’s SAT Session with Eunice",
      subject: "SAT",
      sessionDateKey: "2026-11-06",
    }),
    "hard",
  );
  assert.equal(
    satDifficultyForStudent({
      email: "future@example.com",
      subject: "SAT",
      sessionDateKey: "2026-11-01",
      settings: [
        ...SAT_DIFFICULTY_SETTINGS,
        {
          email: "future@example.com",
          difficulty: "hard",
          effectiveAfterDateKey: "2026-10-16",
        },
      ],
    }),
    "hard",
  );
  assert.equal(
    satDifficultyForStudent({
      email: "future@example.com",
      subject: "SAT",
      sessionDateKey: "2026-10-16",
      settings: [
        {
          email: "future@example.com",
          difficulty: "hard",
          effectiveAfterDateKey: "2026-10-16",
        },
      ],
    }),
    "standard",
  );
});

test("hard selection takes the hardest official module 2 items and balances sections", () => {
  const items = [4, 5, 6].flatMap((testNumber) => [
    candidate(testNumber, "rw", 14),
    candidate(testNumber, "rw", 15),
    candidate(testNumber, "rw", 16),
    candidate(testNumber, "math", 17),
    candidate(testNumber, "math", 18),
    candidate(testNumber, "math", 19),
    { ...candidate(testNumber, "rw", 20), module: 1, sourceKey: `sat-pt${testNumber}-rw-m1-q20`, id: `m1-${testNumber}` },
  ]);
  assert.equal(isHardSatBankItem(candidate(5, "rw", 14)), false);
  assert.equal(isHardSatBankItem(candidate(5, "math", 17)), false);
  assert.equal(isHardSatBankItem({ ...candidate(5, "rw", 20), module: 1 }), false);
  assert.equal(isOfficialModule2BankItem(candidate(5, "rw", 14)), true);
  assert.equal(isOfficialModule2BankItem({ ...candidate(5, "rw", 20), module: 1 }), false);
  assert.deepEqual(hardSatSectionQuotas(40), { rw: 22, math: 18 });
  assert.deepEqual(hardSatSectionQuotas(20), { rw: 11, math: 9 });
  const selected = selectHardSatQuestions(items, {
    targetCount: 4,
    minCount: 4,
    maxCount: 4,
    excludeSourceKeys: new Set(["sat-pt5-rw-m2-q15"]),
    seenPracticeTests: new Set([4]),
  });
  assert.deepEqual(
    selected.map((item) => item.sourceKey),
    [
      "sat-pt4-rw-m2-q16",
      "sat-pt5-rw-m2-q16",
      "sat-pt4-math-m2-q19",
      "sat-pt5-math-m2-q19",
    ],
  );
  const seenTestsDoNotOutrankDifficulty = selectHardSatQuestions(items, {
    targetCount: 4,
    minCount: 4,
    maxCount: 4,
    seenPracticeTests: new Set([5, 6]),
  });
  assert.deepEqual(
    seenTestsDoNotOutrankDifficulty.map((item) => item.sourceKey),
    [
      "sat-pt4-rw-m2-q16",
      "sat-pt5-rw-m2-q16",
      "sat-pt4-math-m2-q19",
      "sat-pt5-math-m2-q19",
    ],
  );
  const shortMath = selectHardSatQuestions(
    [
      candidate(4, "rw", 23),
      candidate(4, "rw", 22),
      candidate(4, "rw", 21),
      candidate(4, "rw", 20),
      candidate(4, "math", 22),
      { ...candidate(4, "rw", 27), module: 1, sourceKey: "module-1", id: "module-1" },
    ],
    { targetCount: 4, minCount: 4, maxCount: 4 },
  );
  assert.deepEqual(
    shortMath.map((item) => item.sourceKey),
    ["sat-pt4-rw-m2-q23", "sat-pt4-rw-m2-q22", "sat-pt4-rw-m2-q21", "sat-pt4-math-m2-q22"],
  );
  const sets = planHardSatSessionSets(items, {
    excludeSourceKeys: new Set(["sat-pt4-rw-m2-q15"]),
    seenPracticeTests: new Set([4]),
    preworkTarget: 4,
    preworkMin: 4,
    preworkMax: 4,
    inSessionMax: 2,
  });
  const preworkKeys = new Set(sets.prework.map((item) => item.sourceKey));
  assert.equal(sets.prework.length, 4);
  assert.equal(sets.inSession.length, 2);
  assert.equal(sets.inSession.some((item) => preworkKeys.has(item.sourceKey)), false);
  assert.equal(sets.prework.some((item) => item.sourceKey === "sat-pt4-rw-m2-q15"), false);
  assert.equal(sets.preworkTimeLimitMinutes, routinePreworkTimeLimitMinutes(4));
  assert.equal(sets.inSessionTimeLimitMinutes, HARD_SAT_IN_SESSION_TIME_LIMIT_MINUTES);
  assert.equal(sets.inSessionTimeLimitMinutes, 30);
  const scarceMath = planHardSatSessionSets(
    [
      candidate(5, "rw", 30),
      candidate(5, "rw", 29),
      candidate(5, "rw", 28),
      candidate(5, "rw", 27),
      candidate(5, "math", 22),
    ],
    { preworkTarget: 4, preworkMin: 4, preworkMax: 4, inSessionMax: 2 },
  );
  assert.deepEqual(
    scarceMath.prework.map((item) => item.sourceKey),
    ["sat-pt5-rw-m2-q30", "sat-pt5-rw-m2-q29", "sat-pt5-math-m2-q22", "sat-pt5-rw-m2-q27"],
  );
  assert.deepEqual(scarceMath.inSession.map((item) => item.sourceKey), ["sat-pt5-rw-m2-q28"]);
});

test("attempted pre-work is not refreshed, and garbled math is not renderable", () => {
  assert.equal(
    shouldRefreshUnattemptedHardPrework({
      difficulty: "hard",
      attemptCount: 1,
      assignedSourceKeys: ["sat-pt4-rw-m1-q1"],
      desiredSourceKeys: ["sat-pt5-rw-m2-q15"],
    }),
    false,
  );
  assert.equal(
    shouldRefreshUnattemptedHardPrework({
      difficulty: "standard",
      attemptCount: 0,
      assignedSourceKeys: ["sat-pt4-rw-m1-q1"],
      desiredSourceKeys: ["sat-pt5-rw-m2-q15"],
    }),
    false,
  );
  assert.equal(
    shouldRefreshUnattemptedHardPrework({
      difficulty: "hard",
      attemptCount: 0,
      assignedSourceKeys: ["sat-pt4-rw-m1-q1"],
      desiredSourceKeys: ["sat-pt5-rw-m2-q15"],
    }),
    false,
  );
  assert.equal(
    shouldRefreshUnattemptedHardPrework({
      difficulty: "hard",
      attemptCount: 0,
      assignedSourceKeys: [],
      desiredSourceKeys: ["sat-pt5-rw-m2-q15"],
    }),
    true,
  );
  assert.equal(satBankUsageCountsAsSeen("archived", 0), false);
  assert.equal(satBankUsageCountsAsSeen("archived", 1), true);
  assert.equal(satBankUsageCountsAsSeen("published", 0), true);
  assert.equal(
    inSessionQuestionTargetForStudent({
      email: TAITO_STUDENT_EMAIL,
      subject: "SAT",
      sessionDateKey: "2026-10-30",
    }),
    20,
  );
  assert.equal(
    inSessionQuestionTargetForStudent({
      email: "other-student@example.com",
      subject: "SAT",
      sessionDateKey: "2026-10-30",
    }),
    15,
  );
  assert.equal(hardSatSetIsComplete({ preworkCount: 39, inSessionCount: 20, inSessionTarget: 20 }), false);
  assert.equal(hardSatSetIsComplete({ preworkCount: 40, inSessionCount: 20, inSessionTarget: 20 }), true);
  assert.equal(HARD_SAT_PREWORK_QUESTIONS, 40);
  assert.equal(
    shouldRefreshUnattemptedHardPrework({
      difficulty: "hard",
      attemptCount: 0,
      assignedSourceKeys: ["sat-pt5-rw-m2-q15"],
      desiredSourceKeys: ["sat-pt5-rw-m2-q15"],
    }),
    false,
  );
  const garbled: RenderableHardSatInput = {
    ...candidate(4, "math", 18),
    examFamily: "sat",
    sourceKind: "official_extract",
    prompt:
      "= (x − 10)(x + 13) f(x)\nThe function f is defined by the given equation. For what value of x does f(x)( ) reach its minimum?",
    choices: [
      { id: "a", label: "A", text: "−130" },
      { id: "b", label: "B", text: "−13 23" },
      { id: "c", label: "C", text: "− 2 3" },
      { id: "d", label: "D", text: "− 2" },
    ],
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(isRenderableHardSatItem(garbled), false);
  const clean: RenderableHardSatInput = {
    ...candidate(8, "rw", 15),
    examFamily: "sat",
    sourceKind: "official_extract",
    prompt:
      "Which choice completes the text with the most logical and precise word or phrase?",
    choices: [
      { id: "a", label: "A", text: "However, the expedition continued" },
      { id: "b", label: "B", text: "Therefore, the expedition continued" },
      { id: "c", label: "C", text: "Meanwhile, the expedition continued" },
      { id: "d", label: "D", text: "Similarly, the expedition continued" },
    ],
    questionType: "mcq",
    correctAnswer: "A",
  };
  assert.equal(isRenderableHardSatItem(clean), true);
  assert.equal(isRenderableHardSatItem({ ...clean, questionNumber: 10 }), true);
  assert.equal(isHardSatBankItem({ ...clean, questionNumber: 10 }), false);
  assert.equal(isRenderableHardSatItem({ ...clean, module: 1, questionNumber: 20 }), false);
  const repairedMath: RenderableHardSatInput = {
    ...candidate(5, "math", 24),
    examFamily: "sat",
    sourceKind: "official_extract",
    prompt: "Which quadratic equation has no real solutions?",
    choices: [
      { id: "a", label: "A", text: "x2 + 14x −49 = 0" },
      { id: "b", label: "B", text: "x2 −14x + 49 = 0" },
      { id: "c", label: "C", text: "5x2 −14x −49 = 0" },
      { id: "d", label: "D", text: "5x2 −14x + 49 = 0" },
    ],
    questionType: "mcq",
    correctAnswer: "D",
  };
  assert.equal(isRenderableHardSatItem(repairedMath), true);
  const facing = hardSatStudentFacing(repairedMath);
  assert.equal(facing?.repaired, true);
  assert.match(facing?.choices[0]?.text ?? "", /x²/);
  const seededSlope: RenderableHardSatInput = {
    ...candidate(5, "math", 18),
    examFamily: "sat",
    sourceKind: "official_extract",
    prompt: "In the xy-plane, what is the slope of the line through (0, 2) and (4, 10)?",
    choices: [
      { id: "a", label: "A", text: "1" },
      { id: "b", label: "B", text: "2" },
      { id: "c", label: "C", text: "3" },
      { id: "d", label: "D", text: "4" },
    ],
    questionType: "mcq",
    correctAnswer: "B",
  };
  assert.equal(isDeveloperSeededSatItem(seededSlope), true);
  assert.equal(isRenderableHardSatItem(seededSlope), false);
  assert.equal(isRenderableHardSatItem({ ...clean, sourceKind: "seed" }), false);
  assert.equal(
    isDeveloperSeededSatItem({
      sourceKind: "official_extract",
      prompt: "The garden's water use fell after drip lines replaced the sprinklers.",
    }),
    true,
  );
  const garbledWithCrop: RenderableHardSatInput = {
    ...garbled,
    figures: [
      {
        url: "https://app.acceptedadmissions.org/media/sat-bank/full-question.png",
        alt: "Full question including the choices",
      },
    ],
  };
  assert.equal(isRenderableHardSatItem(garbledWithCrop), false);
  const cropBacked: RenderableHardSatInput = {
    ...garbled,
    choices: [
      { id: "a", label: "A", text: "−130" },
      { id: "b", label: "B", text: "−23/2" },
      { id: "c", label: "C", text: "−3/2" },
      { id: "d", label: "D", text: "−3/2" },
    ],
    correctAnswer: "D",
    officialExplanation: "Choice D is correct. The vertex of the rewritten quadratic is at x = -3/2.",
    figures: [
      {
        url: "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/m2-q18-full.png",
        alt: "Full question including choices",
      },
    ],
  };
  assert.equal(isRenderableHardSatItem(cropBacked), false);
  assert.equal(hardSatFacingTextIsGarbled(cropBacked.prompt), true);
  assert.equal(
    isRenderableHardSatItem({
      ...cropBacked,
      officialExplanation: "Choice A is correct. This letter does not match the key.",
    }),
    false,
  );
  const wrongFigure: RenderableHardSatInput = {
    ...candidate(6, "math", 18),
    examFamily: "sat",
    sourceKind: "official_extract",
    prompt:
      "Rectangle P has an area of 72 square inches. If a rectangle with an area of 20 square inches is removed from rectangle P, what is the area, in square inches, of the resulting figure?",
    choices: [
      { id: "a", label: "A", text: "92" },
      { id: "b", label: "B", text: "84" },
      { id: "c", label: "C", text: "80" },
      { id: "d", label: "D", text: "52" },
    ],
    questionType: "mcq",
    correctAnswer: "D",
    figures: [
      {
        url: "https://app.acceptedadmissions.org/media/sat-bank/scatter.png",
        alt: "Diagram from page 34",
      },
    ],
  };
  assert.equal(isStudentUsableQuizItem(wrongFigure), true);
  assert.equal(isRenderableHardSatItem(wrongFigure), false);
});

test("hard assign path does not email or rewrite attempt rows", () => {
  const files = [
    "sat-hard-sets.ts",
    "sat-set-difficulty.ts",
    "autogenerated-sat-prework.ts",
    "session-curriculum-prep.ts",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("sendEmail"), false, file);
    assert.equal(source.includes("update(attemptsTable)"), false, file);
    assert.equal(source.includes("delete(attemptsTable)"), false, file);
    assert.equal(source.includes(".insert(attemptsTable)"), false, file);
  }
  const assign = readFileSync(new URL("./sat-bank-service.ts", import.meta.url), "utf8");
  const guard = assign.slice(
    assign.indexOf("async function archiveAssignmentIfUnattempted"),
    assign.indexOf("async function archiveSessionPrework"),
  );
  assert.match(guard, /if \(Number\(count\) > 0\) return;/);
  assert.doesNotMatch(guard, /attemptsTable\)\s*\.set|update\(attemptsTable\)|delete\(attemptsTable\)/);
  const prep = readFileSync(new URL("./session-curriculum-prep.ts", import.meta.url), "utf8");
  assert.doesNotMatch(prep, /ensureHardSatSessionSets/);
  assert.match(prep, /describeHardSatSessionPrep/);
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  assert.match(hardSets, /status: "attempted"/);
  assert.match(hardSets, /satBankUsageCountsAsSeen/);
  assert.match(hardSets, /ne\(assignmentsTable\.status, "archived"\)/);
  assert.match(hardSets, /raiseHardSatShortfallAlert/);
  assert.match(hardSets, /everyKeyIsHard/);
  const preworkFn = hardSets.slice(
    hardSets.indexOf("export async function ensureHardSatPrework"),
    hardSets.indexOf("export async function officialHardInSessionItems"),
  );
  assert.doesNotMatch(preworkFn, /replaceable\[0\]/);
  assert.match(preworkFn, /blocked-by-attempts/);
  const inSessionFn = hardSets.slice(
    hardSets.indexOf("export async function ensureHardSatInSession"),
    hardSets.indexOf("export async function fillUnattemptedOfficialHardInSession"),
  );
  assert.match(inSessionFn, /everyKeyIsHard/);
  assert.match(inSessionFn, /archiveUnattemptedAssignment/);
  const sessionSets = hardSets.slice(hardSets.indexOf("export async function ensureHardSatSessionSets"));
  assert.match(sessionSets, /ensureHardSatInSession\(session\)/);
  assert.doesNotMatch(sessionSets, /prework\.action === "shortfall"\) return/);
  assert.doesNotMatch(hardSets, /sendEmail|sendTransactionalEmail/);
  const leftover = prep.slice(
    prep.indexOf("async function attachHardBank"),
    prep.indexOf("export type SessionPrepResult"),
  );
  assert.doesNotMatch(leftover, /fillUnattemptedOfficialHardInSession|materializeHardSatQuestion/);
  assert.match(leftover, /questionsTable\.sourceType, "original"/);
  assert.doesNotMatch(leftover, /difficulty", "hard"/);
  const route = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const sessionGet = route.slice(
    route.indexOf('router.get("/sessions/:sessionId"'),
    route.indexOf("async function listAssignmentsForUser"),
  );
  assert.doesNotMatch(sessionGet, /ensureHardSatSessionSets/);
  const adaptiveFn = route.slice(
    route.indexOf("async function adaptiveCurriculumForSession"),
    route.indexOf('"/sessions/:sessionId/adaptive-curriculum"'),
  );
  assert.doesNotMatch(adaptiveFn, /prepareSessionCurriculum|deriveAdaptiveRecommendations|materializeHardSatQuestion|fillUnattemptedOfficialHardInSession/);
  assert.match(adaptiveFn, /not_prepared/);
  const adaptiveMarker = '"/sessions/:sessionId/adaptive-curriculum"';
  const adaptiveGetAt = route.indexOf(adaptiveMarker);
  const adaptivePostAt = route.indexOf(adaptiveMarker, adaptiveGetAt + adaptiveMarker.length);
  const adaptiveGet = route.slice(route.lastIndexOf("router.get(", adaptiveGetAt), adaptivePostAt);
  assert.doesNotMatch(adaptiveGet, /ensureHardSatSessionSets/);
  assert.doesNotMatch(adaptiveGet, /prepareSessionCurriculum/);
  const attemptGet = route.slice(
    route.indexOf('router.get("/attempts/:attemptId"'),
    route.indexOf('router.post(\n  "/attempts/:attemptId/pause"'),
  );
  assert.equal(attemptGet.match(/prepareCurriculum: false/g)?.length, 2);
  assert.doesNotMatch(attemptGet, /prepareCurriculum: true/);
  const postHandler = route.slice(route.lastIndexOf("router.post(", adaptivePostAt), route.indexOf('router.get("/assignments"'));
  assert.match(postHandler, /ensureRole\(\["administrator", "tutor"\]\)/);
  assert.match(postHandler, /withSessionPreworkLock/);
  assert.match(postHandler, /ensureHardSatSessionSets\(session, req\.appUser\?\.id/);
  const submitAttempt = route.slice(route.indexOf('router.post(\n  "/attempts/:attemptId/submit"'));
  assert.match(submitAttempt, /prepareCurriculum: true/);
  const shared = readFileSync(new URL("./sat-bank-service.ts", import.meta.url), "utf8");
  assert.match(shared, /toRenderableHardSatInput/);
  const reimportFn = shared.slice(
    shared.indexOf("export async function runCollegeBoardReimport"),
    shared.indexOf("let officialImportPromise"),
  );
  assert.match(reimportFn, /if \(input\.dryRun !== false\) return report/);
  const upsertAt = reimportFn.indexOf("upsertBankRecords");
  const dryReturnAt = reimportFn.indexOf("if (input.dryRun !== false) return report");
  assert.ok(dryReturnAt >= 0 && upsertAt > dryReturnAt);
  assert.doesNotMatch(reimportFn, /refreshLinkedQuestionsFromBank|dropUnusableQuestionsFromLiveAssignments/);
  assert.match(reimportFn, /questionIdsOnAttemptedSets|stillAttempted/);
  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(boot, /runCollegeBoardReimport/);
  const bankRoute = readFileSync(new URL("../routes/sat-bank.ts", import.meta.url), "utf8");
  const reimportRoute = bankRoute.slice(
    bankRoute.indexOf('"/admin/sat-bank/reimport"'),
    bankRoute.indexOf('"/admin/sat-bank/rescore-usable"'),
  );
  assert.match(reimportRoute, /dryRun !== false/);
  assert.match(reimportRoute, /ensureRole\(\["administrator"\]\)/);
  assert.doesNotMatch(reimportRoute, /sendEmail|sendMail|resend|nodemailer|clerk/i);
  const officialBoot = shared.slice(
    shared.indexOf("export async function ensureOfficialExtractsImported"),
    shared.indexOf("async function materializeBankQuestionInternal"),
  );
  assert.match(officialBoot, /officialCount > 0/);
  assert.doesNotMatch(officialBoot, /runCollegeBoardReimport/);
  assert.match(hardSets, /toRenderableHardSatInput/);
  assert.equal(
    toRenderableHardSatInput({
      id: "bank-1",
      sourceKey: "sat-pt8-rw-m2-q15",
      section: "rw",
      module: "2",
      questionNumber: "15",
      practiceTestNumber: "8",
    }).questionNumber,
    15,
  );
});

function studentUsableRecord(record: ParsedBankRecord): boolean {
  if (record.examFamily !== "sat" || record.sourceKind !== "official_extract") return false;
  if (
    !isAssignableBankItem({
      prompt: record.prompt,
      questionType: record.questionType,
      choices: record.choices,
      correctAnswer: record.correctAnswer,
      extractGaps: record.extractGaps,
    })
  ) {
    return false;
  }
  if (!isTutorQuizMcq(record.questionType)) return false;
  const facing = materializedQuestionContent(record);
  if (
    !isMultipleChoiceQuizItem({
      questionType: facing.questionType,
      choices: facing.choices,
      correctAnswer: facing.correctAnswer,
    })
  ) {
    return false;
  }
  return isStudentUsableQuizItem({
    id: record.sourceKey,
    sourceKey: record.sourceKey,
    collectionSlug: record.collectionSlug,
    examFamily: record.examFamily,
    section: record.section,
    module: record.module,
    questionNumber: record.questionNumber,
    position: record.position,
    prompt: facing.prompt,
    stimulus: facing.stimulus,
    choices: facing.choices,
    figures: record.figures,
    questionType: facing.questionType,
    correctAnswer: facing.correctAnswer,
    extractGaps: record.extractGaps,
    domain: record.domain,
  });
}

test("Taito's next SAT session (Oct 30) gets a hard disjoint pre-work and in-session set", async () => {
  const root = resolveCollegeBoardRoot();
  const files = (await readdir(root))
    .filter((name) => /^sat-practice-test-\d+-digital\.jsonl$/.test(name))
    .sort();
  const records: ParsedBankRecord[] = [];
  for (const file of files) {
    const parsed = parseCollegeBoardPayload(await readFile(path.join(root, file), "utf8"), file);
    records.push(...parsed.records);
  }
  const usable = records.filter(studentUsableRecord);
  const bySlug = new Map<string, { slug: string; practiceTestNumber: number | null; count: number }>();
  for (const record of records) {
    if (record.examFamily !== "sat") continue;
    const current = bySlug.get(record.collectionSlug) ?? {
      slug: record.collectionSlug,
      practiceTestNumber: record.practiceTestNumber,
      count: 0,
    };
    current.count += 1;
    bySlug.set(record.collectionSlug, current);
  }
  const preferred = preferSatDiagnosticCollection(
    [...bySlug.values()].map((collection) => ({
      examFamily: "sat",
      practiceTestNumber: collection.practiceTestNumber,
      slug: collection.slug,
      questionCount: collection.count,
    })),
  );
  const diagnostic = composeDiagnosticItems(
    usable.map((record) => {
      const facing = materializedQuestionContent(record);
      return {
        id: record.sourceKey,
        sourceKey: record.sourceKey,
        collectionSlug: record.collectionSlug,
        examFamily: record.examFamily,
        section: record.section,
        module: record.module,
        questionNumber: record.questionNumber,
        position: record.position,
        prompt: facing.prompt,
        stimulus: facing.stimulus,
        choices: facing.choices,
        figures: record.figures,
        questionType: facing.questionType,
        correctAnswer: facing.correctAnswer,
        extractGaps: record.extractGaps,
        practiceTestNumber: record.practiceTestNumber,
      };
    }),
    {
      preferredCollectionSlug: preferred?.slug ?? null,
      allowCrossCollectionFill: true,
    },
  );
  const routinePool = [...usable].sort(
    (left, right) =>
      left.position - right.position ||
      left.questionNumber - right.questionNumber ||
      (left.practiceTestNumber ?? 99) - (right.practiceTestNumber ?? 99) ||
      left.sourceKey.localeCompare(right.sourceKey),
  );
  const routine = selectQuestionsForCountBudget(
    routinePool.map((record) => ({
      id: record.sourceKey,
      section: record.section,
      skill: record.skill ?? record.section,
      estimatedSeconds: record.estimatedSeconds,
      position: record.position,
    })),
  );
  const seenKeys = new Set<string>([
    ...diagnostic.selected.map((item) => item.sourceKey ?? item.id ?? ""),
    ...routine.selected.map((item) => item.id),
  ]);
  seenKeys.delete("");
  const recordByKey = new Map(records.map((record) => [record.sourceKey, record]));
  const seenTests = new Set<number>();
  for (const sourceKey of seenKeys) {
    const testNumber = recordByKey.get(sourceKey)?.practiceTestNumber;
    if (typeof testNumber === "number") seenTests.add(testNumber);
  }
  const hardPool = records.filter((record) =>
    isRenderableHardSatItem(
      toRenderableHardSatInput({
        id: record.sourceKey,
        sourceKey: record.sourceKey,
        examFamily: record.examFamily,
        sourceKind: record.sourceKind,
        section: record.section,
        module: record.module,
        questionNumber: record.questionNumber,
        practiceTestNumber: record.practiceTestNumber,
        prompt: record.prompt,
        stimulus: record.stimulus,
        choices: record.choices,
        figures: record.figures,
        questionType: record.questionType,
        correctAnswer: record.correctAnswer,
        officialExplanation: record.officialExplanation,
        extractGaps: record.extractGaps,
        domain: record.domain,
        skill: record.skill,
        difficulty: record.difficulty,
      }),
    ),
  );
  const inSessionTarget = inSessionQuestionTargetForStudent({
    email: TAITO_STUDENT_EMAIL,
    subject: "SAT",
    sessionDateKey: "2026-10-30",
  });
  assert.equal(inSessionTarget, 20);
  const sets = planHardSatSessionSets(hardPool, {
    excludeSourceKeys: seenKeys,
    seenPracticeTests: seenTests,
    preworkTarget: HARD_SAT_PREWORK_QUESTIONS,
    preworkMin: HARD_SAT_PREWORK_QUESTIONS,
    preworkMax: HARD_SAT_PREWORK_QUESTIONS,
    inSessionMax: inSessionTarget,
  });
  const preworkIds = sets.prework.map((item) => item.sourceKey);
  const inSessionIds = sets.inSession.map((item) => item.sourceKey);
  console.log(
    JSON.stringify(
      {
        nextSessionDate: "2026-10-30",
        assumedSeenTests: [...seenTests].sort((a, b) => a - b),
        assumedSeenCount: seenKeys.size,
        preworkTimeLimitMinutes: sets.preworkTimeLimitMinutes,
        inSessionTimeLimitMinutes: sets.inSessionTimeLimitMinutes,
        prework: preworkIds,
        inSession: inSessionIds,
      },
      null,
      2,
    ),
  );
  assert.equal(preworkIds.length, HARD_SAT_PREWORK_QUESTIONS, `prework ${preworkIds.length}`);
  assert.equal(inSessionIds.length, inSessionTarget);
  assert.equal(new Set([...preworkIds, ...inSessionIds]).size, preworkIds.length + inSessionIds.length);
  for (const sourceKey of [...preworkIds, ...inSessionIds]) {
    assert.equal(seenKeys.has(sourceKey), false, sourceKey);
    const record = recordByKey.get(sourceKey);
    assert.ok(record, sourceKey);
    assert.equal(record.module, 2, sourceKey);
    if (record.section === "rw") assert.ok(record.questionNumber >= 15, sourceKey);
    if (record.section === "math") assert.ok(record.questionNumber >= 18, sourceKey);
    assert.equal(sourceKey === "sat-pt4-math-m2-q18", false, sourceKey);
  }
  assert.equal(sets.prework.some((item) => item.section === "rw"), true);
  assert.equal(sets.prework.some((item) => item.section === "math"), true);
  const preworkFacing = sets.prework.flatMap((item) => {
    const record = recordByKey.get(item.sourceKey);
    if (!record) return [];
    const facing = hardSatStudentFacing({
      id: record.sourceKey,
      sourceKey: record.sourceKey,
      examFamily: record.examFamily,
      sourceKind: record.sourceKind,
      section: record.section,
      module: record.module,
      questionNumber: record.questionNumber,
      practiceTestNumber: record.practiceTestNumber,
      prompt: record.prompt,
      stimulus: record.stimulus,
      choices: record.choices,
      figures: record.figures,
      questionType: record.questionType,
      correctAnswer: record.correctAnswer,
      officialExplanation: record.officialExplanation,
      extractGaps: record.extractGaps,
      domain: record.domain,
      skill: record.skill,
      difficulty: record.difficulty,
    });
    return facing
      ? [{
          ...facing,
          section: record.section,
          module: record.module,
          questionNumber: record.questionNumber,
          figures: record.figures,
          sourceKey: record.sourceKey,
        }]
      : [];
  });
  assert.equal(canAssignCleanStudentQuizSet(preworkFacing), true);
  assert.equal(sets.preworkTimeLimitMinutes, routinePreworkTimeLimitMinutes(preworkIds.length));
  assert.equal(sets.inSessionTimeLimitMinutes, 30);

  for (const record of hardPool) {
    const facing = hardSatStudentFacing({
      id: record.sourceKey,
      sourceKey: record.sourceKey,
      examFamily: record.examFamily,
      sourceKind: record.sourceKind,
      section: record.section,
      module: record.module,
      questionNumber: record.questionNumber,
      practiceTestNumber: record.practiceTestNumber,
      prompt: record.prompt,
      stimulus: record.stimulus,
      choices: record.choices,
      figures: record.figures,
      questionType: record.questionType,
      correctAnswer: record.correctAnswer,
      officialExplanation: record.officialExplanation,
      extractGaps: record.extractGaps,
      domain: record.domain,
      skill: record.skill,
      difficulty: record.difficulty,
    });
    assert.ok(facing, record.sourceKey);
    assert.equal(hardSatFacingTextIsGarbled(facing.prompt), false, record.sourceKey);
    for (const choice of facing.choices) {
      assert.equal(hardSatFacingTextIsGarbled(choice.text), false, `${record.sourceKey} ${choice.label}`);
    }
  }
  const pt7q25 = records.find((record) => record.sourceKey === "sat-pt7-math-m2-q25");
  assert.ok(pt7q25);
  assert.deepEqual(pt7q25.choices.map((choice) => choice.text), ["√109", "√149", "√167", "√341"]);
  assert.equal(pt7q25.correctAnswer.trim().toUpperCase(), "C");
  const pt11q26 = records.find((record) => record.sourceKey === "sat-pt11-math-m2-q26");
  assert.ok(pt11q26);
  assert.deepEqual(pt11q26.choices.map((choice) => choice.text), ["3/5", "3/4", "4/5", "4/3"]);
  assert.equal(pt11q26.correctAnswer.trim().toUpperCase(), "D");
  const droppedImageOnly = records.find((record) => record.sourceKey === "sat-pt8-math-m2-q26");
  assert.ok(droppedImageOnly);
  assert.equal(
    isRenderableHardSatItem(
      toRenderableHardSatInput({
        id: droppedImageOnly.sourceKey,
        sourceKey: droppedImageOnly.sourceKey,
        examFamily: droppedImageOnly.examFamily,
        sourceKind: droppedImageOnly.sourceKind,
        section: droppedImageOnly.section,
        module: droppedImageOnly.module,
        questionNumber: droppedImageOnly.questionNumber,
        practiceTestNumber: droppedImageOnly.practiceTestNumber,
        prompt: droppedImageOnly.prompt,
        stimulus: droppedImageOnly.stimulus,
        choices: droppedImageOnly.choices,
        figures: droppedImageOnly.figures,
        questionType: droppedImageOnly.questionType,
        correctAnswer: droppedImageOnly.correctAnswer,
        officialExplanation: droppedImageOnly.officialExplanation,
        extractGaps: droppedImageOnly.extractGaps,
        domain: droppedImageOnly.domain,
        skill: droppedImageOnly.skill,
        difficulty: droppedImageOnly.difficulty,
      }),
    ),
    false,
  );
  const rwCount = hardPool.filter((record) => record.section === "rw").length;
  const mathCount = hardPool.filter((record) => record.section === "math").length;
  const tailRw = hardPool.filter((record) => record.section === "rw" && record.questionNumber >= 15).length;
  const tailMath = hardPool.filter((record) => record.section === "math" && record.questionNumber >= 18).length;
  const dates = ["2026-10-30", "2026-11-06", "2026-11-20", "2026-11-27", "2026-12-11", "2026-12-18"];
  const used = new Set(seenKeys);
  const sectionMix = (items: ReadonlyArray<{ section: string; questionNumber: number }>) => {
    const rw = items.filter((item) => item.section === "rw");
    const math = items.filter((item) => item.section === "math");
    return {
      rw: rw.length,
      math: math.length,
      minRw: rw.length ? Math.min(...rw.map((item) => item.questionNumber)) : null,
      minMath: math.length ? Math.min(...math.map((item) => item.questionNumber)) : null,
    };
  };
  const coverage = [];
  for (const sessionDateKey of dates) {
    const target = inSessionQuestionTargetForStudent({
      email: TAITO_STUDENT_EMAIL,
      subject: "SAT",
      sessionDateKey,
    });
    assert.equal(target, 20, sessionDateKey);
    const planned = planHardSatSessionSets(hardPool, {
      excludeSourceKeys: used,
      seenPracticeTests: seenTests,
      preworkTarget: HARD_SAT_PREWORK_QUESTIONS,
      preworkMin: HARD_SAT_PREWORK_QUESTIONS,
      preworkMax: HARD_SAT_PREWORK_QUESTIONS,
      inSessionMax: target,
    });
    const full = hardSatSetIsComplete({
      preworkCount: planned.prework.length,
      inSessionCount: planned.inSession.length,
      inSessionTarget: target,
    });
    for (const item of [...planned.prework, ...planned.inSession]) {
      assert.equal(item.module, 2, item.sourceKey);
      assert.equal(used.has(item.sourceKey), false, item.sourceKey);
    }
    const keys = new Set([...planned.prework, ...planned.inSession].map((item) => item.sourceKey));
    assert.equal(keys.size, planned.prework.length + planned.inSession.length, sessionDateKey);
    coverage.push({
      sessionDateKey,
      full,
      prework: sectionMix(planned.prework),
      inSession: sectionMix(planned.inSession),
    });
    if (!full) continue;
    for (const item of [...planned.prework, ...planned.inSession]) used.add(item.sourceKey);
  }
  const covered = coverage.filter((row) => row.full).length;
  console.log(
    JSON.stringify(
      { usableModule2Rw: rwCount, usableModule2Math: mathCount, tailRw, tailMath, covered, coverage },
      null,
      2,
    ),
  );
  assert.equal(tailRw, 133);
  assert.equal(tailMath, 33);
  assert.equal(rwCount, 208);
  assert.equal(mathCount, 48);
  assert.deepEqual(
    coverage.map((row) => ({
      sessionDateKey: row.sessionDateKey,
      full: row.full,
      prework: row.prework,
      inSession: row.inSession,
    })),
    [
      {
        sessionDateKey: "2026-10-30",
        full: true,
        prework: { rw: 30, math: 10, minRw: 27, minMath: 24 },
        inSession: { rw: 15, math: 5, minRw: 27, minMath: 23 },
      },
      {
        sessionDateKey: "2026-11-06",
        full: true,
        prework: { rw: 40, math: 0, minRw: 19, minMath: null },
        inSession: { rw: 20, math: 0, minRw: 17, minMath: null },
      },
      {
        sessionDateKey: "2026-11-20",
        full: true,
        prework: { rw: 40, math: 0, minRw: 4, minMath: null },
        inSession: { rw: 20, math: 0, minRw: 3, minMath: null },
      },
      {
        sessionDateKey: "2026-11-27",
        full: false,
        prework: { rw: 7, math: 0, minRw: 2, minMath: null },
        inSession: { rw: 3, math: 0, minRw: 1, minMath: null },
      },
      {
        sessionDateKey: "2026-12-11",
        full: false,
        prework: { rw: 7, math: 0, minRw: 2, minMath: null },
        inSession: { rw: 3, math: 0, minRw: 1, minMath: null },
      },
      {
        sessionDateKey: "2026-12-18",
        full: false,
        prework: { rw: 7, math: 0, minRw: 2, minMath: null },
        inSession: { rw: 3, math: 0, minRw: 1, minMath: null },
      },
    ],
  );
  assert.equal(covered, 3);
  const pt5 = records.find((record) => record.sourceKey === "sat-pt5-math-m2-q18");
  assert.ok(pt5);
  assert.match(pt5.prompt, /4√\(2x\) = 16/);
  assert.match(pt5.officialExplanation, /√\(2x\) = 4/);
  assert.match(pt5.officialExplanation, /6x = 48/);
  assert.equal(pt5.correctAnswer.trim().toUpperCase(), "B");
  assert.doesNotMatch(pt5.officialExplanation, /yields 2x\s*=\s*4/);
});
