/**
 * Post-session homework uses `before_session` because the assignments API
 * has no `after_session` phase. These titles stay out of pre-work dedupe
 * so a follow-up does not replace or block in-session practice and routine
 * pre-work.
 */
export const GEOMETRY_SAT_FOLLOW_UP_TITLE = "Geometry SAT Questions";

export const GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE = "Geometry Area and Volume";

const POST_SESSION_FOLLOW_UP_TITLES = new Set<string>([
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
]);

export function isPostSessionFollowUpTitle(title?: string | null): boolean {
  return POST_SESSION_FOLLOW_UP_TITLES.has(title?.trim() ?? "");
}
