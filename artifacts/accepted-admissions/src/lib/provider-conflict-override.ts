/** Same prefix the API uses for a tutor Google free/busy conflict. */
export const PROVIDER_CALENDAR_BUSY_PREFIX = "Tutor's connected calendar is busy";

export function providerOnlyScheduleConflicts(conflicts: readonly string[]): boolean {
  return conflicts.length > 0 && conflicts.every((conflict) => conflict.startsWith(PROVIDER_CALENDAR_BUSY_PREFIX));
}

export function scheduleConflictFromError(error: unknown): {
  code: string | null;
  conflicts: string[];
} {
  const data = (error as { data?: { code?: string; conflicts?: string[] } } | null)?.data;
  return {
    code: data?.code ?? null,
    conflicts: Array.isArray(data?.conflicts) ? data.conflicts.filter((item) => typeof item === "string") : [],
  };
}

/** Offer the override only for a 409 whose conflicts are all tutor-calendar busy lines. */
export function canOfferProviderConflictOverride(error: unknown): string[] | null {
  const details = scheduleConflictFromError(error);
  if (details.code !== "SCHEDULE_CONFLICT") return null;
  if (!providerOnlyScheduleConflicts(details.conflicts)) return null;
  return details.conflicts;
}
