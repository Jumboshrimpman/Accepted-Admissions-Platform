import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dateTime: "2099-10-02T16:00:00.000Z",
  timezone: "America/New_York",
  assignments: [
    {
      id: "quiz-1",
      title: "October pre-session mini-section",
      deliveryPhase: "before_session",
      questionCount: 3,
      timeLimitMinutes: 20,
      latestScore: null,
      latestAttemptId: null as string | null,
      latestAttemptStatus: null as string | null,
    },
  ],
  blocks: [] as Array<{
    id: string;
    kind: string;
    status: string;
    visibility: string;
    position: number;
    config: {
      title?: string;
      label?: string;
      text?: string;
      html?: string;
      url?: string;
      libraryKind?: string;
      items?: string[];
    };
  }>,
  studentNotes: null as string | null,
  artifacts: [] as Array<{ id: string; kind: string; content: string }>,
  sessionPrep: null as null | {
    mode: string;
    summary: string;
    duringAssignmentId: string;
    attachedQuestionCount: number;
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetSessionQueryKey: (id: string) => ["/api/sessions", id],
  getGetAdaptiveCurriculumQueryKey: (id: string) => ["/api/adaptive", id],
  getListSessionArtifactsQueryKey: (id: string) => ["/api/artifacts", id],
  useGetCurrentUser: () => ({ data: { role: "student" } }),
  useGetSession: () => ({
    data: {
      id: "session-1",
      courseId: "course-1",
      title: "Taito SAT with Eunice",
      subject: "SAT",
      dateTime: mocks.dateTime,
      timezone: mocks.timezone,
      durationMinutes: 60,
      meetingUrl: null,
      calendarEventUrl: null,
      studentNotes: mocks.studentNotes,
      assignments: mocks.assignments,
      blocks: mocks.blocks,
      homework: [],
    },
    isLoading: false,
    error: null,
  }),
  useGetAdaptiveCurriculum: () => ({
    data: mocks.sessionPrep
      ? { sessionPrep: mocks.sessionPrep, recommendations: [], publishedBlocks: [] }
      : null,
    isLoading: false,
    isError: false,
  }),
  useListSessionArtifacts: () => ({ data: mocks.artifacts }),
  getGetSessionLessonQueryKey: (id: string) => ["/api/sessions", id, "lesson"],
  useGetSessionLesson: () => ({
    data: {
      sessionId: "session-1",
      scoreReporting: "estimated_diagnostic",
      scoreHonesty: "Estimated SAT range only. Not official adaptive scoring.",
      accuracyPercent: null,
      weaknessGroups: [],
      misses: [
        {
          questionId: "q1",
          skill: "Transitions",
          prompt: "Which transition best connects the paragraphs?",
          studentAnswer: "a",
          correctAnswer: "b",
        },
      ],
      retries: [],
    },
    isLoading: false,
  }),
  useRequestSessionRetry: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordRetryOutcome: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ courseId: "course-1", sessionId: "session-1" }),
}));

import PortalSession from "./session";

afterEach(() => {
  cleanup();
  mocks.dateTime = "2099-10-02T16:00:00.000Z";
  mocks.timezone = "America/New_York";
  mocks.assignments[0]!.title = "October pre-session mini-section";
  mocks.assignments[0]!.latestAttemptId = null;
  mocks.assignments[0]!.latestAttemptStatus = null;
  mocks.blocks = [];
  mocks.studentNotes = null;
  mocks.artifacts = [];
  mocks.sessionPrep = null;
  if (mocks.assignments.length > 1) mocks.assignments.splice(1);
});

