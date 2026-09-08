export type SessionScheduleInstant = {
  dateTime: Date;
  durationMinutes?: number | null;
};

export type SessionScheduleChange = "cancel" | "reschedule";

export function sessionEffectiveEnd(session: SessionScheduleInstant): Date {
  const minutes = Number(session.durationMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return new Date(session.dateTime.getTime() + minutes * 60_000);
  }
  return session.dateTime;
}

export function isPastSession(
  session: SessionScheduleInstant,
  now: Date = new Date(),
): boolean {
  return sessionEffectiveEnd(session).getTime() <= now.getTime();
}

export function sessionScheduleChangeError(
  session: SessionScheduleInstant,
  action: SessionScheduleChange,
  now: Date = new Date(),
): { status: number; code: string; message: string } | null {
  if (isPastSession(session, now)) {
    return {
      status: 409,
      code: "SESSION_IN_THE_PAST",
      message:
        action === "cancel"
          ? "A past session cannot be cancelled."
          : "A past session cannot be rescheduled.",
    };
  }
  if (session.dateTime.getTime() <= now.getTime()) {
    return {
      status: 409,
      code: "SESSION_STARTED",
      message:
        action === "cancel"
          ? "A session that has started cannot be cancelled."
          : "A session that has started cannot be rescheduled.",
    };
  }
  return null;
}
