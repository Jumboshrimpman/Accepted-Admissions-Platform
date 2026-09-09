export type AssignmentQuestionDraftSource = {
  prompt: string;
  choices?: Array<{ id: string; label: string; text: string }>;
  correctAnswer?: string | null;
  explanation?: string | null;
};

export type SessionQuestionDraft = {
  prompt: string;
  choices: Array<{ id: string; label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
};

const DEFAULT_CHOICES = [
  { id: "a", label: "A", text: "" },
  { id: "b", label: "B", text: "" },
  { id: "c", label: "C", text: "" },
  { id: "d", label: "D", text: "" },
];

export function isSessionMcqQuestion(questionType: string | null | undefined): boolean {
  const type = questionType?.trim().toLowerCase() ?? "";
  return type !== "spr" && type !== "student_produced_response" && type !== "free_response";
}

export function draftFromAssignmentQuestion(
  question: AssignmentQuestionDraftSource,
): SessionQuestionDraft {
  const choices =
    question.choices && question.choices.length >= 2
      ? question.choices.slice(0, 4).map((choice, index) => ({
          id: choice.id || String.fromCharCode(97 + index),
          label: choice.label || String.fromCharCode(65 + index),
          text: choice.text,
        }))
      : DEFAULT_CHOICES.map((choice) => ({ ...choice }));
  return {
    prompt: question.prompt,
    choices,
    correctAnswer: question.correctAnswer || choices[0]?.id || "a",
    explanation: question.explanation || "",
  };
}

export function sessionQuestionUpdateBody(draft: SessionQuestionDraft) {
  return {
    prompt: draft.prompt,
    choices: draft.choices,
    correctAnswer: draft.correctAnswer,
    explanation: draft.explanation,
  };
}

