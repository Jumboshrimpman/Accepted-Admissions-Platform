import type { AppUser } from "@workspace/db";

export type ConfiguredAccess = {
  role: AppUser["role"];
  subject: string;
};

export type AccessDecision = {
  access: ConfiguredAccess | null;
  conflict: boolean;
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
