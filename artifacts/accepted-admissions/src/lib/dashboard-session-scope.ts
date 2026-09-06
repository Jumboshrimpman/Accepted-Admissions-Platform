export function sessionsForDashboardRole<T>(
  sessions: T[],
  viewer: { id: string; role: string },
): T[] {
  return sessions.filter((session) => {
    const row = session as {
      tutor?: { id?: string } | null;
      student?: { id?: string } | null;
    };
    if (viewer.role === "tutor") {
      return row.tutor?.id === viewer.id;
    }
    if (viewer.role === "student" || viewer.role === "viewer") {
      return !row.student?.id || row.student.id === viewer.id;
    }
    return true;
  });
}
