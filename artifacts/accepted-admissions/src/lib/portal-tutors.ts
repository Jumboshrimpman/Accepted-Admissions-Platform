export type PortalTutor = {
  id: string;
  name: string;
  specialty: string;
};

function subjectSpecialty(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (/ielts|english/i.test(text)) return "English";
  if (/^sat\b/i.test(text) || /sat tutor/i.test(text)) return "SAT";
  return null;
}

function tutorKey(id: string | null | undefined, name: string): string {
  return (id?.trim() || name.trim().toLowerCase() || "tutor").replace(/\s+/g, "-");
}

function normalizeTutorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function addTutor(
  byKey: Map<string, PortalTutor>,
  tutor: { id?: string | null; name?: string | null; specialty?: string | null } | null | undefined,
  subject?: string | null,
) {
  const name = tutor?.name?.trim();
  if (!name) return;
  const specialty =
    subjectSpecialty(subject) ??
    subjectSpecialty(tutor.specialty) ??
    (tutor.specialty?.trim() && tutor.specialty !== "Assigned tutor" ? tutor.specialty.trim() : "Tutor");
  const id = tutor.id?.trim() || "";
  const nameKey = normalizeTutorName(name);
  let existing: PortalTutor | undefined;
  let existingKey: string | undefined;
  for (const [key, value] of byKey) {
    if ((id && value.id === id) || normalizeTutorName(value.name) === nameKey) {
      existing = value;
      existingKey = key;
      break;
    }
  }
  if (!existing || !existingKey) {
    byKey.set(nameKey, { id: id || tutorKey(null, name), name, specialty });
    return;
  }
  if (existing.specialty === "Tutor" && specialty !== "Tutor") {
    existing.specialty = specialty;
  }
  if (id && existing.id !== id && existing.id === tutorKey(null, existing.name)) {
    existing.id = id;
  }
}

const TAITO_PROGRAM_TUTORS: PortalTutor[] = [
  { id: "eunice-chon", name: "Eunice Chon", specialty: "SAT" },
  { id: "nika-raiffe", name: "Nika Raiffe", specialty: "English" },
];

export function portalTutorsFromDashboard(dashboard: {
  credits?: { twelveSessionPlan?: boolean | null } | null;
  courses?: Array<{
    tutors?: Array<{ id: string; name: string; specialty?: string | null } | null> | null;
  }>;
  curriculumSessions?: Array<{
    subject?: string | null;
    tutor?: { id?: string | null; name?: string | null; specialty?: string | null } | null;
  }>;
  upcomingSessions?: Array<{
    subject?: string | null;
    tutor?: { id?: string | null; name?: string | null; specialty?: string | null } | null;
  }>;
}): PortalTutor[] {
  const byKey = new Map<string, PortalTutor>();
  for (const course of dashboard.courses ?? []) {
    for (const tutor of course.tutors ?? []) {
      addTutor(byKey, tutor, tutor?.specialty);
    }
  }
  for (const session of [
    ...(dashboard.curriculumSessions ?? []),
    ...(dashboard.upcomingSessions ?? []),
  ]) {
    addTutor(byKey, session.tutor, session.subject);
  }
  if (dashboard.credits?.twelveSessionPlan) {
    for (const tutor of TAITO_PROGRAM_TUTORS) {
      const nameKey = normalizeTutorName(tutor.name);
      const firstName = tutor.name.split(/\s+/)[0]!.toLowerCase();
      const match =
        byKey.get(nameKey) ??
        [...byKey.values()].find((candidate) =>
          candidate.name.toLowerCase().includes(firstName),
        );
      if (match) {
        match.specialty = tutor.specialty;
        continue;
      }
      byKey.set(nameKey, tutor);
    }
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}
