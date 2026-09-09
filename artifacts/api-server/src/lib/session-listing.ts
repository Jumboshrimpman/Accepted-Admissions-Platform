/** Student curriculum / homework destinations never include cancelled bookings. */
export function isCancelledBooking(
  session: { bookingStatus?: string | null },
): boolean {
  return session.bookingStatus === "cancelled";
}

export function isStudentCurriculumSession(
  session: { bookingStatus?: string | null; status?: string | null },
): boolean {
  return !isCancelledBooking(session);
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
