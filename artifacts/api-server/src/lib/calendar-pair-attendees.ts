// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ADMIN_INBOX_EMAIL } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
} from "./xavier-identity.ts";

/** Production Clerk user for Michelle Makarem. */
export const MICHELLE_MAKAREM_CLERK_USER_ID = "user_3JCRGfBj8dgWSjO1r2zeKovFVE7";
/** Production student email for Michelle Makarem. */
export const MICHELLE_MAKAREM_EMAIL = "makaremmichelle7@gmail.com";

export type CalendarInviteParty = {
  clerkUserId?: string | null;
  email?: string | null;
};

export type CalendarPairAdminInvite = {
  studentClerkUserIds: readonly string[];
  studentEmails: readonly string[];
  tutorClerkUserIds: readonly string[];
  tutorEmails: readonly string[];
  adminEmails: readonly string[];
};

/**
 * Student+tutor pairs whose Google Calendar invites always include an admin
 * guest. Matching uses Clerk ids or emails, never display names.
 * Currently only Michelle Makarem booked with Xavier Morales.
 */
export const CALENDAR_PAIR_ADMIN_INVITES: readonly CalendarPairAdminInvite[] = [
  {
    studentClerkUserIds: [MICHELLE_MAKAREM_CLERK_USER_ID],
    studentEmails: [MICHELLE_MAKAREM_EMAIL],
    tutorClerkUserIds: [CANONICAL_XAVIER_CLERK_USER_ID],
    tutorEmails: [CANONICAL_XAVIER_EMAIL],
    adminEmails: [ADMIN_INBOX_EMAIL],
  },
];

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function partyMatches(
  party: CalendarInviteParty | null | undefined,
  clerkUserIds: readonly string[],
  emails: readonly string[],
): boolean {
  if (!party) return false;
  const clerkUserId = party.clerkUserId?.trim() ?? "";
  if (clerkUserId && clerkUserIds.some((id) => id === clerkUserId)) return true;
  const email = normalizeEmail(party.email);
  return Boolean(email) && emails.some((candidate) => normalizeEmail(candidate) === email);
}

/** Admin inboxes that must be guests on this student+tutor calendar invite. */
export function adminAttendeeEmailsForPair(
  student: CalendarInviteParty | null | undefined,
  tutor: CalendarInviteParty | null | undefined,
): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const rule of CALENDAR_PAIR_ADMIN_INVITES) {
    if (!partyMatches(student, rule.studentClerkUserIds, rule.studentEmails)) continue;
    if (!partyMatches(tutor, rule.tutorClerkUserIds, rule.tutorEmails)) continue;
    for (const email of rule.adminEmails) {
      const normalized = normalizeEmail(email);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      emails.push(normalized);
    }
  }
  return emails;
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
