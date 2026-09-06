export const CANONICAL_XAVIER_NAME = "Xavier Morales";
export const CANONICAL_XAVIER_EMAIL = "xaver.rmz6@gmail.com";
export const CANONICAL_XAVIER_CLERK_USER_ID =
  "user_3IxUfoT1xRnDsqhlx5NN1eGfRg6";

/** Production Clerk user created from a misspelled / outdated Xavier email. */
export const RETIRED_XAVIER_CLERK_USER_ID =
  "user_3IsvKVDGAg5KdvwHhvODf2VFqtd";

export const RETIRED_XAVIER_EMAILS = [
  "xavier.rmz6@gmail.com",
  "xsfam6@gmail.com",
] as const;

export const SUPERSEDED_XAVIER_GRANT_NOTE =
  "SUPERSEDED: duplicate Xavier Clerk user. Canonical SAT tutor is user_3IxUfoT1xRnDsqhlx5NN1eGfRg6 / xaver.rmz6@gmail.com.";

const RETIRED_XAVIER_EMAIL_SET = new Set<string>(RETIRED_XAVIER_EMAILS);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function retiredXavierClerkMarker(clerkUserId: string): string {
  const trimmed = clerkUserId.trim();
  return trimmed.startsWith("retired:") ? trimmed : `retired:${trimmed}`;
}

export function isRetiredXavierClerkUserId(
  clerkUserId: string | null | undefined,
): boolean {
  if (!clerkUserId) return false;
  const trimmed = clerkUserId.trim();
  return (
    trimmed === RETIRED_XAVIER_CLERK_USER_ID ||
    trimmed === retiredXavierClerkMarker(RETIRED_XAVIER_CLERK_USER_ID) ||
    trimmed.startsWith("retired:")
  );
}

export function isRetiredXavierEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (
    RETIRED_XAVIER_EMAIL_SET.has(normalized) ||
    normalized.endsWith("@retired.accepted.local")
  );
}

export function isCanonicalXavierEmail(
  email: string | null | undefined,
): boolean {
  return Boolean(email) && normalizeEmail(email!) === CANONICAL_XAVIER_EMAIL;
}

export function isRetiredXavierIdentity(
  clerkUserId?: string | null,
  email?: string | null,
): boolean {
  return (
    isRetiredXavierClerkUserId(clerkUserId) || isRetiredXavierEmail(email)
  );
}

export function isSupersededAccessGrant(grant: {
  active?: boolean;
  notes?: string | null;
  clerkUserId?: string | null;
  email?: string | null;
}): boolean {
  if (grant.active !== false) return false;
  const notes = grant.notes ?? "";
  return (
    notes.startsWith("SUPERSEDED:") ||
    isRetiredXavierClerkUserId(grant.clerkUserId) ||
    isRetiredXavierEmail(grant.email)
  );
}
