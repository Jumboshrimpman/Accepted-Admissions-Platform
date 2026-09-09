import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TutorCurriculum } from "./curriculum";

const mocks = vi.hoisted(() => ({
  queryClient: { invalidateQueries: vi.fn() },
  curriculum: null as TutorCurriculum | null,
  createSession: { isPending: false, mutate: vi.fn() },
  cloneAssignment: { isPending: false, mutate: vi.fn() },
  updateAssignment: { isPending: false, mutate: vi.fn() },
  assignBank: { isPending: false, mutate: vi.fn() },
  attachLibrary: { isPending: false, mutate: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.queryClient,
  useQuery: () => ({
    data: mocks.curriculum,
    isLoading: false,
    error: null,
  }),
  useMutation: () => mocks.createSession,
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
  useCloneAdminAssignmentToSession: () => mocks.cloneAssignment,
  useUpdateAdminAssignment: () => mocks.updateAssignment,
  useAssignSatBankPrework: () => mocks.assignBank,
  useAttachSessionLibraryAsset: () => mocks.attachLibrary,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import TutorCurriculumPage from "./curriculum";

const curriculum: TutorCurriculum = {
  programs: [
    {
      id: "course-1",
      title: "Fall SAT",
      subject: "SAT",
      term: "Fall 2026",
      status: "active",
      goalSummary: null,
      meetUrl: null,
      driveUrl: null,
      sessionCount: 1,
      completedSessionCount: 0,
    },
  ],
  students: [
    {
      id: "student-1",
      name: "Michelle Makarem",
      courseId: "course-1",
      courseTitle: "Fall SAT",
      subject: "SAT",
    },
  ],
  sessions: [
    {
      id: "session-1",
      courseId: "course-1",
      programTitle: "Fall SAT",
      dateTime: "2026-09-15T16:00:00.000Z",
      timezone: "America/New_York",
      subject: "SAT",
      title: "Michelle’s SAT Session with Xavier",
      status: "published",
      durationMinutes: 60,
      bookingStatus: "confirmed",
      meetingUrl: null,
      calendarEventUrl: null,
      student: { id: "student-1", name: "Michelle Makarem" },
      tutor: { id: "tutor-1", name: "Xavier" },
      hasHomework: false,
      hasReport: false,
      conflict: false,
      conflictWith: [],
    },
  ],
  quizzes: [
    {
      id: "quiz-bank",
      courseId: "course-1",
      sessionId: null,
      programTitle: "Fall SAT",
      sessionTitle: null,
      deliveryPhase: "before_session",
      title: "Evidence mini-section",
      subject: "SAT",
      instructions: "Complete before the meeting.",
      status: "published",
      deadline: null,
      timeLimitMinutes: 20,
      maxAttempts: 1,
      questionCount: 4,
      submissionCount: 0,
    },
  ],
  libraryAssets: [
    {
      id: "asset-1",
      title: "SAT Practice Test 11",
      kind: "practice_test",
      description: null,
      resourceUrl: null,
      body: null,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  satBankCollections: [{ id: "col-11", title: "SAT Practice Test 11", questionCount: 98 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.curriculum = curriculum;
});

afterEach(() => {
  cleanup();
});

describe("tutor curriculum workspace", () => {
  test("hides cancelled sessions from Your sessions and assign dropdowns", () => {
    mocks.curriculum = {
      ...curriculum,
      sessions: [
        ...curriculum.sessions,
        {
          ...curriculum.sessions[0]!,
          id: "session-cancelled",
          title: "Cancelled SAT Session",
          bookingStatus: "cancelled",
        },
      ],
    };
    render(<TutorCurriculumPage />);
    expect(screen.getByTestId("tutor-session-card-session-1")).toBeTruthy();
    expect(screen.queryByTestId("tutor-session-card-session-cancelled")).toBeNull();
    expect(screen.queryByText("Cancelled SAT Session")).toBeNull();
    const assignOptions = Array.from(
      (screen.getByTestId("tutor-assign-quiz-session") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(assignOptions).toContain("session-1");
    expect(assignOptions).not.toContain("session-cancelled");
  });

  test("lets a tutor create a session and assign bank work for a linked student", () => {
    render(<TutorCurriculumPage />);

    expect(screen.getByTestId("tutor-curriculum-page")).toBeTruthy();
    expect(screen.getByTestId("tutor-create-quiz-open")).toBeTruthy();
    expect(screen.getByTestId("tutor-quiz-repository")).toBeTruthy();
    expect(screen.getByTestId("tutor-quiz-repo-item-quiz-bank")).toBeTruthy();
    expect(screen.getByTestId("tutor-linked-students").textContent).toContain("Michelle Makarem");
    expect(screen.getByText("SAT Practice Test 11 · 98 questions")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tutor-create-session-toggle"));
    fireEvent.change(screen.getByTestId("tutor-session-student"), {
      target: { value: "student-1" },
    });
    fireEvent.click(screen.getByTestId("tutor-create-session-submit"));
    expect(mocks.createSession.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: "course-1",
        clientUserId: "student-1",
        subject: "SAT",
        durationMinutes: 60,
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    fireEvent.change(screen.getByTestId("tutor-assign-quiz-session"), {
      target: { value: "session-1" },
    });
    fireEvent.change(screen.getByTestId("tutor-assign-quiz-select"), {
      target: { value: "quiz-bank" },
    });
    fireEvent.click(screen.getByTestId("tutor-assign-quiz-submit"));
    expect(mocks.cloneAssignment.mutate).toHaveBeenCalledWith(
      { assignmentId: "quiz-bank", data: { sessionId: "session-1" } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    fireEvent.change(screen.getByTestId("tutor-assign-bank-session"), {
      target: { value: "session-1" },
    });
    fireEvent.click(screen.getByTestId("tutor-assign-bank-submit"));
    expect(mocks.assignBank.mutate).toHaveBeenCalledWith(
      {
        sessionId: "session-1",
        data: { collectionId: null, homeworkKind: "routine", targetMinutes: 60 },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
