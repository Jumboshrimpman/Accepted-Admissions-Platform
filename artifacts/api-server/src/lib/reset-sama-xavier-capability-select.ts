// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { EUNICE_TUTOR_EMAIL, NIKA_TUTOR_EMAIL, TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
  RETIRED_XAVIER_CLERK_USER_ID,
} from "./xavier-identity.ts";

/** Session title prefix from the #33 Xavier SAT capability-test seed. */
export const CAPABILITY_RESET_SESSION_TITLE_PREFIX = "SAT capability test — Xavier";
/** Sama’s test student. Not Taito, Michelle, Ryo, Eunice, or Nika. */
export const CAPABILITY_RESET_SAMA_EMAIL = "samapostgrad@gmail.com";

/**
 * One-shot audit marker. A later boot must not wipe a retake that starts
 * after this reset has already run for the session.
 */
export const SAMA_XAVIER_CAPABILITY_RESET_ACTION =
  "ops.sama_xavier_sat_capability_attempt_reset_v1";

/** Michelle’s production client. Kept here so this module does not import the DB. */
const MICHELLE_CLIENT_EMAIL = "makaremmichelle7@gmail.com";
/** Ryo’s production parent login. Kept here so this module does not import the DB. */
const RYO_PARENT_EMAIL = "ryo@jaac.co.jp";

const DENIED_EMAILS = new Set(
  [
    TAITO_STUDENT_EMAIL,
    EUNICE_TUTOR_EMAIL,
    NIKA_TUTOR_EMAIL,
    RYO_PARENT_EMAIL,
    MICHELLE_CLIENT_EMAIL,
  ].map((email) => email.trim().toLowerCase()),
);

export type CapabilityResetIdentity = {
  titlePrefix?: string;
  samaEmail?: string;
  xavierEmail?: string;
  xavierClerkUserId?: string;
  xavierDuplicateClerkUserId?: string;
};

export type CapabilityResetScope = {
  titlePrefix: string;
  samaEmail: string;
  xavierEmail: string;
  xavierClerkUserId: string;
  xavierDuplicateClerkUserId: string;
};

