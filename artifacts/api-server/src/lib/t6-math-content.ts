import module1File from "./data/t6-math/module1.json" with { type: "json" };
import module2File from "./data/t6-math/module2.json" with { type: "json" };
import { enrichStimulusWithFigures } from "./sat-bank-figures.ts";
import { stemCitesVisual } from "./sat-bank-figure-primary.ts";
import {
  EUNICE_TUTOR_EMAIL,
  NIKA_TUTOR_EMAIL,
  sessionLocalDateKey,
  TAITO_STUDENT_EMAIL,
} from "./session-schedule.ts";

/**
 * Michelle's two College Board SAT Practice Test 6 math modules.
 * Built from the checked transcription in data/t6-math, not from
 * content/college-board/sat-practice-test-6-digital.jsonl (those math
 * stems do not match their keys). Startup calls ensureMichelleT6MathModules.
 * A second run updates the same quizzes and does not insert duplicates.
 */

export const MICHELLE_T6_EMAIL = "makaremmichelle7@gmail.com";
export const MICHELLE_T6_CLERK_USER_ID = "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";
export const T6_MATH_MEDIA_DIR = "/media/sat-bank/t6-math-full-length";
export const T6_MATH_REFERENCE_SHEET = "sat_math";
export const T6_MATH_TIME_LIMIT_MINUTES = 50;
export const T6_MATH_MAX_ATTEMPTS = 1;
export const T6_MATH_TAG = "t6-math-full-length";

const FORBIDDEN_CLIENT_EMAILS = new Set(
  [TAITO_STUDENT_EMAIL, "ryo@jaac.co.jp", EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL].map((email) =>
    email.toLowerCase(),
  ),
);

