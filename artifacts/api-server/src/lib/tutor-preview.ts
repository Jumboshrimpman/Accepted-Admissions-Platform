const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PREVIEW_RESOURCE = /\/admin\/tutors\/[^/]+\/preview$/;

/**
 * Reads that start calendar OAuth, reconnect links, or a connection test.
 * A preview must not reach them even when the method is GET.
 */
const PREVIEW_BLOCKED_READS = [
  /\/calendar\/connect$/,
  /\/calendar\/oauth\//,
  /\/calendar\/connections\/[^/]+\/reconnect-link$/,
  /\/calendar\/connections\/[^/]+\/test$/,
  /\/admin\/calendar-connections\/[^/]+\/reconnect-link$/,
  /\/admin\/calendar-connections\/[^/]+\/test$/,
];

function pathWithoutQuery(path: string): string {
  const bare = path.split("?")[0] ?? path;
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare;
}

function markerValue(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && /^(1|true)$/i.test(raw.trim());
}

export function tutorPreviewMarkerPresent(input: {
  header?: unknown;
  query?: unknown;
}): boolean {
  return markerValue(input.header) || markerValue(input.query);
}

/**
 * Preview context is the preview URL itself, or any request carrying
 * `X-Tutor-Preview: 1` or `?preview=1`. Mutating methods are refused.
 * Calendar connect, reconnect, and connection tests are refused too.
 */
export function tutorPreviewWriteRejected(input: {
  method?: string;
  path?: string;
  header?: unknown;
  query?: unknown;
}): boolean {
  const method = (input.method ?? "GET").toUpperCase();
  const path = pathWithoutQuery(input.path ?? "");
  if (PREVIEW_RESOURCE.test(path) && !SAFE_METHODS.has(method)) return true;
  if (!tutorPreviewMarkerPresent({ header: input.header, query: input.query })) return false;
  if (!SAFE_METHODS.has(method)) return true;
  return PREVIEW_BLOCKED_READS.some((pattern) => pattern.test(path));
}
