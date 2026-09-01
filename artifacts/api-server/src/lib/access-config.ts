import type { AppUser } from "@workspace/db";

export type ConfiguredAccess = {
  role: AppUser["role"];
  subject: string;
};

export type AccessDecision = {
  access: ConfiguredAccess | null;
  conflict: boolean;
};

export const ACCESS_ROLE_CATEGORIES = [
  "administrator",
  "sat_tutor",
  "english_tutor",
  "tutor",
  "student",
  "viewer",
] as const;

export type AccessRoleCategory = (typeof ACCESS_ROLE_CATEGORIES)[number];

export type AccessConfigurationConflict = {
  roleCategories: AccessRoleCategory[];
};

function configuredSet(
  env: NodeJS.ProcessEnv,
  name: string,
  normalize: (value: string) => string = (value) => value.trim(),
): Set<string> {
  return new Set((env[name] ?? "").split(",").map(normalize).filter(Boolean));
}

export function normalizeProvisionedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function verifiedPrimaryEmail(user: {
  primaryEmailAddress?: {
    emailAddress?: string;
    verification?: { status?: string | null } | null;
  } | null;
}): string | undefined {
  const primaryEmail = user.primaryEmailAddress;
  if (primaryEmail?.verification?.status !== "verified") return undefined;
  return primaryEmail.emailAddress
    ? normalizeProvisionedEmail(primaryEmail.emailAddress)
    : undefined;
}

const accessAllowlistDefinitions: Array<{
  kind: "clerkId" | "email";
  envName: string;
  roleCategory: AccessRoleCategory;
  normalize?: (value: string) => string;
}> = [
  {
    kind: "clerkId",
    envName: "ACCEPTED_ADMIN_CLERK_USER_IDS",
    roleCategory: "administrator",
  },
  {
    kind: "clerkId",
    envName: "ACCEPTED_SAT_TUTOR_CLERK_USER_IDS",
    roleCategory: "sat_tutor",
  },
  {
    kind: "clerkId",
    envName: "ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS",
    roleCategory: "english_tutor",
  },
  {
    kind: "clerkId",
    envName: "ACCEPTED_TUTOR_CLERK_USER_IDS",
    roleCategory: "tutor",
  },
  {
    kind: "clerkId",
    envName: "ACCEPTED_STUDENT_CLERK_USER_IDS",
    roleCategory: "student",
  },
  {
    kind: "clerkId",
    envName: "ACCEPTED_VIEWER_CLERK_USER_IDS",
    roleCategory: "viewer",
  },
  {
    kind: "email",
    envName: "ACCEPTED_ADMIN_EMAILS",
    roleCategory: "administrator",
    normalize: normalizeProvisionedEmail,
  },
  {
    kind: "email",
    envName: "ACCEPTED_SAT_TUTOR_EMAILS",
    roleCategory: "sat_tutor",
    normalize: normalizeProvisionedEmail,
  },
  {
    kind: "email",
    envName: "ACCEPTED_ENGLISH_TUTOR_EMAILS",
    roleCategory: "english_tutor",
    normalize: normalizeProvisionedEmail,
  },
  {
    kind: "email",
    envName: "ACCEPTED_TUTOR_EMAILS",
    roleCategory: "tutor",
    normalize: normalizeProvisionedEmail,
  },
  {
    kind: "email",
    envName: "ACCEPTED_STUDENT_EMAILS",
    roleCategory: "student",
    normalize: normalizeProvisionedEmail,
  },
  {
    kind: "email",
    envName: "ACCEPTED_VIEWER_EMAILS",
    roleCategory: "viewer",
    normalize: normalizeProvisionedEmail,
  },
];

