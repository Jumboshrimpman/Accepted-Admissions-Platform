import { assignmentChoices } from "./assignment-visibility.ts";
import { isTutorQuizMcq } from "./sat-bank-import.ts";

export const SESSION_QUESTION_COPY_METHOD = "session-copy";
export const SESSION_QUESTION_SHARED_EDIT_MESSAGE =
  "Tutors cannot edit shared bank quizzes. Assign a duplicate to the session, then edit that copy.";
export const SESSION_QUESTION_MCQ_ONLY_MESSAGE =
  "Only multiple-choice questions can be edited on the session plan.";

export type QuestionSnapshotSource = {
  subject: string;
  domain: string;
  skill: string;
  questionType: string;
  difficulty: string;
  stimulus?: string | null;
  prompt: string;
  choices: unknown;
  correctAnswer: string;
  explanation: string;
  sourceType: string;
  sourceId?: string | null;
  tags?: string[] | null;
};

export type SessionMcqChoice = { id: string; label: string; text: string };

export function isSessionLocalQuestionFork(question: {
  generationMethod?: string | null;
  tags?: string[] | null;
}): boolean {
  if (question.generationMethod === SESSION_QUESTION_COPY_METHOD) return true;
  return (question.tags ?? []).includes("session-copy");
}

export function shouldForkSessionQuestion(input: {
  bankLinked: boolean;
  otherAssignmentCount: number;
}): boolean {
  return input.bankLinked || input.otherAssignmentCount > 0;
}

export function sessionQuestionSnapshotValues(source: QuestionSnapshotSource) {
  const tags = Array.isArray(source.tags) ? [...source.tags] : [];
  if (!tags.includes("session-copy")) tags.push("session-copy");
  return {
    subject: source.subject,
    domain: source.domain,
    skill: source.skill,
    questionType: source.questionType,
    difficulty: source.difficulty,
    stimulus: source.stimulus ?? null,
    prompt: source.prompt,
    choices: assignmentChoices(source.choices) ?? [],
    correctAnswer: source.correctAnswer,
    explanation: source.explanation,
    sourceType: source.sourceType,
    sourceId: source.sourceId ?? null,
    reviewStatus: "approved" as const,
    tags,
    generationMethod: SESSION_QUESTION_COPY_METHOD,
  };
}

export function normalizeSessionMcqChoices(value: unknown): SessionMcqChoice[] | null {
  const choices = assignmentChoices(value);
  if (!choices || choices.length < 2 || choices.length > 4) return null;
  return choices.map((choice, index) => ({
    id: (choice.id.trim() || String.fromCharCode(97 + index)).toLowerCase(),
    label: choice.label.trim() || String.fromCharCode(65 + index),
    text: choice.text,
  }));
}

export function validateSessionMcqEdit(input: {
  prompt?: string;
  choices?: unknown;
  correctAnswer?: string;
  explanation?: string;
  questionType?: string | null;
}):
  | {
      ok: true;
      prompt: string;
      choices: SessionMcqChoice[];
      correctAnswer: string;
      explanation: string;
    }
  | { ok: false; error: string } {
  if (input.questionType && !isTutorQuizMcq(input.questionType)) {
    return { ok: false, error: SESSION_QUESTION_MCQ_ONLY_MESSAGE };
  }
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "A question prompt is required." };
  const choices = normalizeSessionMcqChoices(input.choices);
  if (!choices) {
    return { ok: false, error: "Provide two to four multiple-choice answers." };
  }
  const correct = (input.correctAnswer ?? "").trim().toLowerCase();
  const matched = choices.find(
    (choice) => choice.id === correct || choice.label.toLowerCase() === correct,
  );
  if (!matched) {
    return { ok: false, error: "The correct answer must match one of the choices." };
  }
  return {
    ok: true,
    prompt,
    choices,
    correctAnswer: matched.id,
    explanation: (input.explanation ?? "").trim(),
  };
}

export function blankSessionMcqValues(input: { subject: string }) {
  const subject = input.subject.trim() || "SAT";
  return sessionQuestionSnapshotValues({
    subject,
    domain: subject,
    skill: "Session practice",
    questionType: "multiple_choice",
    difficulty: "medium",
    stimulus: null,
    prompt: "New multiple-choice question",
    choices: [
      { id: "a", label: "A", text: "Choice A" },
      { id: "b", label: "B", text: "Choice B" },
      { id: "c", label: "C", text: "Choice C" },
      { id: "d", label: "D", text: "Choice D" },
    ],
    correctAnswer: "a",
    explanation: "",
    sourceType: "original",
    sourceId: null,
    tags: ["session-copy"],
  });
}
