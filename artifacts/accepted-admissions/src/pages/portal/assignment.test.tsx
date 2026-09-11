import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const submitMutate = vi.fn();
const saveMutate = vi.fn();
const startMutate = vi.fn();
const pauseMutate = vi.fn();
const resumeMutate = vi.fn();
const setLocation = vi.fn();

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
        { id: "c", label: "C", text: "Meanwhile" },
        { id: "d", label: "D", text: "Similarly" },
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
        { id: "c", label: "C", text: "created" },
        { id: "d", label: "D", text: "decided" },
      ],
      skill: "Words in Context",
      difficulty: "medium" as const,
      predictionFirst: true,
    },
  ],
  search: "",
  attempt: {
    id: "attempt-1",
    assignmentId: "asg-1",
    status: "active" as const,
    remainingSeconds: 1200,
    currentQuestionIndex: 0,
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
  customFetch: vi.fn(async () => ({ id: "report-1" })),
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
  usePauseAttempt: () => ({ mutate: pauseMutate, isPending: false }),
  useResumeAttempt: () => ({ mutate: resumeMutate, isPending: false }),
  useSaveAttemptResponse: () => ({ mutate: saveMutate, isPending: false }),
  useSubmitAttempt: () => ({ mutate: submitMutate, isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useParams: () => ({ assignmentId: "asg-1" }),
  useSearch: () => mocks.search,
  useLocation: () => ["/portal/assignments/asg-1", setLocation],
}));

import PortalAssignment from "./assignment";

const defaultQuestions = structuredClone(mocks.questions);

function keepOnlyFirstQuestion() {
  mocks.questions = [mocks.questions[0]!];
}

