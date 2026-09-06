import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bankDedupKey,
  bankSourceKey,
  collectionSlug,
  collectionTitle,
  defaultEstimatedSeconds,
  extractStableId,
  normalizeExamFamily,
  normalizeExamSection,
  normalizeExamVariant,
  type ExamFamily,
  type ExamSection,
} from "./sat-bank-source-key.ts";

export type BankChoice = { id: string; label: string; text: string };

export type ExtractGaps = {
  skillDifficultyAbsent: boolean;
  missingPrompt: boolean;
  missingChoices: boolean;
  figuresIncomplete: boolean;
  spr: boolean;
  notes: string[];
};

export type ParsedBankRecord = {
  sourceKey: string;
  dedupKey: string;
  examFamily: ExamFamily;
  examVariant: string;
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
  skill: string | null;
  domain: string | null;
  difficulty: string | null;
  questionType: string;
  estimatedSeconds: number;
  sourceKind: "official_extract" | "seed";
  sourceFiles: Record<string, unknown>;
  assets: Array<{ kind: string; title: string; resourceUrl: string }>;
  extractGaps: ExtractGaps;
  assignable: boolean;
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

function parseChoices(raw: unknown): BankChoice[] | null {
  if (raw == null) return null;
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
      const label = asString(row.label) || asString(row.id).toUpperCase();
      const id =
        asString(row.id).toLowerCase() ||
        label.toLowerCase() ||
        CHOICE_IDS[index] ||
        String.fromCharCode(97 + index);
      return { id, label: label || id.toUpperCase(), text };
    })
    .filter((choice): choice is BankChoice => Boolean(choice));
}

function normalizeExtractText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pdfPath(filename: string): string {
  const name = filename.trim();
  if (!name) return "";
  if (name.startsWith("content/") || name.startsWith("http://") || name.startsWith("https://")) {
    return name;
  }
  return `content/college-board/pdfs/${name}`;
}

export function isAssignableBankItem(input: {
  prompt: string;
  questionType: string;
  choices: BankChoice[];
  correctAnswer: string;
  extractGaps?: ExtractGaps;
}): boolean {
  if (!input.correctAnswer.trim()) return false;
  if (!input.prompt.trim() || input.extractGaps?.missingPrompt) return false;
  if (input.questionType === "spr") return true;
  return input.choices.length >= 2 && !input.extractGaps?.missingChoices;
}

