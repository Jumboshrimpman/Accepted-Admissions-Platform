import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import { CANONICAL_APP_ORIGIN, resolveConfiguredAppOrigin } from "./public-origin.ts";
import { selectStatusHomework, type StatusHomeworkCandidate } from "./session-homework.ts";
import { sessionPreworkDedupeSlot } from "./session-prework-dedupe.ts";

export type SessionQuestionPdfPhase = "before_session" | "during_session";

export type SessionQuestionPdfFigure = {
  alt: string;
  bytes: Uint8Array | null;
};

export type SessionQuestionPdfQuestion = {
  prompt: string;
  stimulus?: string | null;
  choices?: Array<{ label: string; text: string }>;
  figures?: SessionQuestionPdfFigure[];
  correctAnswer?: string | null;
  explanation?: string | null;
};

export type SessionQuestionPdfSection = {
  title: string;
  questions: SessionQuestionPdfQuestion[];
};

export type SessionQuestionPdfInput = {
  phase: SessionQuestionPdfPhase;
  includeAnswerKey: boolean;
  sessionTitle: string;
  sessionDateLabel: string;
  studentName: string;
  /** One untitled block. Prefer `sections` when the session has more than one assignment. */
  questions?: SessionQuestionPdfQuestion[];
  sections?: SessionQuestionPdfSection[];
};

export type SessionPdfAssignmentQuestion = {
  id: string;
  position: number;
};

export type SessionPdfAssignment = {
  id: string;
  title: string;
  deliveryPhase: string;
  status: string;
  subject?: string | null;
  homeworkKind?: string | null;
  /** Override when the attached question list is not the count students see. */
  questionCount?: number | null;
  /** Attempts by the session's client, the same count selectStatusHomework uses. */
  attemptCount?: number | null;
  /** session_prework_plans.assignment_id for this session. */
  planAssignmentId?: string | null;
  createdAt?: Date | string | number | null;
  questions: readonly SessionPdfAssignmentQuestion[];
};

export type SessionPdfSectionPlan = {
  assignmentId: string;
  title: string;
  questionIds: string[];
};

/** Assigned tutor and administrators only. Students never receive question or answer-key PDFs. */
export function decideSessionQuestionPdfAccess(input: {
  role: string;
  requesterUserId: string;
  sessionTutorUserId: string | null;
}): { ok: true; status: 200 } | { ok: false; status: 403; error: string } {
  if (input.role === "administrator") return { ok: true, status: 200 };
  if (
    input.role === "tutor" &&
    input.sessionTutorUserId != null &&
    input.requesterUserId === input.sessionTutorUserId
  ) {
    return { ok: true, status: 200 };
  }
  return {
    ok: false,
    status: 403,
    error: "Only the assigned tutor or an administrator can download session question PDFs.",
  };
}

const TEMP_VIEW_DISABLED = new Set(["", "off", "disabled", "none", "false"]);

/**
 * The xsfam6 alias may open the tutor portal while TEMP_NIKA_VIEW_EMAIL is unset.
 * Answer-key PDFs stay off unless that variable is explicitly set to a live address.
 */
export function temporaryAliasMayDownloadAnswerKey(input: {
  temporaryTutorAlias?: string | null;
  includeAnswerKey: boolean;
  configuredViewEmail?: string | null;
}): boolean {
  if (!input.includeAnswerKey) return true;
  if (!input.temporaryTutorAlias?.trim()) return true;
  if (typeof input.configuredViewEmail !== "string") return false;
  return !TEMP_VIEW_DISABLED.has(input.configuredViewEmail.trim().toLowerCase());
}

