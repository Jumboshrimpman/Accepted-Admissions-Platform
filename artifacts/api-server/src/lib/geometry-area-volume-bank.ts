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

/** This quiz only. Other SAT assignments keep their own limits. */
export const GEOMETRY_AREA_VOLUME_TIME_LIMIT_MINUTES = 60;

export const GEOMETRY_AREA_VOLUME_INSTRUCTIONS =
  "Geometry area and volume practice. Choose one answer for each question. Your score is the percent correct. Your tutor receives the result when you submit.";

/**
 * Easy to hard. The in-repo official SAT bank has no harder multiple-choice
 * area, surface area, volume, similar-figure, or area-conversion item than
 * the cube-and-sphere problem. The two easier official items stay in the set
 * and move to the front: function interpretation, then the cutting-board factor.
 */
export const GEOMETRY_AREA_VOLUME_DIFFICULTY_ORDER = [
  "sat-pt10-math-m1-q15",
  "sat-pt8-math-m1-q16",
  "sat-pt6-math-m2-q16",
  "sat-pt5-math-m1-q23",
  "sat-pt10-math-m1-q22",
  "sat-pt5-math-m2-q22",
  "sat-pt9-math-m2-q23",
  "sat-pt8-math-m1-q18",
  "sat-pt4-math-m1-q18",
  "sat-pt11-math-m1-q26",
  "sat-pt4-math-m2-q26",
  "sat-pt8-math-m2-q22",
] as const;

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
  if (/\b(gallon of stain|will cover \d+|draining from)\b/i.test(text)) return true;
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

type ChoiceText = readonly [string, string, string, string];

/**
 * Session-local repairs only. Each stem is rebuilt from numbers and relations
 * already stated in that item's in-repo prompt or official explanation.
 * Bank rows are not rewritten.
 */
const SESSION_LOCAL_REPAIRS: Record<string, { prompt: string; choices: ChoiceText }> = {
  "sat-pt4-math-m1-q18": {
    prompt:
      "Square P has a side length of x inches. Square Q has a perimeter that is 176 inches greater than the perimeter of square P. The function f gives the area of square Q, in square inches. Which of the following defines f?",
    choices: [
      "f(x) = (x + 44)^2",
      "f(x) = (x + 176)^2",
      "f(x) = (176x + 44)^2",
      "f(x) = (176x + 176)^2",
    ],
  },
  "sat-pt4-math-m2-q26": {
    prompt:
      "Two identical rectangular prisms each have a height of 90 centimeters (cm). The base of each prism is a square, and the surface area of each prism is K cm^2. If the prisms are glued together along a square base, the resulting prism has a surface area of (92/47)K cm^2. What is the side length, in cm, of each square base?",
    choices: ["4", "8", "9", "16"],
  },
  "sat-pt8-math-m1-q16": {
    prompt:
      "The area A, in square centimeters, of a rectangular cutting board can be represented by the expression w(w + 9), where w is the width, in centimeters, of the cutting board. Which expression represents the length, in centimeters, of the cutting board?",
    choices: ["w(w + 9)", "w", "9", "w + 9"],
  },
  "sat-pt8-math-m1-q18": {
    prompt:
      "Circle A has a radius of 3/n and circle B has a radius of 129/n, where n is a positive constant. The area of circle B is how many times the area of circle A?",
    choices: ["43", "86", "129", "1,849"],
  },
  "sat-pt8-math-m2-q22": {
    prompt:
      "A cube has an edge length of 68 inches. A solid sphere with a radius of 34 inches is inside the cube, such that the sphere touches the center of each face of the cube. To the nearest cubic inch, what is the volume of the space in the cube not taken up by the sphere?",
    choices: ["149,796", "164,500", "190,955", "310,800"],
  },
  "sat-pt10-math-m1-q15": {
    prompt:
      "The function f(w) = 6w^2 gives the area of a rectangle, in square feet, if its width is w feet and its length is 6 times its width. Which of the following is the best interpretation of f(14) = 1,176?",
    choices: [
      "If the width of the rectangle is 14 ft, then the area of the rectangle is 1,176 ft^2.",
      "If the width of the rectangle is 14 ft, then the length of the rectangle is 1,176 ft.",
      "If the width of the rectangle is 1,176 ft, then the length of the rectangle is 14 ft.",
      "If the width of the rectangle is 1,176 ft, then the area of the rectangle is 14 ft^2.",
    ],
  },
  "sat-pt10-math-m1-q22": {
    prompt:
      "The floor of a ballroom has an area of 600 square meters. An architect creates a scale model of the floor of the ballroom, where the length of each side of the model is 1/10 times the length of the corresponding side of the actual floor of the ballroom. What is the area, in square meters, of the scale model?",
    choices: ["6", "10", "60", "150"],
  },
  "sat-pt11-math-m1-q26": {
    prompt:
      "A right rectangular prism has a base area of 24t square centimeters. The length of the base is 8/3 cm, and the height of the rectangular prism is 15 cm. Which expression represents the surface area, in cm^2, of the right rectangular prism?",
    choices: ["48t + 160", "318t + 80", "1,968t + 80", "360t"],
  },
};

