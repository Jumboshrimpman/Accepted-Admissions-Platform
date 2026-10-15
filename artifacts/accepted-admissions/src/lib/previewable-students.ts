export type PreviewableStudent = {
  id: string;
  name: string;
  email: string;
};

/** Canonical Neel Dharni client. Preview stays available when his user row is missing. */
export const NEEL_DHARNI_PREVIEW_CLIENT: PreviewableStudent = {
  id: "6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19",
  name: "Neel Dharni",
  email: "samakubba@gmail.com",
};

function withNeelDharni(students: PreviewableStudent[]): PreviewableStudent[] {
  if (students.some((student) => student.id === NEEL_DHARNI_PREVIEW_CLIENT.id)) {
    return students;
  }
  return [...students, NEEL_DHARNI_PREVIEW_CLIENT];
}

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
  const listed =
    fromCurriculum.length > 0
      ? fromCurriculum
      : (input.overviewUsers ?? [])
          .filter((user) => user.role === "student")
          .map((user) => ({
            id: user.id,
            name: user.displayName,
            email: user.email,
          }));
  return withNeelDharni(listed);
}