describe("student session quiz path", () => {
  test("offers Start pre-work before the meeting and links to the assignment", () => {
    render(<PortalSession />);

    expect(screen.getByText("Complete the assigned pre-work, then review right and wrong answers with your tutor.")).toBeTruthy();
    const takeQuiz = screen.getByRole("link", { name: /Start pre-work/i });
    expect(takeQuiz.getAttribute("href")).toBe("/portal/assignments/quiz-1");
    expect(screen.getByTestId("prework-deadline-quiz-1").textContent).toMatch(
      /Due before your session: .+ ET/,
    );
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/Practice together from pre-work/);
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(
      /Open a wrong answer to review with correct explanation/,
    );
    expect(screen.queryByTestId("opened-miss")).toBeNull();
    expect(screen.getByText(/Open a miss or similar problem and work it with your tutor/)).toBeTruthy();
    expect(screen.queryByText(/has not published (this |the )?sequence/i)).toBeNull();
  });

  test("hides clean-question wording on the student session", () => {
    mocks.assignments[0]!.title =
      "SAT diagnostic (104 clean questions) — Taito’s SAT Session with Eunice";
    mocks.blocks = [
      {
        id: "goals",
        kind: "objectives",
        status: "published",
        visibility: "both",
        position: 0,
        config: {
          title: "Session goals",
          items: ["Walk the largest miss clusters from the short clean diagnostic."],
        },
      },
    ];
    render(<PortalSession />);
    expect(
      screen.getByText("SAT diagnostic (104 questions) — Taito’s SAT Session with Eunice"),
    ).toBeTruthy();
    expect(screen.getByText("Walk the largest miss clusters from the diagnostic.")).toBeTruthy();
    expect(screen.queryByText(/clean question/i)).toBeNull();
  });

  test("in-session practice link opens the quiz generated from homework results", () => {
    const original = mocks.assignments.map((item) => ({ ...item }));
    mocks.assignments.push({
      id: "generic-bank",
      title: "Hard-question bank — leftover time",
      deliveryPhase: "during_session",
      questionCount: 8,
      timeLimitMinutes: 30,
      latestScore: null,
      latestAttemptId: null,
      latestAttemptStatus: null,
    });
    mocks.sessionPrep = {
      mode: "mistake_focus",
      summary: "Homework misses were converted into similar in-session practice.",
      duringAssignmentId: "practice-from-homework",
      attachedQuestionCount: 4,
    };
    render(<PortalSession />);
    const practice = screen.getByTestId("in-session-practice-link");
    expect(practice.textContent).toMatch(/from homework results/i);
    expect(practice.querySelector("a")?.getAttribute("href")).toBe(
      "/portal/assignments/practice-from-homework",
    );
    expect(screen.queryByTestId("session-homework-generic-bank")).toBeNull();
    mocks.assignments.splice(0, mocks.assignments.length, ...original);
  });

  test("does not show the live-plan unfinished-prep note", () => {
    mocks.blocks = [
      {
        id: "prep",
        kind: "adaptive_prep",
        status: "published",
        visibility: "both",
        position: 0,
        config: {
          title: "AI-native session plan",
          items: [
            "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.",
          ],
        },
      },
    ];
    mocks.sessionPrep = {
      mode: "complete_homework_in_session",
      summary:
        "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.",
      duringAssignmentId: "during-1",
      attachedQuestionCount: 4,
    };
    render(<PortalSession />);
    expect(screen.queryByText(/unfinished prep/i)).toBeNull();
    expect(screen.queryByText(/live plan now carries/i)).toBeNull();
    expect(screen.queryByText("AI-native session plan")).toBeNull();
    expect(screen.queryByTestId("in-session-practice-link")).toBeNull();
  });

  test("in-progress pre-work shows Resume and opens the quiz with resume=1", () => {
    mocks.assignments[0]!.latestAttemptId = "attempt-1";
    mocks.assignments[0]!.latestAttemptStatus = "paused";
    render(<PortalSession />);
    const resume = screen.getByRole("link", { name: /^Resume$/i });
    expect(resume.getAttribute("href")).toBe("/portal/assignments/quiz-1?resume=1");
  });

  test("keeps Geometry SAT Questions open as follow-up after the session day", () => {
    const original = mocks.assignments.map((item) => ({ ...item }));
    mocks.dateTime = "2020-01-01T17:00:00.000Z";
    mocks.timezone = "UTC";
    mocks.assignments.splice(
      0,
      mocks.assignments.length,
      { ...original[0]!, title: "Yesterday pre-work" },
      {
        id: "geometry-quiz",
        title: "Geometry SAT Questions",
        deliveryPhase: "before_session",
        questionCount: 12,
        timeLimitMinutes: 30,
        latestScore: null,
        latestAttemptId: null,
        latestAttemptStatus: null,
      },
    );
    render(<PortalSession />);
    const past = screen.getByTestId("session-homework-quiz-1");
    expect(past.textContent).toContain("Complete");
    expect(past.textContent).toContain("Review");
    const followUp = screen.getByTestId("session-homework-geometry-quiz");
    expect(followUp.textContent).toContain("Follow-up");
    expect(followUp.textContent).toContain("Start quiz");
    expect(followUp.textContent).not.toContain("Due before");
    expect(screen.getByTestId("after-session-reports")).toBeTruthy();
    expect(screen.queryByText(/not available yet/i)).toBeNull();
    mocks.assignments.splice(0, mocks.assignments.length, ...original);
  });

  test("keeps Geometry Area and Volume open as follow-up without replacing in-session practice", () => {
    const original = mocks.assignments.map((item) => ({ ...item }));
    const prep = mocks.sessionPrep;
    mocks.dateTime = "2020-01-01T17:00:00.000Z";
    mocks.timezone = "UTC";
    mocks.sessionPrep = {
      mode: "hard_bank",
      summary: "Harder problems for leftover time",
      duringAssignmentId: "during-1",
      attachedQuestionCount: 4,
    };
    mocks.assignments.splice(
      0,
      mocks.assignments.length,
      { ...original[0]!, id: "during-1", title: "In-session practice", deliveryPhase: "during_session" },
      {
        id: "area-volume-quiz",
        title: "Geometry Area and Volume",
        deliveryPhase: "before_session",
        questionCount: 4,
        timeLimitMinutes: 30,
        latestScore: null,
        latestAttemptId: null,
        latestAttemptStatus: null,
      },
    );
    try {
      render(<PortalSession />);
      const followUp = screen.getByTestId("session-homework-area-volume-quiz");
      expect(followUp.textContent).toContain("Follow-up");
      expect(followUp.textContent).toContain("Start quiz");
      expect(followUp.textContent).not.toContain("Due before");
      const practice = screen.getByTestId("in-session-practice-link");
      expect(practice.textContent).toContain("In-session practice");
    } finally {
      mocks.assignments.splice(0, mocks.assignments.length, ...original);
      mocks.sessionPrep = prep;
    }
  });

  test("marks session homework complete after that session calendar day", () => {
    mocks.dateTime = "2020-01-01T17:00:00.000Z";
    mocks.timezone = "UTC";
    mocks.assignments[0]!.title = "Yesterday pre-work";
    render(<PortalSession />);
    const card = screen.getByTestId("session-homework-quiz-1");
    expect(card.textContent).toContain("Complete");
    expect(card.textContent).toContain("Review");
    expect(card.textContent).not.toContain("Start pre-work");
    expect(card.textContent).not.toContain("Due before");
  });
});