function parseAssets(record: Record<string, unknown>): Array<{
  kind: string;
  title: string;
  resourceUrl: string;
}> {
  const files = asObject(record.sourceFiles) ?? asObject(record.bundles) ?? asObject(record.source) ?? {};
  const assets: Array<{ kind: string; title: string; resourceUrl: string }> = [];
  const mapping: Array<[string, string, string]> = [
    ["testPdf", "test_pdf", "Test PDF"],
    ["test_pdf", "test_pdf", "Test PDF"],
    ["answersPdf", "answers_explanations", "Answers and explanations"],
    ["answers_explanations", "answers_explanations", "Answers and explanations"],
    ["scoringGuide", "scoring_guide", "Scoring guide"],
    ["scoring_guide", "scoring_guide", "Scoring guide"],
    ["scoringPdf", "scoring_guide", "Scoring guide"],
    ["test", "test_pdf", "Test PDF"],
    ["answers", "answers_explanations", "Answers and explanations"],
    ["scoring", "scoring_guide", "Scoring guide"],
  ];
  for (const [key, kind, title] of mapping) {
    const url = pdfPath(asString(files[key] ?? record[key]));
    if (url) assets.push({ kind, title, resourceUrl: url });
  }
  const extra = Array.isArray(record.assets) ? record.assets : [];
  for (const item of extra) {
    const row = asObject(item);
    if (!row) continue;
    const resourceUrl = pdfPath(asString(row.resourceUrl) || asString(row.url) || asString(row.path));
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
  const promptRaw = asString(row.prompt) || asString(row.stem) || asString(row.question);
  const prompt = normalizeExtractText(promptRaw);
  if (!examFamily) return { skip: `${source}: missing examFamily` };
  if (!section) return { skip: `${source}: missing section` };
  if (module == null || module < 1) return { skip: `${source}: missing module` };
  if (questionNumber == null || questionNumber < 1) return { skip: `${source}: missing questionNumber` };

  const practiceTestNumber =
    asNumber(row.practiceTestNumber) ?? asNumber(row.practice_test_number) ?? asNumber(row.testNumber);
  const sourceObj = asObject(row.source);
  const examVariant =
    normalizeExamVariant(
      asString(row.examVariant) || asString(row.exam_variant) || asString(sourceObj?.examVariant),
      examFamily,
    ) ?? examFamily;
  const packId =
    asString(row.packId) ||
    asString(sourceObj?.packId) ||
    asString(row.collectionSlug) ||
    null;
  const formCode = asString(row.formCode) || asString(row.form_code) || asString(row.pack) || null;
  const parsedChoices = parseChoices(row.choices);
  const questionTypeRaw = asString(row.questionType) || asString(row.question_type);
  const questionType =
    questionTypeRaw ||
    (parsedChoices === null ? "spr" : parsedChoices.length ? "mcq" : "spr");
  const choices = parsedChoices ?? [];
  const correctAnswerRaw =
    asString(row.correctAnswer) || asString(row.correct_answer) || asString(row.answer);
  if (!correctAnswerRaw) return { skip: `${source}: missing correctAnswer` };
  const officialExplanation = normalizeExtractText(
    asString(row.officialExplanation) ||
      asString(row.official_explanation) ||
      asString(row.explanation),
  );
  const skill = asString(row.skill) || null;
  const topic = asString(row.topic) || asString(row.domain) || null;
  const difficulty = asString(row.difficulty) || null;
  const notes = Array.isArray(row.extractionNotes)
    ? row.extractionNotes.filter((item): item is string => typeof item === "string")
    : [];
  const missingPrompt = prompt.length < 4;
  const missingChoices = questionType !== "spr" && (parsedChoices === null || choices.length < 2);
  const spr = questionType === "spr" || parsedChoices === null;
  const extractGaps: ExtractGaps = {
    skillDifficultyAbsent: !skill && !difficulty,
    missingPrompt,
    missingChoices,
    figuresIncomplete: missingPrompt || missingChoices || notes.some((note) => /figure/i.test(note)),
    spr,
    notes,
  };
  const identity = {
    examFamily,
    examVariant,
    practiceTestNumber,
    formCode,
    section,
    module,
    questionNumber,
  };
  const providedId = asString(row.id) || asString(row.sourceKey);
  const sourceKey =
    providedId ||
    (practiceTestNumber != null
      ? extractStableId({
          examVariant,
          practiceTestNumber,
          section,
          module,
          questionNumber,
        })
      : bankSourceKey(identity));
  const sourceKind = asString(row.sourceKind) === "seed" ? "seed" : "official_extract";
  const acceptedForms = correctAnswerRaw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedCorrect = correctAnswerRaw.toLowerCase();
  const choiceMatch = choices.find(
    (choice) => choice.id === normalizedCorrect || choice.label.toLowerCase() === normalizedCorrect,
  );
  const record: ParsedBankRecord = {
    sourceKey,
    dedupKey: bankDedupKey(identity),
    examFamily,
    examVariant,
    practiceTestNumber,
    formCode,
    section,
    module,
    questionNumber,
    position: asNumber(row.position) ?? module * 100 + questionNumber,
    collectionSlug: collectionSlug({
      examFamily,
      examVariant,
      practiceTestNumber,
      formCode,
      packId,
    }),
    collectionTitle: collectionTitle({
      examFamily,
      examVariant,
      practiceTestNumber,
      formCode,
      title: asString(row.collectionTitle) || asString(row.collection),
    }),
    prompt,
    stimulus: normalizeExtractText(asString(row.stimulus) || asString(row.passage)) || null,
    choices,
    correctAnswer: choiceMatch?.id ?? correctAnswerRaw,
    officialExplanation,
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
    scoring: {
      ...(asObject(row.scoring) ?? {}),
      acceptedForms,
      layout: "linear_120",
    },
    skill,
    domain: topic,
    difficulty,
    questionType,
    estimatedSeconds: defaultEstimatedSeconds({
      section,
      questionType,
      estimatedSeconds: asNumber(row.estimatedSeconds) ?? asNumber(row.estimated_seconds),
    }),
    sourceKind,
    sourceFiles: asObject(row.sourceFiles) ?? asObject(row.bundles) ?? sourceObj ?? {},
    assets: parseAssets(row),
    extractGaps,
    assignable: isAssignableBankItem({
      prompt,
      questionType,
      choices,
      correctAnswer: correctAnswerRaw,
      extractGaps,
    }),
  };
  return { record };
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
    if (seen.has(record.sourceKey) || seen.has(record.dedupKey)) {
      duplicatesInFile.push(record.sourceKey);
      return;
    }
    seen.add(record.sourceKey);
    seen.add(record.dedupKey);
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

const SKIP_EXTRACT_NAMES = /^(manifest|extraction-report|schema)\.json$/i;
const SKIP_EXTRACT_DIRS = /(^|\/)fixtures(\/|$)/i;
const SKIP_EXTRACT_FILES = /sample-extract\.jsonl$/i;

export function isOfficialExtractFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const base = normalized.split("/").pop() ?? "";
  if (SKIP_EXTRACT_DIRS.test(normalized)) return false;
  if (SKIP_EXTRACT_FILES.test(base)) return false;
  if (SKIP_EXTRACT_NAMES.test(base)) return false;
  return /\.(json|jsonl)$/i.test(base);
}

export async function listOfficialExtractFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(dir: string) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        await visit(full);
        continue;
      }
      if (isOfficialExtractFile(full)) files.push(full);
    }
  }
  await visit(root);
  return files.sort();
}

