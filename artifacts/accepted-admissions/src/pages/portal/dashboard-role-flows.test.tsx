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
  getGetDashboardQueryKey: () => ["dashboard"],
  getListReviewQueueQueryKey: () => ["review-queue"],
  getGetBookingAvailabilityQueryKey: () => ["availability"],
  getListBookingSessionsQueryKey: () => ["sessions"],
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
  useListBookingTutors: () => ({
    data: [],
    isLoading: false,
  }),
  useListBookingSessions: () => ({
    data: [],
    isLoading: false,
  }),
  useGetBookingAvailability: () => ({
    data: null,
    isLoading: false,
  }),
  useCreateBookingSession: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useCancelBookingSession: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useRescheduleBookingSession: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: unknown }) => (
    <a href={href} {...props}>
      {children as never}
    </a>
  ),
  useLocation: () => ["/portal", vi.fn()],
}));

import FallWelcomeDashboard, { ClientDashboardView } from "./fall-welcome-dashboard";
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
        tutors: isTutor
          ? []
          : [
              {
                id: "eunice",
                name: "Eunice Chon",
                specialty: "SAT Tutor",
                avatarUrl: null,
              },
              {
                id: "nika",
                name: "Nika Raiffe",
                specialty: "English Tutor",
                avatarUrl: null,
              },
            ],
      },
    ],
    upcomingSessions: isTutor
      ? [
          {
            id: "session-sat",
            courseId: "course-fall",
            dateTime: "2026-10-02T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            durationMinutes: 60,
            subject: "SAT",
            title: "Taito’s SAT Session with Eunice",
            status: "published",
            meetingUrl: "https://meet.google.com/sat-room",
            calendarEventUrl: "https://calendar.google.com/calendar/r/day?date=20261002",
            tutor: { id: "tutor-user", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
            student: { id: "student", name: "Taito Goto" },
          },
        ]
      : [
          {
            id: "session-sat",
            courseId: "course-fall",
            dateTime: "2026-10-02T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            durationMinutes: 60,
            subject: "SAT",
            title: "Taito’s SAT Session with Eunice",
            status: "published",
            meetingUrl: "https://meet.google.com/sat-room",
            calendarEventUrl: "https://calendar.google.com/calendar/r/day?date=20261002",
            tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
            student: { id: role === "viewer" ? "student-user" : `${role}-user`, name: "Taito Goto" },
          },
          {
            id: "session-ielts",
            courseId: "course-fall",
            dateTime: "2026-10-23T12:00:00.000Z",
            timezone: "Asia/Tokyo",
            durationMinutes: 60,
            subject: "IELTS",
            title: "Taito’s English Session with Nika",
            status: "published",
            meetingUrl: "https://meet.google.com/ielts-room",
            calendarEventUrl: "https://calendar.google.com/calendar/r/day?date=20261023",
            tutor: { id: "tutor-2", name: "Nika Raiffe", specialty: "IELTS Tutor", avatarUrl: null },
            student: { id: role === "viewer" ? "student-user" : `${role}-user`, name: "Taito Goto" },
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
    credits: {
      purchasedHours: isTutor ? 0 : 4,
      usedHours: 0,
      remainingHours: isTutor ? 0 : 4,
      readOnly: role === "viewer",
      selfServeSatBooking: false,
      twelveSessionPlan: !isTutor,
    },
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

    expect(screen.getAllByText("Taito’s SAT Session with Eunice").length).toBeGreaterThan(0);
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getAllByText("9:00–10:00 PM JST").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Join meeting/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("link", { name: /Open calendar/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("off-platform-billing-note")).toBeTruthy();
    expect(screen.queryByText("Book a prepaid SAT session")).toBeNull();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("Past due")).toBeTruthy();
    expect(screen.getByText("Your tutors")).toBeTruthy();
    expect(screen.getAllByText("Eunice Chon").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nika Raiffe").length).toBeGreaterThan(0);
    expect(screen.getByText("One plan. Twelve focused meetings.")).toBeTruthy();
    expect(screen.getByText("Twelve-session roadmap")).toBeTruthy();
  });

  test("viewer gets the same scoped review surface in explicit view-only mode", () => {
    mocks.dashboard = dashboardForRole("viewer");
    render(<FallWelcomeDashboard />);

    expect(screen.getByRole("status").textContent).toContain("view-only mode");
    expect(screen.getByText("Your tutors")).toBeTruthy();
    expect(screen.getAllByText("Taito’s SAT Session with Eunice").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Join meeting/i })[0]?.getAttribute("href")).toBe(
      "https://meet.google.com/sat-room",
    );
    expect(screen.queryByText("Book a prepaid SAT session")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark reviewed/i })).toBeNull();
  });

  test("administrator preview keeps client data visible without client actions", () => {
    mocks.dashboard = dashboardForRole("student");
    render(<ClientDashboardView dashboard={mocks.dashboard} adminPreview />);

    expect(screen.getByRole("status").textContent).toContain("Read-only client preview");
    expect(screen.getByText("Your tutors")).toBeTruthy();
    expect(screen.getAllByText("Taito’s SAT Session with Eunice").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Read only" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Open session/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Join meeting/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open calendar/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Start|Continue|View result/i })).toBeNull();
  });

  test("tutor sees only tutor workspace controls and can review assigned work", () => {
    mocks.dashboard = {
      ...dashboardForRole("tutor"),
      newSubmissions: [
        {
          attemptId: "attempt-1",
          assignmentId: "assignment-1",
          assignmentTitle: "October 2 SAT diagnostic",
          studentUserId: "student",
          studentName: "Taito Goto",
          status: "submitted",
          score: 80,
          submittedAt: "2026-09-30T12:00:00.000Z",
          reviewStatus: "new",
          mistakeCount: 2,
          tutorNotes: null,
          analysisPreview:
            "Open with the 3 Transitions misses first — start at “Which transition best connects”.",
          nextFocus: ["SAT Math", "Math", "Reading and Writing", "Transitions"],
          sessionOpener:
            "Open with the 3 Transitions misses first — start at “Which transition best connects”.",
          skipRehash: ["Evidence (100% · 4/4)"],
          sectionBreakdown: [
            { section: "rw", label: "Reading and Writing", accuracy: 80, total: 10, missCount: 2 },
            { section: "math", label: "Math", accuracy: 90, total: 10, missCount: 1 },
          ],
          missClusters: [{ label: "Transitions", missCount: 3, examples: ["Which transition best connects"] }],
        },
      ],
    } as Dashboard;
    render(<TutorDashboard />);

    expect(screen.getAllByText("Taito Goto").length).toBeGreaterThan(0);
    expect(screen.getByText("9:00–10:00 PM JST")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open workspace/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Join meeting/i }).getAttribute("href")).toBe(
      "https://meet.google.com/sat-room",
    );
    expect(screen.getByRole("link", { name: /Open calendar/i }).getAttribute("href")).toBe(
      "https://calendar.google.com/calendar/r/day?date=20261002",
    );
    expect(screen.getByText("New submission alerts")).toBeTruthy();
    expect(screen.getByText("1 to review")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Review submission/i })).toHaveLength(1);
    expect(screen.queryByText(/Flagged skills/i)).toBeNull();
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/Transitions/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).toMatch(/Reading and Writing 80%/);
    expect(screen.getByTestId("tutor-analysis-brief").textContent).not.toMatch(
      /Focus:\s*SAT Math · Math · Reading and Writing/,
    );
    fireEvent.click(screen.getByRole("button", { name: /Clear flags/i }));
    expect(mocks.updateReview.mutate).toHaveBeenCalledWith(
      { itemId: "queue-1", data: { status: "reviewed", tutorNote: "Reviewed and approved." } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("adaptive guidance never shows Skill not in extract to clients", () => {
    mocks.dashboard = {
      ...dashboardForRole("student"),
      credits: {
        purchasedHours: 4,
        usedHours: 0,
        remainingHours: 4,
        readOnly: false,
        selfServeSatBooking: false,
        twelveSessionPlan: false,
      },
      curriculumSessions: [
        {
          id: "session-sat",
          courseId: "course-fall",
          dateTime: "2026-10-02T12:00:00.000Z",
          timezone: "Asia/Tokyo",
          durationMinutes: 60,
          subject: "SAT",
          title: "Taito’s SAT Session with Eunice",
          status: "published",
          meetingUrl: "https://meet.google.com/sat-room",
          calendarEventUrl: null,
          tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "student-user", name: "Taito Goto" },
          readiness: "ready",
          nextAction: "Review answers",
          currentFocus: "Skill not in extract",
          preparation: null,
          latestResult: {
            status: "submitted",
            score: 31,
            attemptId: "attempt-1",
            analysis: {
              source: "deterministic",
              label: "Adaptive skill analysis",
              provider: null,
              strengths: ["Skill not in extract (80% accuracy)"],
              weaknesses: ["Skill not in extract (31% accuracy)"],
              mistakePatterns: ["Skill not in extract: 11 misses"],
              nextFocus: ["Skill not in extract"],
              feedback: "Skill not in extract needs more practice.",
              missClusters: [{ label: "Algebra", kind: "domain", missCount: 8 }],
              sectionBreakdown: [
                { section: "math", label: "Math", accuracy: 31, total: 16, missCount: 11 },
              ],
            },
          },
        },
      ],
    } as Dashboard;
    render(<FallWelcomeDashboard />);

    expect(screen.getByText("Adaptive guidance")).toBeTruthy();
    expect(screen.queryByText(/Skill not in extract/i)).toBeNull();
    expect(screen.getByTestId("adaptive-missed-skill").textContent).toMatch(/Algebra/);
    expect(screen.getByTestId("adaptive-next-practice").textContent).toMatch(/Practice Algebra next/);
  });

  test("Michelle can self-serve SAT booking for Xavier or Eunice", () => {
    mocks.dashboard = {
      ...dashboardForRole("student"),
      user: {
        id: "michelle-user",
        displayName: "Michelle Makarem",
        email: "michaelmakarem@gmail.com",
        role: "student",
        avatarUrl: null,
      },
      credits: {
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        readOnly: false,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
      curriculumSessions: [
        {
          id: "session-michelle-sat",
          courseId: "course-fall",
          dateTime: "2026-09-15T16:00:00.000Z",
          timezone: "America/New_York",
          durationMinutes: 60,
          subject: "SAT",
          title: "Michelle’s SAT Session with Xavier",
          status: "published",
          meetingUrl: "https://meet.google.com/michelle-sat",
          calendarEventUrl: null,
          tutor: { id: "tutor-xavier", name: "Xavier", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "michelle-user", name: "Michelle Makarem" },
          readiness: "ready",
          nextAction: "Open session plan",
          currentFocus: "Evidence and conventions.",
          preparation: null,
          latestResult: null,
        },
      ],
    } as Dashboard;
    render(<FallWelcomeDashboard />);

    expect(screen.getByTestId("client-credit-balance")).toBeTruthy();
    expect(screen.getByText("Book a prepaid SAT session")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Purchase session credits/i }).getAttribute("href")).toBe(
      "/portal/sat",
    );
    expect(screen.queryByTestId("off-platform-billing-note")).toBeNull();
    expect(screen.queryByText("One plan. Twelve focused meetings.")).toBeNull();
    expect(screen.queryByText("Twelve-session roadmap")).toBeNull();
    expect(screen.queryByText(/twelve focused meetings/i)).toBeNull();
    expect(screen.getByText("Welcome back, Michelle.")).toBeTruthy();
    expect(screen.getByText("Session roadmap")).toBeTruthy();
    expect(screen.getByText("Michelle’s SAT Session with Xavier")).toBeTruthy();
  });

  test("client session roadmap hides cancelled meetings", () => {
    mocks.dashboard = {
      ...dashboardForRole("student"),
      credits: {
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        readOnly: false,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
      curriculumSessions: [
        {
          id: "session-live",
          courseId: "course-fall",
          dateTime: "2026-09-15T16:00:00.000Z",
          timezone: "America/New_York",
          durationMinutes: 60,
          subject: "SAT",
          title: "Live SAT Session",
          status: "published",
          bookingStatus: "confirmed",
          meetingUrl: null,
          calendarEventUrl: null,
          tutor: { id: "tutor-xavier", name: "Xavier", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "student-user", name: "Student" },
          readiness: "ready",
          nextAction: "Open session plan",
          currentFocus: "Evidence",
          preparation: null,
          latestResult: null,
        },
        {
          id: "e66d31e8-b953-4a0c-a067-f30f142b4461",
          courseId: "course-fall",
          dateTime: "2026-09-07T20:00:00.000Z",
          timezone: "America/New_York",
          durationMinutes: 60,
          subject: "SAT",
          title: "SAT capability test — Xavier",
          status: "published",
          bookingStatus: "cancelled",
          meetingUrl: null,
          calendarEventUrl: null,
          tutor: { id: "tutor-xavier", name: "Xavier", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "student-user", name: "Student" },
          readiness: "ready",
          nextAction: "Open session plan",
          currentFocus: "Evidence",
          preparation: null,
          latestResult: null,
        },
      ],
    } as Dashboard;
    render(<FallWelcomeDashboard />);
    expect(screen.getByText("Session roadmap")).toBeTruthy();
    expect(screen.getByText("Live SAT Session")).toBeTruthy();
    expect(screen.queryByText("Cancelled SAT Session")).toBeNull();
    expect(screen.queryByText("SAT capability test — Xavier")).toBeNull();
    expect(screen.queryByText(/Sep 7/)).toBeNull();
  });

  test("tutor curriculum view does not show SAT purchase or book CTAs even when self-serve is on", () => {
    mocks.dashboard = {
      ...dashboardForRole("tutor"),
      credits: {
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        readOnly: false,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
    };
    render(<FallWelcomeDashboard />);

    expect(screen.queryByTestId("client-credit-balance")).toBeNull();
    expect(screen.queryByTestId("link-portal-sat-pay")).toBeNull();
    expect(screen.queryByRole("link", { name: /Purchase session credits/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Buy more SAT credits/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Purchase SAT hours/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Book a SAT session/i })).toBeNull();
    expect(screen.queryByText("Book a prepaid SAT session")).toBeNull();
    expect(screen.getByTestId("off-platform-billing-note")).toBeTruthy();
  });

  test("tutor dashboard has no SAT buy or book entry points", () => {
    mocks.dashboard = dashboardForRole("tutor");
    render(<TutorDashboard />);

    expect(screen.queryByRole("link", { name: /Purchase session credits/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Buy more SAT credits/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Purchase SAT/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Book SAT" })).toBeNull();
    expect(screen.queryByText("Book a prepaid SAT session")).toBeNull();
    expect(screen.getByRole("link", { name: /Open workspace/i }).getAttribute("href")).toMatch(
      /^\/tutor\//,
    );
  });
});
