import { describeAssignmentCompletion } from "./assignment-completion.ts";

export type TutorPreworkKind = "none" | "submitted" | "in_progress" | "not_submitted";

export type TutorPreworkStatus = {
  kind: TutorPreworkKind;
  label: string;
  detail: string | null;
  attemptId: string | null;
};

export type PreworkHomework = {
  assignmentId: string;
  attemptStatus?: string | null;
  score?: number | null;
  submittedAt?: string | Date | null;
  attemptId?: string | null;
};

type PreworkAssignment = {
  id: string;
  latestAttemptStatus?: string | null;
  latestScore?: number | null;
  latestAttemptId?: string | null;
};

function attemptRank(status?: string | null): number {
  if (status === "submitted" || status === "expired") return 2;
  if (status === "active" || status === "paused") return 1;
  return 0;
}

/**
 * One row per live pre-work assignment. The assignment summary
 * (`latestAttemptStatus`) is what the student portal already uses. Homework is
 * a second payload and can lag or miss the same attempt, so the stronger of
 * the two is what Manage session shows.
 */
export function mergeListedPreworkAttempts(
  assignments: readonly PreworkAssignment[],
  homework: readonly PreworkHomework[],
): PreworkHomework[] {
  return assignments.map((assignment) => {
    const row = homework.find((item) => item.assignmentId === assignment.id);
    const useAssignment = attemptRank(assignment.latestAttemptStatus) > attemptRank(row?.attemptStatus);
    if (useAssignment) {
      return {
        assignmentId: assignment.id,
        attemptStatus: assignment.latestAttemptStatus,
        score: assignment.latestScore ?? row?.score ?? null,
        submittedAt: row?.submittedAt ?? null,
        attemptId: assignment.latestAttemptId ?? row?.attemptId ?? null,
      };
    }
    return {
      assignmentId: assignment.id,
      attemptStatus: row?.attemptStatus ?? assignment.latestAttemptStatus ?? null,
      score: row?.score ?? assignment.latestScore ?? null,
      submittedAt: row?.submittedAt ?? null,
      attemptId: row?.attemptId ?? assignment.latestAttemptId ?? null,
    };
  });
}

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
    return { kind: "none", label: "No pre-work assigned", detail: null, attemptId: null };
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
    return {
      kind: "submitted",
      label: "Submitted",
      detail,
      attemptId: submitted.attemptId ?? null,
    };
  }
  const started = rows.find(
    (item) => item.attemptStatus === "active" || item.attemptStatus === "paused",
  );
  if (started) {
    return {
      kind: "in_progress",
      label: "In progress",
      detail: null,
      attemptId: started.attemptId ?? null,
    };
  }
  return { kind: "not_submitted", label: "Not started", detail: null, attemptId: null };
}
