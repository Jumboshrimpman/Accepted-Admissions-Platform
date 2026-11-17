/**
 * Asynchronous SAT Math video explanations (Michelle Makarem with Xavier
 * Morales first). Pure rules only, so they run under `node --test`.
 *
 * Two switches must both be on before any student sees the feature:
 *   1. ASYNC_MATH_VIDEOS_ENABLED on the API server (off when unset).
 *   2. An enabled row in math_video_enrollments for that student.
 */

export const MATH_VIDEO_MIN_QUESTIONS = 3;
export const MATH_VIDEO_MAX_QUESTIONS = 10;
export const MATH_VIDEO_RECOMMENDED_CREDITS = 15;
export const MATH_VIDEO_TURNAROUND_HOURS = 48;
export const MATH_VIDEO_ITEM_TEXT_MAX = 2000;
export const MATH_VIDEO_TUTOR_NOTE_MAX = 2000;
export const MATH_VIDEO_MAX_FILES_PER_REQUEST = 40;
export const MATH_VIDEO_MAX_GRANT = 100;
/** Phone photos are usually 2–8 MB. HEIC and PDFs fit too. */
export const MATH_VIDEO_FILE_MAX_BYTES = 15 * 1024 * 1024;

/**
 * "Until Dec 5": submissions close at the end of Dec 5, 2026 in New York
 * (Dec 6 00:00 EST = 05:00 UTC). Exclusive bound.
 */
export const MATH_VIDEO_DEFAULT_OFFER_ENDS_AT = new Date("2026-12-06T05:00:00.000Z");

export const MATH_VIDEO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type MathVideoStatus = "draft" | "submitted" | "delivered" | "cancelled";
export type MathVideoCreditKind = "grant" | "adjustment" | "debit" | "refund";

export function asyncMathVideosFlagEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.ASYNC_MATH_VIDEOS_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export type EnrollmentLike = {
  enabled: boolean;
  offerEndsAt: Date;
} | null | undefined;

/** The student can see the panel (history stays visible after the offer ends). */
export function studentMayView(flag: boolean, enrollment: EnrollmentLike): boolean {
  return flag && Boolean(enrollment?.enabled);
}

export function offerIsOpen(enrollment: EnrollmentLike, now: Date): boolean {
  if (!enrollment?.enabled) return false;
  return now.getTime() < enrollment.offerEndsAt.getTime();
}

export function dueAtForSubmission(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + MATH_VIDEO_TURNAROUND_HOURS * 60 * 60 * 1000);
}

export function isOverdue(
  request: { status: string; dueAt: Date | null },
  now: Date,
): boolean {
  return request.status === "submitted" && request.dueAt !== null && now.getTime() > request.dueAt.getTime();
}

export function creditBalance(entries: readonly { delta: number }[]): number {
  return entries.reduce((sum, entry) => sum + (Number.isFinite(entry.delta) ? entry.delta : 0), 0);
}

// ---------------------------------------------------------------- items

export type DraftItem = { text: string };

export function normalizeItems(input: unknown): { ok: true; items: DraftItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Send the questions as a list." };
  if (input.length > MATH_VIDEO_MAX_QUESTIONS) {
    return { ok: false, error: `A video request can include at most ${MATH_VIDEO_MAX_QUESTIONS} questions.` };
  }
  const items: DraftItem[] = [];
  for (const raw of input) {
    const text =
      raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string"
        ? (raw as { text: string }).text.replace(/\r\n/g, "\n").trim()
        : "";
    if (text.length > MATH_VIDEO_ITEM_TEXT_MAX) {
      return { ok: false, error: `Keep each question note under ${MATH_VIDEO_ITEM_TEXT_MAX} characters.` };
    }
    items.push({ text });
  }
  return { ok: true, items };
}

export type SubmitCheck =
  | { ok: true; questionCount: number }
  | { ok: false; status: number; code: string; error: string };

/**
 * Every question needs a note or at least one photo. 3–10 questions, one
 * credit each, and the offer must still be open.
 */
export function checkSubmission(args: {
  items: readonly DraftItem[];
  fileItemIndexes: readonly number[];
  balance: number;
  offerOpen: boolean;
}): SubmitCheck {
  if (!args.offerOpen) {
    return {
      ok: false,
      status: 409,
      code: "OFFER_CLOSED",
      error: "Video requests are closed. The offer ran until Dec 5.",
    };
  }
  const count = args.items.length;
  if (count < MATH_VIDEO_MIN_QUESTIONS || count > MATH_VIDEO_MAX_QUESTIONS) {
    return {
      ok: false,
      status: 400,
      code: "QUESTION_COUNT",
      error: `Each video request must include ${MATH_VIDEO_MIN_QUESTIONS}–${MATH_VIDEO_MAX_QUESTIONS} questions.`,
    };
  }
  const withFiles = new Set(args.fileItemIndexes);
  for (const index of args.fileItemIndexes) {
    if (index >= count) {
      return {
        ok: false,
        status: 400,
        code: "ORPHAN_FILE",
        error: `A photo is attached to question ${index + 1}, which was removed. Delete the photo or add the question back.`,
      };
    }
  }
  for (let index = 0; index < count; index += 1) {
    if (!args.items[index]!.text && !withFiles.has(index)) {
      return {
        ok: false,
        status: 400,
        code: "EMPTY_QUESTION",
        error: `Question ${index + 1} needs a photo or a short description.`,
      };
    }
  }
  if (args.balance < count) {
    return {
      ok: false,
      status: 402,
      code: "NOT_ENOUGH_CREDITS",
      error: `This request needs ${count} question credits and you have ${Math.max(0, args.balance)}.`,
    };
  }
  return { ok: true, questionCount: count };
}

