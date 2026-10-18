import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  canShowClearHomework,
  hydrateMistakePrompts,
  allowsInSessionPerQuestionFeedback,
  isDuplicateSessionPrework,
  isInSessionHomeworkCompletion,
  planAssignmentIdAfterPreworkArchive,
  planAssignmentIdAfterPreworkPublish,
  homeworkWithStudentAttempt,
  selectActivePrework,
  sessionAttemptUserId,
  selectInSessionHomeworkQuestionIds,
  eligiblePlaceholderArchiveIds,
  futurePlaceholderSatHomework,
  placeholderArchiveApplyIds,
  placeholderSatHomeworkAction,
  preworkStartabilityProblem,
  selectStatusHomework,
  sessionHasBankPrework,
  shouldRepublishSeededHomework,
  wrongAnswersOnly,
} from "./session-homework.ts";

test("status homework hides archived leftovers and keeps one current diagnostic", () => {
  const listed = selectStatusHomework([
    {
      assignmentId: "archived-1",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "archived",
      homeworkKind: "diagnostic",
      questionCount: 120,
      attemptCount: 0,
    },
    {
      assignmentId: "archived-1",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "archived",
      homeworkKind: "diagnostic",
      questionCount: 120,
      attemptCount: 0,
    },
    {
      assignmentId: "archived-2",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "archived",
      homeworkKind: "diagnostic",
      questionCount: 98,
      attemptCount: 0,
    },
    {
      assignmentId: "archived-3",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "archived",
      homeworkKind: "diagnostic",
      questionCount: 120,
      attemptCount: 1,
    },
    {
      id: "live-diagnostic",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "published",
      homeworkKind: "diagnostic",
      questionCount: 120,
      attemptCount: 0,
    },
    {
      id: "empty-extra",
      title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
      status: "published",
      homeworkKind: "diagnostic",
      questionCount: 0,
      attemptCount: 0,
    },
    {
      id: "routine-prework",
      title: "October 9 mini-section",
      status: "published",
      homeworkKind: "routine",
      questionCount: 40,
      attemptCount: 0,
    },
  ]);
  assert.deepEqual(
    listed.map((item) => item.assignmentId ?? item.id),
    ["live-diagnostic", "routine-prework"],
  );
  assert.equal(
    isDuplicateSessionPrework(
      { id: "live-diagnostic", title: "Full-length SAT diagnostic", homeworkKind: "diagnostic" },
      { id: "archived-1", title: "Full-length SAT diagnostic", status: "archived" },
    ),
    false,
  );
  assert.equal(
    isDuplicateSessionPrework(
      { id: "live-diagnostic", title: "Full-length SAT diagnostic", homeworkKind: "diagnostic" },
      { id: "empty-extra", title: "Full SAT Practice Diagnostic", status: "published", questionCount: 0 },
    ),
    true,
  );
});

test("status homework collapses same-title IELTS routines to the newest complete copy", () => {
  const listed = selectStatusHomework([
    {
      id: "empty-copy",
      title: "IELTS-style reading pre-work — Taito’s English Session with Nika",
      status: "published",
      homeworkKind: "routine",
      questionCount: 0,
      attemptCount: 0,
    },
    {
      id: "complete-copy",
      title: "IELTS-style reading pre-work — Taito’s English Session with Nika",
      status: "published",
      homeworkKind: "routine",
      questionCount: 12,
      attemptCount: 0,
    },
    {
      id: "sat-grammar",
      title: "SAT Homework — Grammar and Boundaries",
      status: "published",
      homeworkKind: "routine",
      questionCount: 4,
      attemptCount: 0,
    },
  ]);
  assert.deepEqual(
    listed.map((item) => item.id),
    ["complete-copy", "sat-grammar"],
  );
});

