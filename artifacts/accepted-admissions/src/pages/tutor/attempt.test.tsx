import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const search = vi.hoisted(() => ({ value: "" }));

vi.mock("@workspace/api-client-react", () => ({
  getGetAttemptResultQueryKey: (id: string) => ["/api/attempts", id, "result"],
  getListReviewSubmissionsQueryKey: () => ["/api/review"],
  customFetch: vi.fn(),
  useGetAttemptResult: () => ({
    data: {
      attemptId: "attempt-1",
      assignmentId: "quiz-1",
      assignmentTitle: "October pre-session mini-section",
      studentUserId: "stu",
      studentName: "Taito Goto",
      sessionId: "session-1",
      sessionDateTime: "2026-10-09T16:00:00.000Z",
      status: "submitted",
      score: 50,
      correctCount: 1,
      totalCount: 2,
      activeSeconds: 120,
      pausedSeconds: 0,
      breakdown: [],
      items: [
        {
          questionId: "q1",
          correct: true,
          finalAnswer: "a",
          correctAnswer: "a",
          explanation: "Evidence.",
          skill: "Evidence",
          flagged: false,
          prompt: "Which claim is supported?",
          choices: [{ id: "a", label: "A", text: "Supported" }],
        },
        {
          questionId: "q2",
          correct: false,
          finalAnswer: "a",
          correctAnswer: "b",
          explanation: "However signals contrast.",
          skill: "Transitions",
          flagged: false,
          prompt: "Which transition best connects the paragraphs?",
          choices: [
            { id: "a", label: "A", text: "Similarly" },
            { id: "b", label: "B", text: "However" },
          ],
        },
      ],
      analysis: {
        source: "deterministic",
        label: "Ready to review",
        strengths: ["Evidence"],
        weaknesses: ["Transitions"],
        mistakePatterns: ["Transitions"],
        nextFocus: ["Transitions"],
        feedback: "Review transitions.",
      },
      studentFeedback: "Review transitions.",
      tutorNotes: "",
      reviewStatus: "new",
    },
    isLoading: false,
    error: null,
  }),
  useUpdateAttemptReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ attemptId: "attempt-1" }),
  useSearch: () => search.value,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: {
      attemptId: "attempt-1",
      assignmentId: "quiz-1",
      assignmentTitle: "October pre-session mini-section",
      sessionId: "session-1",
      totalCount: 2,
      wrongCount: 1,
      items: [{ questionId: "q2", correct: false, skill: "Transitions", prompt: "Which transition best connects the paragraphs?" }],
    },
  }),
}));

import TutorAttempt from "./attempt";

afterEach(() => {
  cleanup();
  search.value = "";
});

describe("tutor attempt wrong-answers filter", () => {
  test("filters a homework attempt to wrong answers only and uses the misses API", () => {
    render(<TutorAttempt />);
    expect(screen.getByTestId("attempt-item-q1")).toBeTruthy();
    expect(screen.getByTestId("attempt-item-q2")).toBeTruthy();
    fireEvent.click(screen.getByTestId("wrong-answers-only-toggle"));
    expect(screen.queryByTestId("attempt-item-q1")).toBeNull();
    expect(screen.getByTestId("attempt-item-q2").textContent).toMatch(/Transitions/);
    expect(screen.getByTestId("wrong-answers-only-summary").textContent).toMatch(/1 miss/);
  });

  test("opens already filtered when the wrongAnswersOnly query is present", () => {
    search.value = "wrongAnswersOnly=1";
    render(<TutorAttempt />);
    expect(screen.queryByTestId("attempt-item-q1")).toBeNull();
    expect(screen.getByTestId("attempt-item-q2")).toBeTruthy();
    expect(screen.getByTestId("wrong-answers-only-toggle").textContent).toMatch(/Showing wrong answers only/);
  });
});
