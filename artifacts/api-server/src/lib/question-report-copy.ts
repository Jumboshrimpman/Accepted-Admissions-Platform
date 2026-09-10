export const QUESTION_REPORT_REASONS = ["incorrect", "bug", "other"] as const;
export type QuestionReportReason = (typeof QUESTION_REPORT_REASONS)[number];

export function isQuestionReportReason(value: string | null | undefined): value is QuestionReportReason {
  return QUESTION_REPORT_REASONS.includes((value ?? "") as QuestionReportReason);
}

export function stemSnippetForReport(prompt: string | null | undefined, max = 180): string {
  const text = (prompt ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function questionReportEmailBody(input: {
  studentName: string;
  studentEmail: string;
  assignmentTitle: string;
  assignmentId: string;
  attemptId: string;
  questionId: string;
  questionIndex: number;
  reason: string;
  note?: string | null;
  stemSnippet: string;
}): string {
  const lines = [
    "A student reported a quiz question.",
    "",
    `Student: ${input.studentName} <${input.studentEmail}>`,
    `Assignment: ${input.assignmentTitle} (${input.assignmentId})`,
    `Attempt: ${input.attemptId}`,
    `Question: ${input.questionId} (index ${input.questionIndex + 1})`,
    `Reason: ${input.reason}`,
  ];
  if (input.note?.trim()) lines.push(`Note: ${input.note.trim()}`);
  if (input.stemSnippet) lines.push(`Stem: ${input.stemSnippet}`);
  return lines.join("\n");
}