test("plan-chosen bank SAT pre-work stays beside grammar; other bank copies collapse", () => {
  const grammar = {
    id: "grammar",
    title: "SAT Homework — Grammar and Boundaries",
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT Reading & Writing",
    homeworkKind: "routine" as const,
    questionCount: 4,
    attemptCount: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const bank = {
    id: "bank",
    title: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT",
    homeworkKind: "routine" as const,
    questionCount: 40,
    attemptCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const ielts = {
    id: "ielts",
    title: "IELTS-style reading pre-work — Taito’s English Session with Nika",
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "IELTS",
    homeworkKind: "routine" as const,
    questionCount: 12,
    attemptCount: 0,
  };
  assert.deepEqual(
    selectStatusHomework([
      { ...grammar, planAssignmentId: "bank" },
      { ...bank, planAssignmentId: "bank" },
      { ...ielts, planAssignmentId: "bank" },
    ]).map((item) => item.id),
    ["grammar", "bank", "ielts"],
  );
  assert.deepEqual(
    selectStatusHomework([grammar, bank, ielts]).map((item) => item.id),
    ["grammar", "bank", "ielts"],
  );
  assert.deepEqual(
    selectStatusHomework([
      grammar,
      { ...bank, id: "empty-bank", questionCount: 0 },
      ielts,
    ]).map((item) => item.id),
    ["grammar", "ielts"],
  );
  assert.equal(
    isDuplicateSessionPrework(
      {
        id: "grammar",
        title: "SAT Homework — Grammar and Boundaries",
        status: "published",
        subject: "SAT Reading & Writing",
      },
      {
        id: "bank",
        title: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
        status: "published",
        subject: "SAT",
        questionCount: 40,
      },
    ),
    false,
  );
});

test("Taito sees the Oct 9 plan bank pre-work beside one Grammar set, and each other session keeps its own bank pre-work", () => {
  const planId = "3483abbd-e1e0-410f-8e38-e88940444ef7";
  const bankTitle = "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice";
  const grammarTitle = "SAT Homework — Grammar and Boundaries";
  const otherTopics = [
    ["2026-10-16", "SAT Homework — Evidence and Inference"],
    ["2026-10-30", "SAT Homework — Transitions and Purpose"],
    ["2026-11-06", "SAT Homework — Sentence Structure Check"],
    ["2026-11-20", "SAT Homework — Main Ideas and Evidence"],
    ["2026-11-27", "SAT Homework — Words in Context"],
    ["2026-12-11", "SAT Homework — Rhetorical Synthesis"],
  ] as const;

  const grammar = (
    id: string,
    createdAt: string,
    planAssignmentId: string,
  ) => ({
    id,
    sessionId: "2026-10-09",
    title: grammarTitle,
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT Reading & Writing",
    homeworkKind: "routine" as const,
    questionCount: 4,
    attemptCount: 1,
    createdAt,
    planAssignmentId,
  });
  const bank = (
    id: string,
    sessionId: string,
    createdAt: string,
    planAssignmentId: string | null,
  ) => ({
    id,
    sessionId,
    title: bankTitle,
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT",
    homeworkKind: "routine" as const,
    questionCount: 40,
    attemptCount: 0,
    createdAt,
    planAssignmentId,
  });

  const oct9 = [
    grammar("zzzz-gb-older", "2026-09-01T00:00:00.000Z", planId),
    grammar("gb-newer", "2026-09-20T00:00:00.000Z", planId),
    bank(planId, "2026-10-09", "2026-10-02T00:00:00.000Z", planId),
  ];
  const otherSessions = otherTopics.map(([sessionId, title], index) => {
    const topicId = `topic-${sessionId}`;
    return [
      {
        id: topicId,
        sessionId,
        title,
        status: "published" as const,
        deliveryPhase: "before_session" as const,
        subject: "SAT Reading & Writing",
        homeworkKind: "routine" as const,
        questionCount: 4,
        attemptCount: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        planAssignmentId: topicId,
      },
      bank(
        `zzzz-bank-extra-${index}`,
        sessionId,
        "2026-10-08T00:00:00.000Z",
        topicId,
      ),
    ];
  });
  const bySession = [oct9, ...otherSessions];
  assert.equal(
    bySession.flat().filter((row) => row.title === bankTitle).length,
    7,
  );
  assert.equal(
    bySession.flat().filter((row) => row.title === grammarTitle).length,
    2,
  );

  const listed = bySession.flatMap((group) => selectStatusHomework(group));
  const oct9Listed = listed.filter((row) => row.sessionId === "2026-10-09").map((row) => row.id);
  assert.deepEqual(oct9Listed.sort(), [planId, "gb-newer"].sort());
  const extraIds = otherTopics.map((_, index) => `zzzz-bank-extra-${index}`);
  assert.deepEqual(
    listed.filter((row) => extraIds.includes(row.id)).map((row) => row.id),
    extraIds,
  );
  otherTopics.forEach(([sessionId], index) => {
    assert.deepEqual(
      listed.filter((row) => row.sessionId === sessionId).map((row) => row.id),
      [`topic-${sessionId}`, `zzzz-bank-extra-${index}`],
    );
  });

  const piledOnOct9 = [
    ...otherTopics.map((_, index) =>
      bank(`zzzz-bank-extra-${index}`, "2026-10-09", "2026-10-08T00:00:00.000Z", planId),
    ),
    ...oct9,
    ...otherTopics.map(([sessionId, title]) => ({
      id: `topic-${sessionId}`,
      sessionId: "2026-10-09",
      title,
      status: "published" as const,
      deliveryPhase: "before_session" as const,
      subject: "SAT Reading & Writing",
      homeworkKind: "routine" as const,
      questionCount: 4,
      attemptCount: 0,
      createdAt: "2026-09-01T00:00:00.000Z",
      planAssignmentId: planId,
    })),
  ];
  assert.deepEqual(
    selectStatusHomework(piledOnOct9).map((row) => row.id).sort(),
    [planId, "gb-newer"].sort(),
  );
});

test("Oct 16 session 37062b4f lists the untouched bank pre-work beside submitted homework for every plan pointer", () => {
  const sessionId = "37062b4f";
  const preworkId = "910009f3";
  const homeworkId = "f00b3046";
  const homework = (planAssignmentId: string | null) => ({
    id: homeworkId,
    sessionId,
    title: "SAT Homework — Evidence and Inference",
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT Reading & Writing",
    homeworkKind: "routine" as const,
    questionCount: 4,
    attemptCount: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    planAssignmentId,
  });
  const prework = (planAssignmentId: string | null) => ({
    id: preworkId,
    sessionId,
    title: "SAT pre-work (30–50 q)",
    status: "published" as const,
    deliveryPhase: "before_session" as const,
    subject: "SAT",
    homeworkKind: "routine" as const,
    questionCount: 40,
    attemptCount: 0,
    createdAt: "2026-10-15T00:00:00.000Z",
    planAssignmentId,
  });
  // Student assignments, admin client preview, and the session page all list
  // through selectStatusHomework (preview uses the client's student role).
  for (const planAssignmentId of [null, homeworkId, preworkId]) {
    const ids = selectStatusHomework([
      homework(planAssignmentId),
      prework(planAssignmentId),
    ]).map((item) => item.id);
    assert.ok(ids.includes(preworkId), `pre-work hidden when plan is ${planAssignmentId}`);
    assert.ok(ids.includes(homeworkId), `homework hidden when plan is ${planAssignmentId}`);
  }
  assert.deepEqual(
    selectStatusHomework([
      homework(homeworkId),
      { ...prework(homeworkId), questionCount: 0 },
    ]).map((item) => item.id),
    [homeworkId],
  );
  const sameKind = selectStatusHomework([
    homework(preworkId),
    prework(preworkId),
    {
      id: "bank-copy",
      sessionId,
      title: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
      status: "published" as const,
      deliveryPhase: "before_session" as const,
      subject: "SAT",
      homeworkKind: "routine" as const,
      questionCount: 40,
      attemptCount: 0,
      planAssignmentId: preworkId,
    },
  ]).map((item) => item.id);
  assert.deepEqual(sameKind, [homeworkId, preworkId]);
});

test("student list, admin preview, and the session page share selectStatusHomework", () => {
  const source = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  assert.match(source, /const assignments = selectStatusHomework\(listedAssignments\)/);
  assert.match(source, /return \[\.\.\.bySession\.values\(\)\]\.flatMap\(\(group\) => selectStatusHomework\(group\)\)/);
  assert.match(source, /const assignmentSummaries = await listAssignmentsForUser\(user\)/);
  assert.match(source, /const dashboard = await dashboardDataForUser\(client\)/);
  const studentFacing = source.slice(
    source.indexOf("const studentFacing = user.role === \"student\" || user.role === \"viewer\""),
    source.indexOf("async function ensureDuringSessionAssignment"),
  );
  assert.match(studentFacing, /if \(!studentFacing\) return listed/);
  assert.match(studentFacing, /selectStatusHomework\(group\)/);
});

test("publishing or archiving session work does not point the plan at topic homework", () => {
  const sync = readFileSync(new URL("./sat-bank-service.ts", import.meta.url), "utf8");
  assert.match(sync, /planAssignmentIdAfterPreworkPublish\(/);
  assert.match(sync, /planAssignmentIdAfterPreworkArchive\(/);
  assert.match(sync, /sessionPreworkDedupeSlot\(row\.title\) !== "sat-topic-homework"/);
  assert.deepEqual(
    planAssignmentIdAfterPreworkPublish({
      publishedId: "f00b3046",
      publishedTitle: "SAT Homework — Evidence and Inference",
      existingPlanAssignmentId: "910009f3",
    }),
    { assignmentId: "910009f3", retarget: false },
  );
  assert.deepEqual(
    planAssignmentIdAfterPreworkPublish({
      publishedId: "f00b3046",
      publishedTitle: "SAT Homework — Evidence and Inference",
      existingPlanAssignmentId: null,
    }),
    { assignmentId: null, retarget: false },
  );
  assert.deepEqual(
    planAssignmentIdAfterPreworkPublish({
      publishedId: "910009f3",
      publishedTitle: "SAT pre-work (30–50 q)",
      existingPlanAssignmentId: "f00b3046",
    }),
    { assignmentId: "910009f3", retarget: true },
  );
  assert.equal(
    planAssignmentIdAfterPreworkArchive({
      archivedId: "910009f3",
      currentPlanAssignmentId: "910009f3",
      nextLive: { id: "f00b3046", title: "SAT Homework — Evidence and Inference" },
    }),
    "910009f3",
  );
  assert.equal(
    planAssignmentIdAfterPreworkArchive({
      archivedId: "old-bank",
      currentPlanAssignmentId: "old-bank",
      nextLive: { id: "910009f3", title: "SAT pre-work (30–50 q)" },
    }),
    "910009f3",
  );
  assert.equal(
    planAssignmentIdAfterPreworkArchive({
      archivedId: "910009f3",
      currentPlanAssignmentId: "other",
      nextLive: { id: "f00b3046", title: "SAT Homework — Evidence and Inference" },
    }),
    "other",
  );
});

test("boot seed does not republish intentionally archived SAT homework", () => {
  const source = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const prep = readFileSync(new URL("./session-curriculum-prep.ts", import.meta.url), "utf8");
  const followUp = readFileSync(new URL("./michelle-xavier-session-follow-up.ts", import.meta.url), "utf8");
  assert.match(source, /shouldRepublishSeededHomework\(assignment\.status\)/);
  assert.match(prep, /if \(!shouldRepublishSeededHomework\(assignment\?\.status\)\) return 0/);
  assert.match(prep, /ne\(assignmentsTable\.status, "archived"\)/);
  const assignQuiz = followUp.slice(
    followUp.indexOf("async function assignQuiz"),
    followUp.indexOf("async function clearNotesFromOtherSessions"),
  );
  const archivedAt = assignQuiz.indexOf("shouldRepublishSeededHomework(already.assignment.status)");
  const timeLimitAt = assignQuiz.indexOf("ensureTimeLimit(already.assignment.id");
  assert.ok(archivedAt > 0);
  assert.ok(timeLimitAt > archivedAt);
  const seed = source.slice(
    source.indexOf("async function ensureSatAssessmentSeed"),
    source.indexOf("async function ensureSeedData"),
  );
  assert.doesNotMatch(seed, /for \(const homework of SAT_HOMEWORK_SETS\)/);
  assert.doesNotMatch(seed, /await ensureAssignment\(/);
  assert.match(source, /placeholder-sat-homework/);
  assert.match(source, /dryRun !== false/);
  assert.doesNotMatch(
    source.slice(source.indexOf('"/admin/placeholder-sat-homework"'), source.indexOf('"/admin/placeholder-sat-homework"') + 2200),
    /sendMail|resend|nodemailer|clerk/i,
  );
  assert.equal(shouldRepublishSeededHomework("archived"), false);
  assert.equal(shouldRepublishSeededHomework("published"), true);
  assert.equal(shouldRepublishSeededHomework("draft"), true);
  assert.equal(shouldRepublishSeededHomework(null), true);
});

test("bank pre-work stops a new generic SAT Homework attachment and leaves an existing one", () => {
  const bank = {
    title: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
    status: "published",
    questionCount: 40,
  };
  assert.equal(sessionHasBankPrework([bank]), true);
  assert.equal(sessionHasBankPrework([{ ...bank, questionCount: 0 }]), false);
  assert.equal(sessionHasBankPrework([{ ...bank, status: "archived" }]), false);
  assert.equal(
    placeholderSatHomeworkAction({ hasBankPrework: true, placeholderExists: false }),
    "skip-new",
  );
  assert.equal(
    placeholderSatHomeworkAction({ hasBankPrework: true, placeholderExists: true }),
    "leave-existing",
  );
  assert.equal(
    placeholderSatHomeworkAction({ hasBankPrework: false, placeholderExists: false }),
    "skip-new",
  );
  const future = futurePlaceholderSatHomework(
    [
      {
        dateKey: "2026-10-16",
        placeholderTitle: "SAT Homework — Evidence and Inference",
        placeholderStatus: "published",
        questionCount: 4,
      },
      {
        dateKey: "2026-10-30",
        placeholderTitle: "SAT Homework — Transitions and Purpose",
        placeholderStatus: "published",
        questionCount: 4,
      },
      {
        dateKey: "2026-11-06",
        placeholderTitle: "SAT Homework — Sentence Structure Check",
        placeholderStatus: "published",
        questionCount: 2,
      },
      {
        dateKey: "2026-11-20",
        placeholderTitle: "SAT Homework — Main Ideas and Evidence",
        placeholderStatus: "published",
        questionCount: 2,
      },
      {
        dateKey: "2026-11-27",
        placeholderTitle: "SAT Homework — Words in Context",
        placeholderStatus: "published",
        questionCount: 2,
      },
      {
        dateKey: "2026-12-11",
        placeholderTitle: "SAT Homework — Rhetorical Synthesis",
        placeholderStatus: "published",
        questionCount: 2,
      },
      {
        dateKey: "2026-12-18",
        placeholderTitle: "SAT Homework — Fall Mixed Review",
        placeholderStatus: "published",
        questionCount: 2,
      },
      {
        dateKey: "2026-12-18",
        placeholderTitle: "SAT Homework — Fall Mixed Review",
        placeholderStatus: "archived",
        questionCount: 2,
      },
    ],
    "2026-10-16",
  );
  assert.deepEqual(
    future.map((session) => `${session.dateKey} ${session.placeholderTitle} (${session.questionCount})`),
    [
      "2026-10-30 SAT Homework — Transitions and Purpose (4)",
      "2026-11-06 SAT Homework — Sentence Structure Check (2)",
      "2026-11-20 SAT Homework — Main Ideas and Evidence (2)",
      "2026-11-27 SAT Homework — Words in Context (2)",
      "2026-12-11 SAT Homework — Rhetorical Synthesis (2)",
      "2026-12-18 SAT Homework — Fall Mixed Review (2)",
    ],
  );
});

test("admin archive accepts only unattempted Oct 30+ placeholder ids", () => {
  const titles = new Set([
    "SAT Homework — Transitions and Purpose",
    "SAT Homework — Evidence and Inference",
  ]);
  const rows = [
    {
      id: "oct-16",
      title: "SAT Homework — Evidence and Inference",
      status: "published",
      questionCount: 4,
      attemptCount: 0,
      sessionDateKey: "2026-10-16",
    },
    {
      id: "oct-30",
      title: "SAT Homework — Transitions and Purpose",
      status: "published",
      questionCount: 4,
      attemptCount: 0,
      sessionDateKey: "2026-10-30",
    },
    {
      id: "attempted",
      title: "SAT Homework — Transitions and Purpose",
      status: "published",
      questionCount: 4,
      attemptCount: 1,
      sessionDateKey: "2026-11-06",
    },
    {
      id: "archived",
      title: "SAT Homework — Transitions and Purpose",
      status: "archived",
      questionCount: 4,
      attemptCount: 0,
      sessionDateKey: "2026-11-20",
    },
    {
      id: "bank",
      title: "SAT pre-work (30–50 questions) — Taito",
      status: "published",
      questionCount: 40,
      attemptCount: 0,
      sessionDateKey: "2026-10-30",
    },
  ];
  assert.deepEqual(eligiblePlaceholderArchiveIds(rows, "2026-10-30", titles), ["oct-30"]);
  assert.deepEqual(
    placeholderArchiveApplyIds({ candidates: rows, requestedIds: ["oct-30"], allowedTitles: titles }),
    { ok: true, archiveIds: ["oct-30"] },
  );
  const rejected = placeholderArchiveApplyIds({
    candidates: rows,
    requestedIds: ["oct-30", "oct-16"],
    allowedTitles: titles,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.deepEqual(rejected.rejectedIds, ["oct-16"]);
  assert.equal(
    preworkStartabilityProblem([
      {
        id: "empty",
        title: "IELTS-style diagnostic reading",
        status: "published",
        deliveryPhase: "before_session",
        questionCount: 0,
      },
    ]),
    "The listed pre-work has no questions, so it cannot be started.",
  );
  assert.equal(
    preworkStartabilityProblem([
      {
        id: "empty",
        title: "IELTS-style diagnostic reading",
        status: "published",
        deliveryPhase: "before_session",
        questionCount: 0,
      },
      {
        id: "english-24",
        title: "IELTS-style diagnostic reading",
        status: "published",
        deliveryPhase: "before_session",
        questionCount: 24,
      },
    ]),
    null,
  );
  assert.match(
    preworkStartabilityProblem([
      {
        id: "draft",
        title: "SAT Homework — Transitions and Purpose",
        status: "draft",
        deliveryPhase: "before_session",
        questionCount: 4,
      },
    ]) ?? "",
    /No published before-session pre-work/,
  );
  const visibility = readFileSync(new URL("./prework-visibility.ts", import.meta.url), "utf8");
  const prep = readFileSync(new URL("./session-curriculum-prep.ts", import.meta.url), "utf8");
  assert.match(visibility, /prework_not_startable/);
  assert.doesNotMatch(visibility, /sendMail|resend|nodemailer|@clerk/i);
  assert.match(prep, /raisePreworkVisibilityAlertForSession\(session\)/);
  const adaptiveGet = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const getStart = adaptiveGet.indexOf('router.get(\n  "/sessions/:sessionId/adaptive-curriculum"');
  const getEnd = adaptiveGet.indexOf('router.post(\n  "/sessions/:sessionId/adaptive-curriculum"');
  assert.ok(getStart > 0 && getEnd > getStart);
  assert.doesNotMatch(adaptiveGet.slice(getStart, getEnd), /raisePreworkVisibilityAlert/);
});

test("duplicate routine SAT pre-work collapses to the copy with attempts", () => {
  const untouched = {
    id: "bank-untouched",
    title: "SAT pre-work (30–50 questions) — Taito’s SAT Session with Eunice",
    status: "published",
    deliveryPhase: "before_session",
    subject: "SAT",
    homeworkKind: "routine" as const,
    questionCount: 40,
    attemptCount: 0,
  };
  const started = {
    id: "bank-started",
    title: "60-minute SAT pre-work — Taito’s SAT Session with Eunice",
    status: "published",
    deliveryPhase: "before_session",
    subject: "SAT",
    homeworkKind: "routine" as const,
    questionCount: 32,
    attemptCount: 1,
  };
  assert.equal(isDuplicateSessionPrework(untouched, started), true);
  assert.deepEqual(
    selectStatusHomework([untouched, started]).map((item) => item.id),
    ["bank-started"],
  );
  assert.deepEqual(
    selectStatusHomework([started, untouched]).map((item) => item.id),
    ["bank-started"],
  );
});

test("selectActivePrework prefers the questioned set over an empty shell", () => {
  const empty = {
    id: "empty-shell",
    title: "IELTS-style diagnostic reading — Oct 23",
    deliveryPhase: "before_session" as const,
    status: "published",
    questionCount: 0,
    planAssignmentId: "english-24",
  };
  const diagnostic = {
    id: "english-24",
    title: "IELTS-style diagnostic reading — Oct 23",
    deliveryPhase: "before_session" as const,
    status: "published",
    questionCount: 24,
    planAssignmentId: "english-24",
  };
  assert.equal(selectActivePrework([empty, diagnostic])?.id, "english-24");
  assert.equal(selectActivePrework([diagnostic, empty])?.questionCount, 24);
});

test("selectActivePrework prefers a submitted copy over an unattempted plan replacement", () => {
  const submitted = {
    id: "41444e0a-submitted",
    title: "Hard math — 40 questions",
    deliveryPhase: "before_session" as const,
    status: "published",
    questionCount: 40,
    planAssignmentId: "replacement-plan",
    latestAttemptStatus: "submitted" as const,
  };
  const replacement = {
    id: "replacement-plan",
    title: "Hard math — 40 questions",
    deliveryPhase: "before_session" as const,
    status: "published",
    questionCount: 40,
    planAssignmentId: "replacement-plan",
    latestAttemptStatus: null,
  };
  assert.equal(selectActivePrework([replacement, submitted])?.id, "41444e0a-submitted");
  assert.equal(selectActivePrework([submitted, replacement])?.id, "41444e0a-submitted");
  assert.equal(
    selectActivePrework([{ ...replacement, latestAttemptStatus: "submitted" }, submitted])?.id,
    "replacement-plan",
  );
  assert.equal(
    selectActivePrework([
      { ...submitted, latestAttemptStatus: undefined },
      { ...replacement, latestAttemptStatus: undefined },
    ])?.id,
    "replacement-plan",
  );
});

test("session attempt lookup uses the student on a staff session page", () => {
  assert.equal(
    sessionAttemptUserId({
      role: "tutor",
      viewerUserId: "tutor-xavier",
      sessionClientUserId: "student-michelle",
      sessionScoped: true,
    }),
    "student-michelle",
  );
  assert.equal(
    sessionAttemptUserId({
      role: "administrator",
      viewerUserId: "admin-user",
      sessionClientUserId: "student-michelle",
      sessionScoped: true,
    }),
    "student-michelle",
  );
  assert.equal(
    sessionAttemptUserId({
      role: "tutor",
      viewerUserId: "tutor-xavier",
      sessionClientUserId: "student-michelle",
      sessionScoped: false,
    }),
    "tutor-xavier",
  );
  assert.equal(
    sessionAttemptUserId({
      role: "student",
      viewerUserId: "student-michelle",
      sessionClientUserId: "student-michelle",
      sessionScoped: true,
    }),
    "student-michelle",
  );
  const blankViewerHomework = {
    id: "41444e0a-submitted",
    latestAttemptId: null,
    latestAttemptStatus: null,
    latestScore: null,
  };
  assert.deepEqual(
    homeworkWithStudentAttempt(blankViewerHomework, {
      id: "attempt-michelle",
      status: "submitted",
      score: 13,
    }),
    {
      id: "41444e0a-submitted",
      latestAttemptId: "attempt-michelle",
      latestAttemptStatus: "submitted",
      latestScore: 13,
    },
  );
});

test("selectActivePrework ignores archived session copies left by replace/remove", () => {
  const archived = {
    id: "old-clone",
    deliveryPhase: "before_session" as const,
    status: "archived",
  };
  const live = {
    id: "new-clone",
    deliveryPhase: "before_session" as const,
    status: "published",
  };
  const during = {
    id: "during",
    deliveryPhase: "during_session" as const,
    status: "draft",
  };
  assert.equal(selectActivePrework([archived, during, live])?.id, "new-clone");
  assert.equal(selectActivePrework([archived, during]), null);
  assert.equal(
    selectActivePrework([
      {
        id: "area-volume",
        title: "Geometry Area and Volume",
        deliveryPhase: "before_session",
        status: "published",
      },
      live,
    ])?.id,
    "new-clone",
  );
});

test("canShowClearHomework is for live before-session and in-session attempts, including empty ones", () => {
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "before_session",
      assignmentStatus: "published",
      attemptId: "attempt-1",
    }),
    true,
  );
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "during_session",
      assignmentStatus: "published",
      attemptId: "attempt-1",
    }),
    true,
  );
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "before_session",
      assignmentStatus: "archived",
      attemptId: "attempt-1",
    }),
    false,
  );
  assert.equal(
    canShowClearHomework({
      deliveryPhase: "before_session",
      assignmentStatus: "published",
      attemptId: null,
    }),
    false,
  );
});