export function normalizeT6Email(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

export function isT6ForbiddenClient(email: string | null | undefined): boolean {
  return FORBIDDEN_CLIENT_EMAILS.has(normalizeT6Email(email));
}

type T6Choice = { id: string; label: string; text: string; image?: string };
type T6Figure = { path: string; alt?: string };
type T6Question = {
  questionNumber: number;
  questionType: string;
  stimulus: string | null;
  prompt: string;
  choices: T6Choice[];
  correctAnswer: string;
  acceptedAnswers: string[];
  explanation: string;
  figures: T6Figure[];
  id: string;
};
type T6ModuleFile = {
  module: number;
  sessionDate: string;
  title: string;
  instructions: string;
  inconspicuousNote: string;
  timeLimitMinutes: number;
  questions: T6Question[];
};

export type T6ChoiceDraft = { id: string; label: string; text: string; image?: string };

export type T6QuestionDraft = {
  key: string;
  sourceId: string;
  questionType: "multiple_choice" | "spr";
  stimulus: string | null;
  prompt: string;
  choices: T6ChoiceDraft[];
  correctAnswer: string;
  explanation: string;
};

export type T6ModulePlan = {
  module: 1 | 2;
  dateKey: string;
  title: string;
  instructions: string;
  footnote: string;
  timeLimitMinutes: number;
  questions: T6QuestionDraft[];
};

function mediaUrl(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? "";
  if (!/^[A-Za-z0-9._-]+\.png$/.test(name)) {
    throw new Error(`Unexpected T6 figure path: ${filePath}`);
  }
  return `${T6_MATH_MEDIA_DIR}/${name}`;
}

function storedAnswer(question: T6Question): string {
  if (question.questionType === "spr") {
    const forms = (question.acceptedAnswers.length > 0 ? question.acceptedAnswers : [question.correctAnswer])
      .map((form) => form.trim())
      .filter(Boolean);
    if (forms.length === 0) throw new Error(`SPR ${question.id} has no accepted answer.`);
    return forms.join(";");
  }
  const letter = (question.correctAnswer || question.acceptedAnswers[0] || "").trim().toLowerCase();
  if (!/^[a-d]$/.test(letter)) throw new Error(`MCQ ${question.id} has key ${question.correctAnswer}.`);
  return letter;
}

function storedChoices(question: T6Question): T6ChoiceDraft[] {
  if (question.questionType !== "mcq") return [];
  return question.choices.map((choice) => {
    const image = choice.image ? mediaUrl(choice.image) : undefined;
    return {
      id: choice.id.trim().toLowerCase(),
      label: choice.label.trim().toUpperCase(),
      // Image choices are pictures on the test. The transcribed caption is not shown.
      text: image ? "" : choice.text,
      ...(image ? { image } : {}),
    };
  });
}

function stimulusWithFigures(question: T6Question): string | null {
  const figures = (question.figures ?? []).map((figure) => ({
    url: mediaUrl(figure.path),
    // The source alt restates the picture. Students see the figure, not that caption.
    alt: "Figure",
  }));
  const enriched = enrichStimulusWithFigures(question.stimulus, figures);
  if (figures.length === 0) return enriched;
  const combined = `${question.prompt}\n${enriched ?? ""}`;
  if (stemCitesVisual(combined)) return enriched;
  const note = "In the figure.";
  return enriched ? `${enriched}\n\n${note}` : note;
}

function questionKey(module: number, questionNumber: number): string {
  return `t6-math-m${module}-q${String(questionNumber).padStart(2, "0")}`;
}

function planFromFile(file: T6ModuleFile): T6ModulePlan {
  if (file.module !== 1 && file.module !== 2) {
    throw new Error(`Unexpected T6 module ${file.module}.`);
  }
  if (file.questions.length !== 27) {
    throw new Error(`T6 module ${file.module} has ${file.questions.length} questions.`);
  }
  if (file.timeLimitMinutes !== T6_MATH_TIME_LIMIT_MINUTES) {
    throw new Error(`T6 module ${file.module} is not a 50-minute section.`);
  }
  const questions = file.questions.map((question, index) => {
    const number = index + 1;
    if (question.questionNumber !== number) {
      throw new Error(`T6 module ${file.module} question ${number} is numbered ${question.questionNumber}.`);
    }
    const questionType = question.questionType === "spr" ? "spr" : "multiple_choice";
    if (question.questionType !== "spr" && question.questionType !== "mcq") {
      throw new Error(`T6 ${question.id} has type ${question.questionType}.`);
    }
    return {
      key: questionKey(file.module, number),
      sourceId: question.id,
      questionType,
      stimulus: stimulusWithFigures(question),
      prompt: question.prompt.trim(),
      choices: storedChoices(question),
      correctAnswer: storedAnswer(question),
      explanation: question.explanation.trim(),
    } satisfies T6QuestionDraft;
  });
  return {
    module: file.module,
    dateKey: file.sessionDate,
    title: file.title.trim(),
    instructions: file.instructions.trim(),
    footnote: file.inconspicuousNote.trim(),
    timeLimitMinutes: file.timeLimitMinutes,
    questions,
  };
}

export const T6_MATH_MODULE_PLANS: readonly T6ModulePlan[] = [
  planFromFile(module1File as T6ModuleFile),
  planFromFile(module2File as T6ModuleFile),
];

export function t6MathPlan(module: 1 | 2): T6ModulePlan {
  const plan = T6_MATH_MODULE_PLANS.find((item) => item.module === module);
  if (!plan) throw new Error(`Missing T6 math module ${module}.`);
  return plan;
}

/** 11:59 p.m. Eastern on the session date when no session row exists. November 2026 is EST. */
export function t6DueAt(dateKey: string, session: { dateTime: Date } | null): Date {
  if (session) return session.dateTime;
  return new Date(`${dateKey}T23:59:00-05:00`);
}

export function sessionMatchesT6Date(
  session: { dateTime: Date; timezone?: string | null },
  dateKey: string,
): boolean {
  const zone = session.timezone?.trim();
  if (zone && sessionLocalDateKey(session.dateTime, zone) === dateKey) return true;
  if (sessionLocalDateKey(session.dateTime, "America/New_York") === dateKey) return true;
  return session.dateTime.toISOString().slice(0, 10) === dateKey;
}

export function pickT6Session<T extends { dateTime: Date; subject?: string | null; title?: string | null }>(
  sessions: readonly T[],
): T | null {
  if (sessions.length === 0) return null;
  const math = sessions.filter(
    (session) => /math/i.test(session.subject ?? "") || /math/i.test(session.title ?? ""),
  );
  const pool = math.length > 0 ? math : [...sessions];
  return [...pool].sort((left, right) => left.dateTime.getTime() - right.dateTime.getTime())[0] ?? null;
}

