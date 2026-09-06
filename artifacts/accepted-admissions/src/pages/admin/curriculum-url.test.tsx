import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * These tests use a real Wouter memory router. That is required to catch the
 * production bug: `useLocation()` is pathname-only, so stuffing `?section=`
 * into a mocked location string would hide a broken deep-link.
 */

const mocks = vi.hoisted(() => ({
  loading: false,
  curriculum: {
    programs: [
      {
        id: "course-1",
        title: "Fall 2026 SAT",
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
        goalSummary: "Build SAT readiness.",
        meetUrl: null,
        driveUrl: null,
        sessionCount: 1,
        completedSessionCount: 0,
      },
    ],
    sessions: [
      {
        id: "session-1",
        courseId: "course-1",
        programTitle: "Fall 2026 SAT",
        dateTime: "2026-10-02T16:00:00.000Z",
        timezone: "America/New_York",
        subject: "SAT",
        title: "Taito SAT with Eunice",
        status: "published",
        durationMinutes: 60,
        bookingStatus: "confirmed",
        meetingUrl: "https://meet.google.com/sat-room",
        student: { id: "student-1", name: "Taito Goto" },
        tutor: { id: "tutor-1", name: "Eunice Chon" },
        hasHomework: false,
        hasReport: false,
        conflict: false,
        conflictWith: [],
      },
    ],
    assignments: [
      {
        id: "quiz-1",
        courseId: "course-1",
        sessionId: null as string | null,
        programTitle: "Fall 2026 SAT",
        sessionTitle: null as string | null,
        deliveryPhase: "before_session" as const,
        title: "October pre-session mini-section",
        subject: "SAT",
        instructions: "Complete before the meeting.",
        status: "published" as const,
        deadline: null,
        timeLimitMinutes: 20,
        maxAttempts: 1,
        questionCount: 3,
        submissionCount: 0,
      },
    ],
    blocks: [],
    questionStatus: [{ subject: "SAT", total: 1, draft: 0, approved: 1, rejected: 0 }],
    submissions: [] as Array<{
      attemptId: string;
      assignmentId: string;
      assignmentTitle: string;
      studentUserId: string;
      studentName: string;
      status: string;
      score: number;
      submittedAt: string;
      reviewStatus: string;
      mistakeCount: number;
    }>,
    tutors: [],
    libraryAssets: [],
    clients: [],
  },
  questions: [
    {
      id: "question-1",
      subject: "SAT",
      domain: "Reading",
      skill: "Evidence",
      questionType: "multiple_choice",
      difficulty: "medium" as const,
      prompt: "Which choice best supports the claim?",
      choices: [
        { id: "a", label: "A", text: "A specific relationship" },
        { id: "b", label: "B", text: "An unsupported list" },
      ],
      correctAnswer: "a",
      explanation: "The supported claim is transferable.",
      sourceType: "authorized-source-derived",
      reviewStatus: "approved" as const,
      tags: ["evidence"],
      generationMethod: "source-aware-generator",
      createdAt: "2026-09-01T12:00:00.000Z",
    },
  ],
  assignmentDetails: {
    "quiz-1": {
      id: "quiz-1",
      questions: [
        { id: "question-1", prompt: "Which choice best supports the claim?" },
        { id: "question-2", prompt: "What is the function of the third paragraph?" },
      ],
    },
  } as Record<string, { id: string; questions: Array<{ id: string; prompt: string }> }>,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAdminCurriculumQueryKey: () => ["/api/admin/curriculum"],
  getListAdminAccessGrantsQueryKey: () => ["/api/admin/access-grants"],
  getListQuestionBankQueryKey: (params?: { courseId: string }) => ["/api/question-bank", params],
  getListContentSourcesQueryKey: (params?: { courseId: string }) => ["/api/content-sources", params],
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  useGetAdminCurriculum: () => ({
    data: mocks.loading ? undefined : mocks.curriculum,
    isLoading: mocks.loading,
    error: null,
  }),
  useGetAdminOverview: () => ({ data: { users: [] }, isLoading: false, error: null }),
  useListAdminAccessGrants: () => ({ data: { grants: [] }, isLoading: false, error: null }),
  useCreateAdminAccessGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminAccessGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminProgram: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCurriculumBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachSessionLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useListQuestionBank: () => ({ data: mocks.questions, isLoading: false }),
  useListContentSources: () => ({ data: [], isLoading: false }),
  useCreateContentSource: () => ({ mutate: vi.fn(), isPending: false }),
  useGeneratePracticeQuestions: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuestionBankItem: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachQuestionToAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveQuestionFromAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useGetAssignment: (assignmentId: string) => ({
    data: mocks.assignmentDetails[assignmentId] ?? { id: assignmentId, questions: [] },
    isLoading: false,
    error: null,
  }),
  useGetAdaptiveCurriculum: () => ({ data: { mistakes: [], homework: null } }),
}));

