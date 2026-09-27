import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isOfficialExtractFile,
  listOfficialExtractFiles,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
  type ParsedBankRecord,
} from "./sat-bank-import.ts";
import {
  auditStudentQuizItem,
  isOfficialSatExtract,
  type DiagnosticQualityInput,
} from "./sat-bank-diagnostic-quality.ts";

export const GEOMETRY_AREA_VOLUME_FOLLOW_UP_TAG =
  "michelle-geometry-area-volume-follow-up";

export const GEOMETRY_AREA_VOLUME_MAX_ITEMS = 12;

export const GEOMETRY_AREA_VOLUME_INSTRUCTIONS =
  "Geometry area and volume practice assigned after your session. Choose one answer for each question. Your score is the percent correct.";

export type GeometryAreaVolumeDraft = {
  sourceKey: string;
  module: number;
  questionNumber: number;
  prompt: string;
  stimulus: string | null;
  choices: Array<{ id: string; label: string; text: string }>;
  correctAnswer: string;
};

const AREA_VOLUME_TOPIC =
  /\b(area|volume|surface area)\b/i;

const GEOMETRY_SOLID_OR_REGION =
  /\b(rectangle|rectangular|square|circle|triangle|cylinder|cone|sphere|prism|pyramid|polygon|cube|similar|semicircle|cubic)\b/i;

/**
 * One-step arithmetic and rate word problems that mention "area" or "volume"
 * without a geometry skill. Module 2 still contains these early items.
 */
function isEasyAreaOrRateFiller(prompt: string): boolean {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (
    /\b(density|population|people per square|grams per cubic|per square mile|raccoons)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\bremoved from\b/i.test(text) && /\barea\b/i.test(text)) return true;
  if (
    /\brectangle\b/i.test(text) &&
    /\blength of \d+/i.test(text) &&
    /\bwidth of \d+/i.test(text) &&
    /\bwhat is the area\b/i.test(text) &&
    !/\b(similar|scale|function|expression|times the length)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

/** OCR that passed a loose letter check but is not solvable as printed. */
function isUnreadableAreaVolumeExtract(record: ParsedBankRecord): boolean {
  const prompt = record.prompt.replace(/\s+/g, " ");
  if (/\b(shown|the figure|in the figure|the graph)\b/i.test(prompt) && record.figures.length === 0) {
    return true;
  }
  if (/\b\d+\s+\d+\s+(feet|inches|centimeters|cm|meters)\b/i.test(prompt)) return true;
  const choiceText = record.choices.map((choice) => choice.text);
  const explanationHasPi = /π|\\pi|\bpi\b/i.test(record.officialExplanation);
  const choicesHavePi = choiceText.some((text) => /π/.test(text));
  if (
    (explanationHasPi || /\b(cylinder|circle|sphere|cone)\b/i.test(prompt)) &&
    !choicesHavePi &&
    choiceText.some((text) => /\d[\d,]*\s*r\b/i.test(text))
  ) {
    return true;
  }
  return false;
}

export function isHardGeometryAreaVolumeItem(record: ParsedBankRecord): boolean {
  if (!isOfficialSatExtract(record)) return false;
  if (record.section !== "math") return false;
  if (record.questionType === "spr") return false;
  const prompt = record.prompt.replace(/\s+/g, " ").trim();
  if (!AREA_VOLUME_TOPIC.test(prompt) || !GEOMETRY_SOLID_OR_REGION.test(prompt)) return false;
  if (isEasyAreaOrRateFiller(prompt)) return false;
  if (isUnreadableAreaVolumeExtract(record)) return false;
  const auditInput: DiagnosticQualityInput = {
    id: record.sourceKey,
    sourceKey: record.sourceKey,
    examFamily: record.examFamily,
    section: record.section,
    module: record.module,
    questionNumber: record.questionNumber,
    prompt: record.prompt,
    stimulus: record.stimulus,
    choices: record.choices,
    figures: record.figures,
    questionType: record.questionType,
    correctAnswer: record.correctAnswer,
    extractGaps: record.extractGaps,
    subject: "SAT Math",
    domain: "Geometry and Trigonometry",
  };
  return auditStudentQuizItem(auditInput).ok;
}

/**
 * Hard official SAT area and volume items a student can answer from the
 * in-repo extracts. Figure-smashed and one-step fillers stay out. The pool
 * is shorter than 12 when the bank has no further clean items.
 */
export function selectHardGeometryAreaVolumeItems(
  records: readonly ParsedBankRecord[],
): GeometryAreaVolumeDraft[] {
  const selected = records.filter(isHardGeometryAreaVolumeItem);
  selected.sort(
    (left, right) =>
      right.module - left.module ||
      left.questionNumber - right.questionNumber ||
      left.sourceKey.localeCompare(right.sourceKey),
  );
  return selected.slice(0, GEOMETRY_AREA_VOLUME_MAX_ITEMS).map((record) => ({
    sourceKey: record.sourceKey,
    module: record.module,
    questionNumber: record.questionNumber,
    prompt: record.prompt,
    stimulus: record.stimulus,
    choices: record.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      text: choice.text,
    })),
    correctAnswer: record.correctAnswer,
  }));
}

export async function loadHardGeometryAreaVolumeQuestions(
  root = resolveCollegeBoardRoot(),
): Promise<GeometryAreaVolumeDraft[]> {
  const files = (await listOfficialExtractFiles(root)).filter((file) => {
    const base = path.basename(file);
    return isOfficialExtractFile(file) && base.startsWith("sat-practice-test-");
  });
  const records: ParsedBankRecord[] = [];
  for (const file of files) {
    const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), path.basename(file));
    records.push(...parsed.records);
  }
  return selectHardGeometryAreaVolumeItems(records);
}
