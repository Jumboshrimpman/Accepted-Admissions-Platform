import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const submitMutate = vi.fn();
const saveMutate = vi.fn();
const startMutate = vi.fn();

const mocks = vi.hoisted(() => ({
  deliveryPhase: "before_session" as "before_session" | "during_session",
  title: "Practice quiz",
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
      presentation: undefined as "figure_primary" | "text" | undefined,
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
      revealed?: boolean;
      correct?: boolean | null;
      correctAnswer?: string | null;
      explanation?: string | null;
    }>,
  },
  result: null as null | Record<string, unknown>,
  resultError: false,
  assignmentError: false,
  assignmentMissing: false,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  getGetAttemptQueryKey: (id: string) => ["/api/attempts", id],
  getGetAttemptResultQueryKey: (id: string) => ["/api/attempts", id, "result"],
  useGetCurrentUser: () => ({ data: { role: "student" } }),
  useGetAssignment: () => ({
    data: mocks.assignmentError || mocks.assignmentMissing
      ? undefined
      : {
          id: "asg-1",
          title: mocks.title,
          subject: "SAT",
          instructions: "Answer the questions.",
          deliveryPhase: mocks.deliveryPhase,
          questionCount: mocks.questions.length,
          timeLimitMinutes: 60,
          latestAttemptId: "attempt-1",
          questions: mocks.questions,
        },
    isLoading: false,
    isError: mocks.assignmentError,
  }),
  useGetAttempt: () => ({
    data: mocks.attempt,
    isLoading: false,
  }),
  useGetAttemptResult: () => ({
    data: mocks.result,
    isLoading: false,
    isError: mocks.resultError,
  }),
  useStartAttempt: () => ({ mutate: startMutate, isPending: false }),
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
  startMutate.mockReset();
  mocks.deliveryPhase = "before_session";
  mocks.title = "Practice quiz";
  mocks.questions[0]!.stimulus = null;
  mocks.questions[0]!.prompt = "Which transition is best?";
  mocks.attempt.status = "active";
  mocks.attempt.remainingSeconds = 1200;
  mocks.attempt.responses = [];
  mocks.result = null;
  mocks.resultError = false;
  mocks.assignmentError = false;
  mocks.assignmentMissing = false;
  mocks.questions[0]!.stimulus = null;
  mocks.questions[0]!.prompt = "Which transition is best?";
  mocks.questions[0]!.questionType = "multiple_choice";
  mocks.questions[0]!.presentation = undefined;
  mocks.questions[0]!.choices = [
    { id: "a", label: "A", text: "However" },
    { id: "b", label: "B", text: "Therefore" },
  ];
});

