// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_EMAIL,
  RETIRED_XAVIER_EMAILS,
  isCanonicalXavierEmail,
} from "./xavier-identity.ts";

export type CalendarProfileScoreInput = {
  id?: string;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  title?: string | null;
  active?: boolean | null;
  bookingEligible?: boolean | null;
  publicApproved?: boolean | null;
  calendarStatus?: string | null;
  internalNotes?: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

export function isRetiredTutorProfile(profile: {
  email?: string | null;
  name?: string | null;
  internalNotes?: string | null;
}): boolean {
  const email = normalizeEmail(profile.email);
  return (
    email.endsWith("@retired.accepted.local") ||
    Boolean(profile.internalNotes?.includes("SUPERSEDED:")) ||
    Boolean(profile.name?.includes("(superseded)"))
  );
}

export function claimableEmailsForUser(user: {
  email?: string | null;
}): string[] {
  const emails = new Set<string>();
  const userEmail = normalizeEmail(user.email);
  if (userEmail) emails.add(userEmail);
  if (isCanonicalXavierEmail(userEmail)) {
    emails.add(CANONICAL_XAVIER_EMAIL);
    for (const email of RETIRED_XAVIER_EMAILS) emails.add(email);
  }
  return [...emails];
}

export function portalEmailsForGoogleMatch(profile: {
  email?: string | null;
  userEmail?: string | null;
}): string[] {
  const emails = claimableEmailsForUser({
    email: profile.userEmail ?? profile.email,
  });
  const profileEmail = normalizeEmail(profile.email);
  if (profileEmail) emails.push(profileEmail);
  if (isCanonicalXavierEmail(profileEmail) || isCanonicalXavierEmail(profile.userEmail)) {
    emails.push(CANONICAL_XAVIER_EMAIL, ...RETIRED_XAVIER_EMAILS);
  }
  return [...new Set(emails.filter(Boolean))];
}

export function scoreCalendarProfile(
  profile: CalendarProfileScoreInput,
  user: { id: string; email: string },
): number {
  if (isRetiredTutorProfile(profile)) return -1000;
  let score = 0;
  if (profile.userId === user.id) score += 50;
  if (normalizeEmail(profile.email) === normalizeEmail(user.email)) score += 40;
  if (profile.active) score += 20;
  if (profile.bookingEligible) score += 10;
  if (profile.publicApproved) score += 5;
  if (profile.calendarStatus === "connected") score += 3;
  if (profile.title !== "Calendar account") score += 2;
  return score;
}

export function selectBestCalendarProfile<T extends CalendarProfileScoreInput>(
  profiles: T[],
  user: { id: string; email: string },
): T | undefined {
  return profiles
    .filter((profile) => !isRetiredTutorProfile(profile))
    .slice()
    .sort((left, right) => scoreCalendarProfile(right, user) - scoreCalendarProfile(left, user))[0];
}
