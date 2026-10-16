import { NEEL_DHARNI_USER_ID, VICTORIA_USER_ID } from "./college-consulting.ts";

/**
 * samakubba@gmail.com currently cannot open Neel's portal for two separate reasons.
 *
 * Clerk's <SignIn withSignUp={false}> shows "Couldn't find your account" when
 * that identifier is not a user in this Clerk instance. This app does not
 * create, invite, or edit Clerk users. Sama created the logins herself; if
 * Clerk still shows that sentence, the address is not in the instance this
 * deployment uses.
 *
 * After Clerk accepts the session, requireAppUser loads users.clerk_user_id,
 * then a portal grant or environment allowlist for the verified primary email.
 * Neel's row is stored with a pending clerk id. Once that row exists, placeholder
 * provisioning follows users.email, not the placeholder constant, so a grant for
 * samakubba@gmail.com is not created. The API then returns 403
 * IDENTITY_NOT_PROVISIONED. The shell copy is: "Your Clerk sign-in succeeded,
 * but this development account is not on the portal access list."
 *
 * An alias lets that verified login open the existing user. It does not copy
 * the login address onto users.email, and it does not change role or name.
 */
export const LOGIN_ALIAS_FAILURE = {
  clerkMessage: "Couldn't find your account.",
  portalCode: "IDENTITY_NOT_PROVISIONED",
  shellCopy:
    "Your Clerk sign-in succeeded, but this development account is not on the portal access list.",
} as const;

export const SOPHIA_SLEIMAN_DISPLAY_NAME = "Sophia Sleiman";

/**
 * Sophia is pinned by user id, not display name. Leave this empty until the
 * production dry run shows her id, then paste it here. Until then, --apply
 * requires --sophia-id.
 */
export const SOPHIA_SLEIMAN_USER_ID = "";

/** Explicitly never linked. xsfam6 stays a retired Xavier address. */
export const REFUSED_LOGIN_ALIAS_EMAILS = [
  "xsfam6@gmail.com",
  "samapostgrad@gmail.com",
] as const;

export type LoginAliasMapping = {
  email: string;
  label: string;
  match: { kind: "userId"; userId: string; role: "student" | "tutor" };
};

export function isPortalAliasRole(role: string | null | undefined): boolean {
  return role === "student" || role === "tutor";
}

export function portalLoginAliasMappings(
  sophiaUserId = SOPHIA_SLEIMAN_USER_ID,
): readonly LoginAliasMapping[] {
  return [
    {
      email: "samakubba@gmail.com",
      label: "Neel Dharni client portal",
      match: { kind: "userId", userId: NEEL_DHARNI_USER_ID, role: "student" },
    },
    {
      email: "samakubba@icloud.com",
      label: "Victoria tutor profile",
      match: { kind: "userId", userId: VICTORIA_USER_ID, role: "tutor" },
    },
    {
      email: "kubbasama@gmail.com",
      label: "Sophia Sleiman client record",
      match: { kind: "userId", userId: sophiaUserId.trim(), role: "student" },
    },
  ];
}

export const PORTAL_LOGIN_ALIAS_MAPPINGS: readonly LoginAliasMapping[] =
  portalLoginAliasMappings();

export type LoginAliasUserSnapshot = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  clerkUserId: string;
};

export type LoginAliasRowSnapshot = {
  email: string;
  userId: string;
  clerkUserId: string | null;
  revokedAt: string | null;
};

export type LoginAliasOperation = "insert" | "restore" | "noop";

export type LoginAliasAction = {
  email: string;
  label: string;
  operation: LoginAliasOperation;
  userId: string;
  contactEmail: string;
  displayName: string;
  role: string;
};

export type LoginAliasPlan = {
  ok: boolean;
  actions: LoginAliasAction[];
  blocked: string[];
};

export function normalizeLoginAliasEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isRefusedLoginAliasEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (REFUSED_LOGIN_ALIAS_EMAILS as readonly string[]).includes(
    normalizeLoginAliasEmail(email),
  );
}