test("wrongAnswersOnly returns misses from a homework attempt", () => {
  const items = [
    { questionId: "q1", correct: true, skill: "Evidence" },
    { questionId: "q2", correct: false, skill: "Transitions" },
    { questionId: "q3", correct: false, skill: "Algebra" },
  ];
  assert.deepEqual(
    wrongAnswersOnly(items).map((item) => item.questionId),
    ["q2", "q3"],
  );
});

test("incomplete homework copied into the session is capped at 15 and prefers unanswered items", () => {
  const source = Array.from({ length: 20 }, (_, index) => `q${index + 1}`);
  const selected = selectInSessionHomeworkQuestionIds(source, {
    unansweredIds: ["q18", "q19", "q20", "q5"],
    alreadyAttachedIds: ["q18"],
  });
  assert.equal(selected.length, 14);
  assert.equal(selected.length + 1, 15);
  assert.deepEqual(selected.slice(0, 3), ["q5", "q19", "q20"]);
  assert.ok(!selected.includes("q18"));
  assert.ok(isInSessionHomeworkCompletion({
    deliveryPhase: "during_session",
    title: "In-session homework completion",
  }));
  assert.equal(
    isInSessionHomeworkCompletion({
      deliveryPhase: "during_session",
      title: "Hard-question bank — leftover time",
    }),
    false,
  );
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "during_session" }), true);
  assert.equal(allowsInSessionPerQuestionFeedback({ deliveryPhase: "before_session" }), false);
});

test("hydrateMistakePrompts fills empty prompts from the question bank so review focus is not hidden", () => {
  const hydrated = hydrateMistakePrompts(
    [
      { questionId: "q1", skill: "Transitions", prompt: "" },
      { questionId: "q2", skill: "Evidence", prompt: "Which claim is supported?" },
    ],
    new Map([["q1", "Which transition best connects the paragraphs?"]]),
  );
  assert.equal(hydrated[0]?.prompt, "Which transition best connects the paragraphs?");
  assert.equal(hydrated[1]?.prompt, "Which claim is supported?");
});