export type CapabilityResetTarget = {
  sessionTitle?: string | null;
  clientEmail?: string | null;
  tutorEmail?: string | null;
  tutorClerkUserId?: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

export function capabilityResetScope(
  identity: CapabilityResetIdentity = {},
): { ok: true; scope: CapabilityResetScope } | { ok: false; reason: string } {
  const titlePrefix = (
    identity.titlePrefix?.trim() || CAPABILITY_RESET_SESSION_TITLE_PREFIX
  ).trim();
  const samaEmail = normalizeEmail(identity.samaEmail ?? CAPABILITY_RESET_SAMA_EMAIL);
  const xavierEmail = normalizeEmail(identity.xavierEmail ?? CANONICAL_XAVIER_EMAIL);
  const xavierClerkUserId = (
    identity.xavierClerkUserId ?? CANONICAL_XAVIER_CLERK_USER_ID
  ).trim();
  const xavierDuplicateClerkUserId = (
    identity.xavierDuplicateClerkUserId ?? RETIRED_XAVIER_CLERK_USER_ID
  ).trim();

  if (!titlePrefix.startsWith(CAPABILITY_RESET_SESSION_TITLE_PREFIX)) {
    return {
      ok: false,
      reason: "Refusing reset: title scope is not the Xavier SAT capability test.",
    };
  }
  if (DENIED_EMAILS.has(samaEmail) || DENIED_EMAILS.has(xavierEmail)) {
    return {
      ok: false,
      reason:
        "Refusing reset: that email is outside the samapostgrad + Xavier capability scope.",
    };
  }
  if (!samaEmail || !xavierEmail || !xavierClerkUserId) {
    return {
      ok: false,
      reason: "Refusing reset: samapostgrad and Xavier must both be identified.",
    };
  }
  return {
    ok: true,
    scope: {
      titlePrefix,
      samaEmail,
      xavierEmail,
      xavierClerkUserId,
      xavierDuplicateClerkUserId,
    },
  };
}

/**
 * True only for Sama’s Xavier SAT capability-test session.
 * Taito, Michelle, Ryo, Eunice, and Nika never match, even if a caller
 * passes their email as the expected student.
 */
export function isSamaXavierCapabilityResetTarget(
  target: CapabilityResetTarget,
  identity: CapabilityResetIdentity = {},
): boolean {
  const resolved = capabilityResetScope(identity);
  if (!resolved.ok) return false;
  const { scope } = resolved;
  const clientEmail = normalizeEmail(target.clientEmail);
  const tutorEmail = normalizeEmail(target.tutorEmail);
  const tutorClerkUserId = target.tutorClerkUserId?.trim() ?? "";
  const title = target.sessionTitle?.trim() ?? "";
  if (clientEmail !== scope.samaEmail || tutorEmail !== scope.xavierEmail) return false;
  if (DENIED_EMAILS.has(clientEmail) || DENIED_EMAILS.has(tutorEmail)) return false;
  if (
    tutorClerkUserId !== scope.xavierClerkUserId &&
    tutorClerkUserId !== scope.xavierDuplicateClerkUserId
  ) {
    return false;
  }
  if (!title.startsWith(CAPABILITY_RESET_SESSION_TITLE_PREFIX)) return false;
  return title.startsWith(scope.titlePrefix);
}

export function capabilitySessionDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Past session days are filed as Complete in the student quiz list. */
export function capabilitySessionDayIsPast(
  dateTime: Date,
  timeZone: string,
  now: Date,
): boolean {
  const zone = timeZone.trim() || "America/New_York";
  const sessionDay = capabilitySessionDayKey(dateTime, zone);
  const today = capabilitySessionDayKey(now, zone);
  if (!sessionDay || !today || sessionDay.includes("undefined")) return false;
  return sessionDay < today;
}

/**
 * Move a past capability session to the next weekday 4pm Eastern so the quiz
 * stays on the open list. Leave the time alone when a calendar event is
 * already attached.
 */
export function shouldRefreshCapabilitySchedule(input: {
  dateTime: Date;
  timezone: string;
  providerEventId?: string | null;
  now: Date;
}): boolean {
  if (input.providerEventId?.trim()) return false;
  return capabilitySessionDayIsPast(input.dateTime, input.timezone, input.now);
}

export type CapabilityAssignmentSnapshot = {
  id: string;
  deliveryPhase?: string | null;
  status?: string | null;
  deadline?: Date | null;
  questionCount: number;
};

export function capabilityAssignmentFixes(
  assignments: readonly CapabilityAssignmentSnapshot[],
  now: Date,
): { publishIds: string[]; clearDeadlineIds: string[] } {
  const before = assignments.filter(
    (assignment) => assignment.deliveryPhase !== "during_session",
  );
  const live = before.filter((assignment) => assignment.status !== "archived");
  const publishIds: string[] = [];
  if (live.length > 0) {
    for (const assignment of live) {
      if (assignment.status !== "published") publishIds.push(assignment.id);
    }
  } else if (before.length > 0) {
    const keeper = [...before].sort((left, right) => {
      if (right.questionCount !== left.questionCount) {
        return right.questionCount - left.questionCount;
      }
      return left.id.localeCompare(right.id);
    })[0];
    if (keeper) publishIds.push(keeper.id);
  }
  const clearDeadlineIds = assignments
    .filter(
      (assignment) =>
        assignment.deadline instanceof Date &&
        assignment.deadline.getTime() <= now.getTime(),
    )
    .map((assignment) => assignment.id);
  return { publishIds, clearDeadlineIds };
}

export function capabilitySessionNeedsVisibilityRestore(session: {
  status?: string | null;
  bookingStatus?: string | null;
  cancelledAt?: Date | null;
  hasHomework?: boolean | null;
  willHavePrework: boolean;
}): {
  publishSession: boolean;
  restoreBooking: boolean;
  setHasHomework: boolean;
} {
  const booking = session.bookingStatus?.trim().toLowerCase() ?? "";
  return {
    publishSession: (session.status ?? "").trim().toLowerCase() !== "published",
    restoreBooking:
      Boolean(session.cancelledAt) || booking === "cancelled" || booking === "canceled",
    setHasHomework: session.willHavePrework && session.hasHomework !== true,
  };
}