export function configuredAccessConflicts(
  env: NodeJS.ProcessEnv = process.env,
): AccessConfigurationConflict[] {
  const valuesByKind = new Map<
    "clerkId" | "email",
    Map<string, Set<AccessRoleCategory>>
  >([
    ["clerkId", new Map()],
    ["email", new Map()],
  ]);

  for (const definition of accessAllowlistDefinitions) {
    const values = configuredSet(
      env,
      definition.envName,
      definition.normalize,
    );
    const valuesForKind = valuesByKind.get(definition.kind)!;
    for (const value of values) {
      const roleCategories =
        valuesForKind.get(value) ?? new Set<AccessRoleCategory>();
      roleCategories.add(definition.roleCategory);
      valuesForKind.set(value, roleCategories);
    }
  }

  const categoryOrder = new Map(
    ACCESS_ROLE_CATEGORIES.map((category, index) => [category, index]),
  );
  return [...valuesByKind.values()]
    .flatMap((values) => [...values.values()])
    .filter((roleCategories) => roleCategories.size > 1)
    .map((roleCategories) => ({
      roleCategories: [...roleCategories].sort(
        (left, right) => categoryOrder.get(left)! - categoryOrder.get(right)!,
      ),
    }));
}

export function configuredAccess(
  clerkUserId: string,
  email?: string,
  env: NodeJS.ProcessEnv = process.env,
): AccessDecision {
  const adminIds = configuredSet(env, "ACCEPTED_ADMIN_CLERK_USER_IDS");
  const satTutorIds = configuredSet(env, "ACCEPTED_SAT_TUTOR_CLERK_USER_IDS");
  const englishTutorIds = configuredSet(
    env,
    "ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS",
  );
  const tutorIds = configuredSet(env, "ACCEPTED_TUTOR_CLERK_USER_IDS");
  const studentIds = configuredSet(env, "ACCEPTED_STUDENT_CLERK_USER_IDS");
  const viewerIds = configuredSet(env, "ACCEPTED_VIEWER_CLERK_USER_IDS");

  const idMatches: ConfiguredAccess[] = [];
  if (adminIds.has(clerkUserId)) {
    idMatches.push({ role: "administrator", subject: "all" });
  }
  if (satTutorIds.has(clerkUserId)) {
    idMatches.push({ role: "tutor", subject: "SAT" });
  }
  if (englishTutorIds.has(clerkUserId)) {
    idMatches.push({ role: "tutor", subject: "IELTS" });
  }
  if (tutorIds.has(clerkUserId)) {
    idMatches.push({ role: "tutor", subject: "all" });
  }
  if (studentIds.has(clerkUserId)) {
    idMatches.push({ role: "student", subject: "all" });
  }
  if (viewerIds.has(clerkUserId)) {
    idMatches.push({
      role: "viewer",
      subject: "student:taito0525@gmail.com",
    });
  }
  if (idMatches.length > 1) return { access: null, conflict: true };
  if (idMatches.length === 1) {
    return { access: idMatches[0]!, conflict: false };
  }

  const normalizedEmail = email ? normalizeProvisionedEmail(email) : "";
  if (!normalizedEmail) return { access: null, conflict: false };

  const emailSet = (name: string) =>
    configuredSet(env, name, normalizeProvisionedEmail);
  const emailMatches: ConfiguredAccess[] = [];
  if (emailSet("ACCEPTED_ADMIN_EMAILS").has(normalizedEmail)) {
    emailMatches.push({ role: "administrator", subject: "all" });
  }
  if (emailSet("ACCEPTED_SAT_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push({ role: "tutor", subject: "SAT" });
  }
  if (emailSet("ACCEPTED_ENGLISH_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push({ role: "tutor", subject: "IELTS" });
  }
  if (emailSet("ACCEPTED_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push({ role: "tutor", subject: "all" });
  }
  if (emailSet("ACCEPTED_STUDENT_EMAILS").has(normalizedEmail)) {
    emailMatches.push({ role: "student", subject: "all" });
  }
  if (emailSet("ACCEPTED_VIEWER_EMAILS").has(normalizedEmail)) {
    emailMatches.push({
      role: "viewer",
      subject: "student:taito0525@gmail.com",
    });
  }

  if (emailMatches.length > 1) return { access: null, conflict: true };
  return { access: emailMatches[0] ?? null, conflict: false };
}
