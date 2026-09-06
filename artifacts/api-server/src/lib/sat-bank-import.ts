import {
  bankSourceKey,
  collectionSlug,
  collectionTitle,
  defaultEstimatedSeconds,
  normalizeExamFamily,
  normalizeExamSection,
  type ExamFamily,
  type ExamSection,
} from "./sat-bank-source-key.ts";

export type BankChoice = { id: string; label: string; text: string };

export type ParsedBankRecord = {
  sourceKey: string;
  examFamily: ExamFamily;
  practiceTestNumber: number | null;
  formCode: string | null;
  section: ExamSection;
  module: number;
  questionNumber: number;
  position: number;
  collectionSlug: string;
  collectionTitle: string;
  prompt: string;
  stimulus: string | null;
  choices: BankChoice[];
  correctAnswer: string;
  officialExplanation: string;
  figures: Array<{ url?: string; path?: string; alt?: string }>;
  scoring: Record<string, unknown>;
  skill: string;
  domain: string;
  difficulty: string;
  questionType: string;
  estimatedSeconds: number;
  sourceKind: "official_extract" | "seed";
  sourceFiles: Record<string, unknown>;
  assets: Array<{ kind: string; title: string; resourceUrl: string }>;
};

export type ImportParseResult = {
  records: ParsedBankRecord[];
  skipped: Array<{ reason: string; source?: string }>;
  duplicatesInFile: string[];
};

const CHOICE_IDS = ["a", "b", "c", "d"] as const;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function parseChoices(raw: unknown): BankChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((choice, index) => {
      if (typeof choice === "string") {
        const id = CHOICE_IDS[index] ?? String.fromCharCode(97 + index);
        return { id, label: id.toUpperCase(), text: choice.trim() };
      }
      const row = asObject(choice);
      if (!row) return null;
      const text = asString(row.text) || asString(row.choice) || asString(row.value);
      if (!text) return null;
      const id = asString(row.id).toLowerCase() || CHOICE_IDS[index] || String.fromCharCode(97 + index);
      const label = asString(row.label) || id.toUpperCase();
      return { id, label, text };
    })
    .filter((choice): choice is BankChoice => Boolean(choice));
}