function findTarget(
  mapping: LoginAliasMapping,
  users: readonly LoginAliasUserSnapshot[],
): { user: LoginAliasUserSnapshot | null; blocked: string | null } {
  if (!mapping.match.userId) {
    return {
      user: null,
      blocked: `${mapping.email}: ${mapping.label} needs a user id (set SOPHIA_SLEIMAN_USER_ID or pass --sophia-id)`,
    };
  }
  const matches = users.filter((user) => user.id === mapping.match.userId);
  if (matches.length !== 1) {
    return {
      user: null,
      blocked: `${mapping.email}: expected one user ${mapping.match.userId} for ${mapping.label}`,
    };
  }
  const user = matches[0]!;
  if (user.role !== mapping.match.role) {
    return {
      user: null,
      blocked: `${mapping.email}: ${mapping.label} has role ${user.role}; expected ${mapping.match.role} and will not re-role`,
    };
  }
  if (!isPortalAliasRole(user.role)) {
    return {
      user: null,
      blocked: `${mapping.email}: ${mapping.label} role ${user.role} cannot be an alias target`,
    };
  }
  return { user, blocked: null };
}

export function planPortalLoginAliases(input: {
  users: readonly LoginAliasUserSnapshot[];
  aliases: readonly LoginAliasRowSnapshot[];
  mappings?: readonly LoginAliasMapping[];
}): LoginAliasPlan {
  const mappings = input.mappings ?? PORTAL_LOGIN_ALIAS_MAPPINGS;
  const blocked: string[] = [];
  const actions: LoginAliasAction[] = [];
  const seen = new Set<string>();

  for (const mapping of mappings) {
    const email = normalizeLoginAliasEmail(mapping.email);
    if (seen.has(email)) blocked.push(`${email}: duplicate mapping`);
    seen.add(email);
    if (isRefusedLoginAliasEmail(email)) {
      blocked.push(`${email}: refused; this address is not mapped`);
      continue;
    }
    const ownedByOther = input.users.find(
      (user) => normalizeLoginAliasEmail(user.email) === email,
    );
    const target = findTarget(mapping, input.users);
    if (target.blocked) {
      blocked.push(target.blocked);
      continue;
    }
    const user = target.user!;
    if (ownedByOther && ownedByOther.id !== user.id) {
      blocked.push(
        `${email}: contact email already belongs to a different user and will not be reassigned`,
      );
      continue;
    }
    const existing = input.aliases.find(
      (alias) => normalizeLoginAliasEmail(alias.email) === email,
    );
    if (existing && existing.userId !== user.id) {
      blocked.push(
        `${email}: alias already points at ${existing.userId}, not ${user.id}`,
      );
      continue;
    }
    const operation: LoginAliasOperation = !existing
      ? "insert"
      : existing.revokedAt
        ? "restore"
        : "noop";
    actions.push({
      email,
      label: mapping.label,
      operation,
      userId: user.id,
      contactEmail: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  }

  return { ok: blocked.length === 0, actions, blocked };
}

export function previewAliasesAfterPlan(
  aliases: readonly LoginAliasRowSnapshot[],
  plan: LoginAliasPlan,
): LoginAliasRowSnapshot[] {
  const next = aliases.map((alias) => ({ ...alias }));
  if (!plan.ok) return next;
  for (const action of plan.actions) {
    if (action.operation === "noop") continue;
    const existing = next.find(
      (alias) => normalizeLoginAliasEmail(alias.email) === action.email,
    );
    if (!existing) {
      next.push({
        email: action.email,
        userId: action.userId,
        clerkUserId: null,
        revokedAt: null,
      });
      continue;
    }
    existing.userId = action.userId;
    existing.revokedAt = null;
  }
  return next;
}

export function planPortalLoginAliasRollback(
  aliases: readonly LoginAliasRowSnapshot[],
): { emails: string[] } {
  const mapped = new Set(
    PORTAL_LOGIN_ALIAS_MAPPINGS.map((mapping) =>
      normalizeLoginAliasEmail(mapping.email),
    ),
  );
  return {
    emails: aliases
      .map((alias) => normalizeLoginAliasEmail(alias.email))
      .filter((email) => mapped.has(email)),
  };
}

export type LoginAliasUse = {
  action: "use";
  userId: string;
  storeClerkUserId: boolean;
};

export type LoginAliasDecision = { action: "skip" } | { action: "refuse" } | LoginAliasUse;

export function decideVerifiedLoginAlias(input: {
  email: string | null | undefined;
  clerkUserId: string;
  alias: LoginAliasRowSnapshot | null;
  user: LoginAliasUserSnapshot | null;
}): LoginAliasDecision {
  const email = input.email ? normalizeLoginAliasEmail(input.email) : "";
  if (!email) return { action: "skip" };
  if (isRefusedLoginAliasEmail(email)) return { action: "refuse" };
  if (!input.alias || input.alias.revokedAt) return { action: "skip" };
  if (normalizeLoginAliasEmail(input.alias.email) !== email) return { action: "skip" };
  if (!input.user || input.user.id !== input.alias.userId) return { action: "skip" };
  if (!isPortalAliasRole(input.user.role)) return { action: "refuse" };
  return {
    action: "use",
    userId: input.user.id,
    storeClerkUserId: input.alias.clerkUserId !== input.clerkUserId,
  };
}

export function decideStoredClerkAlias(input: {
  clerkUserId: string;
  alias: LoginAliasRowSnapshot | null;
  user: LoginAliasUserSnapshot | null;
}): LoginAliasDecision {
  if (!input.alias || input.alias.revokedAt) return { action: "skip" };
  if (input.alias.clerkUserId !== input.clerkUserId) return { action: "skip" };
  if (isRefusedLoginAliasEmail(input.alias.email)) return { action: "refuse" };
  if (!input.user || input.user.id !== input.alias.userId) return { action: "skip" };
  if (!isPortalAliasRole(input.user.role)) return { action: "refuse" };
  return { action: "use", userId: input.user.id, storeClerkUserId: false };
}

export function aliasLoginAccessOutcome(input: {
  userRole: string;
  access: { role: string } | null;
  conflict: boolean;
}):
  | { outcome: "allow" }
  | {
      outcome: "deny";
      code:
        | "IDENTITY_NOT_PROVISIONED"
        | "ROLE_PROVISIONING_MISMATCH"
        | "PORTAL_ACCESS_CONFIGURATION_ERROR";
    } {
  if (!isPortalAliasRole(input.userRole)) {
    return { outcome: "deny", code: "IDENTITY_NOT_PROVISIONED" };
  }
  if (input.conflict) {
    return { outcome: "deny", code: "PORTAL_ACCESS_CONFIGURATION_ERROR" };
  }
  if (!input.access) {
    return { outcome: "deny", code: "IDENTITY_NOT_PROVISIONED" };
  }
  if (input.userRole !== input.access.role) {
    return { outcome: "deny", code: "ROLE_PROVISIONING_MISMATCH" };
  }
  return { outcome: "allow" };
}

export type LoginAliasSelectRow = {
  userId: string;
  role: string;
  displayName: string;
  contactEmail: string;
  userClerkUserId: string;
  loginEmail: string | null;
  aliasUserId: string | null;
  aliasClerkUserId: string | null;
  aliasRevokedAt: string | null;
};

/** Operator SELECT. Application logs must not include these addresses. */
export function loginAliasSelectRows(
  users: readonly LoginAliasUserSnapshot[],
  aliases: readonly LoginAliasRowSnapshot[],
): LoginAliasSelectRow[] {
  const mappedEmails = new Set(
    PORTAL_LOGIN_ALIAS_MAPPINGS.map((mapping) =>
      normalizeLoginAliasEmail(mapping.email),
    ),
  );
  const relevantUsers = users.filter((user) => {
    if (user.id === NEEL_DHARNI_USER_ID || user.id === VICTORIA_USER_ID) return true;
    if (user.displayName === SOPHIA_SLEIMAN_DISPLAY_NAME && user.role === "student") {
      return true;
    }
    return mappedEmails.has(normalizeLoginAliasEmail(user.email));
  });
  const rows: LoginAliasSelectRow[] = [];
  for (const user of relevantUsers) {
    const linked = aliases.filter((alias) => alias.userId === user.id);
    if (linked.length === 0) {
      rows.push({
        userId: user.id,
        role: user.role,
        displayName: user.displayName,
        contactEmail: user.email,
        userClerkUserId: user.clerkUserId,
        loginEmail: null,
        aliasUserId: null,
        aliasClerkUserId: null,
        aliasRevokedAt: null,
      });
      continue;
    }
    for (const alias of linked) {
      rows.push({
        userId: user.id,
        role: user.role,
        displayName: user.displayName,
        contactEmail: user.email,
        userClerkUserId: user.clerkUserId,
        loginEmail: alias.email,
        aliasUserId: alias.userId,
        aliasClerkUserId: alias.clerkUserId,
        aliasRevokedAt: alias.revokedAt,
      });
    }
  }
  const orphanAliases = aliases.filter(
    (alias) =>
      mappedEmails.has(normalizeLoginAliasEmail(alias.email)) &&
      !relevantUsers.some((user) => user.id === alias.userId),
  );
  for (const alias of orphanAliases) {
    rows.push({
      userId: alias.userId,
      role: "",
      displayName: "",
      contactEmail: "",
      userClerkUserId: "",
      loginEmail: alias.email,
      aliasUserId: alias.userId,
      aliasClerkUserId: alias.clerkUserId,
      aliasRevokedAt: alias.revokedAt,
    });
  }
  return rows;
}
