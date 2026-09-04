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

/**
 * Resolve the Clerk publishable key without throwing.
 *
 * Do not pass a production (`pk_live_`) key through `publishableKeyFromHost()`.
 * That helper only returns `pk_test_` fallbacks as-is. For live keys it builds
 * `clerk.${hostname}`, so `app.acceptedadmissions.org` becomes
 * `clerk.app.acceptedadmissions.org` instead of the configured Frontend API
 * (`clerk.acceptedadmissions.org`). Clerk then never finishes loading and
 * `<SignIn>` / `<Show>` render a blank screen.
 */
export function resolveClerkPublishableKey(
  _hostname: string,
  configuredKey: string | undefined,
): ClerkPublishableKeyResult {
  const configured = configuredKey?.trim() ?? "";
  if (isConfiguredPublishableKey(configured)) {
    return { ok: true, publishableKey: configured };
  }
  if (!configured) {
    return { ok: false, reason: "missing" };
  }
  return { ok: false, reason: "invalid" };
}

export function clerkConfigErrorCopy(
  reason: ClerkPublishableKeyResult extends { ok: false; reason: infer R }
    ? R
    : never,
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