function parseAssets(record: Record<string, unknown>): Array<{
  kind: string;
  title: string;
  resourceUrl: string;
}> {
  const files = asObject(record.sourceFiles) ?? asObject(record.bundles) ?? {};
  const assets: Array<{ kind: string; title: string; resourceUrl: string }> = [];
  const mapping: Array<[string, string, string]> = [
    ["testPdf", "test_pdf", "Test PDF"],
    ["test_pdf", "test_pdf", "Test PDF"],
    ["answersPdf", "answers_explanations", "Answers and explanations"],
    ["answers_explanations", "answers_explanations", "Answers and explanations"],
    ["scoringGuide", "scoring_guide", "Scoring guide"],
    ["scoring_guide", "scoring_guide", "Scoring guide"],
  ];
  for (const [key, kind, title] of mapping) {
    const url = asString(files[key] ?? record[key]);
    if (url) assets.push({ kind, title, resourceUrl: url });
  }
  const extra = Array.isArray(record.assets) ? record.assets : [];
  for (const item of extra) {
    const row = asObject(item);
    if (!row) continue;
    const resourceUrl = asString(row.resourceUrl) || asString(row.url) || asString(row.path);
    if (!resourceUrl) continue;
    assets.push({
      kind: asString(row.kind) || "other",
      title: asString(row.title) || "Source file",
      resourceUrl,
    });
  }
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.kind}:${asset.resourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseCollegeBoardRecord(
  value: unknown,
  source = "record",
): { record?: ParsedBankRecord; skip?: string } {
  const row = asObject(value);
  if (!row) return { skip: `${source}: not an object` };
  const examFamily = normalizeExamFamily(
    asString(row.examFamily) || asString(row.exam_family) || asString(row.exam),
  );
  const section = normalizeExamSection(
    asString(row.section) || asString(row.sectionName) || asString(row.subject),
  );
  const module = asNumber(row.module) ?? asNumber(row.moduleNumber);
  const questionNumber =
    asNumber(row.questionNumber) ?? asNumber(row.question_number) ?? asNumber(row.q);
  const prompt = asString(row.prompt) || asString(row.stem) || asString(row.question);
  if (!examFamily) return { skip: `${source}: missing examFamily` };
  if (!section) return { skip: `${source}: missing section` };
  if (module == null || module < 1) return { skip: `${source}: missing module` };
  if (questionNumber == null || questionNumber < 1) return { skip: `${source}: missing questionNumber` };
  if (prompt.length < 4) return { skip: `${source}: missing prompt` };

  const practiceTestNumber =
    asNumber(row.practiceTestNumber) ?? asNumber(row.practice_test_number) ?? asNumber(row.testNumber);
  const formCode = asString(row.formCode) || asString(row.form_code) || asString(row.pack) || null;
  const choices = parseChoices(row.choices);
  const correctAnswer = asString(row.correctAnswer) || asString(row.correct_answer) || asString(row.answer);
  const normalizedCorrect = correctAnswer.toLowerCase();
  const identity = {
    examFamily,
    practiceTestNumber,
    formCode,
    section,
    module,
    questionNumber,
  };
  const sourceKind = asString(row.sourceKind) === "seed" ? "seed" : "official_extract";
  return {
    record: {
      sourceKey: asString(row.sourceKey) || bankSourceKey(identity),
      examFamily,
      practiceTestNumber,
      formCode,
      section,
      module,
      questionNumber,
      position:
        asNumber(row.position) ??
        module * 100 + questionNumber,
      collectionSlug:
        asString(row.collectionSlug) ||
        collectionSlug({ examFamily, practiceTestNumber, formCode }),
      collectionTitle: collectionTitle({
        examFamily,
        practiceTestNumber,
        formCode,
        title: asString(row.collectionTitle) || asString(row.collection),
      }),
      prompt,
      stimulus: asString(row.stimulus) || asString(row.passage) || null,
      choices,
      correctAnswer: choices.some((choice) => choice.id === normalizedCorrect)
        ? normalizedCorrect
        : correctAnswer || (choices[0]?.id ?? ""),
      officialExplanation:
        asString(row.officialExplanation) ||
        asString(row.official_explanation) ||
        asString(row.explanation),
      figures: Array.isArray(row.figures)
        ? row.figures.flatMap((figure) => {
            const item = asObject(figure);
            if (!item) return [];
            return [
              {
                url: asString(item.url) || undefined,
                path: asString(item.path) || undefined,
                alt: asString(item.alt) || undefined,
              },
            ];
          })
        : [],
      scoring: asObject(row.scoring) ?? {},
      skill: asString(row.skill) || "Unspecified skill",
      domain: asString(row.domain) || (section === "math" ? "SAT Math" : "Information and Ideas"),
      difficulty: asString(row.difficulty) || "medium",
      questionType: asString(row.questionType) || asString(row.question_type) || (choices.length ? "mcq" : "spr"),
      estimatedSeconds: defaultEstimatedSeconds({
        section,
        questionType: asString(row.questionType) || asString(row.question_type),
        estimatedSeconds: asNumber(row.estimatedSeconds) ?? asNumber(row.estimated_seconds),
      }),
      sourceKind,
      sourceFiles: asObject(row.sourceFiles) ?? asObject(row.bundles) ?? {},
      assets: parseAssets(row),
    },
  };
}

export function parseCollegeBoardPayload(text: string, source = "payload"): ImportParseResult {
  const trimmed = text.trim();
  const records: ParsedBankRecord[] = [];
  const skipped: Array<{ reason: string; source?: string }> = [];
  const seen = new Set<string>();
  const duplicatesInFile: string[] = [];

  const consume = (value: unknown, label: string) => {
    const parsed = parseCollegeBoardRecord(value, label);
    if (parsed.skip) {
      skipped.push({ reason: parsed.skip, source: label });
      return;
    }
    const record = parsed.record!;
    if (seen.has(record.sourceKey)) {
      duplicatesInFile.push(record.sourceKey);
      return;
    }
    seen.add(record.sourceKey);
    records.push(record);
  };

  if (!trimmed) {
    return { records, skipped, duplicatesInFile };
  }

  if (trimmed.startsWith("[")) {
    try {
      const rows = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(rows)) {
        skipped.push({ reason: `${source}: JSON array expected`, source });
        return { records, skipped, duplicatesInFile };
      }
      rows.forEach((row, index) => consume(row, `${source}[${index}]`));
      return { records, skipped, duplicatesInFile };
    } catch {
      skipped.push({ reason: `${source}: invalid JSON array`, source });
      return { records, skipped, duplicatesInFile };
    }
  }

  if (trimmed.startsWith("{")) {
    const maybeSingle = (() => {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return null;
      }
    })();
    const obj = maybeSingle && typeof maybeSingle === "object" ? (maybeSingle as Record<string, unknown>) : null;
    if (obj && (Array.isArray(obj.questions) || Array.isArray(obj.records) || Array.isArray(obj.items))) {
      const rows = (obj.questions ?? obj.records ?? obj.items) as unknown[];
      rows.forEach((row, index) => consume(row, `${source}.questions[${index}]`));
      return { records, skipped, duplicatesInFile };
    }
    if (obj && (obj.prompt || obj.questionNumber || obj.q)) {
      consume(obj, source);
      return { records, skipped, duplicatesInFile };
    }
  }

  const lines = trimmed.split(/\r?\n/);
  lines.forEach((line, index) => {
    const content = line.trim();
    if (!content) return;
    try {
      consume(JSON.parse(content), `${source}:${index + 1}`);
    } catch {
      skipped.push({ reason: `${source}:${index + 1}: invalid JSONL line`, source });
    }
  });
  return { records, skipped, duplicatesInFile };
}

