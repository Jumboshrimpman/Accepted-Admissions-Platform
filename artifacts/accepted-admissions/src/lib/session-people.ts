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