afterEach(() => {
  cleanup();
  submitMutate.mockReset();
  saveMutate.mockReset();
  startMutate.mockReset();
  pauseMutate.mockReset();
  resumeMutate.mockReset();
  setLocation.mockReset();
  mocks.search = "";
  mocks.deliveryPhase = "before_session";
  mocks.title = "Practice quiz";
  mocks.questions = structuredClone(defaultQuestions);
  mocks.attempt.status = "active";
  mocks.attempt.remainingSeconds = 1200;
  mocks.attempt.currentQuestionIndex = 0;
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
    { id: "c", label: "C", text: "Meanwhile" },
    { id: "d", label: "D", text: "Similarly" },
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

  test("graph items with complete A–D text show the choice copy, not letter-only buttons", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      presentation: "figure_primary",
      questionType: "mcq",
      prompt:
        "According to the US Department of Agriculture, in 2016 California had between 2,600 and 2,800 organic farms and ______ Which choice most effectively uses data from the graph to complete the text?",
      stimulus:
        "![Enrollment graph](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png)",
      choices: [
        { id: "a", label: "A", text: "Washington had between 600 and 800 organic farms." },
        { id: "b", label: "B", text: "New York had fewer than 800 organic farms." },
        { id: "c", label: "C", text: "Wisconsin and Iowa each had between 1,200 and 1,400 organic farms." },
        { id: "d", label: "D", text: "Pennsylvania had more than 1,200 organic farms." },
      ],
    };
    render(<PortalAssignment />);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/Washington had between 600/);
    expect(screen.queryByTestId("figure-primary-choices")).toBeNull();
    const stem = screen.getByTestId("figure-primary-question");
    expect(stem.className).not.toMatch(/md:grid-cols-2/);
    expect(screen.getByTestId("quiz-stimulus-panel").className).toMatch(/overflow-visible/);
  });

  test("stimulus panel allows wide tables to scroll instead of clipping", () => {
    mocks.questions[0]!.stimulus =
      "Species\tTreated\tUntreated\tMass treated (g)\tMass untreated (g)\nCorn\tyes\tno\t15.1\t10.2\nMarigold\tyes\tno\t12.0\t8.5\nBroccoli\tyes\tno\t9.0\t7.5";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "broccoli grown in soil containing mycorrhizal fungi had a slightly lower mass" },
      { id: "b", label: "B", text: "corn grown in soil containing mycorrhizal fungi had a higher mass" },
      { id: "c", label: "C", text: "marigolds grown in soil containing mycorrhizal fungi had a moderate mass" },
      { id: "d", label: "D", text: "corn had the highest average mass of all three species grown" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    const panel = screen.getByTestId("quiz-stimulus-panel");
    expect(panel.className).toMatch(/overflow-visible/);
    expect(panel.className).not.toMatch(/overflow-hidden/);
    expect(screen.getByTestId("quiz-question-stem").className).not.toMatch(/md:grid-cols-2/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/broccoli grown/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/corn had the highest/);
  });

  test("figure-primary items without usable choice text show unavailable, never letter-only buttons", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      presentation: "figure_primary",
      questionType: "mcq",
      prompt: "<!-- sat-bank-figures -->\nV = i,.r3 V =3£wh",
      stimulus:
        "![Question region](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/q1.png)\n<!-- /sat-bank-figures -->",
      choices: [],
    };
    mocks.questions = [mocks.questions[0]!];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("figure-primary-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByTestId("spr-answer")).toBeNull();
    expect(screen.queryByPlaceholderText(/student-produced response/i)).toBeNull();
    expect(screen.queryByText(/sat-bank-figures/)).toBeNull();
    expect(screen.queryByText(/V = i/)).toBeNull();
  });

  test("OCR-garbage and empty A–D shells are not shown as letter-only buttons", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      presentation: "figure_primary",
      prompt: "",
      stimulus:
        "![Scatterplot](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p36-draw2.png)",
      choices: [
        { id: "a", label: "A", text: "selecting" },
        { id: "b", label: "B", text: "inspecting ~ ----~" },
        { id: "c", label: "C", text: "creating ~" },
        { id: "d", label: "D", text: "" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("figure-primary-choices")).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByText(/----/)).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("long choice D wraps instead of clipping", () => {
    mocks.questions[0]!.prompt =
      "Which of the following is the best interpretation of f(5) is approximately equal to 243?";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "The value is 5 dollars greater in 1962." },
      { id: "b", label: "B", text: "The value is approximately 243 dollars in 1962." },
      { id: "c", label: "C", text: "The value is 5 times greater in 1962." },
      {
        id: "d",
        label: "D",
        text: "The value of the bank account is estimated to increase by approximately 243 dollars every 5 years between 1957 and 1972.",
      },
    ];
    render(<PortalAssignment />);
    const choices = screen.getByTestId("answer-choices");
    expect(choices.className).toMatch(/overflow-visible/);
    expect(choices.textContent).toMatch(/between 1957 and 1972/);
    const option = screen.getAllByTestId("quiz-answer-choice").at(-1);
    expect(option?.className).toMatch(/overflow-visible/);
    expect(option?.className).toMatch(/items-start/);
    expect(option?.textContent).toMatch(/between 1957 and 1972/);
  });

  test("partial figure crop does not stack broken OCR stem or letter-only buttons", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      presentation: "text",
      questionType: "mcq",
      prompt:
        "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area of the triangle, in square units?",
      stimulus:
        "![Question figure region page 38](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p38-q22-right.png)",
      choices: [
        { id: "a", label: "A", text: "8 2 + 80" },
        { id: "b", label: "B", text: "12" },
        { id: "c", label: "C", text: "24/80" },
        { id: "d", label: "D", text: "24" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByText(/sides of length 2 2/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("figure-primary-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("failed fraction dumps are not shown as A–D choices", () => {
    mocks.questions[0]!.prompt =
      "14x = 2 w + 19\n7y\nWhich equation correctly expresses w in terms of x and y ?\nf(x)";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "w = −19 y F 28x" },
      { id: "b", label: "B", text: "−19 w = 14y 2⎞⎟ ⎛x" },
      { id: "c", label: "C", text: "w = − 19 ⎜⎜⎜⎝ ⎟⎟⎠ y ⎟ 2⎞⎟ ⎛28x" },
      { id: "d", label: "D", text: "w = 14y ⎟⎟⎠ − 19 ⎜⎜⎜⎝ ⎟" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/⎜/)).toBeNull();
  });

  test("word-problem stems do not show a mismatched page-neighbor figure", () => {
    mocks.questions[0]!.prompt =
      "The lengths of two sides of a triangle are 4 centimeters and 6 centimeters. If the perimeter of the triangle is 18 centimeters, what is the length, in centimeters, of the third side of this triangle?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 34](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-9-digital/p34-draw2.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "2" },
      { id: "b", label: "B", text: "8" },
      { id: "c", label: "C", text: "10" },
      { id: "d", label: "D", text: "24" },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByAltText("Diagram from page 34")).toBeNull();
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/18 centimeters/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/24/);
  });

  test("slash-fraction equivalent equations show labeled A–D choice text", () => {
    mocks.questions[0]!.prompt = "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "x/4 = 32" },
      { id: "b", label: "B", text: "x/4 = 5" },
      { id: "c", label: "C", text: "x/4 = 1" },
      { id: "d", label: "D", text: "x/4 = -32" },
    ];
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/x\/4 \+ 1 = 33/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/x\/4 = 32/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/x\/4 = -32/);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
  });

  test("unlabeled equation-list figure and missing-operator choices never become bare A–D", () => {
    mocks.questions[0]!.prompt = "16 + 30 = 190 x\nWhich equation has the same solution as the given equation?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 34](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-9-digital/p34-draw2.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "x 16 = 30" },
      { id: "b", label: "B", text: "16 x = 130" },
      { id: "c", label: "C", text: "x 16 = 160" },
      { id: "d", label: "D", text: "x 16 = 190" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByText(/16 \+ 30 = 190 x/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("surfboard word problem does not double-render page-neighbor inequalities or bare A–D", () => {
    mocks.questions[0]!.prompt =
      "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for t hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 35](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-10-digital/p35-draw1.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "t 10 ≤75" },
      { id: "b", label: "B", text: "t 10 + 25 ≤75" },
      { id: "c", label: "C", text: "25 ≤75 t" },
      { id: "d", label: "D", text: "t 25 + 10 ≤75" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByAltText("Diagram from page 35")).toBeNull();
    expect(screen.queryByText(/surfboard/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("partial linear-function crop hides garbage OCR and never shows letter-only A–D", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      prompt:
        "= ^ h in\nFor the linear function f , the graph of y f(x)\nthe xy-plane has a slope of 7 and passes through the\n^ h. Which equation defines f ?\npoint,0 5\n^ h",
      stimulus:
        "![Question figure region page 34](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-11-digital/p34-q3-right.png)",
      choices: [
        { id: "a", label: "A", text: "f(x) x 5 = ^ h" },
        { id: "b", label: "B", text: "f(x) x 35 = ^ h" },
        { id: "c", label: "C", text: "f(x) x/7 = 5 + ^ h" },
        { id: "d", label: "D", text: "f(x) x/12 = 5 +" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByText(/point,0 5/)).toBeNull();
    expect(screen.queryByText(/\^ h in/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("pipe-backslash graph OCR and missing-operator polynomials are not student-usable", () => {
    mocks.questions[0]!.prompt =
      "The line graph shows the estimated number of chipmunks in a state park on April 1 of each year from 1989 to 1999.\nI \\\n/ ' I '\\ I '\nI\nBased on the line graph, in which year was the estimated number of chipmunks in the state park the greatest?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 42](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p42-draw1.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "1989" },
      { id: "b", label: "B", text: "1994" },
      { id: "c", label: "C", text: "1995" },
      { id: "d", label: "D", text: "1998" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByText(/I \\/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("run-on inequality systems are not student-usable", () => {
    mocks.questions[0]!.prompt =
      "The point (8, 2) in the x y-plane is a solution to which of the following systems of inequalities?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "x > 0 y > 0" },
      { id: "b", label: "B", text: "x > 0 y < 0" },
      { id: "c", label: "C", text: "x < 0 y > 0" },
      { id: "d", label: "D", text: "x < 0 y < 0" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-choice")).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
  });

  test("smashed 2 –4x –7x quadratic OCR is not student-usable", () => {
    mocks.questions[0]!.prompt = "2 −4x −7x = −36\nWhat is the positive solution to the given equation?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "7/4" },
      { id: "b", label: "B", text: "9/4" },
      { id: "c", label: "C", text: "4" },
      { id: "d", label: "D", text: "7" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-choice")).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
  });

  test("mangled ( , x y ) stems are not student-usable", () => {
    mocks.questions[0]!.prompt =
      "x + y = 18\n5 y = x\nWhat is the solution ( ,x y) to the given system of equations?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "(15, 3)" },
      { id: "b", label: "B", text: "(16, 2)" },
      { id: "c", label: "C", text: "(17, 1)" },
      { id: "d", label: "D", text: "(18, 0)" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("incomplete table crop hides broken OCR and never shows letter-only A–D", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      prompt:
        "= x2 −3\nh x\nWhich table gives three values of x and their\n( ) for the given corresponding values of h x\nfunction h?",
      stimulus:
        "![Question figure region page 43](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p43-q8-right.png)",
      choices: [
        { id: "a", label: "A", text: "x 1 2 3 h(x) 4 5 6" },
        { id: "b", label: "B", text: "x 1 2 3 −2 h(x) 1 6" },
        { id: "c", label: "C", text: "x 1 2 3 −1 h(x) 1 3" },
        { id: "d", label: "D", text: "x 1 2 3 −2 h(x) 1 3" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByText(/= x2/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("scrambled 270(0.1)x stem is not student-usable", () => {
    mocks.questions[0]!.prompt = "= 270(0.1)x. What The function f is defined by f(x)\nis the value of f (0) ?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "0" },
      { id: "b", label: "B", text: "1" },
      { id: "c", label: "C", text: "27" },
      { id: "d", label: "D", text: "270" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("21px juxtaposition equation stays readable with slash-fraction choices", () => {
    mocks.questions[0]!.prompt =
      "−3x + 21px = 84\nIn the given equation, p is a constant. The equation has no solution. What is the value of p ?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "0" },
      { id: "b", label: "B", text: "1/7" },
      { id: "c", label: "C", text: "4/3" },
      { id: "d", label: "D", text: "4" },
    ];
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/21px/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/1\/7/);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
  });

  test("scrambled f(x) definition is not student-usable", () => {
    mocks.questions[0]!.prompt =
      "= (x − 10)(x + 13) f(x)\nThe function f is defined by the given equation. For what value of x does f(x)( ) reach its minimum?";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "−130" },
      { id: "b", label: "B", text: "−13 23" },
      { id: "c", label: "C", text: "− 2 3" },
      { id: "d", label: "D", text: "− 2" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("smashed metal-ball vertex crop hides OCR and never shows letter-only A–D", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      prompt:
        "f(x) = 1 x\n2 + The function ( ) ( −7) 3 gives a metal\n9\nball’s height above the ground f(x)( ), in inches,",
      stimulus:
        "![Question figure region page 46](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p46-q19-left.png)",
      choices: [
        { id: "a", label: "A", text: "The metal ball’s minimum height was 3 inches above the ground." },
        { id: "b", label: "B", text: "The metal ball’s minimum height was 7 inches above the ground." },
        { id: "c", label: "C", text: "The metal ball’s height was 3 inches above the ground when it started moving." },
        { id: "d", label: "D", text: "The metal ball’s height was 7 inches above the ground when it started moving. 20" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByText(/2 \+ The function/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("dot plot with empty A–D never becomes letter-only buttons", () => {
    mocks.questions[0]!.prompt =
      "The dot plot represents the 15 values in data set A. Data set B is created by adding 56 to each of the values in data set A. Which of the following correctly compares the medians and the ranges of data sets A and B?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 47](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p47-draw1.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "" },
      { id: "b", label: "B", text: "" },
      { id: "c", label: "C", text: "" },
      { id: "d", label: "D", text: "" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("library word problem hides an orphan figure fragment and does not invent letter-only A–D", () => {
    mocks.questions[0]!.prompt =
      "A proposal for a new library was included on an election ballot. A radio show stated that 3 times as many people voted in favor of the proposal as people who voted against it. Based on these data, how many people voted against the proposal?";
    mocks.questions[0]!.stimulus =
      "![Diagram from page 45](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p45-draw1.png)";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "" },
      { id: "b", label: "B", text: "" },
      { id: "c", label: "C", text: "" },
      { id: "d", label: "D", text: "" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByAltText("Diagram from page 45")).toBeNull();
    expect(screen.queryByText(/library/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("literal question-mark operator and missing exponents are not shown as A–D", () => {
    mocks.questions[0]!.prompt = "12x3 −5x ? 3\nWhich expression is equivalent to";
    mocks.questions[0]!.stimulus = null;
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "7x6" },
      { id: "b", label: "B", text: "17x3" },
      { id: "c", label: "C", text: "7x3" },
      { id: "d", label: "D", text: "17x6" },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/7x6/)).toBeNull();
  });

  test("corrupt triangle stem with a figure hides OCR and never shows letter-only A–D", () => {
    mocks.questions[0] = {
      ...mocks.questions[0]!,
      prompt: "In the triangle shown, PQ QR. What is the value = of x?",
      stimulus:
        "![Diagram from page 34](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-11-digital/p34-draw1.png)",
      choices: [
        { id: "a", label: "A", text: "156" },
        { id: "b", label: "B", text: "66" },
        { id: "c", label: "C", text: "48" },
        { id: "d", label: "D", text: "24" },
      ],
    };
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByText(/PQ QR/)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
  });

  test("smashed x f(x) lines render as a data table, not one smashed prose line", () => {
    mocks.questions[0]!.prompt =
      "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values of x. Which equation defines f(x)?";
    mocks.questions[0]!.choices = [
      { id: "a", label: "A", text: "f(x)= 3x + 29" },
      { id: "b", label: "B", text: "f(x)= 29x + 32" },
      { id: "c", label: "C", text: "f(x)= 35x + 29" },
      { id: "d", label: "D", text: "f(x)= 32x + 35" },
    ];
    render(<PortalAssignment />);
    const table = screen.getByTestId("quiz-data-table");
    expect(table.textContent).toMatch(/f\(x\)/);
    expect(table.textContent).toMatch(/29/);
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/linear function/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/3x \+ 29/);
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
          prompt: "Which choice most effectively uses data from the graph to complete the text?",
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

  test("never renders a student-produced-response text box and recovers letter choices", () => {
    mocks.questions = [
      {
        id: "q-spr",
        position: 0,
        subject: "SAT Math",
        questionType: "spr",
        prompt: "A customer spent $27 to purchase oranges at $3 per pound. How many pounds?",
        stimulus: null,
        choices: [],
        skill: "Problem-Solving",
        difficulty: "medium",
        predictionFirst: false,
      },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("spr-answer")).toBeNull();
    expect(screen.queryByPlaceholderText(/Type the student-produced response/i)).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/sat-bank-figures/i)).toBeNull();
  });

  test("figure-primary comment without usable A–D text does not show letter-only buttons", () => {
    mocks.questions = [
      {
        id: "q-figure-primary",
        position: 0,
        subject: "SAT Math",
        questionType: "spr",
        prompt:
          '<!-- figure-primary src="https://app.acceptedadmissions.org/media/sat-bank/q12.png" -->\nOCR {x^2} parse failure',
        stimulus: null,
        choices: [],
        skill: "Problem-Solving",
        difficulty: "medium",
        predictionFirst: false,
      },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("figure-primary-choices")).toBeNull();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByTestId("spr-answer")).toBeNull();
    expect(screen.queryByPlaceholderText(/Type the student-produced response/i)).toBeNull();
  });

  test("Oct 2 Q77–82 smashed or incomplete A–D items are dropped, never shown as unavailable", () => {
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q77",
        prompt:
          "14x = 2 w + 19 7y The given equation relates the distinct positive real numbers w, x, and y. Which equation correctly expresses w in terms of x and y ? f(x)",
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q78",
        prompt:
          "A right triangle has sides of length 2 2 , 6 2 , and 80 units. What is the area of the triangle, in square units?",
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q79",
        prompt:
          "2 4x + bx − 45, where b is a constant, The expression can be rewritten as (hx + k)(x + j). Which of the following must be an integer?",
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q80",
        prompt:
          "y = 2x2 − 21x + 64 y = 3x + a The graphs intersect at exactly one point, ( , x y). What is the value of x?",
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q81",
        prompt:
          "An isosceles right triangle has a hypotenuse of length 58 inches. What is the perimeter, in inches, of this triangle?",
        choices: [
          { id: "a", label: "A", text: "2/29" },
          { id: "b", label: "B", text: "2/58" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q82",
        prompt:
          "In the x y-plane, a parabola has vertex (9, −14). If y = ax2 + bx + c, which of the ? following could be the value of a + b + c",
        choices: [],
      },
    ];
    keepOnlyFirstQuestion();
    render(<PortalAssignment />);
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByTestId("answer-choices")).toBeNull();
    expect(screen.queryByText(/2\/29/)).toBeNull();
    expect(screen.queryByText(/14x = 2 w/)).toBeNull();
  });

  test("Oct 2 Q83–91 drop figure-only or wiped A–D items and keep intact slash-fraction Q89", () => {
    const figure =
      "![Question figure](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p40-draw1.png)";
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q83",
        prompt: "Note: Figure not drawn to scale.",
        stimulus: figure,
        choices: [
          { id: "a", label: "A", text: "" },
          { id: "b", label: "B", text: "" },
          { id: "c", label: "C", text: "" },
          { id: "d", label: "D", text: "" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q84",
        prompt: "",
        stimulus: figure,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q85",
        prompt: "",
        stimulus: figure,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q88",
        prompt: "16+30=190 xWhich equation has the same solution as the given equation?",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q89",
        prompt: "x/4 + 1 = 33\nWhich equation has the same solution as the given equation?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "x/4 = 32" },
          { id: "b", label: "B", text: "x/4 = 5" },
          { id: "c", label: "C", text: "x/4 = 1" },
          { id: "d", label: "D", text: "x/4 = -32" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q91",
        prompt:
          "The total cost, in dollars, to rent a surfboard consists of a $25 service fee and a $10 per hour rental fee. A person rents a surfboard for t hours and intends to spend a maximum of $75 to rent the surfboard. Which inequality represents this situation?",
        stimulus: null,
        choices: [],
      },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/16\+30=190/)).toBeNull();
    expect(screen.getByText("Question 1 of 1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/x\/4 \+ 1 = 33/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/x\/4 = 32/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/x\/4 = -32/);
  });

  test("Oct 2 Q92–98 drop OCR-garbage and wiped A–D items and keep readable Q93", () => {
    const figure =
      "![Chipmunk line graph](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p42-draw1.png)";
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q92",
        prompt:
          "= ^ h inFor thelinearfunctionf , thegraphof y f(x)thexy-planehasaslopeof7andpassesthrough the ^ h. Whichequationdefinesf ? point0,0 5 ^ h",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "" },
          { id: "b", label: "B", text: "" },
          { id: "c", label: "C", text: "" },
          { id: "d", label: "D", text: "" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q93",
        prompt: "s + 7 = 27 r = 3What is thesolution (r, s) tothegivensystemofequations?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "(6,3)" },
          { id: "b", label: "B", text: "(3,6)" },
          { id: "c", label: "C", text: "(3,27)" },
          { id: "d", label: "D", text: "(27,3)" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q94",
        prompt: "",
        stimulus: figure,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q96",
        prompt: "12x3 −5x ? 3Which expressionisequivalentto",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q97",
        prompt: "x + y = 18 5 y = x What is thesolution (, x y) tothegivensystemofequations?",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q98",
        prompt:
          "The point (8, 2) in the xy-plane is a solution to which of the following systems of inequalities?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "x > 0 y > 0" },
          { id: "b", label: "B", text: "x > 0 y < 0" },
          { id: "c", label: "C", text: "x < 0 y > 0" },
          { id: "d", label: "D", text: "x < 0 y < 0" },
        ],
      },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/point0,0 5/)).toBeNull();
    expect(screen.queryByText(/12x3/)).toBeNull();
    expect(screen.queryByText(/\(, x y\)/)).toBeNull();
    expect(screen.queryByText(/x > 0 y > 0/)).toBeNull();
    expect(screen.getByText("Question 1 of 1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/s \+ 7 = 27/);
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/r = 3/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/\(6,3\)/);
  });

  test("Oct 2 Q99–106 drop scrambled, incomplete, and smashed 2 –4x –7x items and keep 21px Q105", () => {
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q99",
        prompt:
          "= x2 −3 h x Which tablegivesthreevaluesof x andtheirfor thegivencorrespondingvaluesof x functionh?",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q100",
        prompt: "= 270(0.1)x. WhatThe functionf isdefinedby f(x)isthevalueof f (0)?",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q103",
        prompt: "2 −4x −7x = −36Whatisthepositivesolutiontothegivenequation?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "7/4" },
          { id: "b", label: "B", text: "9/4" },
          { id: "c", label: "C", text: "4" },
          { id: "d", label: "D", text: "7" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q104",
        prompt:
          "A proposal for a new library was included on an election ballot. A radio show stated that 3 times as many people voted in favor of the proposal as people who voted against it. A social media post reported that 15,000 more people voted in favor of the proposal than voted against it. Based on these data, how many people voted against the proposal?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "7,500" },
          { id: "b", label: "B", text: "15,000" },
          { id: "c", label: "C", text: "22,500" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q105",
        prompt:
          "−3x + 21px = 84 In thegivenequation, p isaconstant. Theequationhasnosolution. Whatisthevalueof p ?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "0" },
          { id: "b", label: "B", text: "1/7" },
          { id: "c", label: "C", text: "4/3" },
          { id: "d", label: "D", text: "4" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q106",
        prompt:
          "=(x −10)(x +13) f(x) The functionf isdefinedby thegivenequation. Forwhatvalueof x doesf(x)reachitsminimum?",
        stimulus: null,
        choices: [],
      },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.queryByText(/h x Which/)).toBeNull();
    expect(screen.queryByText(/WhatThe function/)).toBeNull();
    expect(screen.queryByText(/library/)).toBeNull();
    expect(screen.queryByText(/\(x −10\)\(x \+13\) f\(x\)/)).toBeNull();
    expect(screen.getByText("Question 1 of 1")).toBeTruthy();
    expect(screen.getByTestId("quiz-question-stem").textContent).toMatch(/21px/);
    expect(screen.getByTestId("answer-choices").textContent).toMatch(/1\/7/);
  });

  test("Oct 2 Q107–114 drop exploded OCR, missing figures, and character-spaced garbage", () => {
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q107",
        prompt:
          "f(x)=1 x 2 + The function (-7) 3 gives a metal 9 ball’s height above the ground f(x), in inches",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q109",
        prompt: "The equation 2 2 x + (y –1) = 49 represents circle A. 2 2 (x –2) + (y –1) =",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q110",
        prompt:
          "Two identical rectangular prisms each have a height of 90 centimeters (cm). The resulting prism has a surface area of 92 K 2 cm . 47 What is the side length?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "4" },
          { id: "b", label: "B", text: "8" },
          { id: "c", label: "C", text: "9" },
          { id: "d", label: "D", text: "16" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q112",
        prompt: "f X -2 2 = is The graph of the quadratic function y f(x) shown. What is the vertex of the graph?",
        stimulus: null,
        choices: [],
      },
      {
        ...mocks.questions[0]!,
        id: "q113",
        prompt: "Which expression is equivalent to x x y 6 5 4 ? + +",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "x15" },
          { id: "b", label: "B", text: "y15" },
          { id: "c", label: "C", text: "xy114+" },
          { id: "d", label: "D", text: "xy304+" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q114",
        prompt:
          "I, 7 X 12345678910 For how many of the 10 data points is the actual y-value greater than the y-value predicted by the line of best fit?",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "3" },
          { id: "b", label: "B", text: "4" },
          { id: "c", label: "C", text: "6" },
          { id: "d", label: "D", text: "7" },
        ],
      },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByText(/metal 9/)).toBeNull();
    expect(screen.queryByText(/2 2 x/)).toBeNull();
    expect(screen.queryByText(/92 K 2/)).toBeNull();
    expect(screen.queryByText(/x x y 6 5 4/)).toBeNull();
    expect(screen.queryByText(/12345678910/)).toBeNull();
  });

  test("Oct 2 Q115/Q117/Q119 drop axis-bleed, smashed algebra, and exploded two-way tables", () => {
    mocks.questions = [
      {
        ...mocks.questions[0]!,
        id: "q115",
        prompt:
          "The dot plot gives the diameter, to the nearest inch, of each of the sea stars in these tide pools. 16 17 18 19 20 Diameter (inches) Based on the dot plot, how many sea stars had a diameter of 16 inches?",
        stimulus:
          "![Dot plot](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p48-draw1.png)",
        choices: [
          { id: "a", label: "A", text: "16" },
          { id: "b", label: "B", text: "6" },
          { id: "c", label: "C", text: "4" },
          { id: "d", label: "D", text: "1" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q117",
        prompt: "x 16( + 15) ? Which expression is equivalent to",
        stimulus: null,
        choices: [
          { id: "a", label: "A", text: "x16+31" },
          { id: "b", label: "B", text: "16+240x" },
          { id: "c", label: "C", text: "16+1x" },
          { id: "d", label: "D", text: "x16+15" },
        ],
      },
      {
        ...mocks.questions[0]!,
        id: "q119",
        prompt:
          "Live east Live west of the river Total Less than 17 11 28 40 years old At least 18 89 107 40 years old Total 35 100 135 The table summarizes members of a local organization. What is the probability that the selected member is at least 40 years old?",
        stimulus:
          "![Cropped table](https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p49-draw1.png)",
        choices: [
          { id: "a", label: "A", text: "28/135" },
          { id: "b", label: "B", text: "35/135" },
          { id: "c", label: "C", text: "100/135" },
          { id: "d", label: "D", text: "107/135" },
        ],
      },
    ];
    render(<PortalAssignment />);
    expect(screen.queryByTestId("quiz-answer-unavailable")).toBeNull();
    expect(screen.queryByText(/Multiple-choice options unavailable/i)).toBeNull();
    expect(screen.getByTestId("quiz-no-answerable-questions")).toBeTruthy();
    expect(screen.queryByText(/16 17 18 19 20/)).toBeNull();
    expect(screen.queryByText(/x 16\(/)).toBeNull();
    expect(screen.queryByText(/Live east Live west/)).toBeNull();
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

  test("Save for later pauses without submitting and leaves the quiz", () => {
    render(<PortalAssignment />);
    fireEvent.click(screen.getByRole("button", { name: /However/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByTestId("save-for-later"));
    expect(submitMutate).not.toHaveBeenCalled();
    expect(pauseMutate).toHaveBeenCalledWith(
      { attemptId: "attempt-1", data: { currentQuestionIndex: 1 } },
      expect.any(Object),
    );
    pauseMutate.mock.calls[0][1].onSuccess({
      ...mocks.attempt,
      status: "paused",
      currentQuestionIndex: 1,
    });
    expect(setLocation).toHaveBeenCalledWith("/portal");
  });

  test("Resume restores the saved question, answers, and flags", () => {
    mocks.attempt.currentQuestionIndex = 1;
    mocks.attempt.responses = [
      { questionId: "q1", prediction: null, predictionLocked: false, finalAnswer: "a", flagged: true },
      { questionId: "q2", prediction: null, predictionLocked: false, finalAnswer: "b", flagged: false },
    ];
    render(<PortalAssignment />);
    expect(screen.getByText("Question 2 of 2")).toBeTruthy();
    expect(screen.getByText("Which word is most precise?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /attached/i }).className).toMatch(/border-primary/);
    expect(screen.getByRole("button", { name: /Submit assignment/i })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    expect(screen.getByText("Which transition is best?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Flagged/i })).toBeTruthy();
    expect(screen.getByText(/Flagged and reported questions aren’t scored/i)).toBeTruthy();
  });

  test("Report question sits next to Save for later and can be sent without leaving the quiz", async () => {
    render(<PortalAssignment />);
    expect(screen.getByTestId("report-question")).toBeTruthy();
    expect(screen.getByTestId("save-for-later")).toBeTruthy();
    fireEvent.click(screen.getByTestId("report-question"));
    expect(screen.getByTestId("report-question-form")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("What looks wrong?"), {
      target: { value: "Table is smashed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByTestId("report-question-status")).toBeTruthy();
    expect(screen.getByTestId("report-question").textContent).toMatch(/Reported/);
    expect(screen.getByText(/Which transition is best/)).toBeTruthy();
  });

  test("paused overlay offers Resume and Save for later, and ?resume=1 auto-resumes", () => {
    mocks.attempt.status = "paused";
    mocks.attempt.currentQuestionIndex = 1;
    render(<PortalAssignment />);
    expect(screen.getByRole("button", { name: /^Resume$/i })).toBeTruthy();
    expect(screen.getByTestId("save-for-later")).toBeTruthy();
    fireEvent.click(screen.getByTestId("save-for-later"));
    expect(setLocation).toHaveBeenCalledWith("/portal");
    expect(submitMutate).not.toHaveBeenCalled();
    cleanup();
    mocks.search = "resume=1";
    render(<PortalAssignment />);
    expect(resumeMutate).toHaveBeenCalledWith({ attemptId: "attempt-1" }, expect.any(Object));
  });
});
