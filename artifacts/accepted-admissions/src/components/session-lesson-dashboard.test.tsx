import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const requestRetry = vi.fn();
const recordOutcome = vi.fn();

const defaultLesson = {
  sessionId: "session-1",
  scoreReporting: "none",
  scoreHonesty: "This 30–50 question pre-work reports accuracy only. It is not an official SAT score.",
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
      choices: [
        { id: "a", label: "A", text: "Similarly" },
        { id: "b", label: "B", text: "However" },
        { id: "c", label: "C", text: "For example" },
        { id: "d", label: "D", text: "Therefore" },
      ],
      officialExplanation: "However signals contrast.",
      studentAnswer: "a",
      correctAnswer: "b",
    },
    {
      questionId: "q2",
      skill: "Transitions",
      prompt: "Which choice most logically completes the text?",
      studentAnswer: "c",
      correctAnswer: "d",
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
};

let lessonData = structuredClone(defaultLesson);

vi.mock("@workspace/api-client-react", () => ({
  getGetSessionLessonQueryKey: (id: string) => ["/api/sessions", id, "lesson"],
  useGetCurrentUser: () => ({ data: { role: "tutor" } }),
  useGetSessionLesson: () => ({
    data: lessonData,
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
  lessonData = structuredClone(defaultLesson);
});

describe("session lesson dashboard", () => {
  test("groups misses by weakness and can request a retry without revealing the answer first", () => {
    render(<SessionLessonDashboard sessionId="session-1" />);
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(/not an official SAT score/);
    expect(screen.getByTestId("weakness-group-1").textContent).toMatch(/Transitions/);
    expect(screen.getByTestId("opened-miss").className).toMatch(/bg-brand-ink/);
    expect(screen.getByTestId("session-lesson-dashboard").textContent).toMatch(
      /Open a wrong answer to review with correct explanation/,
    );
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/Review this wrong answer together/);
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/Official explanation/);
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/However signals contrast/);
    expect(screen.getByTestId("opened-miss-choices").textContent).toMatch(/Similarly/);
    expect(screen.getByTestId("opened-miss-choices").textContent).toMatch(/However/);
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/Student answer:\s*A\. Similarly/);
    expect(screen.getByTestId("opened-miss-correct-answer").textContent).toMatch(/B\. However/);
    expect(screen.getByTestId("retry-prompt-retry-1").textContent).toMatch(
      /Which transition best completes the second draft/,
    );
    expect(screen.getByTestId("retry-retry-1").textContent).not.toMatch(/correct answer/i);
    expect(screen.getByTestId("retry-retry-1").textContent).toMatch(/Similar practice question/);
    expect(screen.getByTestId("retry-retry-1").textContent).not.toMatch(/\bbank\b/);
    fireEvent.click(screen.getByTestId("request-similar-retry"));
    expect(requestRetry).toHaveBeenCalledWith(
      { sessionId: "session-1", data: { sourceQuestionId: "q1" } },
      expect.any(Object),
    );
    fireEvent.click(screen.getByTestId("retry-choice-retry-1-b"));
    fireEvent.click(screen.getByTestId("record-retry-outcome"));
    expect(recordOutcome).toHaveBeenCalledWith(
      { retryId: "retry-1", data: { studentAnswer: "b" } },
      expect.any(Object),
    );
  });

  test("miss buttons use Q-numbers and snippets instead of identical skill chips", () => {
    lessonData.weaknessGroups = [
      {
        id: "g-stale",
        skill: "Skill not in extract",
        domain: "SAT Math",
        missCount: 2,
        priority: 1,
        questionIds: ["q1", "q2"],
      },
    ];
    lessonData.misses = [
      {
        questionId: "q1",
        skill: "Skill not in extract",
        domain: "SAT Math",
        prompt: "If 2x + 3 = 11, what is the value of x?",
        studentAnswer: "4",
        correctAnswer: "4",
      },
      {
        questionId: "q2",
        skill: "Skill not in extract",
        domain: "SAT Math",
        prompt: "What is the slope of the line through (0, 0) and (2, 6)?",
        studentAnswer: "2",
        correctAnswer: "3",
      },
    ];
    render(<SessionLessonDashboard sessionId="session-1" />);
    expect(screen.getByTestId("weakness-group-1").textContent).toMatch(/SAT Math/);
    expect(screen.getByTestId("weakness-group-1").textContent).not.toMatch(/Skill not in extract/);
    expect(screen.getByTestId("miss-picker-q1").textContent).toMatch(/^Q1 · /);
    expect(screen.getByTestId("miss-picker-q2").textContent).toMatch(/^Q2 · /);
    expect(screen.getByTestId("miss-picker-q1").textContent).not.toEqual(
      screen.getByTestId("miss-picker-q2").textContent,
    );
    expect(screen.queryByText("Skill not in extract")).toBeNull();
    expect(screen.getByTestId("opened-miss").textContent).toMatch(/SAT Math/);
  });

  test("checking a similar problem shows Incorrect with the correct answer", () => {
    recordOutcome.mockImplementation((_vars, options) => {
      options?.onSuccess?.({
        retryId: "retry-1",
        correct: false,
        outcome: "still_struggling",
        correctAnswer: "b",
        explanation: "However signals contrast.",
      });
    });
    render(<SessionLessonDashboard sessionId="session-1" />);
    fireEvent.click(screen.getByTestId("retry-choice-retry-1-a"));
    fireEvent.click(screen.getByTestId("record-retry-outcome"));
    expect(screen.getByRole("status").textContent).toMatch(/^Incorrect\./);
    expect(screen.getByRole("status").textContent).toMatch(/B\. However/);
    expect(screen.getByRole("status").textContent).not.toMatch(/still struggling/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/\bbank\b/);
    expect(screen.getByTestId("retry-outcome-retry-1").textContent).toMatch(/Incorrect/);
    expect(screen.getByTestId("retry-feedback-retry-1").textContent).toMatch(/Your answer:\s*A\. Meanwhile/);
    expect(screen.getByTestId("retry-correct-answer-retry-1").textContent).toMatch(/B\. However/);
    expect(screen.getByTestId("retry-explanation-retry-1").textContent).toMatch(/However signals contrast/);
    expect(screen.getByTestId("retry-retry-1").getAttribute("data-expanded")).toBe("true");
  });

  test("Incorrect feedback still shows the answer when the key is a letter C", () => {
    lessonData.retries = [
      {
        id: "retry-c",
        source: "bank",
        outcome: "still_struggling",
        retryQuestionId: "retry-q-c",
        correct: false,
        prompt: "Which choice most logically completes the text?",
        choices: [
          { id: "a", label: "A", text: "Meanwhile" },
          { id: "c", label: "C", text: "For example" },
        ],
        studentAnswer: "a",
        correctAnswer: "C",
        explanation: "For example introduces an illustration.",
      },
    ];
    render(<SessionLessonDashboard sessionId="session-1" />);
    fireEvent.click(screen.getByTestId("retry-toggle-retry-c"));
    expect(screen.getByTestId("retry-correct-answer-retry-c").textContent).toMatch(/C\. For example/);
    expect(screen.getByTestId("retry-explanation-retry-c").textContent).toMatch(
      /For example introduces an illustration/,
    );
  });

  test("graded retries collapse by default and can show details", () => {
    lessonData.retries = [
      {
        id: "retry-2",
        source: "bank",
        outcome: "still_struggling",
        retryQuestionId: "retry-q-2",
        correct: false,
        prompt: "Which transition best completes the second draft?",
        choices: [
          { id: "a", label: "A", text: "Meanwhile" },
          { id: "b", label: "B", text: "However" },
        ],
        studentAnswer: "a",
        correctAnswer: "b",
        explanation: "However signals contrast.",
      },
      {
        id: "retry-3",
        source: "bank",
        outcome: "mastered",
        retryQuestionId: "retry-q-3",
        correct: true,
        prompt: "Which choice is correct?",
        studentAnswer: "b",
        correctAnswer: "b",
      },
    ];
    render(<SessionLessonDashboard sessionId="session-1" />);
    expect(screen.getByTestId("retry-outcome-retry-2").textContent).toMatch(/Incorrect/);
    expect(screen.getByTestId("retry-outcome-retry-3").textContent).toMatch(/Correct/);
    expect(screen.getByTestId("retry-summary-retry-2").textContent).toMatch(/Which transition best/);
    expect(screen.getByTestId("retry-retry-2").getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByTestId("retry-feedback-retry-2")).toBeNull();
    expect(screen.queryByTestId("retry-prompt-retry-2")).toBeNull();
    fireEvent.click(screen.getByTestId("retry-toggle-retry-2"));
    expect(screen.getByTestId("retry-retry-2").getAttribute("data-expanded")).toBe("true");
    expect(screen.getByTestId("retry-toggle-retry-2").textContent).toMatch(/Hide/);
    expect(screen.getByTestId("retry-feedback-retry-2").textContent).toMatch(/Your answer:\s*A\. Meanwhile/);
    expect(screen.getByTestId("retry-correct-answer-retry-2").textContent).toMatch(/B\. However/);
    expect(screen.getByTestId("retry-feedback-retry-2").textContent).toMatch(/However signals contrast/);
    expect(screen.getByTestId("retry-retry-2").textContent).toMatch(/Similar practice question/);
    expect(screen.getByTestId("retry-retry-2").textContent).not.toMatch(/still struggling/i);
    expect(screen.getByTestId("retry-retry-2").textContent).not.toMatch(/\bbank\b/);
    fireEvent.click(screen.getByTestId("retry-toggle-retry-2"));
    expect(screen.getByTestId("retry-retry-2").getAttribute("data-expanded")).toBe("false");
    expect(screen.queryByTestId("retry-feedback-retry-2")).toBeNull();
    expect(screen.getByTestId("retry-retry-3").getAttribute("data-expanded")).toBe("false");
    fireEvent.click(screen.getByTestId("retry-toggle-retry-3"));
    expect(screen.getByTestId("retry-feedback-retry-3").textContent).toMatch(/Your answer/);
    expect(screen.queryByTestId("retry-correct-answer-retry-3")).toBeNull();
  });
});
