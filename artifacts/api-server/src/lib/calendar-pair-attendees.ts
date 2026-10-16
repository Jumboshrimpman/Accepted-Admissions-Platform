// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ADMIN_INBOX_EMAIL } from "./transactional-email.ts";

/** Production Clerk user for Michelle Makarem. */
export const MICHELLE_MAKAREM_CLERK_USER_ID = "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";
/** Production student email for Michelle Makarem. */
export const MICHELLE_MAKAREM_EMAIL = "makaremmichelle7@gmail.com";

export type CalendarInviteParty = {
  clerkUserId?: string | null;
  email?: string | null;
  userId?: string | null;
};

/**
 * Every booking invite includes the admin inbox, for every tutor and client.
 * The student and tutor arguments stay so create, reschedule, and admin updates
 * keep one call site. Matching is no longer limited to Michelle+Xavier or Neel pairs.
 */
export function adminAttendeeEmailsForPair(
  _student?: CalendarInviteParty | null,
  _tutor?: CalendarInviteParty | null,
): string[] {
  return [ADMIN_INBOX_EMAIL];
}

/** Keep existing guests and append admin emails once, case-insensitively. */
export function mergeCalendarAttendees(
  attendees: readonly { email: string }[],
  extraEmails: readonly string[],
): { email: string }[] {
  const merged: { email: string }[] = [];
  const seen = new Set<string>();
  const push = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ email: trimmed });
  };
  for (const attendee of attendees) push(attendee.email);
  for (const email of extraEmails) push(email);
  return merged;
}
