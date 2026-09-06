import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  location: "/admin/curriculum?section=curriculum",
  setLocation: vi.fn(),
  generateQuestions: vi.fn(),
  cloneAssignment: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  updateQuestion: vi.fn(),
  attachQuestion: vi.fn(),
  sources: [
    {
      id: "source-1",
      courseId: "course-1",
      subject: "SAT",
      title: "Evidence notes",
      sourceKind: "text" as const,
      authorizationNote: "Owned by Accepted Admissions.",
      provenance: {},
      status: "imported" as const,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    },
  ],
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
    tutors: [
      {
        id: "tutor-1",
        name: "Eunice Chon",
        email: "eunice_chon@berkeley.edu",
        subjects: ["SAT"],
        active: true,
        calendarStatus: "connected",
        sessionCount: 1,
        upcomingSessionCount: 1,
        assignedStudents: [],
      },
    ],
    libraryAssets: [],
    clients: [
      {
        id: "student-1",
        name: "Taito Goto",
        email: "taito0525@gmail.com",
        assignedTutors: [],
      },
    ],
  },
  assignmentDetails: {
    "quiz-1": {
      id: "quiz-1",
      questions: [
        {
          id: "question-1",
          prompt: "Which choice best supports the claim?",
          skill: "Evidence",
          choices: [
            { id: "a", label: "A", text: "A specific relationship" },
            { id: "b", label: "B", text: "An unsupported list" },
          ],
        },
        {
          id: "question-2",
          prompt: "What is the function of the third paragraph?",
          skill: "Function",
          choices: [
            { id: "a", label: "A", text: "Introduce a claim" },
            { id: "b", label: "B", text: "Provide an example" },
          ],
        },
      ],
    },
  } as Record<string, { id: string; questions: Array<{ id: string; prompt: string; skill: string; choices: Array<{ id: string; label: string; text: string }> }> }>,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAdminCurriculumQueryKey: () => ["/api/admin/curriculum"],
  getListAdminAccessGrantsQueryKey: () => ["/api/admin/access-grants"],
  getListQuestionBankQueryKey: (params?: { courseId: string }) => ["/api/question-bank", params],
  getListContentSourcesQueryKey: (params?: { courseId: string }) => ["/api/content-sources", params],
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  useGetAdminCurriculum: () => ({ data: mocks.curriculum, isLoading: false, error: null }),
  useGetAdminOverview: () => ({
    data: {
      users: [
        {
          id: "tutor-nika",
          clerkUserId: "user_nika",
          email: "nika@example.invalid",
          displayName: "Nika Raiffe",
          role: "tutor",
          createdAt: "2026-09-01T12:00:00.000Z",
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useListAdminAccessGrants: () => ({ data: { grants: [] }, isLoading: false, error: null }),
  useCreateAdminAccessGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminAccessGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminTutorAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAdminTutorAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminAssignment: () => ({
    mutate: (vars: unknown, options?: { onSuccess?: (created: unknown) => void }) => {
      mocks.createAssignment(vars, options);
      options?.onSuccess?.({
        ...mocks.curriculum.assignments[0],
        id: "quiz-created",
        title: "New SAT quiz",
        questionCount: 0,
      });
    },
    isPending: false,
  }),
  useCreateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminAssignment: () => ({ mutate: mocks.updateAssignment, isPending: false }),
  useUpdateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminProgram: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCurriculumBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachSessionLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useListQuestionBank: () => ({ data: mocks.questions, isLoading: false }),
  useListContentSources: () => ({ data: mocks.sources, isLoading: false }),
  useCreateContentSource: () => ({ mutate: vi.fn(), isPending: false }),
  useGeneratePracticeQuestions: () => ({ mutate: mocks.generateQuestions, isPending: false }),
  useUpdateQuestionBankItem: () => ({ mutate: mocks.updateQuestion, isPending: false }),
  useAttachQuestionToAssignment: () => ({ mutate: mocks.attachQuestion, isPending: false }),
  useRemoveQuestionFromAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useGetAssignment: (assignmentId: string) => ({
    data: mocks.assignmentDetails[assignmentId] ?? {
      id: assignmentId,
      questions: [],
    },
    isLoading: false,
    error: null,
  }),
  useGetAdaptiveCurriculum: () => ({
    data: {
      mistakes: mocks.curriculum.submissions.length
        ? [{ skill: "Transitions", prompt: "Which transition best connects the paragraphs?" }]
        : [],
      homework: mocks.curriculum.submissions[0]
        ? { latestAttemptId: mocks.curriculum.submissions[0].attemptId }
        : null,
    },
  }),
  getListSatBankCollectionsQueryKey: () => ["/api/admin/sat-bank/collections"],
  getListSatBankQuestionsQueryKey: () => ["/api/admin/sat-bank/questions"],
  getGetSatBankCollectionQueryKey: (id: string) => ["/api/admin/sat-bank/collections", id],
  useListSatBankCollections: () => ({
    data: [
      {
        id: "col-11",
        title: "SAT Practice Test 11",
        slug: "sat-practice-test-11",
        examFamily: "sat",
        extractStatus: "partial",
        questionCount: 2,
        officialExplanationCount: 0,
        assets: [],
      },
    ],
    isLoading: false,
  }),
  useListSatBankQuestions: () => ({ data: [], isLoading: false }),
  useGetSatBankCollection: () => ({ data: undefined, isLoading: false }),
  useImportSatBank: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignSatBankPrework: () => ({ mutate: vi.fn(), isPending: false }),
  customFetch: vi.fn(),
}));

vi.mock("@/lib/clone-admin-assignment", () => ({
  useCloneAdminAssignmentToSession: () => ({ mutate: mocks.cloneAssignment, isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useLocation: () => [mocks.location, mocks.setLocation],
  useSearch: () => mocks.location.split("?")[1] ?? "",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import AdminCurriculum from "./curriculum";

afterEach(() => {
  cleanup();
  mocks.generateQuestions.mockReset();
  mocks.cloneAssignment.mockReset();
  mocks.createAssignment.mockReset();
  mocks.updateAssignment.mockReset();
  mocks.updateAssignment.mockImplementation((_vars, options) => options?.onSuccess?.({}));
  mocks.updateQuestion.mockReset();
  mocks.attachQuestion.mockReset();
  mocks.setLocation.mockReset();
  mocks.location = "/admin/curriculum?section=curriculum";
  mocks.curriculum.assignments = mocks.curriculum.assignments.filter((assignment) => assignment.id === "quiz-1");
  mocks.curriculum.assignments[0]!.sessionId = null;
  mocks.curriculum.assignments[0]!.sessionTitle = null;
  mocks.curriculum.assignments[0]!.status = "published";
  mocks.curriculum.submissions = [];
  mocks.curriculum.sessions = mocks.curriculum.sessions.filter((session) => session.id === "session-1");
});

describe("curriculum bank IA", () => {
  test("makes the Quiz → Questions → Assign → Results path obvious and wires draft generation on the quiz", () => {
    render(<AdminCurriculum />);

    expect(screen.getByRole("heading", { name: "Quiz workspace" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Quizzes" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Fall plan/i })).toBeNull();
    expect(screen.getByTestId("curriculum-bank-path").textContent).toMatch(/1\. Quiz/);
    expect(screen.getByTestId("curriculum-bank-path").textContent).toMatch(/2\. Questions/);
    expect(screen.getByTestId("curriculum-bank-path").textContent).toMatch(/3\. Assign/);
    expect(screen.getByTestId("curriculum-bank-path").textContent).toMatch(/4\. Results/);
    expect(screen.getByRole("tab", { name: /Quizzes/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Programs$/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Session blocks/i })).toBeNull();
    expect(screen.queryByText("Finance")).toBeNull();
    expect(screen.getByText("October pre-session mini-section")).toBeTruthy();

    cleanup();
    mocks.location = "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1";
    render(<AdminCurriculum />);
    expect(screen.getByTestId("quiz-detail-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-editor-question-1")).toBeTruthy();
    expect(screen.getByLabelText("Question 1 prompt")).toBeTruthy();
    expect((screen.getByLabelText("Question 1 prompt") as HTMLTextAreaElement).value).toContain(
      "Which choice best supports the claim?",
    );
    expect(
      screen.getByTestId("quiz-question-editor-question-1").querySelector("button"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Save question" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("quiz-question-list-quiz-1").textContent).toContain(
      "What is the function of the third paragraph?",
    );
    expect(screen.getByTestId("generate-questions-card")).toBeTruthy();
    expect(screen.getByText("Generate questions")).toBeTruthy();
    expect(screen.getByTestId("generate-questions-blocked")).toBeTruthy();
    expect(screen.getAllByText(/OPENAI_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create template drafts").length).toBeGreaterThan(0);
    expect(screen.getByText("Experimental")).toBeTruthy();
    expect(screen.getByText(/generic starting points from hard-coded templates/i)).toBeTruthy();
    expect(screen.queryByText(/AI drafts/i)).toBeNull();
    expect(screen.queryByText(/College Board/i)).toBeNull();
    expect(screen.getByTestId("generate-draft-questions").textContent).toMatch(/Create template drafts/);
    fireEvent.change(screen.getByLabelText("Learning objective"), {
      target: { value: "distinguish evidence from inference" },
    });
    fireEvent.click(screen.getByTestId("generate-draft-questions"));
    expect(mocks.generateQuestions).toHaveBeenCalledWith(
      {
        sourceId: "source-1",
        data: { focus: "distinguish evidence from inference", count: 3, difficulty: "medium" },
      },
      expect.any(Object),
    );
  });

  test("keeps a compact Questions tab and points generate at the quiz workspace", () => {
    mocks.location = "/admin/curriculum?section=curriculum&tab=questions";
    render(<AdminCurriculum />);
    expect(screen.getByRole("heading", { name: "Question bank" })).toBeTruthy();
    expect(screen.getByText(/Author inside an open quiz/i)).toBeTruthy();
    expect(screen.getByText("Ready for quiz")).toBeTruthy();
    expect(screen.getByTestId("question-row-question-1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark ready for quiz/i })).toBeNull();
    expect(screen.queryByText(/Coming soon/i)).toBeNull();
    expect(screen.queryByTestId("generate-draft-questions")).toBeNull();
    expect(screen.getByRole("link", { name: /Open a quiz to generate/i }).getAttribute("href")).toMatch(
      /tab=quizzes/,
    );
  });

  test("assigns an existing bank quiz as pre-session work and links session review", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    render(<AdminCurriculum />);

    expect(screen.getByText("Pre-session quiz")).toBeTruthy();
    expect(screen.getByText("No quiz attached. Assign one from the bank below.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("assign-prework-session-1"));
    expect(mocks.cloneAssignment).toHaveBeenCalledWith(
      {
        assignmentId: "quiz-1",
        sessionId: "session-1",
      },
      expect.any(Object),
    );
    expect(mocks.updateAssignment).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open session review" }).getAttribute("href")).toBe(
      "/tutor/sessions/session-1",
    );
  });

  test("the same bank quiz stays assignable to a second session without reparenting", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    mocks.curriculum.sessions.push({
      ...mocks.curriculum.sessions[0]!,
      id: "session-2",
      title: "Second SAT session",
    });
    render(<AdminCurriculum />);

    fireEvent.click(screen.getByTestId("assign-prework-session-1"));
    fireEvent.click(screen.getByTestId("assign-prework-session-2"));
    expect(mocks.cloneAssignment).toHaveBeenNthCalledWith(
      1,
      { assignmentId: "quiz-1", sessionId: "session-1" },
      expect.any(Object),
    );
    expect(mocks.cloneAssignment).toHaveBeenNthCalledWith(
      2,
      { assignmentId: "quiz-1", sessionId: "session-2" },
      expect.any(Object),
    );
    expect(mocks.updateAssignment).not.toHaveBeenCalled();
    mocks.curriculum.sessions.pop();
  });

  test("assign dropdown lists only reusable bank quizzes and omits currently-session labels", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    mocks.curriculum.assignments.push({
      ...mocks.curriculum.assignments[0]!,
      id: "quiz-clone",
      sessionId: "session-2",
      sessionTitle: "Taito's SAT Session with Eunice",
      title: "Full SAT Practice Diagnostic",
      questionCount: 10,
    });
    render(<AdminCurriculum />);

    const picker = screen.getByLabelText("Quiz to assign as pre-session work") as HTMLSelectElement;
    const options = Array.from(picker.options).map((option) => ({
      value: option.value,
      label: option.textContent,
    }));
    expect(options).toEqual([
      { value: "quiz-1", label: "October pre-session mini-section · 3 questions" },
    ]);
    expect(picker.textContent).not.toMatch(/currently/i);
    expect(picker.textContent).not.toContain("Taito's SAT Session with Eunice");
  });

  test("shows an empty assign state when only session-bound quizzes exist", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    mocks.curriculum.assignments[0]!.sessionId = "session-2";
    mocks.curriculum.assignments[0]!.sessionTitle = "Taito's SAT Session with Eunice";
    render(<AdminCurriculum />);

    expect(screen.queryByLabelText("Quiz to assign as pre-session work")).toBeNull();
    expect(screen.getByText("Create a quiz in the Quizzes workspace (no session) first.")).toBeTruthy();
  });

  test("Quizzes list is bank-only; session clones stay reachable from Open quiz", () => {
    mocks.curriculum.assignments.push({
      ...mocks.curriculum.assignments[0]!,
      id: "quiz-clone",
      sessionId: "session-1",
      sessionTitle: "Taito SAT with Eunice",
      title: "October pre-session mini-section (assigned)",
    });
    render(<AdminCurriculum />);

    expect(screen.getByTestId("quiz-card-quiz-1")).toBeTruthy();
    expect(screen.queryByTestId("quiz-card-quiz-clone")).toBeNull();
    expect(screen.queryByText("Assigned copy")).toBeNull();
    expect(screen.getByText(/Session copies live on Sessions/i)).toBeTruthy();

    cleanup();
    mocks.location = "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-clone";
    render(<AdminCurriculum />);
    expect(screen.getByTestId("quiz-detail-quiz-clone")).toBeTruthy();
    expect(screen.getByText("Assigned copy")).toBeTruthy();
    expect(screen.getByText(/This copy is already on Taito SAT with Eunice/)).toBeTruthy();
  });

  test("completed bank quizzes cannot be assigned as pre-work from the quiz", () => {
    mocks.location = "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1";
    mocks.curriculum.assignments[0]!.status = "completed";
    render(<AdminCurriculum />);

    expect(screen.getByText("Only published or draft before-session bank quizzes can be assigned as pre-work.")).toBeTruthy();
    expect(screen.queryByTestId("assign-quiz-quiz-1")).toBeNull();
    mocks.curriculum.assignments[0]!.status = "published";
  });

  test("creating template drafts on the open quiz attaches them without a separate Approve step", () => {
    mocks.location = "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1";
    mocks.generateQuestions.mockImplementation((_vars, options) => {
      options?.onSuccess?.([
        {
          id: "draft-1",
          subject: "SAT",
          domain: "Reading",
          skill: "Evidence",
          questionType: "multiple_choice",
          difficulty: "medium",
          prompt: "Generated draft prompt for this quiz",
          choices: [],
          correctAnswer: "a",
          explanation: "Because",
          sourceType: "authorized-source-derived",
          reviewStatus: "draft",
          tags: [],
          generationMethod: "source-aware-generator",
          createdAt: "2026-09-01T12:00:00.000Z",
        },
      ]);
    });
    mocks.updateQuestion.mockImplementation((_vars, options) => options?.onSuccess?.({}));
    mocks.attachQuestion.mockImplementation((_vars, options) => options?.onSuccess?.({}));

    render(<AdminCurriculum />);
    fireEvent.change(screen.getByLabelText("Learning objective"), {
      target: { value: "distinguish evidence from inference" },
    });
    fireEvent.click(screen.getByTestId("generate-draft-questions"));
    expect(mocks.attachQuestion).toHaveBeenCalledWith(
      { assignmentId: "quiz-1", data: { questionId: "draft-1" } },
      expect.any(Object),
    );
    expect(screen.queryByRole("button", { name: /^Approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark ready for quiz/i })).toBeNull();
  });

  test("shows attached quiz and attempt review entry points on the session card", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    mocks.curriculum.assignments[0]!.sessionId = "session-1";
    mocks.curriculum.assignments[0]!.sessionTitle = "Taito SAT with Eunice";
    mocks.curriculum.submissions = [
      {
        attemptId: "attempt-1",
        assignmentId: "quiz-1",
        assignmentTitle: "October pre-session mini-section",
        studentUserId: "student-1",
        studentName: "Taito Goto",
        status: "submitted",
        score: 80,
        submittedAt: "2026-09-30T12:00:00.000Z",
        reviewStatus: "new",
        mistakeCount: 2,
      },
    ];

    render(<AdminCurriculum />);

    expect(screen.getByTestId("session-prework-session-1").textContent).toContain(
      "October pre-session mini-section",
    );
    expect(screen.getByRole("link", { name: "Review Taito Goto" }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-1",
    );
    expect(screen.getByRole("link", { name: "Open quiz" }).getAttribute("href")).toBe(
      "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1",
    );
    fireEvent.click(screen.getByText("View questions"));
    expect(screen.getByText("Which choice best supports the claim?")).toBeTruthy();
    expect(screen.getByText("What is the function of the third paragraph?")).toBeTruthy();
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/Missed on pre-work/);
    expect(screen.getByTestId("missed-on-prework").textContent).toMatch(/Which transition best connects/);
  });

  test("opening a quiz from Sessions via URL shows its questions", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    const view = render(<AdminCurriculum />);
    expect(screen.getByText("Sessions & meetings")).toBeTruthy();

    mocks.location = "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-1";
    view.rerender(<AdminCurriculum />);
    expect(screen.getByTestId("quiz-detail-quiz-1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-editor-question-1")).toBeTruthy();
    expect((screen.getByLabelText("Question 1 prompt") as HTMLTextAreaElement).value).toContain(
      "Which choice best supports the claim?",
    );
  });

  test("creating a quiz opens the workspace instead of dumping back to the list", () => {
    render(<AdminCurriculum />);
    fireEvent.click(screen.getByRole("button", { name: /New quiz/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New SAT quiz" } });
    fireEvent.change(screen.getByLabelText("Instructions / explanation"), {
      target: { value: "Complete before the meeting." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create quiz" }));
    expect(mocks.createAssignment).toHaveBeenCalled();
    expect(mocks.setLocation).toHaveBeenCalledWith(
      "/admin/curriculum?section=curriculum&tab=quizzes&quiz=quiz-created",
    );
  });

  test("replacing and removing session pre-work archives the previous session copy", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    mocks.curriculum.assignments.push({
      ...mocks.curriculum.assignments[0]!,
      id: "quiz-clone",
      sessionId: "session-1",
      sessionTitle: "Taito SAT with Eunice",
    });
    mocks.curriculum.assignments.push({
      ...mocks.curriculum.assignments[0]!,
      id: "quiz-2",
      title: "Replacement SAT quiz",
      sessionId: null,
      sessionTitle: null,
      questionCount: 2,
    });

    render(<AdminCurriculum />);
    expect(screen.getByRole("button", { name: "Replace pre-work" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quiz to assign as pre-session work"), {
      target: { value: "quiz-2" },
    });
    fireEvent.click(screen.getByTestId("assign-prework-session-1"));
    expect(mocks.updateAssignment).toHaveBeenCalledWith(
      { assignmentId: "quiz-clone", data: { status: "archived" } },
      expect.any(Object),
    );
    expect(mocks.cloneAssignment).toHaveBeenCalledWith(
      { assignmentId: "quiz-2", sessionId: "session-1" },
      expect.any(Object),
    );

    fireEvent.click(screen.getByTestId("remove-prework-session-1"));
    expect(mocks.updateAssignment).toHaveBeenCalledWith(
      { assignmentId: "quiz-clone", data: { status: "archived" } },
      expect.any(Object),
    );
  });

  test("legacy Programs URL does not bring Programs back as a backdoor", () => {
    mocks.location = "/admin/curriculum?section=programs";
    render(<AdminCurriculum />);
    expect(screen.getByText("Sessions & meetings")).toBeTruthy();
    expect(screen.queryByText("Save program")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Programs$/i })).toBeNull();
    expect(screen.queryByText("Meet link")).toBeNull();
  });

  test("session edit picks Taito, Eunice, and Nika by name or email without portal provisioning", () => {
    mocks.location = "/admin/curriculum?section=sessions";
    render(<AdminCurriculum />);
    fireEvent.click(screen.getByRole("button", { name: /New session/i }));
    fireEvent.change(screen.getByLabelText("Session student search"), {
      target: { value: "taito0525" },
    });
    expect(screen.getByLabelText("Session student").textContent).toMatch(/Taito Goto · taito0525@gmail.com/);
    fireEvent.change(screen.getByLabelText("Session tutor search"), {
      target: { value: "nika@" },
    });
    const tutorOptions = Array.from(
      (screen.getByLabelText("Session tutor") as HTMLSelectElement).options,
    ).map((option) => option.textContent);
    expect(tutorOptions.some((label) => /Nika Raiffe/.test(label ?? "") && /nika@/.test(label ?? ""))).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Session tutor search"), {
      target: { value: "Eunice" },
    });
    expect(screen.getByLabelText("Session tutor").textContent).toMatch(/Eunice Chon/);
  });

  test("library forms do not offer Google Drive fields or CTAs", () => {
    mocks.location = "/admin/curriculum?section=curriculum&tab=library";
    render(<AdminCurriculum />);
    fireEvent.click(screen.getByRole("button", { name: /New library asset/i }));
    expect(screen.getByText("Shared resource URL (PDF or licensed test)")).toBeTruthy();
    expect(screen.queryByText(/Drive, PDF/i)).toBeNull();
    expect(screen.queryByText(/Google Drive/i)).toBeNull();
  });

  test("SAT/PSAT bank tab and 60-minute session assign stay on existing operations pages", () => {
    mocks.location = "/admin/curriculum?section=curriculum&tab=sat-bank";
    render(<AdminCurriculum />);
    expect(screen.getByTestId("sat-bank-panel").textContent).toMatch(/SAT\/PSAT question bank/);
    expect(screen.getByText("SAT Practice Test 11")).toBeTruthy();
    cleanup();
    mocks.location = "/admin/curriculum?section=sessions";
    render(<AdminCurriculum />);
    expect(screen.getByTestId("assign-bank-prework-session-1").textContent).toMatch(
      /60-minute bank pre-work/,
    );
    expect(screen.getByRole("button", { name: /Assign 60-min pre-work/i })).toBeTruthy();
  });
});
