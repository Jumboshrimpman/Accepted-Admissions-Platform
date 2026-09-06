import type { AppUser } from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import { isRetiredXavierIdentity } from "./xavier-identity.ts";

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

/** Roles that administrators may provision from the portal UI. */
export const PROVISIONABLE_ROLE_CATEGORIES = [
  "sat_tutor",
  "english_tutor",
  "tutor",
  "student",
] as const;

export type ProvisionableRoleCategory =
  (typeof PROVISIONABLE_ROLE_CATEGORIES)[number];

export type AccessConfigurationConflict = {
  roleCategories: AccessRoleCategory[];
};

export type DatabaseAccessGrant = {
  email: string;
  clerkUserId: string | null;
  roleCategory: ProvisionableRoleCategory;
  active?: boolean;
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

export function accessFromRoleCategory(
  roleCategory: AccessRoleCategory,
): ConfiguredAccess {
  switch (roleCategory) {
    case "administrator":
      return { role: "administrator", subject: "all" };
    case "sat_tutor":
      return { role: "tutor", subject: "SAT" };
    case "english_tutor":
      return { role: "tutor", subject: "IELTS" };
    case "tutor":
      return { role: "tutor", subject: "all" };
    case "student":
      return { role: "student", subject: "all" };
    case "viewer":
      return {
        role: "viewer",
        subject: "student:taito0525@gmail.com",
      };
  }
}

export function isProvisionableRoleCategory(
  value: string,
): value is ProvisionableRoleCategory {
  return (PROVISIONABLE_ROLE_CATEGORIES as readonly string[]).includes(value);
}

export function subjectsForRoleCategory(
  roleCategory: ProvisionableRoleCategory,
): string[] {
  switch (roleCategory) {
    case "sat_tutor":
      return ["SAT"];
    case "english_tutor":
      return ["IELTS", "English"];
    case "tutor":
      return ["SAT", "IELTS", "English"];
    case "student":
      return [];
  }
}

export function tutorTitleForRoleCategory(
  roleCategory: Exclude<ProvisionableRoleCategory, "student">,
): string {
  switch (roleCategory) {
    case "sat_tutor":
      return "SAT Tutor";
    case "english_tutor":
      return "English & IELTS Tutor";
    case "tutor":
      return "Tutor";
  }
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

function decisionFromMatches(matches: ConfiguredAccess[]): AccessDecision {
  if (matches.length > 1) {
    const unique = new Map(
      matches.map((match) => [`${match.role}:${match.subject}`, match]),
    );
    if (unique.size > 1) return { access: null, conflict: true };
    return { access: [...unique.values()][0]!, conflict: false };
  }
  if (matches.length === 1) {
    return { access: matches[0]!, conflict: false };
  }
  return { access: null, conflict: false };
}

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
  return resolvePortalAccess(clerkUserId, email, { env });
}

export function databaseConfiguredAccess(
  clerkUserId: string,
  email: string | undefined,
  grants: DatabaseAccessGrant[],
): AccessDecision {
  const normalizedEmail = email ? normalizeProvisionedEmail(email) : "";
  const matches: ConfiguredAccess[] = [];
  for (const grant of grants) {
    if (grant.active === false) continue;
    const grantEmail = normalizeProvisionedEmail(grant.email);
    const clerkMatch =
      Boolean(grant.clerkUserId) && grant.clerkUserId === clerkUserId;
    const emailMatch =
      Boolean(normalizedEmail) && grantEmail === normalizedEmail;
    if (!clerkMatch && !emailMatch) continue;
    matches.push(accessFromRoleCategory(grant.roleCategory));
  }
  return decisionFromMatches(matches);
}

export function mergeAccessDecisions(
  ...decisions: AccessDecision[]
): AccessDecision {
  if (decisions.some((decision) => decision.conflict)) {
    return { access: null, conflict: true };
  }
  const matches = decisions
    .map((decision) => decision.access)
    .filter((access): access is ConfiguredAccess => Boolean(access));
  return decisionFromMatches(matches);
}

export function resolvePortalAccess(
  clerkUserId: string,
  email?: string,
  options: {
    env?: NodeJS.ProcessEnv;
    databaseGrants?: DatabaseAccessGrant[];
  } = {},
): AccessDecision {
  if (isRetiredXavierIdentity(clerkUserId, email)) {
    return { access: null, conflict: false };
  }
  const env = options.env ?? process.env;
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
    idMatches.push(accessFromRoleCategory("administrator"));
  }
  if (satTutorIds.has(clerkUserId)) {
    idMatches.push(accessFromRoleCategory("sat_tutor"));
  }
  if (englishTutorIds.has(clerkUserId)) {
    idMatches.push(accessFromRoleCategory("english_tutor"));
  }
  if (tutorIds.has(clerkUserId)) {
    idMatches.push(accessFromRoleCategory("tutor"));
  }
  if (studentIds.has(clerkUserId)) {
    idMatches.push(accessFromRoleCategory("student"));
  }
  if (viewerIds.has(clerkUserId)) {
    idMatches.push(accessFromRoleCategory("viewer"));
  }
  const idDecision = decisionFromMatches(idMatches);
  if (idDecision.access || idDecision.conflict) {
    return mergeAccessDecisions(
      idDecision,
      databaseConfiguredAccess(
        clerkUserId,
        email,
        options.databaseGrants ?? [],
      ),
    );
  }

  const normalizedEmail = email ? normalizeProvisionedEmail(email) : "";
  if (!normalizedEmail) {
    return databaseConfiguredAccess(
      clerkUserId,
      email,
      options.databaseGrants ?? [],
    );
  }

  const emailSet = (name: string) =>
    configuredSet(env, name, normalizeProvisionedEmail);
  const emailMatches: ConfiguredAccess[] = [];
  if (emailSet("ACCEPTED_ADMIN_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("administrator"));
  }
  if (emailSet("ACCEPTED_SAT_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("sat_tutor"));
  }
  if (emailSet("ACCEPTED_ENGLISH_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("english_tutor"));
  }
  if (emailSet("ACCEPTED_TUTOR_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("tutor"));
  }
  if (emailSet("ACCEPTED_STUDENT_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("student"));
  }
  if (emailSet("ACCEPTED_VIEWER_EMAILS").has(normalizedEmail)) {
    emailMatches.push(accessFromRoleCategory("viewer"));
  }

  return mergeAccessDecisions(
    decisionFromMatches(emailMatches),
    databaseConfiguredAccess(
      clerkUserId,
      normalizedEmail,
      options.databaseGrants ?? [],
    ),
  );
}

/** Returns env role categories that already claim this identity. */
export function envRoleCategoriesForIdentity(
  clerkUserId: string | undefined,
  email: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AccessRoleCategory[] {
  if (isRetiredXavierIdentity(clerkUserId, email)) {
    return [];
  }
  const categories = new Set<AccessRoleCategory>();
  const normalizedEmail = email ? normalizeProvisionedEmail(email) : "";
  for (const definition of accessAllowlistDefinitions) {
    const values = configuredSet(
      env,
      definition.envName,
      definition.normalize,
    );
    if (definition.kind === "clerkId" && clerkUserId && values.has(clerkUserId)) {
      categories.add(definition.roleCategory);
    }
    if (
      definition.kind === "email" &&
      normalizedEmail &&
      values.has(normalizedEmail)
    ) {
      categories.add(definition.roleCategory);
    }
  }
  return [...categories];
}
