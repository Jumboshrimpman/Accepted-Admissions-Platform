export function isBeforeSessionHomework(
  assignments: Array<{ id: string; deliveryPhase?: string | null }>,
  assignmentId: string,
): boolean {
  const assignment = assignments.find((item) => item.id === assignmentId);
  return (assignment?.deliveryPhase ?? "before_session") !== "during_session";
}

export function canShowClearHomework(input: {
  deliveryPhase?: string | null;
  assignmentStatus?: string | null;
  attemptId?: string | null;
}): boolean {
  if (input.deliveryPhase === "during_session") return false;
  if (input.assignmentStatus === "archived") return false;
  return Boolean(input.attemptId);
}
