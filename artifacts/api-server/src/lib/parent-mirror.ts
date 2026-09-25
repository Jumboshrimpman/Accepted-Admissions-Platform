import { and, desc, eq, ne } from "drizzle-orm";
import {
  db,
  portalAccessGrantsTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { normalizeProvisionedEmail } from "./access-config.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";

/** Production parent. Signs in with his own Clerk account. */
export const RYO_PARENT_EMAIL = "ryo@jaac.co.jp";
export const RYO_PARENT_CLERK_USER_ID = "user_3IsvKcNhmcqPtcxFfGOYgtR4MAc";
/** Production student mirrored by Ryo. His own login is unchanged. */
export const TAITO_PARENT_CLERK_USER_ID = "user_3IsvKdTAnOmfXNTiOlOvupgfjZl";
export const TAITO_PARENT_MIRROR_RELATIONSHIP =
  "view only mirror of Taito’s client account";

export type MirroredStudent = {
  id: string;
  displayName: string;
  email: string;
  timezone: string;
};

export async function mirroredStudentForViewer(
  viewerUserId: string,
): Promise<MirroredStudent | null> {
  const [student] = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(viewerLinksTable)
    .innerJoin(usersTable, eq(usersTable.id, viewerLinksTable.studentUserId))
    .where(
      and(
        eq(viewerLinksTable.viewerUserId, viewerUserId),
        eq(viewerLinksTable.active, true),
        eq(usersTable.role, "student"),
      ),
    )
    .orderBy(desc(viewerLinksTable.createdAt))
    .limit(1);
  return student ?? null;
}

export async function mirroredStudentIdForViewer(
  viewerUserId: string,
): Promise<string | null> {
  const student = await mirroredStudentForViewer(viewerUserId);
  return student?.id ?? null;
}

export async function deactivateViewerLinks(viewerUserId: string): Promise<void> {
  await db
    .update(viewerLinksTable)
    .set({ active: false })
    .where(eq(viewerLinksTable.viewerUserId, viewerUserId));
}

/** One active student per viewer. Other links for that viewer are turned off. */
export async function syncViewerMirrorLink(input: {
  viewerUserId: string;
  studentEmail: string;
  relationship?: string;
}): Promise<boolean> {
  const studentEmail = normalizeProvisionedEmail(input.studentEmail);
  const [student] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.email, studentEmail), eq(usersTable.role, "student")))
    .limit(1);
  await db
    .update(viewerLinksTable)
    .set({ active: false })
    .where(
      and(
        eq(viewerLinksTable.viewerUserId, input.viewerUserId),
        ...(student ? [ne(viewerLinksTable.studentUserId, student.id)] : []),
      ),
    );
  if (!student) return false;
  const relationship =
    input.relationship ??
    (studentEmail === TAITO_STUDENT_EMAIL
      ? TAITO_PARENT_MIRROR_RELATIONSHIP
      : "read-only parent mirror");
  await db
    .insert(viewerLinksTable)
    .values({
      viewerUserId: input.viewerUserId,
      studentUserId: student.id,
      relationship,
      active: true,
    })
    .onConflictDoUpdate({
      target: [viewerLinksTable.viewerUserId, viewerLinksTable.studentUserId],
      set: { active: true, relationship },
    });
  return true;
}

/**
 * Upsert the production Ryo → Taito grant and link when both app users exist.
 * Does not call Clerk and does not send an invitation.
 */
export async function ensureRyoTaitoParentMirror(): Promise<{
  grantEmail: string;
  linked: boolean;
}> {
  const notes =
    "Parent mirror of Taito Goto (taito0525@gmail.com). Read-only. No Clerk invitation.";
  await db
    .insert(portalAccessGrantsTable)
    .values({
      email: RYO_PARENT_EMAIL,
      clerkUserId: RYO_PARENT_CLERK_USER_ID,
      displayName: "Ryo",
      roleCategory: "viewer",
      linkedStudentEmail: TAITO_STUDENT_EMAIL,
      active: true,
      notes,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: portalAccessGrantsTable.email,
      set: {
        clerkUserId: RYO_PARENT_CLERK_USER_ID,
        roleCategory: "viewer",
        linkedStudentEmail: TAITO_STUDENT_EMAIL,
        active: true,
        revokedAt: null,
        updatedAt: new Date(),
      },
    });

  const [ryo] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, RYO_PARENT_EMAIL))
    .limit(1);
  if (!ryo) return { grantEmail: RYO_PARENT_EMAIL, linked: false };

  const [clerkOwner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, RYO_PARENT_CLERK_USER_ID))
    .limit(1);
  const canClaimClerk = !clerkOwner || clerkOwner.id === ryo.id;
  const nextClerkUserId = canClaimClerk
    ? RYO_PARENT_CLERK_USER_ID
    : ryo.clerkUserId;
  let viewer: AppUser = ryo;
  if (ryo.role !== "viewer" || ryo.clerkUserId !== nextClerkUserId) {
    const [updated] = await db
      .update(usersTable)
      .set({
        role: "viewer",
        clerkUserId: nextClerkUserId,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, ryo.id))
      .returning();
    if (updated) viewer = updated;
  }

  const linked = await syncViewerMirrorLink({
    viewerUserId: viewer.id,
    studentEmail: TAITO_STUDENT_EMAIL,
  });
  await db
    .update(portalAccessGrantsTable)
    .set({
      userId: viewer.id,
      clerkUserId: viewer.clerkUserId,
      updatedAt: new Date(),
    })
    .where(eq(portalAccessGrantsTable.email, RYO_PARENT_EMAIL));
  return { grantEmail: RYO_PARENT_EMAIL, linked };
}
