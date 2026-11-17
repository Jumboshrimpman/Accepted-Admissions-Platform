/** Browser helpers for the async SAT Math video request panel. */

export const MATH_VIDEO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const MATH_VIDEO_UPLOAD_CONCURRENCY = 3;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

const ALLOWED = new Set(Object.values(MIME_BY_EXTENSION));

/**
 * Some phones/browsers hand over HEIC photos with an empty `type`. Fall back
 * to the extension so the server's type check still passes.
 */
export function uploadMimeType(file: { name: string; type: string }): string | null {
  const declared = file.type.trim().toLowerCase();
  if (ALLOWED.has(declared)) return declared;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  if (!uploadMimeType(file)) return `${file.name}: upload photos (JPG, PNG, HEIC, WebP) or a PDF.`;
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MATH_VIDEO_UPLOAD_MAX_BYTES) return `${file.name} is larger than 15 MB.`;
  return null;
}

/** Browsers can't draw HEIC (except Safari), so show a file tile instead. */
export function canPreviewInline(mimeType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType);
}

/**
 * "Add photos as separate questions": one photo per question. Fills empty
 * questions first, then appends new ones, never past the max.
 * Returns the target question index per file (null = no room).
 */
export function assignPhotosToQuestions(args: {
  items: readonly { text: string; fileCount: number }[];
  photoCount: number;
  maxQuestions: number;
}): { targets: (number | null)[]; itemCount: number } {
  const targets: (number | null)[] = [];
  const empty = args.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.text.trim() && item.fileCount === 0)
    .map(({ index }) => index);
  let itemCount = args.items.length;
  for (let photo = 0; photo < args.photoCount; photo += 1) {
    const reuse = empty.shift();
    if (reuse !== undefined) {
      targets.push(reuse);
    } else if (itemCount < args.maxQuestions) {
      targets.push(itemCount);
      itemCount += 1;
    } else {
      targets.push(null);
    }
  }
  return { targets, itemCount };
}

/** How many questions would be charged, and whether the request can be sent. */
export function submitReadiness(args: {
  items: readonly { text: string; fileCount: number }[];
  credits: number;
  minQuestions: number;
  maxQuestions: number;
  offerOpen: boolean;
  uploading: boolean;
}): { ready: boolean; count: number; reason: string | null } {
  const count = args.items.length;
  if (!args.offerOpen) return { ready: false, count, reason: "Video requests closed after Dec 5." };
  if (args.uploading) return { ready: false, count, reason: "Wait for the photos to finish uploading." };
  if (count < args.minQuestions) {
    return { ready: false, count, reason: `Add at least ${args.minQuestions} questions (you have ${count}).` };
  }
  if (count > args.maxQuestions) return { ready: false, count, reason: `Use at most ${args.maxQuestions} questions.` };
  const blank = args.items.findIndex((item) => !item.text.trim() && item.fileCount === 0);
  if (blank >= 0) return { ready: false, count, reason: `Question ${blank + 1} needs a photo or a short description.` };
  if (args.credits < count) {
    return { ready: false, count, reason: `This uses ${count} credits and you have ${Math.max(0, args.credits)}.` };
  }
  return { ready: true, count, reason: null };
}

/** "Due in 31 hours", "Due in 45 minutes", "Overdue by 2 hours". */
export function dueLabel(dueAtIso: string | null, now: Date = new Date()): string {
  if (!dueAtIso) return "";
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return "";
  const diff = due.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.max(1, Math.round(abs / 60_000));
  const span = hours >= 1 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return diff >= 0 ? `Due in ${span}` : `Overdue by ${span}`;
}

/** Client-side mirror of the server parser, for a live preview while typing. */
export function youtubeVideoIdFromUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = segments[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (segments[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
