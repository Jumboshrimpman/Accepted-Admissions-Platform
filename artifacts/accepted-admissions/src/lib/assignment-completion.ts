export type AssignmentCompletionKind = "not_started" | "in_progress" | "paused" | "submitted";

export function describeAssignmentCompletion(input: {
  attemptStatus?: string | null;
  score?: number | null;
  submittedAt?: string | Date | null;
  timezone?: string | null;
}): { kind: AssignmentCompletionKind; label: string } {
  if (input.attemptStatus === "active") {
    return { kind: "in_progress", label: "In progress" };
  }
  if (input.attemptStatus === "paused") {
    return { kind: "paused", label: "Paused" };
  }
  if (input.attemptStatus === "submitted" || input.attemptStatus === "expired") {
    const score =
      typeof input.score === "number" && Number.isFinite(input.score)
        ? `${Math.round(input.score)}%`
        : null;
    const when = formatSubmittedAt(input.submittedAt, input.timezone);
    const detail = [score, when].filter(Boolean).join(" · ");
    return {
      kind: "submitted",
      label: detail ? `Submitted · ${detail}` : "Submitted",
    };
  }
  return { kind: "not_started", label: "Not started" };
}

function formatSubmittedAt(
  value: string | Date | null | undefined,
  timezone?: string | null,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
