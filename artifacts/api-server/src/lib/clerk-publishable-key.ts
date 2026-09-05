export type ClerkPublishableKeyResult =
  | { ok: true; publishableKey: string }
  | { ok: false; reason: "missing" | "invalid" };

export type ClerkConfigErrorReason =
  Extract<ClerkPublishableKeyResult, { ok: false }>["reason"];

const LIVE_PREFIX = "pk_live_";
const TEST_PREFIX = "pk_test_";

export function isConfiguredPublishableKey(
  key: string | undefined,
): key is string {
  const trimmed = key?.trim() ?? "";
  return trimmed.startsWith(LIVE_PREFIX) || trimmed.startsWith(TEST_PREFIX);
}

function decodeBase64(value: string): string {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Frontend API host encoded in a Clerk publishable key (`…$` payload). */
export function frontendApiFromPublishableKey(
  key: string | undefined,
): string | null {
  if (!isConfiguredPublishableKey(key)) return null;
  const encoded = key.startsWith(LIVE_PREFIX)
    ? key.slice(LIVE_PREFIX.length)
    : key.slice(TEST_PREFIX.length);
  if (!encoded) return null;
  try {
    const decoded = decodeBase64(encoded);
    if (!decoded.endsWith("$")) return null;
    const frontendApi = decoded.slice(0, -1);
    return frontendApi.includes(".") ? frontendApi : null;
  } catch {
    return null;
  }
}

/**
 * Use the configured `CLERK_PUBLISHABLE_KEY` unchanged.
 *
 * Do not pass a valid `pk_live_` / `pk_test_` key through
 * `publishableKeyFromHost()`. That helper ignores live keys and builds
 * `clerk.${requestHost}`. When Vercel rewrites `/api` to Railway with
 * `x-forwarded-host=app.acceptedadmissions.org`, that becomes
 * `clerk.app.acceptedadmissions.org` instead of the Frontend API encoded
 * in the key (`clerk.acceptedadmissions.org`).
 */
export function resolveClerkPublishableKey(
  configuredKey: string | undefined,
): ClerkPublishableKeyResult {
  const configured = configuredKey?.trim() ?? "";
  if (!configured) {
    return { ok: false, reason: "missing" };
  }
  if (!isConfiguredPublishableKey(configured)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, publishableKey: configured };
}

export function clerkPublishableKeyError(
  reason: ClerkConfigErrorReason,
): string {
  if (reason === "invalid") {
    return "CLERK_PUBLISHABLE_KEY is not a valid pk_test_ or pk_live_ value.";
  }
  return "CLERK_PUBLISHABLE_KEY is missing.";
}
