/**
 * Taito's Oct 23 in-session attempt. Submit returns its stored result and
 * does not rewrite it. Historical expired in-session rows are left as stored.
 */
export const OCT23_IN_SESSION_ATTEMPT_ID = "e38f62db-f088-435c-aa84-4c5480707f59";

export function inSessionDeliverySkipsTimeLimit(
  deliveryPhase: string | null | undefined,
): boolean {
  return deliveryPhase === "during_session";
}

/** Server expiry applies to hard-timed pre-work, homework, and review quizzes only. */
export function serverTimeLimitReached(input: {
  deliveryPhase: string | null | undefined;
  timeLimitMinutes: number;
  activeSeconds: number;
  softTimeLimit?: boolean | null;
}): boolean {
  if (inSessionDeliverySkipsTimeLimit(input.deliveryPhase)) return false;
  if (input.softTimeLimit) return false;
  return input.activeSeconds >= input.timeLimitMinutes * 60;
}
