import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const clearHomework = vi.fn();
const currentUserState = { id: "tutor-eunice", role: "tutor" };
const sessionState = { dateTime: "2026-10-02T16:00:00.000Z" };
const homeworkState = {
  title: "October pre-session mini-section",
  questionCount: 3,
  latestAttemptStatus: "submitted" as string | null,
  latestAttemptId: "attempt-1" as string | null,
  deadline: null as string | null,
  deliveryPhase: "before_session" as const,
};
const sessionPageState = {
  cleanIelts: false,
};

const assignmentQueries: Record<
  string,
  {
    isLoading?: boolean;
    data?: {
      id: string;
      title: string;
      questions: Array<{ id: string; prompt: string; questionType: string }>;
    } | null;
  }
> = {};

const adaptiveLists = {
  mistakes: [{ skill: "Transitions" }] as Array<{ skill: string; prompt?: string }>,
  recommendations: [] as Array<{ id: string; status: string; skill: string; reason: string }>,
  hardQuestions: [] as Array<{ id: string; skill: string; prompt: string }>,
};

const adaptiveState: {
  sessionPrep: null | {
    mode: string;
    summary: string;
    duringAssignmentId: string | null;
    attachedQuestionCount: number;
    needsQuestions?: boolean;
  };
} = {
  sessionPrep: {
    mode: "mistake_focus",
    summary: "Open with the missed transition item.",
    duringAssignmentId: "practice-from-homework",
    attachedQuestionCount: 3,
  },
};

