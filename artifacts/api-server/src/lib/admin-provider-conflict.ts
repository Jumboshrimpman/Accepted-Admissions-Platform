/** Prefix of the only conflict an admin may override. Matches adminSessionConflicts. */
export const PROVIDER_CALENDAR_BUSY_PREFIX = "Tutor's connected calendar is busy";

export function isProviderCalendarBusyConflict(conflict: string): boolean {
  return conflict.startsWith(PROVIDER_CALENDAR_BUSY_PREFIX);
}

/**
 * Provider free/busy lines drop out only when the admin asked to override them.
 * Tutor overlaps, client overlaps, and shared-Meet collisions stay in `blocking`.
 * Without the flag, `blocking` is the original list.
 */
export function sessionConflictsAfterProviderOverride(
  conflicts: readonly string[],
  overrideProviderConflict: boolean,
): { blocking: string[]; overridden: string[] } {
  if (!overrideProviderConflict) {
    return { blocking: [...conflicts], overridden: [] };
  }
  const overridden: string[] = [];
  const blocking: string[] = [];
  for (const conflict of conflicts) {
    if (isProviderCalendarBusyConflict(conflict)) overridden.push(conflict);
    else blocking.push(conflict);
  }
  return { blocking, overridden };
}

export function providerConflictOverrideLog(input: {
  sessionId: string;
  tutorUserId: string | null;
  dateTime: Date;
  conflicts: readonly string[];
}): {
  event: "session.provider_conflict_overridden";
  sessionId: string;
  tutorUserId: string | null;
  dateTime: string;
  conflict: string;
} {
  return {
    event: "session.provider_conflict_overridden",
    sessionId: input.sessionId,
    tutorUserId: input.tutorUserId,
    dateTime: input.dateTime.toISOString(),
    conflict: input.conflicts.join("\n"),
  };
}
