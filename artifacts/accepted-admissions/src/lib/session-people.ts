export type NamedPerson = {
  id: string;
  name: string;
  email?: string | null;
};

export type OverviewUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
};

export function mergeSessionPeople<T extends NamedPerson>(
  primary: T[],
  overviewUsers: OverviewUser[],
  role: "student" | "tutor",
  extra?: Partial<T>,
): T[] {
  const extras = overviewUsers
    .filter((user) => user.role === role && !primary.some((person) => person.id === user.id))
    .map((user) => ({
      ...(extra ?? {}),
      id: user.id,
      name: user.displayName,
      email: user.email,
    })) as T[];
  return [...primary, ...extras];
}

export function filterPeopleByQuery<T extends NamedPerson>(people: T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  if (!term) return people;
  return people.filter((person) =>
    `${person.name} ${person.email ?? ""}`.toLowerCase().includes(term),
  );
}

export function personOptionLabel(person: NamedPerson): string {
  return person.email ? `${person.name} · ${person.email}` : person.name;
}

export function assignmentSubjectOptions(tutorSubjects: string[] = []): string[] {
  const options: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = trimmed.toUpperCase() === "ENGLISH" ? "IELTS" : trimmed;
    if (!options.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      options.push(normalized);
    }
  };
  add("SAT");
  add("IELTS");
  for (const subject of tutorSubjects) add(subject);
  return options;
}

export function isSupersededAccessGrant(grant: {
  active: boolean;
  notes?: string | null;
  clerkUserId?: string | null;
  email?: string | null;
}): boolean {
  if (grant.active) return false;
  const notes = grant.notes ?? "";
  const clerkUserId = grant.clerkUserId ?? "";
  const email = (grant.email ?? "").trim().toLowerCase();
  return (
    notes.startsWith("SUPERSEDED:") ||
    clerkUserId.startsWith("retired:") ||
    clerkUserId === "user_3IsvKVDGAg5KdvwHhvODf2VFqtd" ||
    email === "xavier.rmz6@gmail.com" ||
    email === "xsfam6@gmail.com" ||
    email.endsWith("@retired.accepted.local")
  );
}

export function isVisiblePeopleTutor(tutor: {
  active: boolean;
  name: string;
  email: string;
}): boolean {
  if (tutor.active) return true;
  const email = tutor.email.trim().toLowerCase();
  return !(
    tutor.name === "Xavier Morales" && email !== "xaver.rmz6@gmail.com"
  );
}
