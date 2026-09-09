import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  questions: [] as Array<Record<string, unknown>>,
  createQuiz: { isPending: false, mutate: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.questions,
    isLoading: false,
    error: null,
  }),
  useMutation: () => mocks.createQuiz,
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
  getListSatBankQuestionsQueryKey: () => ["/api/admin/sat-bank/questions"],
  listSatBankQuestions: vi.fn(),
}));

import { TutorQuizBuilder } from "./tutor-quiz-builder";

const programs = [
  {
    id: "course-1",
    title: "Fall SAT",
    subject: "SAT",
    term: "Fall 2026",
    status: "active",
    goalSummary: null,
    meetUrl: null,
    driveUrl: null,
    sessionCount: 1,
    completedSessionCount: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questions = [
    {
      id: "bq-1",
      sourceKey: "sat-pt4-rw-1-1",
      collectionId: "col-1",
      examFamily: "sat",
      section: "rw",
      module: 1,
      questionNumber: 1,
      position: 1,
      prompt: "Which choice best states the main idea?",
      questionType: "mcq",
      estimatedSeconds: 60,
      sourceKind: "official_extract",
      hasOfficialExplanation: true,
      assignable: true,
      choices: [
        { id: "a", label: "A", text: "A claim" },
        { id: "b", label: "B", text: "A list" },
      ],
      correctAnswer: "a",
      officialExplanation: "The passage states a transferable claim.",
    },
    {
      id: "bq-2",
      sourceKey: "sat-pt4-math-1-2",
      collectionId: "col-1",
      examFamily: "sat",
      section: "math",
      module: 1,
      questionNumber: 2,
      position: 2,
      prompt: "What is the value of x?",
      questionType: "mcq",
      estimatedSeconds: 75,
      sourceKind: "official_extract",
      hasOfficialExplanation: true,
      assignable: true,
      choices: [
        { id: "a", label: "A", text: "2" },
        { id: "b", label: "B", text: "4" },
      ],
      correctAnswer: "b",
      officialExplanation: "Solve the linear equation.",
    },
    {
      id: "bq-spr",
      sourceKey: "sat-pt4-math-1-3",
      collectionId: "col-1",
      examFamily: "sat",
      section: "math",
      module: 1,
      questionNumber: 3,
      position: 3,
      prompt: "Enter the value of y.",
      questionType: "spr",
      estimatedSeconds: 90,
      sourceKind: "official_extract",
      hasOfficialExplanation: true,
      assignable: true,
      choices: [],
      correctAnswer: "9",
    },
  ];
});

afterEach(() => {
  cleanup();
});

describe("tutor quiz builder", () => {
  test("lets a tutor inspect keys, select MCQ items, and save a named quiz", () => {
    const onCreated = vi.fn();
    render(
      <TutorQuizBuilder
        open
        onOpenChange={() => undefined}
        programs={programs}
        collections={[{ id: "col-1", title: "SAT Practice Test 4", questionCount: 3 }]}
        defaultCourseId="course-1"
        onCreated={onCreated}
        onError={() => undefined}
      />,
    );

    expect(screen.getByTestId("tutor-quiz-builder")).toBeTruthy();
    expect(screen.getByText(/Student-produced response/)).toBeTruthy();
    expect(screen.queryByText("Enter the value of y.")).toBeNull();
    expect(screen.getByText("Which choice best states the main idea?")).toBeTruthy();
    expect(screen.getByText(/A\. A claim/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("tutor-bank-question-explain-bq-1"));
    expect(screen.getByTestId("tutor-bank-question-key-bq-1").textContent).toContain("Correct:");
    expect(screen.getByTestId("tutor-bank-question-key-bq-1").textContent).toContain(
      "The passage states a transferable claim.",
    );

    fireEvent.click(screen.getByLabelText("Select question 1"));
    fireEvent.click(screen.getByLabelText("Select question 2"));
    fireEvent.change(screen.getByTestId("tutor-quiz-builder-title"), {
      target: { value: "Xavier RW + Math mini" },
    });
    fireEvent.click(screen.getByTestId("tutor-quiz-builder-save"));

    expect(mocks.createQuiz.mutate).toHaveBeenCalledWith(
      {
        courseId: "course-1",
        title: "Xavier RW + Math mini",
        bankQuestionIds: ["bq-1", "bq-2"],
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
