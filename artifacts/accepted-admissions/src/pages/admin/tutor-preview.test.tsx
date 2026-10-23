import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const NIKA_ID = "46d7cfee-d0c0-4bad-93e7-d79907301684";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ tutorId: NIKA_ID }),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => mocks.customFetch(...args),
}));

import AdminTutorPreview from "./tutor-preview";

const payload = {
  tutorProfileId: NIKA_ID,
  readOnly: true,
  dashboard: {
    user: {
      id: "tutor-user",
      displayName: "Nika Raiffe",
      email: "tutor@example.invalid",
      role: "tutor",
      avatarUrl: null,
    },
    welcomeMessage: "Your sessions and practice are ready.",
    courses: [
      {
        id: "course-fall",
        title: "Fall 2026 SAT & IELTS",
        subject: "SAT & IELTS",
        term: "Fall 2026",
        status: "active",
        sessionCount: 0,
        completedSessionCount: 0,
        tutors: [],
      },
    ],
    upcomingSessions: [],
    curriculumSessions: [],
    assignments: [],
    recentScores: [],
    reviewSkills: [],
    credits: { purchasedHours: 0, usedHours: 0, remainingHours: 0, readOnly: true },
    progress: {
      totalSessions: 0,
      completedSessions: 0,
      averageScore: null,
      strengths: [],
      weaknesses: [],
    },
    assignedStudents: [],
    newSubmissions: [
      {
        attemptId: "attempt-1",
        assignmentId: "assignment-1",
        assignmentTitle: "English diagnostic",
        studentUserId: "student",
        studentName: "Preview Student",
        status: "submitted",
        score: 100,
        submittedAt: "2026-10-22T12:00:00.000Z",
        reviewStatus: "new",
        mistakeCount: 0,
        tutorNotes: null,
        sessionId: "session-1",
        sessionDateTime: "2026-10-23T12:00:00.000Z",
        analysisPreview: null,
        nextFocus: [],
        sessionOpener: null,
        skipRehash: [],
        sectionBreakdown: [],
        missClusters: [],
      },
    ],
    openReviewCount: 1,
    materials: [],
  },
  reviewQueue: [
    {
      id: "queue-1",
      attemptId: "attempt-1",
      questionId: "question-1",
      studentName: "Preview Student",
      skill: "Reading",
      reason: "Flagged",
      prediction: null,
      finalAnswer: null,
      status: "open",
      tutorNote: null,
    },
  ],
  dateHours: {
    tutorProfileId: NIKA_ID,
    timezone: "America/New_York",
    today: "2026-10-23",
    latestDate: "2027-01-21",
    editorDates: ["2026-10-23", "2026-10-26"],
    dateHours: {
      "2026-10-23": [],
      "2026-10-26": [{ start: "21:00", end: "22:00" }],
    },
  },
  dateHoursUnavailable: false,
  offeredAvailability: {
    from: "2026-10-23T14:00:00.000Z",
    to: "2026-11-06T14:00:00.000Z",
    timezone: "America/New_York",
    providerStatus: "disconnected",
    offeredToClients: true,
    lengths: [
      { durationMinutes: 60, slots: ["2026-10-27T01:00:00.000Z"] },
      { durationMinutes: 90, slots: [] },
      { durationMinutes: 120, slots: [] },
    ],
  },
  offeredAvailabilityError: false,
  googleBusyTimesOmitted: false,
  calendar: { status: "disconnected" as const },
};

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

describe("administrator tutor preview", () => {
  test("shows the tutor dashboard without save, connect, or review controls", async () => {
    mocks.customFetch.mockResolvedValue(payload);
    render(<AdminTutorPreview />);

    expect(await screen.findByTestId("tutor-preview-banner")).toBeTruthy();
    expect(screen.getByText("Administrator tutor preview")).toBeTruthy();
    expect(screen.getByText(/Nika Raiffe's tutor dashboard/)).toBeTruthy();
    expect(screen.getByText("Set your bookable hours")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("This date is closed.");
    expect(screen.getByText("Availability offered to clients")).toBeTruthy();
    expect(screen.getByTestId("tutor-calendar-preview").textContent).toContain("Disconnected");
    expect(screen.getByRole("button", { name: /Review submission/i }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: /Open meeting plan/i }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByTestId("tutor-open-curriculum").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /Clear flags/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Save this date/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Connect Google Calendar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Disconnect/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open workspace/i })).toBeNull();
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenCalledTimes(1);
    });
    expect(mocks.customFetch).toHaveBeenCalledWith(`/api/admin/tutors/${NIKA_ID}/preview`);
  });
});
