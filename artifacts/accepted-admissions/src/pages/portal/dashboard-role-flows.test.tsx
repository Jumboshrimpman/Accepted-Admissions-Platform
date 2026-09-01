import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Dashboard } from "@workspace/api-client-react";

const mocks = vi.hoisted(() => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
  dashboard: null as Dashboard | null,
  queue: [] as Array<{
    id: string;
    attemptId: string;
    questionId: string;
    studentName: string;
    skill: string;
    reason: string;
    prediction: string | null;
    finalAnswer: string | null;
    status: "open" | "reviewed";
    tutorNote: string | null;
  }>,
  updateReview: {
    isPending: false,
    mutate: vi.fn(),
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getListReviewQueueQueryKey: () => ["review-queue"],
  useGetDashboard: () => ({
    data: mocks.dashboard,
    isLoading: false,
    error: null,
  }),
  useListReviewQueue: () => ({
    data: mocks.queue,
    isLoading: false,
  }),
  useUpdateReviewQueueItem: () => mocks.updateReview,
  useGetCurrentUser: () => ({
    data: { role: "tutor" },
  }),
  useListCalendarConnections: () => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  }),
  useDisconnectCalendar: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.queryClient,
}));

import FallWelcomeDashboard from "./fall-welcome-dashboard";
import TutorDashboard from "@/pages/tutor/dashboard";

function dashboardForRole(
  role: "student" | "tutor" | "viewer",
): Dashboard {
  const isTutor = role === "tutor";
  return {
    user: {
      id: `${role}-user`,
      displayName: role === "viewer" ? "Parent Viewer" : isTutor ? "Eunice Chon" : "Taito Goto",
      email: `${role}@example.invalid`,
      role,
      avatarUrl: null,
    },
    welcomeMessage: "Your Fall program is ready.",
    courses: [
      {
        id: "course-fall",
        title: "Fall 2026 SAT & IELTS",
        subject: "SAT & IELTS",
        term: "Fall 2026",
        status: "active",
        sessionCount: 2,
        completedSessionCount: 0,
        tutors: [],
      },
    ],
    upcomingSessions: isTutor
      ? [
          {
            id: "session-sat",
            courseId: "course-fall",
            dateTime: "2026-10-10T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            subject: "SAT",
            title: "SAT session with Taito",
            status: "published",
            meetingUrl: "https://meet.google.com/sat-room",
            tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
            student: { id: "student", name: "Taito Goto" },
          },
        ]
      : [
          {
            id: "session-sat",
            courseId: "course-fall",
            dateTime: "2026-10-10T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            subject: "SAT",
            title: "SAT session with Eunice",
            status: "published",
            meetingUrl: "https://meet.google.com/sat-room",
            tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
          },
          {
            id: "session-ielts",
            courseId: "course-fall",
            dateTime: "2026-10-17T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            subject: "IELTS",
            title: "IELTS session with Nika",
            status: "published",
            meetingUrl: "https://meet.google.com/ielts-room",
            tutor: { id: "tutor-2", name: "Nika Raiffe", specialty: "IELTS Tutor", avatarUrl: null },
          },
        ],
    assignments: isTutor
      ? []
      : [
          {
            id: "assignment-active",
            title: "Timed practice",
            subject: "SAT",
            status: "published",
            deadline: "2099-10-01T00:00:00.000Z",
            questionCount: 5,
            timeLimitMinutes: 20,
            attemptCount: 1,
            maxAttempts: 2,
            latestScore: null,
            latestAttemptId: "attempt-active",
            latestAttemptStatus: "active",
          },
          {
            id: "assignment-score",
            title: "Reading results",
            subject: "SAT",
            status: "published",
            deadline: null,
            questionCount: 5,
            timeLimitMinutes: 20,
            attemptCount: 1,
            maxAttempts: 2,
            latestScore: 85,
            latestAttemptId: "attempt-submitted",
            latestAttemptStatus: "submitted",
          },
          {
            id: "assignment-complete",
            title: "Completed without score",
            subject: "IELTS",
            status: "published",
            deadline: null,
            questionCount: 5,
            timeLimitMinutes: 20,
            attemptCount: 1,
            maxAttempts: 1,
            latestScore: null,
            latestAttemptId: "attempt-expired",
            latestAttemptStatus: "expired",
          },
          {
            id: "assignment-past-due",
            title: "Missed deadline",
            subject: "SAT",
            status: "published",
            deadline: "2000-01-01T00:00:00.000Z",
            questionCount: 5,
            timeLimitMinutes: 20,
            attemptCount: 0,
            maxAttempts: 1,
            latestScore: null,
            latestAttemptId: null,
            latestAttemptStatus: null,
          },
        ],
    recentScores: [],
    reviewSkills: [],
    credits: { remainingHours: isTutor ? 0 : 4, readOnly: role === "viewer" },
    progress: {
      totalSessions: isTutor ? 1 : 2,
      completedSessions: 0,
      averageScore: null,
      strengths: [],
      weaknesses: [],
    },
    assignedStudents: isTutor
      ? [
          {
            id: "student",
            name: "Taito Goto",
            courseId: "course-fall",
            courseTitle: "Fall 2026 SAT & IELTS",
            subject: "SAT",
          },
        ]
      : [],
    newSubmissions: [],
    openReviewCount: isTutor ? 1 : 0,
  } as unknown as Dashboard;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queue = [
    {
      id: "queue-1",
      attemptId: "attempt-1",
      questionId: "question-1",
      studentName: "Taito Goto",
      skill: "Boundaries",
      reason: "Review the punctuation choice.",
      prediction: "A",
      finalAnswer: "B",
      status: "open",
      tutorNote: null,
    },
  ];
  mocks.updateReview.isPending = false;
});

afterEach(() => {
  cleanup();
});

describe("authenticated role dashboard flows", () => {
  test("student sees scoped sessions, meeting links, and every assignment status", () => {
    mocks.dashboard = dashboardForRole("student");
    render(<FallWelcomeDashboard />);

    expect(screen.getByText("SAT session with Eunice")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Join meeting/i })).toHaveLength(1);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("Past due")).toBeTruthy();
  });

  test("viewer gets the same scoped review surface in explicit view-only mode", () => {
    mocks.dashboard = dashboardForRole("viewer");
    render(<FallWelcomeDashboard />);

    expect(screen.getByRole("status").textContent).toContain("view-only mode");
    expect(screen.getByText("SAT session with Eunice")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Join meeting/i }).getAttribute("href")).toBe(
      "https://meet.google.com/sat-room",
    );
    expect(screen.queryByRole("button", { name: /Mark reviewed/i })).toBeNull();
  });

  test("tutor sees only tutor workspace controls and can review assigned work", () => {
    mocks.dashboard = dashboardForRole("tutor");
    render(<TutorDashboard />);

    expect(screen.getAllByText("Taito Goto").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Open workspace/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Join meeting/i }).getAttribute("href")).toBe(
      "https://meet.google.com/sat-room",
    );
    fireEvent.click(screen.getByRole("button", { name: /Mark reviewed/i }));
    expect(mocks.updateReview.mutate).toHaveBeenCalledWith(
      { itemId: "queue-1", data: { status: "reviewed", tutorNote: "Reviewed and approved." } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});