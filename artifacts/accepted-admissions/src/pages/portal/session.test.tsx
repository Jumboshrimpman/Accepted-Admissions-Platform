import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

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
      assignments: [
        {
          id: "quiz-1",
          title: "October pre-session mini-section",
          deliveryPhase: "before_session",
          questionCount: 3,
          timeLimitMinutes: 20,
          latestScore: null,
          latestAttemptId: null,
          latestAttemptStatus: null,
        },
      ],
      blocks: [],
      homework: [],
    },
    isLoading: false,
    error: null,
  }),
  useGetAdaptiveCurriculum: () => ({ data: null, isLoading: false, isError: false }),
  useListSessionArtifacts: () => ({ data: [] }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ courseId: "course-1", sessionId: "session-1" }),
}));

import PortalSession from "./session";

afterEach(() => {
  cleanup();
});

describe("student session quiz path", () => {
  test("offers Start pre-work before the meeting and links to the assignment", () => {
    render(<PortalSession />);

    expect(screen.getByText("Complete the assigned pre-work, then review right and wrong answers with your tutor.")).toBeTruthy();
    const takeQuiz = screen.getByRole("link", { name: /Start pre-work/i });
    expect(takeQuiz.getAttribute("href")).toBe("/portal/assignments/quiz-1");
  });
});
