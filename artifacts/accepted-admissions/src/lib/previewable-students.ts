export type PreviewableStudent = {
  id: string;
  name: string;
  email: string;
};

export function previewableStudents(input: {
  curriculumClients?: Array<{ id: string; name: string; email: string }> | null;
  overviewUsers?: Array<{
    id: string;
    displayName: string;
    email: string;
    role: string;
  }> | null;
}): PreviewableStudent[] {
  const fromCurriculum = (input.curriculumClients ?? []).map((client) => ({
    id: client.id,
    name: client.name,
    email: client.email,
  }));
  if (fromCurriculum.length > 0) return fromCurriculum;
  return (input.overviewUsers ?? [])
    .filter((user) => user.role === "student")
    .map((user) => ({
      id: user.id,
      name: user.displayName,
      email: user.email,
    }));
}
