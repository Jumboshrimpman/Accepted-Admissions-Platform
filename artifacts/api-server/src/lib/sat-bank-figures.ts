import { assignmentChoices, assignmentDifficulty } from "./assignment-visibility.ts";
import {
  figurePrimaryStudentPrompt,
  isLetterAnswer,
  letterMcqChoices,
  normalizeLetterAnswer,
  selectStimulusFigures,
  shouldUseFigurePrimary,
  stripSatBankFigureComments,
} from "./sat-bank-figure-primary.ts";
import { quizSubject, skillLabelForBank } from "./sat-bank-skill.ts";

export type BankFigure = {
  url?: string;
  path?: string;
  alt?: string;
  role?: string;
  kind?: string;
  primary?: boolean;
};

export type LinkedRefreshCounts = {
  updated: number;
  skipped: number;
  errors: number;
};

const ABSOLUTE_HTTPS = /^https:\/\//i;
const ABSOLUTE_HTTP = /^http:\/\//i;

export function asBankFigures(value: unknown): BankFigure[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as BankFigure;
    return [
      {
        url: typeof row.url === "string" ? row.url : undefined,
        path: typeof row.path === "string" ? row.path : undefined,
        alt: typeof row.alt === "string" ? row.alt : undefined,
        role: typeof row.role === "string" ? row.role : undefined,
        kind: typeof row.kind === "string" ? row.kind : undefined,
        primary: row.primary === true,
      },
    ];
  });
}

/** Prefer absolute https figure URLs; allow http and same-origin /media paths. */
export function resolveBankFigureUrl(figure: BankFigure): string | null {
  const url = figure.url?.trim() ?? "";
  if (ABSOLUTE_HTTPS.test(url) || ABSOLUTE_HTTP.test(url)) return url;
  if (url.startsWith("/media/")) return url;
  return null;
}

export function figureMarkdownLine(figure: BankFigure): string | null {
  const url = resolveBankFigureUrl(figure);
  if (!url) return null;
  const alt = (figure.alt?.trim() || "Figure").replace(/[\[\]]/g, "");
  return `![${alt}](${url})`;
}

function imageUrlsInText(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]).filter(Boolean),
  );
}

/**
 * Prepend markdown image lines for bank figures above existing stimulus text.
 * Deterministic: rebuilt from raw stimulus + figures. Idempotent: skips URLs
 * already present as `![alt](url)` in the stimulus.
 */
export function enrichStimulusWithFigures(
  stimulus: string | null | undefined,
  figures: unknown,
): string | null {
  const base = (stimulus ?? "").trim();
  const already = imageUrlsInText(base);
  const lines: string[] = [];
  const seen = new Set<string>(already);
  for (const figure of asBankFigures(figures)) {
    const url = resolveBankFigureUrl(figure);
    const line = figureMarkdownLine(figure);
    if (!url || !line || seen.has(url) || base.includes(line)) continue;
    seen.add(url);
    lines.push(line);
  }
  if (lines.length === 0) return base || null;
  return [...lines, base].filter((part) => part.length > 0).join("\n\n");
}

export function materializedQuestionContent(bank: {
  section: string;
  domain?: string | null;
  skill?: string | null;
  questionType: string;
  difficulty?: string | null;
  stimulus?: string | null;
  figures?: unknown;
  prompt?: string | null;
  choices?: unknown;
  correctAnswer: string;
  officialExplanation?: string | null;
  subject?: string | null;
  extractGaps?: Record<string, unknown> | null;
  tags?: string[] | null;
}) {
  const figures = asBankFigures(bank.figures);
  const figurePrimary = shouldUseFigurePrimary({
    prompt: bank.prompt,
    stimulus: bank.stimulus,
    choices: assignmentChoices(bank.choices) ?? [],
    figures,
    questionType: bank.questionType,
    correctAnswer: bank.correctAnswer,
    extractGaps: bank.extractGaps,
    tags: bank.tags,
  });
  const stimulusFigures = figurePrimary ? selectStimulusFigures(figures) : figures;
  const stimulus = stripSatBankFigureComments(
    enrichStimulusWithFigures(bank.stimulus, stimulusFigures) ?? "",
  );
  return {
    subject: quizSubject(bank.section),
    domain: bank.domain || (bank.section === "math" ? "SAT Math" : "Reading and Writing"),
    skill: skillLabelForBank({
      skill: bank.skill,
      section: bank.section,
      domain: bank.domain,
      subject: bank.subject,
    }),
    questionType:
      figurePrimary && isLetterAnswer(bank.correctAnswer) ? "mcq" : bank.questionType,
    difficulty: assignmentDifficulty(bank.difficulty),
    stimulus: stimulus || null,
    prompt: figurePrimary
      ? figurePrimaryStudentPrompt(bank.prompt)
      : bank.prompt?.trim() ||
        "Figure or table was not recovered from this PDF page. Open the linked source PDF.",
    choices:
      figurePrimary && isLetterAnswer(bank.correctAnswer)
        ? letterMcqChoices(assignmentChoices(bank.choices))
        : assignmentChoices(bank.choices) ?? [],
    correctAnswer: normalizeLetterAnswer(bank.correctAnswer),
    explanation: bank.officialExplanation ?? "",
    reviewStatus: "approved" as const,
  };
}

export function classifyLinkedRefresh(input: {
  hasLinkedId: boolean;
  linkedExists: boolean;
}): "update" | "insert" | "skip" {
  if (!input.hasLinkedId) return "skip";
  if (input.linkedExists) return "update";
  return "insert";
}

export function emptyLinkedRefreshCounts(): LinkedRefreshCounts {
  return { updated: 0, skipped: 0, errors: 0 };
}

export function recordLinkedRefresh(
  counts: LinkedRefreshCounts,
  action: "update" | "insert" | "skip" | "error",
): LinkedRefreshCounts {
  if (action === "update") return { ...counts, updated: counts.updated + 1 };
  if (action === "error") return { ...counts, errors: counts.errors + 1 };
  return { ...counts, skipped: counts.skipped + 1 };
}
