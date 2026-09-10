import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
      dateTime: "2026-10-02T16:00:00.000Z",
      timezone: "America/New_York",
      durationMinutes: 60,
      meetingUrl: null,
      calendarEventUrl: null,
      studentNotes: null,
      assignments: mocks.assignments,
      blocks: [],
      homework: [],
    },
    isLoading: false,
    error: null,
  }),
  useGetAdaptiveCurriculum: () => ({ data: null, isLoading: false, isError: false }),
  useListSessionArtifacts: () => ({ data: [] }),
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
  mocks.assignments[0]!.latestAttemptId = null;
  mocks.assignments[0]!.latestAttemptStatus = null;
});

describe("student session quiz path", () => {
  test("offers Start pre-work before the meeting and links to the assignment", () => {
    render(<PortalSession />);

    expect(screen.getByText("Complete the assigned pre-work, then review right and wrong answers with your tutor.")).toBeTruthy();
    const takeQuiz = screen.getByRole("link", { name: /Start pre-work/i });
    expect(takeQuiz.getAttribute("href")).toBe("/portal/assignments/quiz-1");
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/Practice together from pre-work/);
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(
      /Open a wrong answer to review with correct explanation/,
    );
    expect(screen.queryByTestId("opened-miss")).toBeNull();
    expect(screen.getByText(/Open a miss or similar problem and work it with your tutor/)).toBeTruthy();
  });

  test("in-progress pre-work shows Resume and opens the quiz with resume=1", () => {
    mocks.assignments[0]!.latestAttemptId = "attempt-1";
    mocks.assignments[0]!.latestAttemptStatus = "paused";
    render(<PortalSession />);
    const resume = screen.getByRole("link", { name: /^Resume$/i });
    expect(resume.getAttribute("href")).toBe("/portal/assignments/quiz-1?resume=1");
  });
});
