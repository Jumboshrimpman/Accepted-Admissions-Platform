import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const requestRetry = vi.fn();
const recordOutcome = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  getGetSessionLessonQueryKey: (id: string) => ["/api/sessions", id, "lesson"],
  useGetSessionLesson: () => ({
    data: {
      sessionId: "session-1",
      scoreReporting: "none",
      scoreHonesty: "This 60-minute pre-work reports accuracy only. It is not an official SAT score.",
      accuracyPercent: 50,
      weaknessGroups: [
        {
          id: "g1",
          skill: "Transitions",
          domain: "Expression of Ideas",
          missCount: 2,
          priority: 1,
          questionIds: ["q1", "q2"],
        },
      ],
      misses: [
        {
          questionId: "q1",
          skill: "Transitions",
          prompt: "Which transition best connects the paragraphs?",
          officialExplanation: "However signals contrast.",
          studentAnswer: "a",
        },
      ],
      retries: [
        {
          id: "retry-1",
          source: "bank",
          outcome: "pending",
          retryQuestionId: "retry-q",
          prompt: "Which transition best completes the second draft?",
          choices: [
            { id: "a", label: "A", text: "Meanwhile" },
            { id: "b", label: "B", text: "However" },
          ],
        },
      ],
    },
    isLoading: false,
  }),
  useRequestSessionRetry: () => ({ mutate: requestRetry, isPending: false }),
  useRecordRetryOutcome: () => ({ mutate: recordOutcome, isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { SessionLessonDashboard } from "./session-lesson-dashboard";

afterEach(() => {
  cleanup();
  requestRetry.mockReset();
  recordOutcome.mockReset();
});

describe("session lesson dashboard", () => {
  test("groups misses by weakness and can request a retry without revealing the answer first", () => {
    render(<SessionLessonDashboard sessionId="session-1" />);
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/not an official SAT score/);
    expect(screen.getByTestId("weakness-group-1").textContent).toMatch(/Transitions/);
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/Official explanation/);
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/However signals contrast/);
    expect(screen.getByTestId("retry-prompt-retry-1").textContent).toMatch(
      /Which transition best completes the second draft/,
    );
    expect(screen.getByTestId("retry-retry-1").textContent).not.toMatch(/correct answer/i);
    fireEvent.click(screen.getByTestId("request-similar-retry"));
    expect(requestRetry).toHaveBeenCalledWith(
      { sessionId: "session-1", data: { sourceQuestionId: "q1" } },
      expect.any(Object),
    );
    fireEvent.change(screen.getByLabelText("Retry answer"), { target: { value: "b" } });
    fireEvent.click(screen.getByTestId("record-retry-outcome"));
    expect(recordOutcome).toHaveBeenCalledWith(
      { retryId: "retry-1", data: { studentAnswer: "b" } },
      expect.any(Object),
    );
  });
});