test("shows SAT Math, Factoring, and a downloadable Factoring Notes PDF on the session page", () => {
  const original = mocks.assignments.map((item) => ({ ...item }));
  mocks.dateTime = "2020-01-01T17:00:00.000Z";
  mocks.timezone = "UTC";
  mocks.assignments.splice(
    0,
    mocks.assignments.length,
    {
      id: "sat-math",
      title: "SAT Math Problems",
      deliveryPhase: "before_session",
      questionCount: 22,
      timeLimitMinutes: 33,
      latestScore: null,
      latestAttemptId: null,
      latestAttemptStatus: null,
    },
    {
      id: "factoring",
      title: "Factoring Quiz",
      deliveryPhase: "before_session",
      questionCount: 26,
      timeLimitMinutes: 39,
      latestScore: null,
      latestAttemptId: null,
      latestAttemptStatus: null,
    },
  );
  mocks.blocks = [
    {
      id: "factoring-notes",
      kind: "external_link",
      status: "published",
      visibility: "both",
      position: 0,
      config: {
        title: "Factoring Notes",
        label: "Factoring Notes",
        text: "Factoring notes from this session. Download the PDF and keep it open while you practice.",
        url: "/media/factoring/xavier-factoring-notes.pdf",
        libraryKind: "resource",
      },
    },
  ];
  try {
    render(<PortalSession />);
    const sat = screen.getByTestId("session-homework-sat-math");
    expect(sat.textContent).toContain("SAT Math Problems");
    expect(sat.textContent).toContain("22 questions");
    expect(sat.textContent).toContain("33 minutes");
    expect(sat.textContent).toContain("Start quiz");
    const factoring = screen.getByTestId("session-homework-factoring");
    expect(factoring.textContent).toContain("Factoring Quiz");
    expect(factoring.textContent).toContain("26 questions");
    expect(factoring.textContent).toContain("39 minutes");
    const notes = screen.getByRole("link", { name: /Download Factoring Notes/i });
    expect(notes.getAttribute("href")).toBe("/media/factoring/xavier-factoring-notes.pdf");
    expect(notes.getAttribute("download")).toBe("xavier-factoring-notes.pdf");
    expect(screen.getByTestId("after-session-reports")).toBeTruthy();
  } finally {
    mocks.assignments.splice(0, mocks.assignments.length, ...original);
    mocks.blocks = [];
  }
});

describe("after-session reports", () => {
  test("hides the after-session section when the tutor has no report", () => {
    render(<PortalSession />);

    expect(screen.queryByTestId("after-session-reports")).toBeNull();
    expect(screen.queryByText(/after the session/i)).toBeNull();
    expect(screen.queryByText(/after-session reports/i)).toBeNull();
    expect(screen.queryByText(/published session report/i)).toBeNull();
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  test("ignores transcripts and blank reports", () => {
    mocks.artifacts = [
      { id: "transcript-1", kind: "transcript", content: "Private transcript text" },
      { id: "report-blank", kind: "report", content: "   " },
    ];
    render(<PortalSession />);

    expect(screen.queryByTestId("after-session-reports")).toBeNull();
    expect(screen.queryByText(/private transcript text/i)).toBeNull();
    expect(screen.queryByText(/after the session/i)).toBeNull();
  });

  test("shows published tutor reports", () => {
    mocks.artifacts = [
      {
        id: "report-1",
        kind: "report",
        content: "Taito improved transitions and should review geometry next.",
      },
    ];
    render(<PortalSession />);

    expect(screen.getByTestId("after-session-reports")).toBeTruthy();
    expect(screen.getByText(/after the session/i)).toBeTruthy();
    expect(screen.getByTestId("after-session-report-report-1").textContent).toMatch(
      /Taito improved transitions and should review geometry next/,
    );
    expect(screen.queryByText(/not available yet/i)).toBeNull();
  });

  test("shows tutor feedback when notes exist without a report artifact", () => {
    mocks.studentNotes = "Nice work on transitions.";
    render(<PortalSession />);

    expect(screen.getByTestId("after-session-reports")).toBeTruthy();
    expect(screen.getByText(/after the session/i)).toBeTruthy();
    expect(screen.getByText(/Nice work on transitions/)).toBeTruthy();
  });
});