vi.mock("@/lib/clone-admin-assignment", () => ({
  useCloneAdminAssignmentToSession: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import AdminCurriculum from "./curriculum";

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  const view = render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <AdminCurriculum />
    </Router>,
  );
  return { ...view, location };
}

afterEach(() => {
  cleanup();
  mocks.loading = false;
});

describe("admin curriculum URL sync", () => {
  test("deep-links each top section from the query string", () => {
    renderAt("/admin/curriculum?section=people");
    expect(screen.getByTestId("admin-section-people")).toBeTruthy();
    expect(screen.getByText("Provision people")).toBeTruthy();
    expect(screen.queryByTestId("admin-section-curriculum")).toBeNull();
    expect(screen.queryByTestId("admin-section-sessions")).toBeNull();
    cleanup();

    renderAt("/admin/curriculum?section=sessions");
    expect(screen.getByTestId("admin-section-sessions")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sessions & meetings" })).toBeTruthy();
    expect(screen.queryByTestId("admin-section-curriculum")).toBeNull();
    expect(screen.queryByTestId("admin-section-people")).toBeNull();
    cleanup();

    renderAt("/admin/curriculum?section=curriculum");
    expect(screen.getByTestId("admin-section-curriculum")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Quiz workspace" })).toBeTruthy();
    expect(screen.queryByTestId("admin-section-people")).toBeNull();
  });

  test("deep-links each curriculum tab from the query string", () => {
    const tabs: Array<{ path: string; panel: string; copy: RegExp }> = [
      { path: "/admin/curriculum?section=curriculum&tab=quizzes", panel: "admin-tab-quizzes", copy: /Reusable bank quizzes only/ },
      { path: "/admin/curriculum?section=curriculum&tab=questions", panel: "admin-tab-questions", copy: /Question bank/ },
      { path: "/admin/curriculum?section=curriculum&tab=library", panel: "admin-tab-library", copy: /Curriculum library/ },
      { path: "/admin/curriculum?section=curriculum&tab=submissions", panel: "admin-tab-submissions", copy: /Student submissions/ },
    ];

    for (const { path, panel, copy } of tabs) {
      cleanup();
      renderAt(path);
      expect(screen.getByTestId("admin-section-curriculum")).toBeTruthy();
      expect(screen.getByTestId(panel).getAttribute("data-state")).toBe("active");
      expect(screen.getByText(copy)).toBeTruthy();
      for (const other of tabs) {
        if (other.panel !== panel) {
          expect(screen.getByTestId(other.panel).getAttribute("data-state")).toBe("inactive");
        }
      }
    }
  });

  test("opening ?quiz= shows that quiz workspace and its questions", () => {
    renderAt("/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1");
    expect(screen.getByTestId("quiz-detail-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-list-quiz-1").textContent).toContain(
      "Which choice best supports the claim?",
    );
    expect(screen.getByTestId("quiz-question-list-quiz-1").textContent).toContain(
      "What is the function of the third paragraph?",
    );
    expect(screen.queryByTestId("quiz-card-quiz-1")).toBeNull();
  });

  test("keeps the quiz deep-link after curriculum data finishes loading", () => {
    mocks.loading = true;
    const { rerender, location } = renderAt(
      "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1",
    );
    expect(screen.queryByTestId("quiz-detail-quiz-1")).toBeNull();

    mocks.loading = false;
    rerender(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <AdminCurriculum />
      </Router>,
    );
    expect(screen.getByTestId("quiz-detail-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-list-quiz-1").textContent).toContain(
      "Which choice best supports the claim?",
    );
  });

  test("People and Sessions top tabs write the URL and show the matching panel", () => {
    const { location } = renderAt("/admin/curriculum?section=curriculum");
    expect(screen.getByTestId("admin-section-curriculum")).toBeTruthy();

    fireEvent.click(screen.getByTestId("admin-section-link-people"));
    expect(screen.getByTestId("admin-section-people")).toBeTruthy();
    expect(screen.queryByTestId("admin-section-curriculum")).toBeNull();
    expect(location.history.at(-1)).toBe("/admin/curriculum?section=people");

    fireEvent.click(screen.getByTestId("admin-section-link-sessions"));
    expect(screen.getByTestId("admin-section-sessions")).toBeTruthy();
    expect(screen.queryByTestId("admin-section-people")).toBeNull();
    expect(location.history.at(-1)).toBe("/admin/curriculum?section=sessions");
  });

  test("curriculum tab clicks stay in sync with the URL", () => {
    const { location } = renderAt("/admin/curriculum?section=curriculum&tab=quizzes");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Questions$/i }));
    expect(location.history.at(-1)).toBe("/admin/curriculum?section=curriculum&tab=questions");
    expect(screen.getByTestId("admin-tab-questions").getAttribute("data-state")).toBe("active");
    expect(screen.getByText(/Question bank/)).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Resources$/i }));
    expect(location.history.at(-1)).toBe("/admin/curriculum?section=curriculum&tab=library");
    expect(screen.getByTestId("admin-tab-library").getAttribute("data-state")).toBe("active");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Submissions$/i }));
    expect(location.history.at(-1)).toBe("/admin/curriculum?section=curriculum&tab=submissions");
    expect(screen.getByTestId("admin-tab-submissions").getAttribute("data-state")).toBe("active");
  });

  test("navigating from Sessions to a quiz URL opens that quiz's questions", () => {
    const { location } = renderAt("/admin/curriculum?section=sessions");
    expect(screen.getByTestId("admin-section-sessions")).toBeTruthy();

    act(() => {
      location.navigate("/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1");
    });
    expect(screen.getByTestId("quiz-detail-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-list-quiz-1").textContent).toContain(
      "Which choice best supports the claim?",
    );
  });
});