vi.mock("@workspace/api-client-react", () => ({
  getGetSessionQueryKey: (id: string) => ["/api/sessions", id],
  getGetAdaptiveCurriculumQueryKey: (id: string) => ["/api/adaptive", id],
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  getListSessionArtifactsQueryKey: (id: string) => ["/api/artifacts", id],
  useGetCurrentUser: () => ({ data: { id: currentUserState.id, role: currentUserState.role } }),
  customFetch: (...args: unknown[]) => clearHomework(...args),
  useGetSession: () => ({
    data: {
      id: "session-1",
      courseId: "course-1",
      status: "published",
      dateTime: sessionState.dateTime,
      timezone: "America/New_York",
      durationMinutes: 60,
      meetingUrl: "https://meet.google.com/sat-room",
      calendarEventUrl: null,
      student: { id: "student-1", name: "Taito Goto" },
      tutor: { id: "tutor-eunice", name: "Eunice Chon", specialty: "Assigned tutor", avatarUrl: null },
      tutorNotes: sessionPageState.cleanIelts
        ? "Vocab notebook: five words from diagnostic misses. Ask which of the four diagnostic passages hurt most."
        : null,
      subject: sessionPageState.cleanIelts ? "IELTS" : "SAT",
      title: sessionPageState.cleanIelts
        ? "Taito’s English Session with Nika"
        : "Taito SAT with Eunice",
      assignments: sessionPageState.cleanIelts
        ? [
            {
              id: "quiz-ielts",
              deliveryPhase: "before_session",
              title: "IELTS-style diagnostic reading",
              questionCount: 24,
            },
            {
              id: "during-1",
              deliveryPhase: "during_session",
              title: "In-session practice",
              questionCount: 18,
            },
          ]
        : [
            {
              id: "quiz-1",
              deliveryPhase: "before_session",
              title: "October pre-session mini-section",
            },
          ],
      blocks: [],
      homework: sessionPageState.cleanIelts
        ? [
            {
              assignmentId: "quiz-ielts",
              title: "IELTS-style diagnostic reading — Taito’s English Session with Nika",
              status: "published",
              deadline: null,
              attemptStatus: "submitted",
              score: 100,
              mistakeCount: 0,
              attemptId: "attempt-ielts",
              analysis: {
                label: "Accuracy summary",
                feedback: "You handled this set cleanly.",
                sessionOpener:
                  "Homework is clean. Skip miss review and use leftover time on harder bank items.",
                strengths: ["Detail (100% · 11/11)"],
                weaknesses: [
                  "No repeated missed skill yet. Keep building from the published session plan.",
                ],
                nextFocus: [
                  "Practice No major weakness identified in this set. next — those misses are the fastest way to raise this set.",
                ],
                skipRehash: [
                  "Detail (100% · 11/11)",
                  "Main idea (100% · 4/4)",
                  "Inference (100% · 4/4)",
                  "Writer's views (100% · 3/3)",
                  "Vocabulary in context (100% · 2/2)",
                ],
                sectionBreakdown: [
                  {
                    section: "other",
                    label: "IELTS Reading",
                    accuracy: 100,
                    correct: 24,
                    total: 24,
                    missCount: 0,
                  },
                ],
                missClusters: [],
              },
            },
          ]
        : [
        {
          assignmentId: "quiz-archived-1",
          title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
          status: "archived",
          deadline: null,
          attemptStatus: null,
          score: null,
          mistakeCount: 0,
          attemptId: null,
          analysis: null,
        },
        {
          assignmentId: "quiz-archived-2",
          title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
          status: "archived",
          deadline: null,
          attemptStatus: null,
          score: null,
          mistakeCount: 0,
          attemptId: null,
          analysis: null,
        },
        {
          assignmentId: "quiz-archived-3",
          title: "Full-length SAT diagnostic — Taito’s SAT Session with Eunice",
          status: "archived",
          deadline: null,
          attemptStatus: null,
          score: null,
          mistakeCount: 0,
          attemptId: null,
          analysis: null,
        },
        {
          assignmentId: "quiz-1",
          title: "October pre-session mini-section",
          status: "published",
          deadline: null,
          attemptStatus: "submitted",
          score: 80,
          mistakeCount: 1,
          attemptId: "attempt-1",
          studentResolvedAt: "2026-10-25T12:00:00.000Z",
          analysis: {
            label: "Ready to review",
            strengths: ["Evidence"],
            weaknesses: ["Transitions"],
            nextFocus: ["Transitions"],
          },
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useListSessionArtifacts: () => ({ data: [] }),
  useGetAssignment: (id: string) => assignmentQueries[id] ?? { data: null },
  useGetAdaptiveCurriculum: () => ({
    data: {
      homework: homeworkState,
      mistakes: adaptiveLists.mistakes,
      recommendations: adaptiveLists.recommendations,
      hardQuestions: adaptiveLists.hardQuestions,
      publishedBlocks: [],
      sessionPrep: adaptiveState.sessionPrep,
    },
  }),
  useCreateCurriculumBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCurriculumBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useUpsertSessionArtifact: () => ({ mutate: vi.fn(), isPending: false }),
  useRefreshAdaptiveCurriculum: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdaptiveRecommendation: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachQuestionToAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAssignmentQuestion: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveQuestionFromAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  getGetSessionLessonQueryKey: (id: string) => ["/api/sessions", id, "lesson"],
  useGetSessionLesson: () => ({
    data: sessionPageState.cleanIelts
      ? {
          sessionId: "session-1",
          attemptId: "attempt-ielts",
          scoreReporting: "none",
          scoreHonesty:
            "This English set reports accuracy only. It is not an official IELTS band or an SAT score.",
          weaknessGroups: [],
          misses: [],
          retries: [],
        }
      : {
      sessionId: "session-1",
      scoreReporting: "none",
      scoreHonesty: "This 30–50 question pre-work reports accuracy only. It is not an official SAT score.",
      weaknessGroups: [
        {
          id: "g1",
          skill: "Transitions",
          domain: "Expression of Ideas",
          missCount: 2,
          priority: 1,
          questionIds: ["q1"],
        },
      ],
      misses: [
        {
          questionId: "q1",
          skill: "Transitions",
          prompt: "Which transition best connects the paragraphs?",
          choices: [
            { id: "a", label: "A", text: "Similarly" },
            { id: "b", label: "B", text: "However" },
          ],
          studentAnswer: "a",
          correctAnswer: "b",
          officialExplanation: "However signals contrast.",
        },
      ],
      retries: [],
    },
    isLoading: false,
  }),
  useRequestSessionRetry: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordRetryOutcome: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ sessionId: "session-1" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import TutorSession from "./session";

afterEach(() => {
  cleanup();
  clearHomework.mockReset();
  currentUserState.id = "tutor-eunice";
  currentUserState.role = "tutor";
  adaptiveState.sessionPrep = {
    mode: "mistake_focus",
    summary: "Open with the missed transition item.",
    duringAssignmentId: "practice-from-homework",
    attachedQuestionCount: 3,
  };
  sessionState.dateTime = "2026-10-02T16:00:00.000Z";
  homeworkState.title = "October pre-session mini-section";
  homeworkState.questionCount = 3;
  homeworkState.latestAttemptStatus = "submitted";
  homeworkState.latestAttemptId = "attempt-1";
  homeworkState.deadline = null;
  sessionPageState.cleanIelts = false;
  adaptiveLists.mistakes = [{ skill: "Transitions" }];
  adaptiveLists.recommendations = [];
  adaptiveLists.hardQuestions = [];
  for (const key of Object.keys(assignmentQueries)) delete assignmentQueries[key];
});

describe("tutor session review page", () => {
  test("keeps session pages light and opens the submitted attempt for review", () => {
    render(<TutorSession />);

    expect(screen.getByTestId("session-authoring-note").textContent).toMatch(/session’s copy/);
    expect(screen.getAllByTestId("tutor-session-quiz-editor").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Authoring tools")).toBeNull();
    expect(screen.queryByText("Generate original practice drafts")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create drafts" })).toBeNull();
    expect(screen.getByText("Homework status & results")).toBeTruthy();
    expect(screen.getByTestId("tutor-session-materials")).toBeTruthy();
    expect(screen.getByTestId("tutor-completion-badge-quiz-1").textContent).toMatch(/Submitted · 80%/);
    expect(screen.getByTestId("tutor-homework-resolved-quiz-1").textContent).toMatch(
      /Resolved by the student/,
    );
    expect(screen.getByTestId("tutor-completion-quiz-1").textContent).toMatch(/Review attempt/);
    expect(screen.getByTestId("download-session-questions").textContent).toMatch(
      /Download questions \(PDF\)/,
    );
    expect(screen.getByTestId("download-session-answer-key").textContent).toMatch(/answer key/);
    expect(screen.queryByTestId("download-english-questions")).toBeNull();
    expect(screen.getByText("1 assignment")).toBeTruthy();
    expect(screen.queryAllByText("Full-length SAT diagnostic — Taito’s SAT Session with Eunice")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Review right \/ wrong answers/i }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-1",
    );
    expect(screen.getByTestId("practice-wrong-answers-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("practice-wrong-answers-before-session")).toBeTruthy();
    expect(screen.getByTestId("in-session-practice-link").querySelector("a")?.getAttribute("href")).toBe(
      "/portal/assignments/practice-from-homework",
    );
    const practiceLinks = screen.getAllByRole("link", { name: /Practice wrong answers only/i });
    expect(practiceLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of practiceLinks) {
      expect(link.getAttribute("href")).toBe("/tutor/attempts/attempt-1?wrongAnswersOnly=1");
    }
    expect(screen.getByTestId("clear-homework-quiz-1").textContent).toMatch(/Clear & redo/);
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/Missed on pre-work/);
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/Transitions/);
    expect(screen.getByRole("tab", { name: "Live plan" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Records" })).toBeTruthy();
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/not an official SAT score/);
    expect(screen.getByTestId("weakness-group-1").textContent).toMatch(/Transitions/);
    fireEvent.click(screen.getByTestId("clear-homework-quiz-1"));
    expect(screen.getByText(/questions stay attached/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(clearHomework).not.toHaveBeenCalled();
  });

  test("shows a not-prepared state when the session has no saved plan", () => {
    adaptiveState.sessionPrep = {
      mode: "not_prepared",
      summary: "This session has not been prepared yet. Use Auto-prepare to build the plan.",
      duringAssignmentId: null,
      attachedQuestionCount: 0,
      needsQuestions: false,
    };
    render(<TutorSession />);
    expect(screen.getByTestId("session-not-prepared").textContent).toMatch(/not been prepared yet/i);
    expect(screen.getByTestId("session-not-prepared").textContent).toMatch(/Auto-prepare/i);
    expect(screen.queryByText("Prepared live plan")).toBeNull();
  });

  test("Oct 23 English pre-work shows 24 questions and a due date, not an unfinished banner", () => {
    sessionState.dateTime = "2026-10-23T16:00:00.000Z";
    homeworkState.title = "IELTS-style diagnostic reading — Taito’s English Session with Nika";
    homeworkState.questionCount = 24;
    homeworkState.latestAttemptStatus = null;
    homeworkState.latestAttemptId = null;
    homeworkState.deadline = null;
    adaptiveState.sessionPrep = {
      mode: "complete_homework_in_session",
      summary:
        "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.",
      duringAssignmentId: "during-1",
      attachedQuestionCount: 0,
      needsQuestions: false,
    };
    render(<TutorSession />);
    expect(screen.getByTestId("before-session-homework").textContent).toContain("24 questions");
    expect(screen.getByTestId("tutor-prework-deadline").textContent).toMatch(/Due before your session/i);
    expect(screen.getByTestId("tutor-prework-deadline").textContent).toMatch(/October 23, 2026/);
    expect(screen.getByTestId("prepared-live-plan").textContent).not.toMatch(/Homework was not finished/i);
    expect(screen.getByTestId("prepared-live-plan").textContent).toMatch(/Waiting on the before-session assignment/i);
  });

  test("a submitted all-correct IELTS diagnostic fills the session without SAT copy", () => {
    sessionPageState.cleanIelts = true;
    sessionState.dateTime = "2026-10-23T12:00:00.000Z";
    homeworkState.title = "IELTS-style diagnostic reading — Taito’s English Session with Nika";
    homeworkState.questionCount = 24;
    homeworkState.latestAttemptStatus = "submitted";
    homeworkState.latestAttemptId = "attempt-ielts";
    adaptiveLists.mistakes = [];
    adaptiveLists.hardQuestions = [
      { id: "hard-1", skill: "Inference", prompt: "Which inference is supported?" },
    ];
    adaptiveState.sessionPrep = {
      mode: "hard_bank",
      summary: "18 in-session questions ready",
      duringAssignmentId: "during-1",
      attachedQuestionCount: 18,
    };
    assignmentQueries["quiz-ielts"] = {
      isLoading: false,
      data: {
        id: "quiz-ielts",
        title: "IELTS-style diagnostic reading",
        questions: Array.from({ length: 24 }, (_, index) => ({
          id: `q-${index + 1}`,
          prompt: `Diagnostic item ${index + 1}`,
          questionType: "multiple_choice",
        })),
      },
    };
    assignmentQueries["during-1"] = { isLoading: true, data: null };

    render(<TutorSession />);

    expect(screen.getByTestId("tutor-completion-badge-quiz-ielts").textContent).toMatch(/Submitted · 100%/);
    expect(screen.getByTestId("during-session-question-count").textContent).toBe("18 questions");
    expect(screen.getAllByTestId("tutor-session-question-count").some((node) => node.textContent === "24 questions")).toBe(true);
    expect(screen.getAllByTestId("tutor-session-question-count").some((node) => node.textContent === "…")).toBe(true);
    expect(screen.getByText("Loading questions…")).toBeTruthy();
    expect(screen.getByTestId("recommended-practice-empty").textContent).toMatch(/harder practice is the live plan/i);
    expect(screen.getByTestId("recommended-hard-practice").textContent).toMatch(/Which inference is supported/);
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/No misses on the submitted pre-work/i);
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/no incorrect items/i);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/IELTS Reading/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/Skills:/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/Writer's views/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/Vocabulary in context/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).not.toMatch(/Estimated SAT/i);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).not.toMatch(/Reading and Writing/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).not.toMatch(/those misses are/i);
    expect(screen.getByText(/five words from the diagnostic passages/i)).toBeTruthy();
    expect(screen.queryByText(/diagnostic misses/i)).toBeNull();
    expect(screen.getByTestId("in-session-practice-link").querySelector("a")?.getAttribute("href")).toBe(
      "/portal/assignments/during-1",
    );
    expect(screen.queryByText("Loading session lesson…")).toBeNull();
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(
      /not an official IELTS band or an SAT score/i,
    );
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/No grouped misses/i);
  });

  test("hides PDF downloads for a tutor who is not assigned to the session", () => {
    currentUserState.id = "tutor-other";
    render(<TutorSession />);
    expect(screen.getByTestId("tutor-session-materials")).toBeTruthy();
    expect(screen.queryByTestId("download-session-questions")).toBeNull();
    expect(screen.queryByTestId("download-session-answer-key")).toBeNull();
  });
});