export function parseGrantAmount(input: unknown): { ok: true; credits: number } | { ok: false; error: string } {
  const value = typeof input === "string" ? Number(input) : input;
  if (typeof value !== "number" || !Number.isInteger(value) || value === 0) {
    return { ok: false, error: "Enter a whole number of credits (not zero)." };
  }
  if (Math.abs(value) > MATH_VIDEO_MAX_GRANT) {
    return { ok: false, error: `Grant at most ${MATH_VIDEO_MAX_GRANT} credits at a time.` };
  }
  return { ok: true, credits: value };
}

// ---------------------------------------------------------------- files

export function normalizeMimeType(contentType: string | undefined | null): string {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase();
}

export function uploadFileDecision(args: {
  contentType: string | undefined | null;
  contentLength: string | undefined | null;
  filename: string;
  itemIndex: number;
  existingFiles: number;
}):
  | { ok: true; mimeType: string; bytes: number; filename: string }
  | { ok: false; status: number; error: string } {
  const mimeType = normalizeMimeType(args.contentType);
  if (!(MATH_VIDEO_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, status: 415, error: "Upload photos (JPG, PNG, HEIC, WebP) or a PDF." };
  }
  const bytes = Number(args.contentLength);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    return { ok: false, status: 411, error: "The upload is empty or missing its size." };
  }
  if (bytes > MATH_VIDEO_FILE_MAX_BYTES) {
    return { ok: false, status: 413, error: "Each file must be 15 MB or smaller." };
  }
  if (!Number.isInteger(args.itemIndex) || args.itemIndex < 0 || args.itemIndex >= MATH_VIDEO_MAX_QUESTIONS) {
    return { ok: false, status: 400, error: "Choose which question this photo belongs to." };
  }
  if (args.existingFiles >= MATH_VIDEO_MAX_FILES_PER_REQUEST) {
    return { ok: false, status: 409, error: `A request can hold at most ${MATH_VIDEO_MAX_FILES_PER_REQUEST} files.` };
  }
  return { ok: true, mimeType, bytes, filename: safeUploadFilename(args.filename, mimeType) };
}

const EXTENSION_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export function safeUploadFilename(raw: string, mimeType: string): string {
  const base = raw
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim()
    .slice(0, 120);
  if (base) return base;
  return `question.${EXTENSION_FOR_MIME[mimeType] ?? "bin"}`;
}

// ---------------------------------------------------------------- YouTube

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/**
 * Accepts watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/ and the
 * nocookie host. Returns the 11-character video ID and a canonical watch URL.
 */
export function parseYouTubeUrl(
  input: string | null | undefined,
): { ok: true; videoId: string; url: string } | { ok: false; error: string } {
  const raw = (input ?? "").trim();
  const invalid = { ok: false as const, error: "Paste a YouTube video link (unlisted is fine)." };
  if (!raw) return invalid;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return invalid;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return invalid;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return invalid;
  let id: string | null = null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (segments[0] === "watch") {
    id = parsed.searchParams.get("v");
  } else if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) {
    id = segments[1] ?? null;
  }
  if (!id || !YOUTUBE_ID.test(id)) return invalid;
  return { ok: true, videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ---------------------------------------------------------------- delivery

export function deliveryDecision(args: {
  status: string;
  youtubeVideoId: string | null;
  followUpAssignmentId: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (args.status === "delivered") return { ok: false, status: 409, error: "This request is already delivered." };
  if (args.status !== "submitted") return { ok: false, status: 409, error: "Only submitted requests can be delivered." };
  if (!args.youtubeVideoId) return { ok: false, status: 400, error: "Add the YouTube video link first." };
  if (!args.followUpAssignmentId) {
    return { ok: false, status: 400, error: "Link the follow-up practice quiz first." };
  }
  return { ok: true };
}

/** Drive folder name for one request, e.g. "2026-11-18 Michelle M · 3f2a9c1b". */
export function requestFolderName(args: { createdAt: Date; clientName: string; requestId: string }): string {
  const date = args.createdAt.toISOString().slice(0, 10);
  const parts = args.clientName.trim().split(/\s+/).filter(Boolean);
  const name = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]!.charAt(0)}` : parts[0] || "Student";
  return `${date} ${name} · ${args.requestId.slice(0, 8)}`.replace(/['\\]/g, "");
}
