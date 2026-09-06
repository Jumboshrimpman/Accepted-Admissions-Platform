import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const submitMutate = vi.fn();
const saveMutate = vi.fn();

const mocks = vi.hoisted(() => ({
  deliveryPhase: "before_session" as "before_session" | "during_session",
  questions: [
    {
      id: "q1",
      position: 0,
      subject: "SAT Reading & Writing",
      questionType: "multiple_choice",
      prompt: "Which transition is best?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "Therefore" },
      ],
      skill: "Transitions",
      difficulty: "medium" as const,
      predictionFirst: true,
    },
    {
      id: "q2",
      position: 1,
      subject: "SAT Reading & Writing",
      questionType: "multiple_choice",
      prompt: "Which word is most precise?",
      stimulus: null,
      choices: [
        { id: "a", label: "A", text: "collected" },
        { id: "b", label: "B", text: "attached" },
      ],
      skill: "Words in Context",
      difficulty: "medium" as const,
      predictionFirst: true,
    },
  ],
  attempt: {
    id: "attempt-1",
    assignmentId: "asg-1",
    status: "active" as const,
    remainingSeconds: 1200,
    responses: [] as Array<{
      questionId: string;
      prediction: string | null;
      predictionLocked: boolean;
      finalAnswer: string | null;
      flagged: boolean;
    }>,
  },
  result: null as null | Record<string, unknown>,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  getGetAttemptQueryKey: (id: string) => ["/api/attempts", id],
  getGetAttemptResultQueryKey: (id: string) => ["/api/attempts", id, "result"],
  useGetCurrentUser: () => ({ data: { role: "student" } }),
  useGetAssignment: () => ({
    data: {
      id: "asg-1",
      title: "Practice quiz",
      subject: "SAT",
      instructions: "Answer the questions.",
      deliveryPhase: mocks.deliveryPhase,
      questionCount: mocks.questions.length,
      timeLimitMinutes: 60,
      latestAttemptId: "attempt-1",
      questions: mocks.questions,
    },
    isLoading: false,
  }),
  useGetAttempt: () => ({
    data: mocks.attempt,
    isLoading: false,
  }),
  useGetAttemptResult: () => ({ data: mocks.result, isLoading: false, isError: false }),
  useStartAttempt: () => ({ mutate: vi.fn(), isPending: false }),
  usePauseAttempt: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeAttempt: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveAttemptResponse: () => ({ mutate: saveMutate, isPending: false }),
  useSubmitAttempt: () => ({ mutate: submitMutate, isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useParams: () => ({ assignmentId: "asg-1" }),
}));

import PortalAssignment from "./assignment";

afterEach(() => {
  cleanup();
  submitMutate.mockReset();
  saveMutate.mockReset();
  mocks.deliveryPhase = "before_session";
  mocks.attempt.status = "active";
  mocks.attempt.responses = [];
  mocks.result = null;
});

describe("student attempt UI", () => {
  test("prediction cannot hide choices or auto-advance to submit without answers", () => {
    render(<PortalAssignment />);
    expect(screen.queryByText("Prediction first")).toBeNull();
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/However/);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit assignment/i }));
    expect(submitMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("empty-submit-error").textContent).toMatch(/empty attempt is not saved/i);
  });

  test("diagnostic results show an estimated SAT range and do not claim official adaptive scoring", () => {
    mocks.attempt.status = "submitted";
    mocks.result = {
      attemptId: "attempt-1",
      assignmentId: "asg-1",
      assignmentTitle: "Full-length SAT diagnostic",
      studentUserId: "stu",
      studentName: "Taito",
      sessionId: "session-1",
      sessionDateTime: null,
      status: "submitted",
      score: 62,
      correctCount: 62,
      totalCount: 100,
      activeSeconds: 4000,
      pausedSeconds: 0,
      breakdown: [],
      items: [],
      analysis: {
        source: "deterministic",
        label: "Estimated SAT score range (College Board scoring guide, linear practice)",
        provider: null,
        strengths: ["Evidence"],
        weaknesses: ["Transitions"],
        mistakePatterns: [],
        nextFocus: ["Transitions"],
        feedback: "Estimated SAT score range: 1180–1260. Not official adaptive scoring.",
      },
      studentFeedback: "Estimated SAT score range: 1180–1260.",
      homeworkKind: "diagnostic",
      scoreReporting: "estimated_diagnostic",
      estimatedSatScore: {
        total: 1220,
        rangeLow: 1180,
        rangeHigh: 1260,
        readingWriting: 620,
        math: 600,
        label: "Estimated SAT score range (College Board scoring guide, linear practice)",
        methodology:
          "Estimated from College Board scoring-guide methodology for linear paper/digital SAT practice. This is not an official College Board adaptive digital SAT score.",
      },
    };
    render(<PortalAssignment />);
    expect(screen.getByText("1180–1260")).toBeTruthy();
    expect(screen.getByText(/estimated SAT range/i)).toBeTruthy();
    expect(screen.getByText(/not an official College Board adaptive digital SAT score/i)).toBeTruthy();
  });

  test("routine results stay accuracy-only and do not claim an official SAT score", () => {
    mocks.attempt.status = "submitted";
    mocks.result = {
      attemptId: "attempt-1",
      assignmentId: "asg-1",
      assignmentTitle: "60-minute SAT pre-work",
      studentUserId: "stu",
      studentName: "Taito",
      sessionId: "session-1",
      sessionDateTime: null,
      status: "submitted",
      score: 50,
      correctCount: 12,
      totalCount: 24,
      activeSeconds: 3000,
      pausedSeconds: 0,
      breakdown: [],
      items: [],
      analysis: {
        source: "deterministic",
        label: "Adaptive skill analysis",
        provider: null,
        strengths: [],
        weaknesses: ["Transitions"],
        mistakePatterns: [],
        nextFocus: ["Transitions"],
        feedback: "Accuracy only.",
      },
      studentFeedback: "Accuracy only.",
      homeworkKind: "routine",
      scoreReporting: "none",
      estimatedSatScore: null,
    };
    render(<PortalAssignment />);
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/Accuracy only — this 60-minute set is not an official SAT score/i)).toBeTruthy();
    expect(screen.queryByText(/estimated SAT range/i)).toBeNull();
  });

  test("in-session practice uses collaborative brown presentation instead of quiz chrome", () => {
    mocks.deliveryPhase = "during_session";
    render(<PortalAssignment />);
    expect(screen.getByTestId("session-practice-board").textContent).toMatch(/Tutor \+ student practice/);
    expect(screen.getByTestId("session-practice-board").className).toMatch(/bg-brand-ink/);
    expect(screen.queryByText("Prediction first")).toBeNull();
    expect(screen.getByText(/Together · no timed auto-submit/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save recorded answers/i }));
    expect(submitMutate).not.toHaveBeenCalled();
  });
});
