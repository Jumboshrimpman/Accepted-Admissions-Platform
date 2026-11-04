import { describeAssignmentCompletion } from "./assignment-completion.ts";

export type TutorPreworkStatus =
  | { kind: "none"; label: string; detail: null }
  | { kind: "submitted" | "in_progress" | "not_submitted"; label: string; detail: string | null };

type PreworkHomework = {
  assignmentId: string;
  attemptStatus?: string | null;
  score?: number | null;
  submittedAt?: string | Date | null;
};

/**
 * Tutor-facing pre-work status. `preworkAssignmentIds` are the session's live
 * before-session (pre-work) assignments; post-session follow-ups are excluded
 * by the caller. Times are shown in ET.
 */
export function tutorPreworkStatus(
  homework: readonly PreworkHomework[],
  preworkAssignmentIds: readonly string[],
): TutorPreworkStatus {
  if (preworkAssignmentIds.length === 0) {
    return { kind: "none", label: "No pre-work assigned", detail: null };
  }
  const ids = new Set(preworkAssignmentIds);
  const rows = homework.filter((item) => ids.has(item.assignmentId));
  const done = (status?: string | null) => status === "submitted" || status === "expired";
  const submitted = rows.find((item) => done(item.attemptStatus));
  if (submitted) {
    const described = describeAssignmentCompletion({
      attemptStatus: submitted.attemptStatus,
      score: submitted.score,
      submittedAt: submitted.submittedAt,
      timezone: "America/New_York",
    });
    const detail = described.label.replace(/^Submitted(?: · )?/, "") || null;
    return { kind: "submitted", label: "Pre-work submitted", detail };
  }
  if (rows.some((item) => item.attemptStatus === "active" || item.attemptStatus === "paused")) {
    return { kind: "in_progress", label: "Pre-work not submitted yet", detail: "In progress" };
  }
  return { kind: "not_submitted", label: "Pre-work not submitted yet", detail: "Not started" };
}