function assignmentCreatedMs(value: SessionPdfAssignment["createdAt"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function orderedQuestionIds(assignment: SessionPdfAssignment): string[] {
  return [...assignment.questions]
    .sort(
      (left, right) => left.position - right.position || left.id.localeCompare(right.id),
    )
    .map((question) => question.id);
}

function isHardQuestionBankTitle(title: string): boolean {
  return /hard-question bank/i.test(title.trim());
}

function statusHomeworkCandidate(assignment: SessionPdfAssignment): StatusHomeworkCandidate {
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignment.status,
    subject: assignment.subject ?? null,
    homeworkKind: assignment.homeworkKind ?? null,
    questionCount: assignment.questionCount ?? assignment.questions.length,
    attemptCount: assignment.attemptCount ?? 0,
    deliveryPhase: assignment.deliveryPhase,
    createdAt: assignment.createdAt,
    planAssignmentId: assignment.planAssignmentId ?? null,
  };
}

/**
 * Pre-work PDFs use the same collapse as the student homework list, then
 * put the bank section first and any other surviving homework after it.
 * In-session PDFs use the hard-question bank when that assignment exists,
 * and never repeat a question that is already on pre-work.
 */
export function selectSessionPdfSections(input: {
  phase: SessionQuestionPdfPhase;
  assignments: readonly SessionPdfAssignment[];
}): SessionPdfSectionPlan[] {
  const live = input.assignments.filter(
    (assignment) =>
      assignment.status !== "archived" && !isPostSessionFollowUpTitle(assignment.title),
  );
  const preworkQuestionIds = new Set<string>();
  for (const assignment of live) {
    if (assignment.deliveryPhase !== "before_session") continue;
    for (const question of assignment.questions) preworkQuestionIds.add(question.id);
  }

  if (input.phase === "before_session") {
    const before = live.filter((assignment) => assignment.deliveryPhase === "before_session");
    const byId = new Map(before.map((assignment) => [assignment.id, assignment]));
    const listed = selectStatusHomework(before.map(statusHomeworkCandidate));
    const selected = listed.flatMap((item) => {
      const id = item.id ?? item.assignmentId;
      const assignment = id ? byId.get(id) : undefined;
      return assignment ? [assignment] : [];
    });
    const banks = selected.filter(
      (assignment) => sessionPreworkDedupeSlot(assignment.title) === "sat-bank-prework",
    );
    const others = selected.filter(
      (assignment) => sessionPreworkDedupeSlot(assignment.title) !== "sat-bank-prework",
    );
    return [...banks, ...others]
      .map((assignment) => ({
        assignmentId: assignment.id,
        title: assignment.title.trim() || "Pre-work",
        questionIds: orderedQuestionIds(assignment),
      }))
      .filter((section) => section.questionIds.length > 0);
  }

  const during = live
    .filter((assignment) => assignment.deliveryPhase === "during_session")
    .sort(
      (left, right) => assignmentCreatedMs(left.createdAt) - assignmentCreatedMs(right.createdAt),
    );
  const hardBanks = during.filter((assignment) => isHardQuestionBankTitle(assignment.title));
  const pool = hardBanks.length > 0 ? hardBanks : during;
  const seen = new Set<string>();
  const sections: SessionPdfSectionPlan[] = [];
  for (const assignment of pool) {
    const questionIds = orderedQuestionIds(assignment).filter((id) => {
      if (preworkQuestionIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (questionIds.length === 0) continue;
    sections.push({
      assignmentId: assignment.id,
      title: assignment.title.trim() || "In-session questions",
      questionIds,
    });
  }
  return sections;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function extractMarkdownFigures(
  value: string | null | undefined,
): Array<{ alt: string; url: string }> {
  const figures: Array<{ alt: string; url: string }> = [];
  for (const match of (value ?? "").matchAll(MARKDOWN_IMAGE)) {
    const url = match[2] ?? "";
    if (!url) continue;
    figures.push({ alt: (match[1] ?? "").trim() || "Figure", url });
  }
  return figures;
}

export function stripMarkdownFigures(value: string | null | undefined): string {
  return (value ?? "")
    .replace(MARKDOWN_IMAGE, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_FIGURE_BYTES = 2_000_000;
const MAX_PNG_PIXELS = 4096 * 4096;
const MEDIA_ROOT_ENV = "SESSION_QUESTION_PDF_MEDIA_ROOT";

/** Walk from src or dist up to `<repo>/artifacts/accepted-admissions/public/media`. */
export function resolveQuizMediaRoot(startDir = import.meta.dirname): string {
  const override = process.env[MEDIA_ROOT_ENV]?.trim();
  if (override) return path.resolve(override);
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const candidates = [
      path.join(dir, "artifacts", "accepted-admissions", "public", "media"),
      path.join(dir, "accepted-admissions", "public", "media"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir, "../../../../accepted-admissions/public/media");
}

const MEDIA_ROOT = resolveQuizMediaRoot();

function allowedFigureOrigins(): string[] {
  const origins = [CANONICAL_APP_ORIGIN];
  const configured = resolveConfiguredAppOrigin();
  if (configured && !origins.includes(configured)) origins.push(configured);
  return origins;
}

function ownHostFigureUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (!allowedFigureOrigins().includes(parsed.origin)) return null;
  return parsed.toString();
}

function localMediaPath(url: string): string | null {
  let pathname = url;
  if (url.startsWith("https://") || url.startsWith("http://")) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/media/")) return null;
  const relative = pathname.slice("/media/".length);
  if (!relative || relative.includes("\0")) return null;
  const resolved = path.resolve(MEDIA_ROOT, relative);
  if (resolved !== MEDIA_ROOT && !resolved.startsWith(`${MEDIA_ROOT}${path.sep}`)) return null;
  return resolved;
}

async function readCappedBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffered = new Uint8Array(await response.arrayBuffer());
    if (buffered.byteLength === 0 || buffered.byteLength > maxBytes) return null;
    return buffered;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Read a quiz figure from local `/media` or this site's own origin. Never writes quiz state. */
export async function readQuizFigure(url: string): Promise<Uint8Array | null> {
  const local = localMediaPath(url);
  if (local) {
    try {
      const bytes = await readFile(local);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_FIGURE_BYTES) return null;
      return bytes;
    } catch {
      // Missing local file. Only this site's origin may be fetched.
    }
  }
  const remote = ownHostFigureUrl(url);
  if (!remote) return null;
  try {
    const response = await fetch(remote, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return await readCappedBytes(response, MAX_FIGURE_BYTES);
  } catch {
    return null;
  }
}

type PdfImage = {
  name: string;
  width: number;
  height: number;
  filter: "FlateDecode";
  data: Buffer;
};

type TextRun =
  | { kind: "text"; text: string }
  | { kind: "sup"; base: string; exp: string }
  | { kind: "frac"; num: string; den: string };

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;

const OTHER_SUPERSCRIPTS: Record<string, string> = {
  "\u2070": "^0",
  "\u00b9": "^1",
  "\u2074": "^4",
  "\u2075": "^5",
  "\u2076": "^6",
  "\u2077": "^7",
  "\u2078": "^8",
  "\u2079": "^9",
  "\u207a": "^+",
  "\u207b": "^-",
  "\u207c": "^=",
};

/** Helvetica is WinAnsi. Keep ° ² ³ ÷ × ±; map the other math symbols to ASCII. */
function pdfWinAnsiText(value: string): string {
  let text = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2212|\u2013|\u2014/g, "-")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=")
    .replace(/\u221a/g, "sqrt")
    .replace(/\u03c0/g, "pi");
  text = text.replace(/[\u2070\u00b9\u2074-\u207c]/g, (char) => OTHER_SUPERSCRIPTS[char] ?? "");
  let encoded = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0x0a || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      encoded += char;
    }
  }
  return encoded;
}

function pdfLiteral(value: string): string {
  const encoded = pdfWinAnsiText(value);
  return `(${encoded.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function parseRichText(value: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern =
    /\\frac\{([^{}]+)\}\{([^{}]+)\}|([A-Za-z0-9)\]]+)\^\{([^{}]+)\}|([A-Za-z0-9)\]]+)\^([0-9]+)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) runs.push({ kind: "text", text: value.slice(cursor, index) });
    if (match[1] != null && match[2] != null) {
      runs.push({ kind: "frac", num: match[1], den: match[2] });
    } else if (match[3] != null && match[4] != null) {
      runs.push({ kind: "sup", base: match[3], exp: match[4] });
    } else if (match[5] != null && match[6] != null) {
      runs.push({ kind: "sup", base: match[5], exp: match[6] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) runs.push({ kind: "text", text: value.slice(cursor) });
  return runs.length > 0 ? runs : [{ kind: "text", text: value }];
}

/**
 * Adobe Helvetica AFM widths in 1000-unit ems, including WinAnsi Latin-1.
 * The old 0.52em average was narrower than m/w, so long lines overprinted.
 */
function fillWinAnsiWidths(target: Uint16Array, pairs: readonly number[]) {
  for (let index = 0; index < pairs.length; index += 2) {
    target[pairs[index]!] = pairs[index + 1]!;
  }
}
const HELVETICA_UNITS = new Uint16Array(256);
fillWinAnsiWidths(HELVETICA_UNITS, [32,278,33,278,34,355,35,556,36,556,37,889,38,667,39,191,40,333,41,333,42,389,43,584,44,278,45,333,46,278,47,278,48,556,49,556,50,556,51,556,52,556,53,556,54,556,55,556,56,556,57,556,58,278,59,278,60,584,61,584,62,584,63,556,64,1015,65,667,66,667,67,722,68,722,69,667,70,611,71,778,72,722,73,278,74,500,75,667,76,556,77,833,78,722,79,778,80,667,81,778,82,722,83,667,84,611,85,722,86,667,87,944,88,667,89,667,90,611,91,278,92,278,93,278,94,469,95,556,96,333,97,556,98,556,99,500,100,556,101,556,102,278,103,556,104,556,105,222,106,222,107,500,108,222,109,833,110,556,111,556,112,556,113,556,114,333,115,500,116,278,117,556,118,500,119,722,120,500,121,500,122,500,123,334,124,260,125,334,126,584,128,556,130,222,131,556,132,333,133,1000,134,556,135,556,136,333,137,1000,138,667,139,333,140,1000,142,611,145,222,146,222,147,333,148,333,149,350,150,556,151,1000,152,333,153,1000,154,500,155,333,156,944,158,500,159,667,160,278,161,333,162,556,163,556,164,556,165,556,166,260,167,556,168,333,169,737,170,370,171,556,172,584,173,333,174,737,175,333,176,400,177,584,178,333,179,333,180,333,181,556,182,537,183,278,184,333,185,333,186,365,187,556,188,834,189,834,190,834,191,611,192,667,193,667,194,667,195,667,196,667,197,667,198,1000,199,722,200,667,201,667,202,667,203,667,204,278,205,278,206,278,207,278,208,722,209,722,210,778,211,778,212,778,213,778,214,778,215,584,216,778,217,722,218,722,219,722,220,722,221,667,222,667,223,611,224,556,225,556,226,556,227,556,228,556,229,556,230,889,231,500,232,556,233,556,234,556,235,556,236,278,237,278,238,278,239,278,240,556,241,556,242,556,243,556,244,556,245,556,246,556,247,584,248,611,249,556,250,556,251,556,252,556,253,500,254,556,255,500]);

const HELVETICA_BOLD_UNITS = new Uint16Array(256);
fillWinAnsiWidths(HELVETICA_BOLD_UNITS, [32,278,33,333,34,474,35,556,36,556,37,889,38,722,39,238,40,333,41,333,42,389,43,584,44,278,45,333,46,278,47,278,48,556,49,556,50,556,51,556,52,556,53,556,54,556,55,556,56,556,57,556,58,333,59,333,60,584,61,584,62,584,63,611,64,975,65,722,66,722,67,722,68,722,69,667,70,611,71,778,72,722,73,278,74,556,75,722,76,611,77,833,78,722,79,778,80,667,81,778,82,722,83,667,84,611,85,722,86,667,87,944,88,667,89,667,90,611,91,333,92,278,93,333,94,584,95,556,96,333,97,556,98,611,99,556,100,611,101,556,102,333,103,611,104,611,105,278,106,278,107,556,108,278,109,889,110,611,111,611,112,611,113,611,114,389,115,556,116,333,117,611,118,556,119,778,120,556,121,556,122,500,123,389,124,280,125,389,126,584,128,556,130,278,131,556,132,500,133,1000,134,556,135,556,136,333,137,1000,138,667,139,333,140,1000,142,611,145,278,146,278,147,500,148,500,149,350,150,556,151,1000,152,333,153,1000,154,556,155,333,156,944,158,500,159,667,160,278,161,333,162,556,163,556,164,556,165,556,166,280,167,556,168,333,169,737,170,370,171,556,172,584,173,333,174,737,175,333,176,400,177,584,178,333,179,333,180,333,181,611,182,556,183,278,184,333,185,333,186,365,187,556,188,834,189,834,190,834,191,611,192,722,193,722,194,722,195,722,196,722,197,722,198,1000,199,722,200,667,201,667,202,667,203,667,204,278,205,278,206,278,207,278,208,722,209,722,210,778,211,778,212,778,213,778,214,778,215,584,216,778,217,722,218,722,219,722,220,722,221,667,222,667,223,611,224,556,225,556,226,556,227,556,228,556,229,556,230,889,231,556,232,556,233,556,234,556,235,556,236,278,237,278,238,278,239,278,240,611,241,611,242,611,243,611,244,611,245,611,246,611,247,584,248,611,249,611,250,611,251,611,252,611,253,556,254,611,255,556]);

export const SESSION_PDF_PAGE_WIDTH = PAGE_WIDTH;
export const SESSION_PDF_MARGIN = MARGIN;
export const SESSION_PDF_CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Width of text after the same WinAnsi mapping the PDF page uses. */
export function helveticaTextWidth(text: string, size: number, bold = false): number {
  const units = bold ? HELVETICA_BOLD_UNITS : HELVETICA_UNITS;
  let total = 0;
  for (const char of pdfWinAnsiText(text)) {
    const code = char.charCodeAt(0);
    const width = units[code];
    total += width || units[0x3f] || 0;
  }
  return (total * size) / 1000;
}

function splitPdfWord(word: string, size: number, maxWidth: number, bold = false): string[] {
  if (maxWidth <= 0 || helveticaTextWidth(word, size, bold) <= maxWidth) return [word];
  const parts: string[] = [];
  let chunk = "";
  for (const char of word) {
    const next = chunk + char;
    if (chunk && helveticaTextWidth(next, size, bold) > maxWidth) {
      parts.push(chunk);
      chunk = char;
    } else {
      chunk = next;
    }
  }
  if (chunk) parts.push(chunk);
  return parts.length > 0 ? parts : [word];
}

function wrapText(text: string, size: number, width: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => splitPdfWord(word, size, width, bold));
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (helveticaTextWidth(next, size, bold) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function decodePng(bytes: Uint8Array): { width: number; height: number; rgb: Buffer } | null {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const view = Buffer.from(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.readUInt32BE(0);
    const type = view.toString("ascii", 4, 8);
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) return null;
    const data = Buffer.from(bytes.buffer, bytes.byteOffset + dataStart, length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) return null;
      if (
        width < 1 ||
        height < 1 ||
        width > MAX_PNG_PIXELS ||
        height > MAX_PNG_PIXELS ||
        width * height > MAX_PNG_PIXELS
      ) {
        return null;
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_PNG_PIXELS ||
    height > MAX_PNG_PIXELS ||
    width * height > MAX_PNG_PIXELS ||
    idat.length === 0
  ) {
    return null;
  }
  const channels = colorType === 6 ? 4 : 3;
  const maxOutputLength = height * (width * channels + 1);
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 1) return null;
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idat), { maxOutputLength });
  } catch {
    return null;
  }
  const stride = width * channels;
  if (inflated.length < height * (stride + 1)) return null;
  const rgb = Buffer.alloc(width * height * 3);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src] ?? 0;
    src += 1;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? recon[i - channels]! : 0;
      const up = prev[i] ?? 0;
      const upLeft = i >= channels ? prev[i - channels]! : 0;
      const raw = row[i] ?? 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (raw + predictor) & 255;
      }
      recon[i] = value;
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 3;
      rgb[target] = recon[source] ?? 0;
      rgb[target + 1] = recon[source + 1] ?? 0;
      rgb[target + 2] = recon[source + 2] ?? 0;
    }
    prev = recon;
  }
  return { width, height, rgb };
}

function imageFromBytes(bytes: Uint8Array, name: string): PdfImage | null {
  const png = decodePng(bytes);
  if (!png || png.width < 1 || png.height < 1) return null;
  return {
    name,
    width: png.width,
    height: png.height,
    filter: "FlateDecode",
    data: deflateSync(png.rgb),
  };
}

class QuestionPdf {
  private pages: string[] = [];
  private current: string[] = [];
  private images: PdfImage[] = [];
  private y = PAGE_HEIGHT - MARGIN;
  private readonly heading: string[];

  constructor(heading: string[]) {
    this.heading = heading;
    this.drawHeading();
  }

  private drawHeading() {
    this.heading.forEach((line, index) => {
      this.drawPlain(line, index === 0 ? 16 : 11, index === 0);
    });
    this.y -= 6;
    this.current.push(`${MARGIN} ${this.y} m ${PAGE_WIDTH - MARGIN} ${this.y} l S`);
    this.y -= 18;
  }

  private newPage() {
    this.pages.push(this.current.join("\n"));
    this.current = [];
    this.y = PAGE_HEIGHT - MARGIN;
    this.drawHeading();
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  private drawPlain(text: string, size: number, bold = false) {
    const font = bold ? "/F2" : "/F1";
    for (const line of wrapText(text, size, PAGE_WIDTH - MARGIN * 2, bold)) {
      this.ensure(size + 4);
      this.current.push(
        `BT ${font} ${size} Tf ${MARGIN} ${Math.round(this.y - size)} Td ${pdfLiteral(line)} Tj ET`,
      );
      this.y -= size + 4;
    }
  }

  sectionTitle(text: string) {
    this.drawPlain(text, 13, true);
    this.y -= 4;
  }

  paragraph(text: string, size = 11) {
    const clean = stripMarkdownFigures(text);
    if (!clean) return;
    const maxX = PAGE_WIDTH - MARGIN;
    const contentWidth = maxX - MARGIN;
    let x = MARGIN;
    let lineHeight = size + 6;
    this.ensure(lineHeight + 8);
    let baseline = Math.round(this.y - size);
    const advance = (width: number, height: number) => {
      if (x > MARGIN && x + width > maxX) {
        this.y -= lineHeight;
        x = MARGIN;
        lineHeight = size + 6;
        this.ensure(lineHeight + 8);
        baseline = Math.round(this.y - size);
      }
      lineHeight = Math.max(lineHeight, height);
      const at = x;
      x += width;
      return { at, baseline };
    };
    const finishLine = () => {
      if (x > MARGIN) this.y -= lineHeight;
      x = MARGIN;
      lineHeight = size + 6;
      this.ensure(lineHeight + 8);
      baseline = Math.round(this.y - size);
    };
    for (const block of clean.split("\n")) {
      for (const run of parseRichText(block.length > 0 ? block : " ")) {
        if (run.kind === "text") {
          const words = run.text.split(/(\s+)/).filter((part) => part.length > 0);
          for (const word of words) {
            if (/^\s+$/.test(word)) {
              if (x > MARGIN) x += helveticaTextWidth(" ", size);
              continue;
            }
            for (const piece of splitPdfWord(word, size, contentWidth)) {
              const width = helveticaTextWidth(piece, size);
              const placed = advance(width, size + 6);
              this.current.push(
                `BT /F1 ${size} Tf ${Math.round(placed.at)} ${placed.baseline} Td ${pdfLiteral(piece)} Tj ET`,
              );
            }
          }
          continue;
        }
        if (run.kind === "sup") {
          const expSize = Math.max(7, Math.round(size * 0.65));
          const baseWidth = helveticaTextWidth(run.base, size);
          const expWidth = helveticaTextWidth(run.exp, expSize);
          const placed = advance(baseWidth + expWidth, size + 8);
          this.current.push(
            `BT /F1 ${size} Tf ${Math.round(placed.at)} ${placed.baseline} Td ${pdfLiteral(run.base)} Tj ET`,
            `BT /F1 ${expSize} Tf ${Math.round(placed.at + baseWidth)} ${placed.baseline + Math.round(size * 0.35)} Td ${pdfLiteral(run.exp)} Tj ET`,
          );
          continue;
        }
        const small = Math.max(8, size - 2);
        const width = Math.max(helveticaTextWidth(run.num, small), helveticaTextWidth(run.den, small), 12) + 4;
        const placed = advance(width + 4, small * 2 + 8);
        const bar = placed.baseline + 2;
        this.current.push(
          `BT /F1 ${small} Tf ${Math.round(placed.at)} ${bar + 3} Td ${pdfLiteral(run.num)} Tj ET`,
          `${Math.round(placed.at)} ${bar} m ${Math.round(placed.at + width)} ${bar} l S`,
          `BT /F1 ${small} Tf ${Math.round(placed.at)} ${bar - small - 2} Td ${pdfLiteral(run.den)} Tj ET`,
        );
      }
      finishLine();
    }
  }

  figure(figure: SessionQuestionPdfFigure) {
    const image = figure.bytes ? imageFromBytes(figure.bytes, `Im${this.images.length + 1}`) : null;
    if (!image) {
      this.paragraph(figure.alt ? `Figure: ${figure.alt}` : "Figure");
      return;
    }
    this.images.push(image);
    const maxWidth = 240;
    const scale = Math.min(1, maxWidth / image.width);
    const drawWidth = Math.max(12, Math.round(image.width * scale));
    const drawHeight = Math.max(12, Math.round(image.height * scale));
    this.ensure(drawHeight + 8);
    const bottom = Math.round(this.y - drawHeight);
    this.current.push(`q ${drawWidth} 0 0 ${drawHeight} ${MARGIN} ${bottom} cm /${image.name} Do Q`);
    this.y = bottom - 8;
    if (figure.alt) this.paragraph(figure.alt, 9);
  }

  finish(): Buffer {
    if (this.current.length > 0) this.pages.push(this.current.join("\n"));
    const objects: Buffer[] = [];
    const add = (body: Buffer | string): number => {
      const id = objects.length + 1;
      const contents = typeof body === "string" ? Buffer.from(body, "latin1") : body;
      objects.push(
        Buffer.concat([
          Buffer.from(`${id} 0 obj\n`, "latin1"),
          contents,
          Buffer.from("\nendobj\n", "latin1"),
        ]),
      );
      return id;
    };

    const imageIds = this.images.map((image) => {
      const dictionary = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.data.length} >>\nstream\n`;
      return add(
        Buffer.concat([
          Buffer.from(dictionary, "latin1"),
          image.data,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
    });
    const contentIds = this.pages.map((page) =>
      add(`<< /Length ${Buffer.byteLength(page, "latin1")} >>\nstream\n${page}\nendstream`),
    );
    const fontRegular = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    const fontBold = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    const xobjects = this.images
      .map((image, index) => `/${image.name} ${imageIds[index]} 0 R`)
      .join(" ");
    const pageIds = contentIds.map((contentId) =>
      add(
        `<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << ${xobjects} >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    const pagesId = add(
      `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    );
    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const pageObjects = pageIds.map((id) => objects[id - 1]!);
    for (const [index, id] of pageIds.entries()) {
      objects[id - 1] = Buffer.from(
        pageObjects[index]!.toString("latin1").replace("/Parent PAGES 0 R", `/Parent ${pagesId} 0 R`),
        "latin1",
      );
    }

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
    const offsets = [0];
    for (const object of objects) {
      offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      chunks.push(object);
    }
    const xrefAt = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objects.length; id += 1) {
      xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
    chunks.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(chunks);
  }
}

function phaseTitle(phase: SessionQuestionPdfPhase, includeAnswerKey: boolean): string {
  const part = phase === "before_session" ? "Pre-work questions" : "In-session questions";
  return includeAnswerKey ? `${part} — answer key` : part;
}

function drawQuestion(
  pdf: QuestionPdf,
  question: SessionQuestionPdfQuestion,
  number: number,
  includeAnswerKey: boolean,
) {
  pdf.paragraph(`${number}. ${stripMarkdownFigures(question.prompt) || "Question"}`, 12);
  if (question.stimulus) pdf.paragraph(question.stimulus, 11);
  const figures =
    question.figures && question.figures.length > 0
      ? question.figures
      : extractMarkdownFigures(`${question.stimulus ?? ""}\n${question.prompt}`).map((figure) => ({
          alt: figure.alt,
          bytes: null,
        }));
  for (const figure of figures) pdf.figure(figure);
  for (const choice of question.choices ?? []) {
    pdf.paragraph(`${choice.label}. ${stripMarkdownFigures(choice.text)}`, 11);
  }
  if (includeAnswerKey) {
    pdf.paragraph(`Answer: ${(question.correctAnswer ?? "").trim() || "—"}`, 11);
    if (question.explanation?.trim()) pdf.paragraph(question.explanation, 10);
  }
  pdf.paragraph(" ", 8);
}

export function renderSessionQuestionPdf(input: SessionQuestionPdfInput): Buffer {
  const pdf = new QuestionPdf([
    phaseTitle(input.phase, input.includeAnswerKey),
    input.sessionTitle,
    input.sessionDateLabel,
    `Student: ${input.studentName}`,
  ]);
  const sections =
    input.sections && input.sections.length > 0
      ? input.sections
      : [{ title: "", questions: input.questions ?? [] }];
  let number = 1;
  for (const section of sections) {
    if (section.title.trim()) pdf.sectionTitle(section.title);
    for (const question of section.questions) {
      drawQuestion(pdf, question, number, input.includeAnswerKey);
      number += 1;
    }
  }
  return pdf.finish();
}
