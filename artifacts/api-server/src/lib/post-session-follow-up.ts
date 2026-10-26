/**
 * Post-session homework uses `before_session` because the assignments API
 * has no `after_session` phase. These titles stay out of pre-work dedupe
 * so a follow-up does not replace or block in-session practice and routine
 * pre-work.
 */
export const GEOMETRY_SAT_FOLLOW_UP_TITLE = "Geometry SAT Questions";

export const GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE = "Geometry Area and Volume";

/** Practice A/B from problem 5 onward, plus full sets 7–12. 22 questions, 33 minutes. */
export const SAT_MATH_FOLLOW_UP_TITLE = "SAT Math Problems";

/** Practice A and Practice B for factoring sets 1–13. 26 questions, 39 minutes. */
export const FACTORING_QUIZ_FOLLOW_UP_TITLE = "Factoring Quiz";

/** 12 questions from Michelle's Oct 18 session, 25 minutes. */
export const OCT18_SESSION_REVIEW_TITLE = "Oct 18 Session Review Quiz";

/** 10 questions from Michelle's Oct 25 session, 30-minute soft limit. */
export const OCT25_SESSION_REVIEW_TITLE = "Oct 25 Session Review Quiz";

/** Unanswered questions from Taito's Oct 23 English in-session set. 60 minutes, 2 attempts. */
export const OCT23_REMAINING_HOMEWORK_TITLE = "Oct 23 In-Session Practice — Remaining Questions";

const POST_SESSION_FOLLOW_UP_TITLES = new Set<string>([
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  OCT18_SESSION_REVIEW_TITLE,
  OCT25_SESSION_REVIEW_TITLE,
  OCT23_REMAINING_HOMEWORK_TITLE,
]);

export function isPostSessionFollowUpTitle(title?: string | null): boolean {
  return POST_SESSION_FOLLOW_UP_TITLES.has(title?.trim() ?? "");
}