function moduleRelativeCollegeBoardRoots(): string[] {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return [
      path.resolve(here, "../../../content/college-board"),
      path.resolve(here, "../../../../content/college-board"),
    ];
  } catch {
    return [];
  }
}

export function resolveCollegeBoardRoot(preferred?: string): string {
  const candidates = [
    preferred,
    process.env.SAT_BANK_ROOT,
    process.env.SAT_BANK_IMPORT_ROOT,
    DEFAULT_COLLEGE_BOARD_ROOT,
    path.resolve(process.cwd(), DEFAULT_COLLEGE_BOARD_ROOT),
    path.resolve(process.cwd(), "../../content/college-board"),
    ...moduleRelativeCollegeBoardRoots(),
  ].filter((item): item is string => Boolean(item));
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "manifest.json"))) return dir;
  }
  return preferred || DEFAULT_COLLEGE_BOARD_ROOT;
}

export type ManifestPack = {
  packId: string;
  examFamily: ExamFamily;
  examVariant: string;
  practiceTestNumber: number;
  pdfs: { test?: string; answers?: string; scoring?: string };
  outputFile: string;
  questionCount: number;
};

export type CollectionStub = {
  examFamily: ExamFamily;
  examVariant: string;
  practiceTestNumber: number | null;
  formCode: string | null;
  title: string;
  slug: string;
  assets: Array<{ kind: string; title: string; resourceUrl: string }>;
};

export function parseCollegeBoardManifest(text: string): ManifestPack[] {
  const obj = asObject(JSON.parse(text) as unknown);
  const packs = Array.isArray(obj?.packs) ? obj.packs : [];
  return packs.flatMap((item) => {
    const row = asObject(item);
    if (!row) return [];
    const examFamily = normalizeExamFamily(asString(row.examFamily));
    const practiceTestNumber = asNumber(row.practiceTestNumber);
    const packId = asString(row.packId);
    if (!examFamily || practiceTestNumber == null || !packId) return [];
    const pdfs = asObject(row.pdfs) ?? {};
    return [
      {
        packId,
        examFamily,
        examVariant: normalizeExamVariant(asString(row.examVariant), examFamily) ?? examFamily,
        practiceTestNumber,
        pdfs: {
          test: asString(pdfs.test) || undefined,
          answers: asString(pdfs.answers) || undefined,
          scoring: asString(pdfs.scoring) || undefined,
        },
        outputFile: asString(row.outputFile) || `${packId}.jsonl`,
        questionCount: asNumber(row.questionCount) ?? 0,
      },
    ];
  });
}

