/**
 * Clients who do not get automatic pre-work unless a later rule opens it.
 * Michelle's Nov 16 sets are locked: never auto-refresh them. From sessions
 * after Nov 16, her SAT pre-work, in-session, and reserve sets may be
 * generated as hard-only.
 */
export const MICHELLE_MAKAREM_USER_ID = "b21bc32a-82c3-4252-a702-daa3fcdd23af";
export const MICHELLE_NOV16_SOPHIA_LAMAS_SESSION_ID = "8a7d4e25-2ca5-4b4e-ba15-5451dfef7598";
/** Exclusive cutoff. The Nov 16 session stays hand-assigned. */
export const MICHELLE_AUTO_PREWORK_AFTER_DATE_KEY = "2026-11-16";

const NO_AUTO_PREWORK_CLIENT_USER_IDS: ReadonlySet<string> = new Set([MICHELLE_MAKAREM_USER_ID]);

function sessionDateKeyEt(
  dateTime: Date | string | null | undefined,
  timezone?: string | null,
): string | null {
  if (!dateTime) return null;
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone?.trim() || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function skipsAutoPrework(session: {
  id?: string | null;
  clientUserId?: string | null;
  dateTime?: Date | string | null;
  timezone?: string | null;
}): boolean {
  const id = session.clientUserId?.trim().toLowerCase();
  if (!id || !NO_AUTO_PREWORK_CLIENT_USER_IDS.has(id)) return false;
  if (session.id?.trim() === MICHELLE_NOV16_SOPHIA_LAMAS_SESSION_ID) return true;
  const dateKey = sessionDateKeyEt(session.dateTime, session.timezone);
  if (dateKey && dateKey > MICHELLE_AUTO_PREWORK_AFTER_DATE_KEY) return false;
  return true;
}
