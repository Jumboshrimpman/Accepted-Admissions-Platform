import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  canShowClearHomework,
  hydrateMistakePrompts,
  allowsInSessionPerQuestionFeedback,
  isDuplicateSessionPrework,
  isInSessionHomeworkCompletion,
  selectActivePrework,
  selectInSessionHomeworkQuestionIds,
  selectStatusHomework,
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
    ["grammar", "ielts", "bank"],
  );
  assert.deepEqual(
    selectStatusHomework([grammar, bank, ielts]).map((item) => item.id),
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

test("Taito sees the Oct 9 plan bank pre-work beside one Grammar set, and no extra bank copies", () => {
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
    [],
  );
  for (const [sessionId] of otherTopics) {
    assert.deepEqual(
      listed.filter((row) => row.sessionId === sessionId).map((row) => row.id),
      [`topic-${sessionId}`],
    );
  }

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
