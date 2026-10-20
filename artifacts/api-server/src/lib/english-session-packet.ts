import {
  IELTS_STYLE_PASSAGES,
  IELTS_STYLE_WRITING_TASKS,
  type IeltsStylePassage,
} from "./ielts-style-bank-content.ts";
import { selectIeltsStylePreworkItems } from "./ielts-style-bank-select.ts";
import {
  TAITO_ENGLISH_DATE_KEYS,
  isEnglishSessionSubject,
  matchesTaitoScheduledDate,
} from "./session-schedule.ts";
import {
  renderSessionQuestionPdf,
  type SessionQuestionPdfSection,
} from "./session-question-pdf.ts";

export const ENGLISH_PACKET_QUESTION_PREAMBLE =
  "Original IELTS-style practice. Not an official IELTS score.";

export const ENGLISH_PACKET_ANSWER_PREAMBLE =
  "Original IELTS-style practice. Not an official IELTS score. For the tutor. Do not share this file with the student.";

export type EnglishPacketSession = {
  dateTime: Date;
  subject: string;
  timezone?: string | null;
  email?: string | null;
  clientUserId?: string | null;
  taitoUserId?: string | null;
};

export type EnglishSessionPacket = {
  dateKey: (typeof TAITO_ENGLISH_DATE_KEYS)[number];
  setIndex: number;
  readingCount: number;
  writingCount: number;
  sections: SessionQuestionPdfSection[];
};

type ReadingPoolItem = {
  id: string;
  module: number;
  questionType: string;
  passageId: string;
  questionIndex: number;
};

function readingPool(): ReadingPoolItem[] {
  return IELTS_STYLE_PASSAGES.flatMap((passage) =>
    passage.questions.map((_, questionIndex) => ({
      id: `${passage.id}:${questionIndex}`,
      module: passage.module,
      questionType: "multiple_choice",
      passageId: passage.id,
      questionIndex,
    })),
  );
}

function letterFor(passage: IeltsStylePassage, questionIndex: number): string {
  const question = passage.questions[questionIndex];
  if (!question) return "";
  return (
    question.choices.find((choice) => choice.id === question.correctAnswer)?.label ??
    question.correctAnswer.toUpperCase()
  );
}

function sectionsForPassages(
  passages: readonly IeltsStylePassage[],
  selected: readonly ReadingPoolItem[],
): SessionQuestionPdfSection[] {
  const sections: SessionQuestionPdfSection[] = [];
  for (const passage of passages) {
    const questions = selected
      .filter((item) => item.passageId === passage.id)
      .sort((left, right) => left.questionIndex - right.questionIndex)
      .map((item) => {
        const question = passage.questions[item.questionIndex]!;
        return {
          prompt: question.prompt,
          choices: question.choices.map((choice) => ({
            label: choice.label,
            text: choice.text,
          })),
          correctAnswer: letterFor(passage, item.questionIndex),
          explanation: question.explanation,
        };
      });
    if (questions.length === 0) continue;
    sections.push({
      title: passage.title,
      passage: passage.stimulus,
      questions,
    });
  }
  return sections;
}

/**
 * Oct 23 is the 24-question diagnostic plus both writing prompts.
 * Later Taito English dates use the same routine module as pre-work.
 * Another student's session on the same day is not a packet.
 */
export function buildEnglishSessionPacket(
  session: EnglishPacketSession,
): EnglishSessionPacket | null {
  if (!isEnglishSessionSubject(session.subject)) return null;
  const dateKey = TAITO_ENGLISH_DATE_KEYS.find((key) =>
    matchesTaitoScheduledDate(session, key),
  );
  if (!dateKey) return null;
  const setIndex = TAITO_ENGLISH_DATE_KEYS.indexOf(dateKey);
  const selected = selectIeltsStylePreworkItems(readingPool(), {
    homeworkKind: setIndex === 0 ? "diagnostic" : "routine",
    setIndex,
  });
  const sections = sectionsForPassages(IELTS_STYLE_PASSAGES, selected);
  if (setIndex === 0) {
    sections.push({
      title: "Writing prompts",
      questions: IELTS_STYLE_WRITING_TASKS.map((task) => ({
        prompt: task.prompt,
        stimulus: task.stimulus,
        explanation: task.explanation,
        suppressAnswerLine: true,
      })),
    });
  }
  const readingCount = sections.reduce(
    (sum, section) =>
      sum + section.questions.filter((question) => !question.suppressAnswerLine).length,
    0,
  );
  if (readingCount === 0) return null;
  return {
    dateKey,
    setIndex,
    readingCount,
    writingCount: setIndex === 0 ? IELTS_STYLE_WRITING_TASKS.length : 0,
    sections,
  };
}

export function renderEnglishSessionPacketPdf(
  packet: EnglishSessionPacket,
  input: {
    includeAnswerKey: boolean;
    sessionTitle: string;
    sessionDateLabel: string;
    studentName: string;
  },
): Buffer {
  return renderSessionQuestionPdf({
    phase: "before_session",
    includeAnswerKey: input.includeAnswerKey,
    documentTitle: input.includeAnswerKey
      ? "English session — answer key"
      : "English session questions",
    preamble: input.includeAnswerKey
      ? ENGLISH_PACKET_ANSWER_PREAMBLE
      : ENGLISH_PACKET_QUESTION_PREAMBLE,
    sessionTitle: input.sessionTitle,
    sessionDateLabel: input.sessionDateLabel,
    studentName: input.studentName,
    sections: packet.sections,
  });
}