export function collectionStubsFromManifest(packs: ManifestPack[]): CollectionStub[] {
  return packs.map((pack) => ({
    examFamily: pack.examFamily,
    examVariant: pack.examVariant,
    practiceTestNumber: pack.practiceTestNumber,
    formCode: pack.examVariant === "sat" ? null : pack.examVariant,
    title: collectionTitle({
      examFamily: pack.examFamily,
      examVariant: pack.examVariant,
      practiceTestNumber: pack.practiceTestNumber,
    }),
    slug: pack.packId,
    assets: [
      pack.pdfs.test
        ? { kind: "test_pdf", title: "Test PDF", resourceUrl: pdfPath(pack.pdfs.test) }
        : null,
      pack.pdfs.answers
        ? {
            kind: "answers_explanations",
            title: "Answers and explanations",
            resourceUrl: pdfPath(pack.pdfs.answers),
          }
        : null,
      pack.pdfs.scoring
        ? { kind: "scoring_guide", title: "Scoring guide", resourceUrl: pdfPath(pack.pdfs.scoring) }
        : null,
    ].filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
  }));
}

export const STAGED_COLLECTION_STUBS: CollectionStub[] = collectionStubsFromManifest([
  ...[4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({
    packId: `sat-practice-test-${n}-digital`,
    examFamily: "sat" as const,
    examVariant: "sat",
    practiceTestNumber: n,
    pdfs: {
      test: `sat-practice-test-${n}-digital.pdf`,
      answers: `sat-practice-test-${n}-answers-digital.pdf`,
      scoring: `scoring-sat-practice-test-${n}-digital.pdf`,
    },
    outputFile: `sat-practice-test-${n}-digital.jsonl`,
    questionCount: 120,
  })),
  {
    packId: "psat-10-practice-test-1",
    examFamily: "psat",
    examVariant: "psat10",
    practiceTestNumber: 1,
    pdfs: {
      test: "psat-10-practice-test-1.pdf",
      answers: "psat-10-practice-test-1-answer-explanations.pdf",
      scoring: "psat-10-practice-test-1-scoring-guide.pdf",
    },
    outputFile: "psat-10-practice-test-1.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-10-practice-test-2",
    examFamily: "psat",
    examVariant: "psat10",
    practiceTestNumber: 2,
    pdfs: {
      test: "psat-10-practice-test-2.pdf",
      answers: "psat-10-practice-test-2-answer-explanations.pdf",
      scoring: "psat-10-practice-test-2-scoring-guide.pdf",
    },
    outputFile: "psat-10-practice-test-2.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-8-9-practice-test-1",
    examFamily: "psat",
    examVariant: "psat8_9",
    practiceTestNumber: 1,
    pdfs: {
      test: "psat-8-9-practice-test-1.pdf",
      answers: "psat-8-9-practice-test-1-answers.pdf",
      scoring: "psat-8-9-practice-test-1-scoring-guide.pdf",
    },
    outputFile: "psat-8-9-practice-test-1.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-8-9-practice-test-2",
    examFamily: "psat",
    examVariant: "psat8_9",
    practiceTestNumber: 2,
    pdfs: {
      test: "psat-8-9-practice-test-2.pdf",
      answers: "psat-8-9-practice-test-2-answers.pdf",
      scoring: "psat-8-9-practice-test-2-scoring-guide.pdf",
    },
    outputFile: "psat-8-9-practice-test-2.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-8-9-practice-test-3",
    examFamily: "psat",
    examVariant: "psat8_9",
    practiceTestNumber: 3,
    pdfs: {
      test: "psat-8-9-practice-test-3.pdf",
      answers: "psat-8-9-practice-test-3-answers.pdf",
      scoring: "psat-8-9-practice-test-3-scoring-guide.pdf",
    },
    outputFile: "psat-8-9-practice-test-3.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-nmsqt-practice-test-1",
    examFamily: "psat",
    examVariant: "psat_nmsqt",
    practiceTestNumber: 1,
    pdfs: {
      test: "psat-nmsqt-practice-test-1.pdf",
      answers: "psat-nmsqt-practice-test-1-answers.pdf",
      scoring: "scoring-psat-nmsqt-practice-test-1.pdf",
    },
    outputFile: "psat-nmsqt-practice-test-1.jsonl",
    questionCount: 120,
  },
  {
    packId: "psat-nmsqt-10-practice-test-3",
    examFamily: "psat",
    examVariant: "psat_nmsqt_10",
    practiceTestNumber: 3,
    pdfs: {
      test: "psat-nmsqt-psat-10-practice-test-3.pdf",
      answers: "psat-nmsqt-psat-10-practice-test-3-answers.pdf",
      scoring: "psat-nmsqt-psat-10-practice-test-3-scoring-guide.pdf",
    },
    outputFile: "psat-nmsqt-10-practice-test-3.jsonl",
    questionCount: 120,
  },
]);
