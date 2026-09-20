import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const updateQuestion = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  useGetAssignment: () => ({
    data: {
      id: "quiz-1",
      title: "October pre-session mini-section",
      questions: [
        {
          id: "q1",
          position: 0,
          subject: "SAT",
          questionType: "multiple_choice",
          prompt: "Which transition best connects the paragraphs?",
          choices: [
            { id: "a", label: "A", text: "Similarly" },
            { id: "b", label: "B", text: "However" },
          ],
          skill: "Transitions",
          difficulty: "medium",
          predictionFirst: false,
          correctAnswer: "b",
          explanation: "However signals contrast.",
        },
        {
          id: "q-math",
          position: 1,
          subject: "SAT Math",
          questionType: "multiple_choice",
          prompt: "x 45 48 + = What is the positive solution to the given equation?",
          choices: [
            { id: "a", label: "A", text: "3" },
            { id: "b", label: "B", text: "93" },
          ],
          skill: "SAT Math",
          difficulty: "medium",
          predictionFirst: false,
          correctAnswer: "a",
          explanation: "Choice A is correct. x 45 48 + = yields x 3 =.",
        },
      ],
    },
  }),
  useUpdateAssignmentQuestion: () => ({ mutate: updateQuestion, isPending: false }),
  useRemoveQuestionFromAssignment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { TutorSessionQuizEditor } from "./tutor-session-quiz-editor";

afterEach(() => {
  cleanup();
  updateQuestion.mockReset();
});

describe("tutor session quiz editor", () => {
  test("lets a tutor edit stem, choices, correct answer, and explanation on the session copy", () => {
    render(<TutorSessionQuizEditor assignmentId="quiz-1" heading="Session homework questions" />);

    fireEvent.click(screen.getByTestId("tutor-session-question-edit-q1"));
    fireEvent.change(screen.getByTestId("tutor-session-question-prompt-q1"), {
      target: { value: "Which transition is contrastive?" },
    });
    fireEvent.change(screen.getByTestId("tutor-session-question-choice-q1-a"), {
      target: { value: "Meanwhile" },
    });
    fireEvent.change(screen.getByTestId("tutor-session-question-correct-q1"), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByTestId("tutor-session-question-explanation-q1"), {
      target: { value: "Meanwhile marks a shift in time." },
    });
    fireEvent.click(screen.getByTestId("tutor-session-question-save-q1"));

    expect(updateQuestion).toHaveBeenCalledWith(
      {
        assignmentId: "quiz-1",
        questionId: "q1",
        data: {
          prompt: "Which transition is contrastive?",
          choices: [
            { id: "a", label: "A", text: "Meanwhile" },
            { id: "b", label: "B", text: "However" },
          ],
          correctAnswer: "a",
          explanation: "Meanwhile marks a shift in time.",
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test("rebuilds smashed Michelle math in the session homework list and leaves Taito titles alone", () => {
    render(
      <TutorSessionQuizEditor
        assignmentId="quiz-1"
        heading="Session homework questions"
        sessionTitle="Michelle’s SAT Session with Xavier"
        clientName="Michelle Makarem"
      />,
    );
    const mathCard = screen.getByTestId("tutor-session-question-q-math");
    expect(mathCard.textContent).toMatch(/x \+ 45 = 48/);
    expect(mathCard.textContent).toMatch(/x = 3/);
    expect(mathCard.textContent).not.toMatch(/x 45 48 \+ =/);

    cleanup();
    render(
      <TutorSessionQuizEditor
        assignmentId="quiz-1"
        heading="Session homework questions"
        sessionTitle="Taito’s SAT Session with Eunice"
        clientName="Taito Goto"
      />,
    );
    const taitoCard = screen.getByTestId("tutor-session-question-q-math");
    expect(taitoCard.textContent).toMatch(/x 45 48 \+ =/);
    expect(taitoCard.textContent).not.toMatch(/x \+ 45 = 48/);
  });
});
