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

export function clerkLoadFailureCopy(configuredKey: string | undefined): {
  title: string;
  body: string;
  failedHost: string;
  scriptUrl: string;
} {
  const failedHost = frontendApiFromPublishableKey(configuredKey) ?? "";
  const scriptUrl = clerkJsScriptUrlFromKey(configuredKey);
  const hostLabel = failedHost || "the Frontend API encoded in the configured publishable key";
  return {
    title: "Sign-in could not load Clerk",
    body: `The Clerk browser script did not load from ${hostLabel}. That host comes from this site’s configured publishable key, not from the browser hostname. Return home and try again, or contact the team if it continues.`,
    failedHost,
    scriptUrl,
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