export const DEFAULT_COLLEGE_BOARD_ROOT = "content/college-board";

export const STAGED_COLLECTION_STUBS: Array<{
  examFamily: ExamFamily;
  practiceTestNumber: number | null;
  formCode: string | null;
  title: string;
  slug: string;
  assets: Array<{ kind: string; title: string; resourceUrl: string }>;
}> = [
  ...[4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({
    examFamily: "sat" as const,
    practiceTestNumber: n,
    formCode: null,
    title: `SAT Practice Test ${n}`,
    slug: `sat-practice-test-${n}`,
    assets: [
      {
        kind: "test_pdf",
        title: `SAT Practice Test ${n} PDF`,
        resourceUrl: `content/college-board/sat/practice-test-${n}/test.pdf`,
      },
      {
        kind: "answers_explanations",
        title: `SAT Practice Test ${n} answers`,
        resourceUrl: `content/college-board/sat/practice-test-${n}/answers.pdf`,
      },
      {
        kind: "scoring_guide",
        title: `SAT Practice Test ${n} scoring`,
        resourceUrl: `content/college-board/sat/practice-test-${n}/scoring.pdf`,
      },
    ],
  })),
  {
    examFamily: "psat",
    practiceTestNumber: null,
    formCode: "8-9",
    title: "PSAT 8/9",
    slug: "psat-8-9",
    assets: [
      {
        kind: "test_pdf",
        title: "PSAT 8/9 test PDF",
        resourceUrl: "content/college-board/psat/8-9/test.pdf",
      },
      {
        kind: "answers_explanations",
        title: "PSAT 8/9 answers",
        resourceUrl: "content/college-board/psat/8-9/answers.pdf",
      },
    ],
  },
  {
    examFamily: "psat",
    practiceTestNumber: null,
    formCode: "10",
    title: "PSAT 10",
    slug: "psat-10",
    assets: [
      {
        kind: "test_pdf",
        title: "PSAT 10 test PDF",
        resourceUrl: "content/college-board/psat/10/test.pdf",
      },
      {
        kind: "answers_explanations",
        title: "PSAT 10 answers",
        resourceUrl: "content/college-board/psat/10/answers.pdf",
      },
    ],
  },
  {
    examFamily: "psat",
    practiceTestNumber: null,
    formCode: "nmsqt",
    title: "PSAT/NMSQT",
    slug: "psat-nmsqt",
    assets: [
      {
        kind: "test_pdf",
        title: "PSAT/NMSQT test PDF",
        resourceUrl: "content/college-board/psat/nmsqt/test.pdf",
      },
      {
        kind: "answers_explanations",
        title: "PSAT/NMSQT answers",
        resourceUrl: "content/college-board/psat/nmsqt/answers.pdf",
      },
    ],
  },
];
