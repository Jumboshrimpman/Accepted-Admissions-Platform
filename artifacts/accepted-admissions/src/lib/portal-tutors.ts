export type PortalTutor = {
  id: string;
  name: string;
  specialty: string;
};

type TutorInput = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  specialty?: string | null;
};

const KNOWN_TUTOR_FIRST_NAMES = new Set(["eunice", "nika", "xavier"]);

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

function identityKeys(tutor: TutorInput): string[] {
  const keys: string[] = [];
  const id = tutor.id?.trim();
  const email = tutor.email?.trim().toLowerCase();
  const name = tutor.name?.trim();
  if (id) keys.push(`id:${id}`);
  if (email) keys.push(`email:${email}`);
  if (name) {
    keys.push(`name:${normalizeTutorName(name)}`);
    const first = name.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (KNOWN_TUTOR_FIRST_NAMES.has(first)) keys.push(`first:${first}`);
  }
  return keys;
}

function resolveSpecialty(
  tutor: TutorInput,
  subject?: string | null,
): string {
  return (
    subjectSpecialty(subject) ??
    subjectSpecialty(tutor.specialty) ??
    (tutor.specialty?.trim() && tutor.specialty !== "Assigned tutor"
      ? tutor.specialty.trim()
      : "Tutor")
  );
}

function addTutor(
  byKey: Map<string, PortalTutor>,
  tutor: TutorInput | null | undefined,
  subject?: string | null,
) {
  const name = tutor?.name?.trim();
  if (!name || !tutor) return;
  const keys = identityKeys(tutor);
  if (keys.length === 0) return;
  const specialty = resolveSpecialty(tutor, subject);
  let existing: PortalTutor | undefined;
  for (const key of keys) {
    existing = byKey.get(key);
    if (existing) break;
  }
  if (!existing) {
    existing = {
      id: tutor.id?.trim() || tutorKey(null, name),
      name,
      specialty,
    };
  } else {
    if (existing.specialty === "Tutor" && specialty !== "Tutor") {
      existing.specialty = specialty;
    }
    if (tutor.id?.trim() && existing.id === tutorKey(null, existing.name)) {
      existing.id = tutor.id.trim();
    }
    if (name.length > existing.name.length) existing.name = name;
  }
  for (const key of keys) {
    byKey.set(key, existing);
  }
}

const TAITO_PROGRAM_TUTORS: PortalTutor[] = [
  { id: "eunice-chon", name: "Eunice Chon", specialty: "SAT" },
  { id: "nika-raiffe", name: "Nika Raiffe", specialty: "English" },
];

export function portalTutorRosterKey(tutor: Pick<PortalTutor, "id" | "name">): string {
  return normalizeTutorName(tutor.name) || tutor.id;
}

export function portalTutorsFromDashboard(dashboard: {
  credits?: { twelveSessionPlan?: boolean | null } | null;
  courses?: Array<{
    tutors?: Array<{
      id: string;
      name: string;
      email?: string | null;
      specialty?: string | null;
    } | null> | null;
  }>;
  curriculumSessions?: Array<{
    subject?: string | null;
    tutor?: {
      id?: string | null;
      email?: string | null;
      name?: string | null;
      specialty?: string | null;
    } | null;
  }>;
  upcomingSessions?: Array<{
    subject?: string | null;
    tutor?: {
      id?: string | null;
      email?: string | null;
      name?: string | null;
      specialty?: string | null;
    } | null;
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
      const keys = identityKeys(tutor);
      const match = keys.map((key) => byKey.get(key)).find(Boolean);
      if (match) {
        match.specialty = tutor.specialty;
        for (const key of keys) byKey.set(key, match);
        continue;
      }
      addTutor(byKey, tutor, tutor.specialty);
    }
  }
  return [...new Set(byKey.values())].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
