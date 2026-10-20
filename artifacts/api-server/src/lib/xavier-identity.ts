export const CANONICAL_XAVIER_NAME = "Xavier Morales";
/** Login and Clerk still use this address. Do not rewrite users.email to the profile spelling. */
export const CANONICAL_XAVIER_EMAIL = "xaver.rmz6@gmail.com";
/** Tutor profile and calendar guest address. Spelled with an i. */
export const XAVIER_PROFILE_EMAIL = "xavier.rmz6@gmail.com";
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

/** Drop retirement lines so a restored public profile is not hidden from Connections. */
export function profileNotesWithoutSupersededMarker(
  notes: string | null | undefined,
): string | null {
  if (!notes) return null;
  const cleaned = notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("SUPERSEDED:"))
    .join("\n");
  return cleaned.length > 0 ? cleaned : null;
}

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

export function isXavierProfileEmail(
  email: string | null | undefined,
): boolean {
  return Boolean(email) && normalizeEmail(email!) === XAVIER_PROFILE_EMAIL;
}

/** Login spelling and profile spelling for one address. Other addresses stay as given. */
export function xavierEmailSpellings(email: string): string[] {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return [normalized];
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (local === "xaver.rmz6" || local === "xavier.rmz6") {
    return [`xaver.rmz6@${domain}`, `xavier.rmz6@${domain}`];
  }
  return [normalized];
}

export type XavierProfileKeepCandidate = {
  id: string;
  photoUrl?: string | null;
  createdAt?: Date | string | null;
  availabilityRuleCount?: number | null;
};

function xavierProfileHasPhoto(profile: XavierProfileKeepCandidate): boolean {
  return Boolean(profile.photoUrl?.trim());
}

function xavierProfileCreatedAt(profile: XavierProfileKeepCandidate): number {
  if (!profile.createdAt) return Number.POSITIVE_INFINITY;
  const ms = new Date(profile.createdAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Keep the original profile: a photo, then availability rules, then the
 * oldest created_at. Array order never decides.
 */
export function chooseXavierProfileToKeep<T extends XavierProfileKeepCandidate>(
  profiles: readonly T[],
): T | null {
  if (profiles.length === 0) return null;
  return [...profiles].sort((a, b) => {
    const photo = Number(xavierProfileHasPhoto(b)) - Number(xavierProfileHasPhoto(a));
    if (photo !== 0) return photo;
    const rules =
      Number((b.availabilityRuleCount ?? 0) > 0) - Number((a.availabilityRuleCount ?? 0) > 0);
    if (rules !== 0) return rules;
    const created = xavierProfileCreatedAt(a) - xavierProfileCreatedAt(b);
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  })[0]!;
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
