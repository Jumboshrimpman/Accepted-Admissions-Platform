import { answersMatch } from "./sat-bank-retry.ts";
import { allowsInSessionPerQuestionFeedback } from "./session-homework.ts";

export const IN_SESSION_CHECK_NOT_ALLOWED_MESSAGE =
  "Per-question feedback is only available during in-session practice";
export const IN_SESSION_CHECK_EMPTY_ANSWER_MESSAGE = "Select an answer before checking";

export function inSessionFeedbackAllowed(deliveryPhase?: string | null): boolean {
  return allowsInSessionPerQuestionFeedback({ deliveryPhase });
}

export function isResponseRevealed(correct: boolean | null | undefined): boolean {
  return correct !== null && correct !== undefined;
}

export function checkAnswerRejectedReason(input: {
  deliveryPhase?: string | null;
  checkAnswer?: boolean;
  finalAnswer?: string | null;
}): string | null {
  if (!input.checkAnswer) return null;
  if (!inSessionFeedbackAllowed(input.deliveryPhase)) {
    return IN_SESSION_CHECK_NOT_ALLOWED_MESSAGE;
  }
  if (!input.finalAnswer?.trim()) {
    return IN_SESSION_CHECK_EMPTY_ANSWER_MESSAGE;
  }
  return null;
}

export function gradeInSessionAnswer(input: {
  studentAnswer?: string | null;
  correctAnswer: string;
}): boolean {
  return answersMatch(input.studentAnswer, input.correctAnswer);
}

export function lockedFinalAnswerAfterReveal(input: {
  alreadyRevealed: boolean;
  existingAnswer?: string | null;
  incomingAnswer?: string | null;
}): string | null {
  if (input.alreadyRevealed) {
    return input.existingAnswer ?? input.incomingAnswer ?? null;
  }
  return input.incomingAnswer ?? input.existingAnswer ?? null;
}

/** Keys stay hidden unless this is in-session practice and the item was already checked. */
export function studentVisibleQuestionFeedback(input: {
  deliveryPhase?: string | null;
  revealed: boolean;
  storedCorrect?: boolean | null;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
}): {
  revealed: boolean;
  correct: boolean | null;
  correctAnswer: string | null;
  explanation: string | null;
} {
  if (!inSessionFeedbackAllowed(input.deliveryPhase) || !input.revealed) {
    return { revealed: false, correct: null, correctAnswer: null, explanation: null };
  }
  const correct =
    input.storedCorrect !== null && input.storedCorrect !== undefined
      ? input.storedCorrect
      : gradeInSessionAnswer({
          studentAnswer: input.studentAnswer,
          correctAnswer: input.correctAnswer ?? "",
        });
  return {
    revealed: true,
    correct,
    correctAnswer: input.correctAnswer?.trim() ? input.correctAnswer : null,
    explanation: input.explanation?.trim() ? input.explanation : null,
  };
}

export function attemptResponseFeedbackShape(input: {
  questionId: string;
  prediction: string | null;
  predictionLocked: boolean;
  finalAnswer: string | null;
  flagged: boolean;
  savedAt?: Date;
  feedback: {
    revealed: boolean;
    correct: boolean | null;
    correctAnswer: string | null;
    explanation: string | null;
  };
}) {
  return {
    questionId: input.questionId,
    prediction: input.prediction,
    predictionLocked: input.predictionLocked,
    finalAnswer: input.finalAnswer,
    flagged: input.flagged,
    savedAt: input.savedAt,
    revealed: input.feedback.revealed,
    correct: input.feedback.correct,
    correctAnswer: input.feedback.correctAnswer,
    explanation: input.feedback.explanation,
  };
}
