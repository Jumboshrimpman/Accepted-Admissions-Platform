import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  portalLoginAliasesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import {
  decideStoredClerkAlias,
  decideVerifiedLoginAlias,
  loginAliasSelectRows,
  normalizeLoginAliasEmail,
  planPortalLoginAliasRollback,
  planPortalLoginAliases,
  previewAliasesAfterPlan,
  type LoginAliasPlan,
  type LoginAliasRowSnapshot,
  type LoginAliasSelectRow,
  type LoginAliasUserSnapshot,
} from "./portal-login-aliases.ts";

function userSnapshot(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  clerkUserId: string;
}): LoginAliasUserSnapshot {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    clerkUserId: user.clerkUserId,
  };
}

function aliasSnapshot(alias: {
  email: string;
  userId: string;
  clerkUserId: string | null;
  revokedAt: Date | null;
}): LoginAliasRowSnapshot {
  return {
    email: alias.email,
    userId: alias.userId,
    clerkUserId: alias.clerkUserId,
    revokedAt: alias.revokedAt ? alias.revokedAt.toISOString() : null,
  };
}

export async function loadLoginAliasSnapshot(): Promise<{
  users: LoginAliasUserSnapshot[];
  aliases: LoginAliasRowSnapshot[];
  select: LoginAliasSelectRow[];
}> {
  const users = (await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      clerkUserId: usersTable.clerkUserId,
    })
    .from(usersTable)).map(userSnapshot);
  const aliases = (await db
    .select({
      email: portalLoginAliasesTable.email,
      userId: portalLoginAliasesTable.userId,
      clerkUserId: portalLoginAliasesTable.clerkUserId,
      revokedAt: portalLoginAliasesTable.revokedAt,
    })
    .from(portalLoginAliasesTable)).map(aliasSnapshot);
  return { users, aliases, select: loginAliasSelectRows(users, aliases) };
}

export async function applyLoginAliasPlan(plan: LoginAliasPlan): Promise<void> {
  if (!plan.ok) throw new Error("Refusing to apply a blocked login-alias plan.");
  await db.transaction(async (tx) => {
    for (const action of plan.actions) {
      if (action.operation === "noop") continue;
      if (action.operation === "insert") {
        await tx
          .insert(portalLoginAliasesTable)
          .values({ email: action.email, userId: action.userId })
          .onConflictDoNothing({ target: portalLoginAliasesTable.email });
      } else {
        await tx
          .update(portalLoginAliasesTable)
          .set({
            userId: action.userId,
            revokedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(portalLoginAliasesTable.email, action.email));
      }
      const [stored] = await tx
        .select({ userId: portalLoginAliasesTable.userId })
        .from(portalLoginAliasesTable)
        .where(eq(portalLoginAliasesTable.email, action.email))
        .limit(1);
      if (!stored || stored.userId !== action.userId) {
        throw new Error(`Alias ${action.email} did not land on the planned user.`);
      }
    }
  });
}

export async function rollbackLoginAliases(): Promise<string[]> {
  const snapshot = await loadLoginAliasSnapshot();
  const { emails } = planPortalLoginAliasRollback(snapshot.aliases);
  if (emails.length === 0) return [];
  await db
    .delete(portalLoginAliasesTable)
    .where(inArray(portalLoginAliasesTable.email, emails));
  return emails;
}

async function userForAlias(userId: string): Promise<LoginAliasUserSnapshot | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      clerkUserId: usersTable.clerkUserId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ? userSnapshot(user) : null;
}

async function appUserById(userId: string): Promise<AppUser | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}

export async function establishedAliasUser(clerkUserId: string): Promise<AppUser | null> {
  const [alias] = await db
    .select({
      email: portalLoginAliasesTable.email,
      userId: portalLoginAliasesTable.userId,
      clerkUserId: portalLoginAliasesTable.clerkUserId,
      revokedAt: portalLoginAliasesTable.revokedAt,
    })
    .from(portalLoginAliasesTable)
    .where(
      and(
        eq(portalLoginAliasesTable.clerkUserId, clerkUserId),
        isNull(portalLoginAliasesTable.revokedAt),
      ),
    )
    .limit(1);
  if (!alias) return null;
  const user = await userForAlias(alias.userId);
  const decision = decideStoredClerkAlias({
    clerkUserId,
    alias: aliasSnapshot(alias),
    user,
  });
  if (decision.action !== "use") return null;
  return appUserById(decision.userId);
}

export async function attachVerifiedEmailAlias(input: {
  clerkUserId: string;
  email: string | null | undefined;
}): Promise<AppUser | null> {
  const email = input.email ? normalizeLoginAliasEmail(input.email) : "";
  if (!email) return null;
  const [alias] = await db
    .select({
      email: portalLoginAliasesTable.email,
      userId: portalLoginAliasesTable.userId,
      clerkUserId: portalLoginAliasesTable.clerkUserId,
      revokedAt: portalLoginAliasesTable.revokedAt,
    })
    .from(portalLoginAliasesTable)
    .where(
      and(
        sql`lower(${portalLoginAliasesTable.email}) = ${email}`,
        isNull(portalLoginAliasesTable.revokedAt),
      ),
    )
    .limit(1);
  if (!alias) return null;
  const user = await userForAlias(alias.userId);
  const decision = decideVerifiedLoginAlias({
    email,
    clerkUserId: input.clerkUserId,
    alias: aliasSnapshot(alias),
    user,
  });
  if (decision.action !== "use") return null;
  if (decision.storeClerkUserId) {
    await db
      .update(portalLoginAliasesTable)
      .set({ clerkUserId: input.clerkUserId, updatedAt: new Date() })
      .where(
        and(
          eq(portalLoginAliasesTable.email, alias.email),
          eq(portalLoginAliasesTable.userId, decision.userId),
          isNull(portalLoginAliasesTable.revokedAt),
        ),
      );
  }
  return appUserById(decision.userId);
}

export function missingLoginAliasRelation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: string }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function dryRunPreview(
  users: LoginAliasUserSnapshot[],
  aliases: LoginAliasRowSnapshot[],
): { plan: LoginAliasPlan; after: LoginAliasSelectRow[] } {
  const plan = planPortalLoginAliases({ users, aliases });
  return {
    plan,
    after: loginAliasSelectRows(users, previewAliasesAfterPlan(aliases, plan)),
  };
}
