/** Student curriculum / homework destinations never include cancelled bookings. */
export function isCancelledBooking(
  session: { bookingStatus?: string | null; cancelledAt?: Date | string | null },
): boolean {
  if (session.cancelledAt) return true;
  const status = session.bookingStatus?.trim().toLowerCase() ?? "";
  return status === "cancelled" || status === "canceled";
}

export function isStudentCurriculumSession(
  session: {
    bookingStatus?: string | null;
    status?: string | null;
    cancelledAt?: Date | string | null;
  },
): boolean {
  if (isCancelledBooking(session)) return false;
  return (session.status ?? "").trim().toLowerCase() !== "archived";
}

/** Upcoming lists never include cancelled or archived meetings, including for admins. */
export function isUpcomingListedSession(
  session: {
    dateTime: Date | string;
    bookingStatus?: string | null;
    status?: string | null;
    cancelledAt?: Date | string | null;
  },
  now = Date.now(),
): boolean {
  return new Date(session.dateTime).getTime() >= now && isStudentCurriculumSession(session);
}

/** Client booking lists ("Your booked sessions") never return cancelled or archived rows. */
export function liveClientBookingSessions<T extends { bookingStatus?: string | null; status?: string | null }>(
  sessions: readonly T[],
): T[] {
  return sessions.filter((session) => isStudentCurriculumSession(session));
}

/** Student, parent, and tutor lists hide cancelled bookings. Admin history may keep them. */
export function hidesCancelledSessions(role: string | null | undefined): boolean {
  return role === "student" || role === "viewer" || role === "tutor";
}

/** Homework / lesson links tied to a cancelled meeting stay off student and tutor lists. */
export function assignmentTiedToCancelledSession(
  assignment: { sessionId?: string | null },
  cancelledSessionIds: ReadonlySet<string>,
): boolean {
  return Boolean(assignment.sessionId && cancelledSessionIds.has(assignment.sessionId));
}