describe("student attempt UI", () => {
  test("prediction cannot hide choices or auto-advance to submit without answers", () => {
    render(<PortalAssignment />);
    expect(screen.queryByText("Prediction first")).toBeNull();
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/However/);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByRole("button", { name: /Submit assignment/i })).toHaveProperty("disabled", true);
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
    expect(screen.getByText(/Accuracy only — this pre-work set is not an official SAT score/i)).toBeTruthy();
    expect(screen.queryByText(/estimated SAT range/i)).toBeNull();
  });

  test("missed homework becomes an in-session test of at most 15 questions and allows partial submit", () => {
    mocks.deliveryPhase = "during_session";
    mocks.title = "In-session homework completion";
    mocks.attempt.responses = [{ questionId: "q1", prediction: null, predictionLocked: false, finalAnswer: "a", flagged: false }];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("session-practice-board")).toBeNull();
    expect(screen.getByTestId("partial-submit-in-session").textContent).toMatch(/at most 15 questions/i);
    expect(screen.getByTestId("submit-in-session-homework")).toBeTruthy();
    fireEvent.click(screen.getByTestId("submit-in-session-homework"));
    expect(submitMutate).toHaveBeenCalled();
  });

  test("pre-work keeps answers hidden until final submit", () => {
    render(<PortalAssignment />);
    fireEvent.click(screen.getByRole("button", { name: /However/i }));
    expect(saveMutate).toHaveBeenCalled();
    expect(saveMutate.mock.calls[0][0].data.checkAnswer).toBeFalsy();
    expect(screen.queryByTestId("check-answer")).toBeNull();
    expect(screen.queryByTestId("question-feedback")).toBeNull();
    expect(screen.queryByText("Correct")).toBeNull();
    expect(screen.queryByText("Incorrect")).toBeNull();
    expect(screen.queryByText(/official explanation/i)).toBeNull();
    expect(screen.queryByText(/However signals contrast/i)).toBeNull();
  });

  test("in-session practice checks one question and shows feedback without submitting the quiz", () => {
    mocks.deliveryPhase = "during_session";
    saveMutate.mockImplementation((vars, opts) => {
      if (vars.data.checkAnswer) {
        opts?.onSuccess?.({
          questionId: vars.data.questionId,
          prediction: null,
          predictionLocked: false,
          finalAnswer: vars.data.finalAnswer,
          flagged: false,
          revealed: true,
          correct: vars.data.finalAnswer === "a",
          correctAnswer: "a",
          explanation: "However signals contrast.",
        });
      }
    });
    render(<PortalAssignment />);
    expect(screen.getByTestId("session-practice-board")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /However/i }));
    fireEvent.click(screen.getByTestId("check-answer"));
    expect(saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questionId: "q1",
          finalAnswer: "a",
          checkAnswer: true,
        }),
      }),
      expect.any(Object),
    );
    expect(screen.getByTestId("question-feedback").textContent).toMatch(/Correct/);
    expect(screen.getByTestId("question-feedback").textContent).toMatch(/However signals contrast/);
    expect(submitMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /2/ }));
    expect(screen.getByText("Which word is most precise?")).toBeTruthy();
    expect(screen.queryByTestId("question-feedback")).toBeNull();
    expect(screen.getByTestId("check-answer")).toHaveProperty("disabled", true);
  });

  test("in-session homework restores checked feedback after refresh and still allows submit", () => {
    mocks.deliveryPhase = "during_session";
    mocks.title = "In-session homework completion";
    mocks.attempt.responses = [
      {
        questionId: "q1",
        prediction: null,
        predictionLocked: false,
        finalAnswer: "b",
        flagged: false,
        revealed: true,
        correct: false,
        correctAnswer: "a",
        explanation: "However signals contrast.",
      },
    ];
    render(<PortalAssignment />);
    expect(screen.getByTestId("question-feedback").textContent).toMatch(/Incorrect/);
    expect(screen.getByTestId("question-feedback").textContent).toMatch(/However signals contrast/);
    expect(screen.queryByTestId("check-answer")).toBeNull();
    fireEvent.click(screen.getByTestId("submit-in-session-homework"));
    expect(submitMutate).toHaveBeenCalled();
  });

  test("in-session practice uses collaborative brown presentation instead of quiz chrome", () => {
    mocks.deliveryPhase = "during_session";
    render(<PortalAssignment />);
    expect(screen.getByTestId("session-practice-board").textContent).toMatch(/Tutor \+ student practice/);
    expect(screen.getByTestId("session-practice-board").className).toMatch(/bg-brand-ink/);
    expect(screen.getByTestId("session-practice-board").textContent).toMatch(/However/);
    expect(screen.getByTestId("practice-problem-picker").textContent).toMatch(/1/);
    expect(screen.queryByText("Prediction first")).toBeNull();
    expect(screen.queryByText(/Together · no timed auto-submit/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Submit assignment/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2/ }));
    fireEvent.click(screen.getByTestId("finish-practice"));
    expect(submitMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("empty-submit-error").textContent).toMatch(/empty attempt is not saved/i);
  });

  test("timer expiry with zero answers does not auto-submit or show a finished result", () => {
    mocks.attempt.remainingSeconds = 0;
    mocks.attempt.responses = [];
    render(<PortalAssignment />);
    expect(submitMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Submitted")).toBeNull();
    expect(screen.queryByText("Time expired")).toBeNull();
    expect(screen.getByTestId("answer-choices")).toBeTruthy();
    expect(screen.getByTestId("empty-submit-error").textContent).toMatch(/empty attempt is not saved/i);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByRole("button", { name: /Submit assignment/i })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: /Submit assignment/i }));
    expect(submitMutate).not.toHaveBeenCalled();
  });

  test("figure-primary items show the composite image and A–D only, never SPR or leaked comments", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      presentation: "figure_primary",
      questionType: "mcq",
      prompt: "<!-- sat-bank-figures -->\nV = i,.r3 V =3£wh",
      stimulus:
        "![Question region](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q1.png)\n<!-- /sat-bank-figures -->",
      choices: [],
    };
    render(<PortalAssignment />);
    expect(screen.getByTestId("figure-primary-question")).toBeTruthy();
    expect(screen.getByTestId("figure-primary-choices").textContent).toMatch(/A/);
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "D" })).toBeTruthy();
    expect(screen.queryByTestId("spr-answer")).toBeNull();
    expect(screen.queryByPlaceholderText(/student-produced response/i)).toBeNull();
    expect(screen.queryByText(/sat-bank-figures/)).toBeNull();
    expect(screen.queryByText(/V = i/)).toBeNull();
    const image = screen.getByAltText("Question region") as HTMLImageElement;
    expect(image.src).toBe(
      "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q1.png",
    );
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    expect(saveMutate).toHaveBeenCalled();
  });

  test("renders markdown figure images from stimulus in the live quiz", () => {
    mocks.questions[0]!.stimulus =
      "![Enrollment graph](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png)\n\nThe graph shows enrollment.";
    render(<PortalAssignment />);
    const image = screen.getByAltText("Enrollment graph") as HTMLImageElement;
    expect(image.src).toBe(
      "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png",
    );
    expect(image.className).toMatch(/max-w-full/);
    expect(screen.getByText("The graph shows enrollment.")).toBeTruthy();
  });

  test("question review renders stimulus figures when the result payload includes them", () => {
    mocks.attempt.status = "submitted";
    mocks.result = {
      attemptId: "attempt-1",
      assignmentId: "asg-1",
      assignmentTitle: "Practice quiz",
      studentUserId: "stu",
      studentName: "Taito",
      sessionId: "session-1",
      sessionDateTime: null,
      status: "submitted",
      score: 0,
      correctCount: 0,
      totalCount: 1,
      activeSeconds: 30,
      pausedSeconds: 0,
      breakdown: [],
      items: [
        {
          questionId: "q1",
          correct: false,
          finalAnswer: "a",
          correctAnswer: "b",
          explanation: "The graph rises.",
          skill: "Transitions",
          flagged: false,
          prompt: "Which transition is best?",
          stimulus:
            "![Enrollment graph](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png)",
          choices: [
            { id: "a", label: "A", text: "However" },
            { id: "b", label: "B", text: "Therefore" },
          ],
        },
      ],
      analysis: {
        source: "deterministic",
        label: "Adaptive skill analysis",
        provider: null,
        strengths: [],
        weaknesses: ["Transitions"],
        mistakePatterns: [],
        nextFocus: ["Transitions"],
        feedback: "Review the graph.",
      },
      studentFeedback: "Review the graph.",
      homeworkKind: "routine",
      scoreReporting: "none",
      estimatedSatScore: null,
    };
    render(<PortalAssignment />);
    expect(screen.getByText("Question review")).toBeTruthy();
    expect((screen.getByAltText("Enrollment graph") as HTMLImageElement).src).toBe(
      "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png",
    );
  });

  test("failed assignment fetch shows an empty-state error instead of a skeleton", () => {
    mocks.assignmentError = true;
    render(<PortalAssignment />);
    expect(screen.getByTestId("assignment-open-error").textContent).toMatch(/failed to load/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("empty expired attempt stays incomplete and can be restarted", () => {
    mocks.attempt.status = "expired";
    mocks.attempt.remainingSeconds = 0;
    mocks.attempt.responses = [];
    mocks.result = null;
    mocks.resultError = true;
    render(<PortalAssignment />);
    expect(screen.getByText("Attempt not submitted")).toBeTruthy();
    expect(screen.queryByText("Time expired")).toBeNull();
    expect(screen.queryByText(/0%/)).toBeNull();
    fireEvent.click(screen.getByTestId("restart-empty-attempt"));
    expect(startMutate).toHaveBeenCalledWith({ assignmentId: "asg-1" }, expect.any(Object));
    expect(submitMutate).not.toHaveBeenCalled();
  });
});
