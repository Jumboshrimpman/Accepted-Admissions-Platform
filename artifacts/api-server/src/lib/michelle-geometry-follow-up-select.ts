export function isCompletedXavierSession(
  session: {
    dateTime: Date;
    status?: string | null;
    bookingStatus?: string | null;
    cancelledAt?: Date | null;
  },
  now: Date,
): boolean {
  if (session.cancelledAt) return false;
  const booking = session.bookingStatus?.trim().toLowerCase() ?? "";
  if (booking === "cancelled" || booking === "canceled") return false;
  if ((session.status ?? "").trim().toLowerCase() === "archived") return false;
  return session.dateTime.getTime() <= now.getTime();
}

/** Latest non-cancelled session whose start is already in the past. */
export function pickMostRecentCompletedSession<T extends { dateTime: Date }>(
  sessions: readonly T[],
  now: Date,
  isEligible: (session: T) => boolean = (session) =>
    isCompletedXavierSession(session, now),
): T | null {
  const eligible = sessions.filter((session) => isEligible(session));
  eligible.sort((left, right) => right.dateTime.getTime() - left.dateTime.getTime());
  return eligible[0] ?? null;
}