function letterChoices(texts: ChoiceText): GeometryAreaVolumeDraft["choices"] {
  return texts.map((text, index) => ({
    id: "abcd"[index]!,
    label: "ABCD"[index]!,
    text,
  }));
}

function servedItem(record: ParsedBankRecord): {
  prompt: string;
  stimulus: string | null;
  choices: GeometryAreaVolumeDraft["choices"];
} {
  const repair = SESSION_LOCAL_REPAIRS[record.sourceKey];
  if (!repair) {
    return {
      prompt: record.prompt,
      stimulus: record.stimulus,
      choices: record.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        text: choice.text,
      })),
    };
  }
  return {
    prompt: repair.prompt,
    stimulus: null,
    choices: letterChoices(repair.choices),
  };
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

export function toHardGeometryAreaVolumeDraft(
  record: ParsedBankRecord,
): GeometryAreaVolumeDraft | null {
  if (!isOfficialSatExtract(record)) return null;
  if (record.section !== "math") return null;
  if (record.questionType === "spr") return null;
  const served = servedItem(record);
  const prompt = served.prompt.replace(/\s+/g, " ").trim();
  if (!AREA_VOLUME_TOPIC.test(prompt) || !GEOMETRY_SOLID_OR_REGION.test(prompt)) return null;
  if (isEasyAreaOrRateFiller(prompt)) return null;
  if (
    isUnreadableAreaVolumeExtract({
      ...record,
      prompt: served.prompt,
      stimulus: served.stimulus,
      choices: served.choices,
      figures: SESSION_LOCAL_REPAIRS[record.sourceKey] ? [] : record.figures,
    })
  ) {
    return null;
  }
  const auditInput: DiagnosticQualityInput = {
    id: record.sourceKey,
    sourceKey: record.sourceKey,
    examFamily: record.examFamily,
    section: record.section,
    module: record.module,
    questionNumber: record.questionNumber,
    prompt: served.prompt,
    stimulus: served.stimulus,
    choices: served.choices,
    figures: SESSION_LOCAL_REPAIRS[record.sourceKey] ? [] : record.figures,
    questionType: record.questionType,
    correctAnswer: record.correctAnswer,
    extractGaps: record.extractGaps,
    subject: "SAT Math",
    domain: "Geometry and Trigonometry",
  };
  if (!auditStudentQuizItem(auditInput).ok) return null;
  return {
    sourceKey: record.sourceKey,
    module: record.module,
    questionNumber: record.questionNumber,
    prompt: served.prompt,
    stimulus: served.stimulus,
    choices: served.choices,
    correctAnswer: record.correctAnswer,
  };
}

export function isHardGeometryAreaVolumeItem(record: ParsedBankRecord): boolean {
  return toHardGeometryAreaVolumeDraft(record) !== null;
}

/**
 * Official SAT area and volume items a student can answer. Stacked fractions,
 * dropped exponents, and extraction-marker bleed are repaired on the
 * session-local copy. Student-produced responses, missing choice sets, and
 * figures that were never extracted stay out.
 */
export function selectHardGeometryAreaVolumeItems(
  records: readonly ParsedBankRecord[],
): GeometryAreaVolumeDraft[] {
  const selected = records.flatMap((record) => {
    const draft = toHardGeometryAreaVolumeDraft(record);
    return draft ? [draft] : [];
  });
  selected.sort(
    (left, right) =>
      geometryAreaVolumeDifficultyScore(right) - geometryAreaVolumeDifficultyScore(left) ||
      left.sourceKey.localeCompare(right.sourceKey),
  );
  return selected.slice(0, GEOMETRY_AREA_VOLUME_MAX_ITEMS).reverse();
}

function geometryAreaVolumeDifficultyScore(item: GeometryAreaVolumeDraft): number {
  const listed = GEOMETRY_AREA_VOLUME_DIFFICULTY_ORDER.indexOf(
    item.sourceKey as (typeof GEOMETRY_AREA_VOLUME_DIFFICULTY_ORDER)[number],
  );
  if (listed >= 0) return listed;
  return 1_000 + item.module * 100 + item.questionNumber;
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
