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
  SAT_DIFFICULTY_SETTINGS,
  isHardSatBankItem,
  hardSatStudentFacing,
  isDeveloperSeededSatItem,
  isRenderableHardSatItem,
  planHardSatSessionSets,
  satDifficultyForStudent,
  selectHardSatQuestions,
  shouldRefreshUnattemptedHardPrework,
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

test("hard selection stays on module 2 tails, skips repeats, and prefers unseen tests", () => {
  const items = [4, 5, 6].flatMap((testNumber) => [
    candidate(testNumber, "rw", 14),
    candidate(testNumber, "rw", 15),
    candidate(testNumber, "rw", 16),
    candidate(testNumber, "math", 17),
    candidate(testNumber, "math", 18),
    candidate(testNumber, "math", 19),
    { ...candidate(testNumber, "rw", 20), module: 1 },
  ]);
  assert.equal(isHardSatBankItem(candidate(5, "rw", 14)), false);
  assert.equal(isHardSatBankItem(candidate(5, "math", 17)), false);
  assert.equal(isHardSatBankItem({ ...candidate(5, "rw", 20), module: 1 }), false);
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
      "sat-pt5-rw-m2-q16",
      "sat-pt5-math-m2-q18",
      "sat-pt5-math-m2-q19",
      "sat-pt6-rw-m2-q15",
    ],
  );
  const backfill = selectHardSatQuestions(items, {
    targetCount: 4,
    minCount: 4,
    maxCount: 4,
    seenPracticeTests: new Set([5, 6]),
  });
  assert.equal(backfill[0]?.practiceTestNumber, 4);
  assert.equal(backfill.length, 4);
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
    true,
  );
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
  assert.match(prep, /ensureHardSatSessionSets/);
  assert.match(prep, /inSessionStatus === "attempted"/);
  const leftover = prep.slice(
    prep.indexOf("async function attachHardBank"),
    prep.indexOf("export type SessionPrepResult"),
  );
  assert.match(leftover, /fillUnattemptedOfficialHardInSession/);
  assert.doesNotMatch(leftover, /sourceType/);
  assert.doesNotMatch(leftover, /difficulty", "hard"/);
  const route = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  assert.match(route, /ensureHardSatSessionSets\(session, req\.appUser\?\.id/);
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
    isRenderableHardSatItem({
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
  );
  const sets = planHardSatSessionSets(hardPool, {
    excludeSourceKeys: seenKeys,
    seenPracticeTests: seenTests,
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
  assert.ok(preworkIds.length >= 30 && preworkIds.length <= 50, `prework ${preworkIds.length}`);
  assert.ok(inSessionIds.length >= 1 && inSessionIds.length <= 15);
  assert.equal(new Set([...preworkIds, ...inSessionIds]).size, preworkIds.length + inSessionIds.length);
  for (const sourceKey of [...preworkIds, ...inSessionIds]) {
    assert.equal(seenKeys.has(sourceKey), false, sourceKey);
    const record = recordByKey.get(sourceKey);
    assert.ok(record, sourceKey);
    assert.equal(record.module, 2, sourceKey);
    if (record.section === "rw") assert.ok(record.questionNumber >= 15, sourceKey);
    if (record.section === "math") assert.ok(record.questionNumber >= 18, sourceKey);
    assert.equal(
      ["sat-pt4-math-m2-q18", "sat-pt4-math-m2-q19", "sat-pt4-math-m2-q24"].includes(sourceKey),
      false,
      sourceKey,
    );
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
    return facing ? [facing] : [];
  });
  assert.equal(canAssignCleanStudentQuizSet(preworkFacing), true);
  assert.equal(sets.preworkTimeLimitMinutes, routinePreworkTimeLimitMinutes(preworkIds.length));
  assert.equal(sets.inSessionTimeLimitMinutes, 30);
});
