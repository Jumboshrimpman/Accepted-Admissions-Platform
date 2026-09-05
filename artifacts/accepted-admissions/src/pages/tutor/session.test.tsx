import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@workspace/api-client-react", () => ({
  getGetSessionQueryKey: (id: string) => ["/api/sessions", id],
  getGetAdaptiveCurriculumQueryKey: (id: string) => ["/api/adaptive", id],
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  getListSessionArtifactsQueryKey: (id: string) => ["/api/artifacts", id],
  useGetSession: () => ({
    data: {
      id: "session-1",
      courseId: "course-1",
      title: "Taito SAT with Eunice",
      subject: "SAT",
      status: "published",
      dateTime: "2026-10-02T16:00:00.000Z",
      timezone: "America/New_York",
      durationMinutes: 60,
      meetingUrl: "https://meet.google.com/sat-room",
      calendarEventUrl: null,
      student: { id: "student-1", name: "Taito Goto" },
      tutorNotes: null,
      assignments: [],
      blocks: [],
      homework: [
        {
          assignmentId: "quiz-1",
          title: "October pre-session mini-section",
          status: "published",
          deadline: null,
          attemptStatus: "submitted",
          score: 80,
          mistakeCount: 1,
          attemptId: "attempt-1",
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
  useGetAssignment: () => ({ data: null }),
  useGetAdaptiveCurriculum: () => ({
    data: {
      homework: {
        title: "October pre-session mini-section",
        questionCount: 3,
        latestAttemptStatus: "submitted",
        latestAttemptId: "attempt-1",
      },
      mistakes: [{ skill: "Transitions" }],
      recommendations: [],
      hardQuestions: [],
      publishedBlocks: [],
      sessionPrep: {
        mode: "mistake_focus",
        summary: "Open with the missed transition item.",
        attachedQuestionCount: 0,
      },
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
});

describe("tutor session review page", () => {
  test("keeps session pages light and opens the submitted attempt for review", () => {
    render(<TutorSession />);

    expect(screen.getByTestId("session-authoring-note").textContent).toMatch(/Curriculum bank/);
    expect(screen.queryByText("Authoring tools")).toBeNull();
    expect(screen.queryByText("Generate original practice drafts")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create drafts" })).toBeNull();
    expect(screen.getByText("Homework status & results")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Review right \/ wrong answers/i }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-1",
    );
    expect(screen.getByRole("tab", { name: "Live plan" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Records" })).toBeTruthy();
  });
});
