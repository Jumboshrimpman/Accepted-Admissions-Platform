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
  if (typeof atob === "function") {
    return atob(padded);
  }
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

export function clerkJsScriptUrlFromKey(key: string | undefined): string {
  const frontendApi = frontendApiFromPublishableKey(key);
  return frontendApi
    ? `https://${frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
    : "";
}

/**
 * Use the configured Vite publishable key unchanged.
 *
 * Do not pass a valid `pk_live_` / `pk_test_` key through
 * `publishableKeyFromHost()`. That helper ignores live keys and builds
 * `clerk.${browserHost}`, which is not the Frontend API encoded in the key.
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

export type ClerkLoadFailureDetails = {
  error?: unknown;
  clerkPresent?: boolean;
};

export type ClerkLoadFailureKind =
  | "script-missing"
  | "load-rejected"
  | "allowed-subdomain";

export function clerkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "";
}

export function isClerkAllowedSubdomainError(error: unknown): boolean {
  const message = clerkErrorMessage(error);
  return (
    /allowed subdomains/i.test(message) ||
    /request origin subdomain/i.test(message)
  );
}

function isLikelyScriptNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|load failed|err_name_not_resolved|err_connection/i.test(
    message,
  );
}

export function isClerkLoadRejection(error: unknown): boolean {
  const message = clerkErrorMessage(error);
  if (!message) return false;
  if (isClerkAllowedSubdomainError(message)) return true;
  return (
    /\bclerk\b/i.test(message) &&
    /load|origin|subdomain|frontend api|publishable/i.test(message)
  );
}

export function clerkLoadFailureKind(
  details: ClerkLoadFailureDetails = {},
): ClerkLoadFailureKind {
  const message = clerkErrorMessage(details.error);
  if (isClerkAllowedSubdomainError(message)) return "allowed-subdomain";
  if (details.clerkPresent) return "load-rejected";
  if (message && !isLikelyScriptNetworkError(message)) return "load-rejected";
  return "script-missing";
}

export function clerkGlobalPresent(
  scope: { Clerk?: unknown } | null | undefined = typeof window === "undefined"
    ? undefined
    : (window as Window & { Clerk?: unknown }),
): boolean {
  return Boolean(scope?.Clerk);
}

export function clerkLoadFailureCopy(
  configuredKey: string | undefined,
  details: ClerkLoadFailureDetails = {},
): {
  title: string;
  body: string;
  failedHost: string;
  scriptUrl: string;
  kind: ClerkLoadFailureKind;
} {
  const failedHost = frontendApiFromPublishableKey(configuredKey) ?? "";
  const scriptUrl = clerkJsScriptUrlFromKey(configuredKey);
  const hostLabel = failedHost || "the Frontend API encoded in the configured publishable key";
  const kind = clerkLoadFailureKind(details);
  const message = clerkErrorMessage(details.error);
  const appLogin = "https://app.acceptedadmissions.org/login";

  if (kind === "allowed-subdomain") {
    return {
      title: "Sign-in cannot start on this host",
      body: `Clerk rejected this page’s origin because it is not on the allowed subdomains list${
        message ? `: ${message}` : "."
      } The Clerk browser script did load. Open ${appLogin} to sign in on the app host.`,
      failedHost,
      scriptUrl,
      kind,
    };
  }

  if (kind === "load-rejected") {
    return {
      title: "Sign-in could not start Clerk",
      body: message
        ? `The Clerk browser script loaded from ${hostLabel}, but Clerk.load() failed: ${message} This is not a missing-script failure. Try ${appLogin}, or contact the team if it continues.`
        : `The Clerk browser script loaded from ${hostLabel}, but Clerk did not become ready. This is not a missing-script failure. Try ${appLogin}, or contact the team if it continues.`,
      failedHost,
      scriptUrl,
      kind,
    };
  }

  return {
    title: "Sign-in could not load Clerk",
    body: `The Clerk browser script did not load from ${hostLabel}. That host comes from this site’s configured publishable key, not from the browser hostname. Return home and try again, or contact the team if it continues.`,
    failedHost,
    scriptUrl,
    kind,
  };
}

export function clerkConfigErrorCopy(
  reason: ClerkConfigErrorReason,
): { title: string; body: string } {
  if (reason === "invalid") {
    return {
      title: "Sign-in is not configured",
      body: "The Clerk publishable key for this site is not a valid pk_test_ or pk_live_ value. Return home and ask an administrator to check the production Clerk keys for this host.",
    };
  }
  return {
    title: "Sign-in is not configured",
    body: "This site is missing its Clerk publishable key, so the portal cannot start sign-in. Return home and ask an administrator to set VITE_CLERK_PUBLISHABLE_KEY for this host.",
  };
}
