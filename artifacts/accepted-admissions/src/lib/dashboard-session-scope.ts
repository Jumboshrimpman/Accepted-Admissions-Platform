export function sessionsForDashboardRole<
  T extends { tutor?: { id?: string } | null; student?: { id?: string } | null },
>(
  sessions: T[],
  viewer: { id: string; role: string },
): T[] {
  if (viewer.role === "tutor") {
    return sessions.filter((session) => session.tutor?.id === viewer.id);
  }
  if (viewer.role === "student" || viewer.role === "viewer") {
    return sessions.filter(
      (session) => !session.student?.id || session.student.id === viewer.id,
    );
  }
  return sessions;
}
