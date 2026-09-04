export type ClerkPublishableKeyResult =
  | { ok: true; publishableKey: string }
  | { ok: false; reason: "missing" | "invalid" };

const LIVE_PREFIX = "pk_live_";
const TEST_PREFIX = "pk_test_";

export function isConfiguredPublishableKey(
  key: string | undefined,
): key is string {
  const trimmed = key?.trim() ?? "";
  return trimmed.startsWith(LIVE_PREFIX) || trimmed.startsWith(TEST_PREFIX);
}

export function normalizeAppHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, "").trim();
}

/** Clerk Frontend API host for an app hostname (`app.example.com` → `clerk.app.example.com`). */
export function clerkFrontendApiHost(hostname: string): string {
  const host = normalizeAppHostname(hostname);
  return host ? `clerk.${host}` : "";
}

/** Typical Clerk accounts host for an app hostname. */
export function clerkAccountsHost(hostname: string): string {
  const host = normalizeAppHostname(hostname);
  return host ? `accounts.${host}` : "";
}

export function clerkJsScriptUrl(hostname: string): string {
  const apiHost = clerkFrontendApiHost(hostname);
  return apiHost
    ? `https://${apiHost}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
    : "";
}

/**
 * Resolve the Clerk publishable key without throwing at module load.
 *
 * Production instances still use Clerk's host-derived Frontend API
 * (`clerk.<app-host>`). That is expected: `app.acceptedadmissions.org` loads
 * Clerk JS from `clerk.app.acceptedadmissions.org`. DNS must include that
 * CNAME (and typically `accounts.<app-host>`). A missing record shows up as
 * ERR_NAME_NOT_RESOLVED, not as a React crash.
 */
export function resolveClerkPublishableKey(
  hostname: string,
  configuredKey: string | undefined,
  deriveFromHost: (host: string, fallbackKey?: string) => string = defaultDeriveFromHost,
): ClerkPublishableKeyResult {
  const configured = configuredKey?.trim() ?? "";
  if (!configured) {
    return { ok: false, reason: "missing" };
  }
  if (!isConfiguredPublishableKey(configured)) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const derived = deriveFromHost(hostname, configured);
    return { ok: true, publishableKey: derived || configured };
  } catch {
    return { ok: true, publishableKey: configured };
  }
}

function defaultDeriveFromHost(host: string, fallbackKey?: string): string {
  if (fallbackKey && fallbackKey.startsWith(TEST_PREFIX)) {
    return fallbackKey;
  }
  const hostname = normalizeAppHostname(host);
  if (!hostname) {
    throw new Error("Host must not be empty.");
  }
  return fallbackKey ?? "";
}

export function clerkLoadFailureCopy(hostname: string): {
  title: string;
  body: string;
  failedHost: string;
  accountsHost: string;
  scriptUrl: string;
} {
  const failedHost = clerkFrontendApiHost(hostname);
  const accountsHost = clerkAccountsHost(hostname);
  const scriptUrl = clerkJsScriptUrl(hostname);
  return {
    title: "Sign-in could not load Clerk",
    body: `The Clerk browser script did not load from ${failedHost}. Production custom domains need a DNS CNAME for that host (and typically ${accountsHost}). Return home and try again after those records resolve.`,
    failedHost,
    accountsHost,
    scriptUrl,
  };
}

export function clerkConfigErrorCopy(
  reason: Extract<ClerkPublishableKeyResult, { ok: false }>["reason"],
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
