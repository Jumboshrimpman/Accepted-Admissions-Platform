/**
 * Standalone skill practice on a session (for example an IELTS Listening test).
 *
 * Rows with this delivery phase are deliberately outside the automatic session
 * pipelines: pre-work dedupe, pre-work reminders, hard SAT set provisioning and
 * in-session practice prep all select `before_session` / `during_session` rows
 * only, so they never archive, refill, retitle or email about these sets.
 * Students still see and take them like normal quizzes.
 */
export const SKILL_PRACTICE_PHASE = "skill_practice" as const;

export function isSkillPracticeAssignment(row: { deliveryPhase?: string | null } | null | undefined): boolean {
  return row?.deliveryPhase === SKILL_PRACTICE_PHASE;
}
