import { eq } from "drizzle-orm";
import {
  calendarConnectionsTable,
  courseMembershipsTable,
  db,
  portalAccessGrantsTable,
  sessionsTable,
  tutorAssignmentsTable,
  tutorCompensationRatesTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
  CANONICAL_XAVIER_NAME,
  RETIRED_XAVIER_CLERK_USER_ID,
  RETIRED_XAVIER_EMAILS,
  SUPERSEDED_XAVIER_GRANT_NOTE,
  isRetiredXavierClerkUserId,
  retiredXavierClerkMarker,
} from "./xavier-identity";

const RETIRED_EMAILS = [...RETIRED_XAVIER_EMAILS];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function retireDuplicateXavierIdentities(): Promise<void> {
  const users = await db.select().from(usersTable);
  const winner =
    users.find((user) => user.clerkUserId === CANONICAL_XAVIER_CLERK_USER_ID) ??
    users.find((user) => normalizeEmail(user.email) === CANONICAL_XAVIER_EMAIL);
  const losers = users.filter(
    (user) =>
      user.id !== winner?.id &&
      (isRetiredXavierClerkUserId(user.clerkUserId) ||
        user.clerkUserId === RETIRED_XAVIER_CLERK_USER_ID ||
        RETIRED_EMAILS.includes(normalizeEmail(user.email) as (typeof RETIRED_EMAILS)[number])),
  );

  if (winner) {
    const nextEmail = users.some(
      (user) =>
        user.id !== winner.id && normalizeEmail(user.email) === CANONICAL_XAVIER_EMAIL,
    )
      ? winner.email
      : CANONICAL_XAVIER_EMAIL;
    if (
      winner.clerkUserId !== CANONICAL_XAVIER_CLERK_USER_ID ||
      normalizeEmail(winner.email) !== normalizeEmail(nextEmail) ||
      winner.displayName !== CANONICAL_XAVIER_NAME ||
      winner.role !== "tutor"
    ) {
      await db
        .update(usersTable)
        .set({
          clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
          email: nextEmail,
          displayName: CANONICAL_XAVIER_NAME,
          role: "tutor",
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, winner.id));
    }
  }

  for (const loser of losers) {
    if (winner) {
      await db
        .update(sessionsTable)
        .set({ tutorUserId: winner.id, updatedAt: new Date() })
        .where(eq(sessionsTable.tutorUserId, loser.id));

      const loserAssignments = await db
        .select()
        .from(tutorAssignmentsTable)
        .where(eq(tutorAssignmentsTable.tutorUserId, loser.id));
      for (const assignment of loserAssignments) {
        await db
          .insert(tutorAssignmentsTable)
          .values({
            courseId: assignment.courseId,
            tutorUserId: winner.id,
            studentUserId: assignment.studentUserId,
            subject: assignment.subject,
          })
          .onConflictDoNothing();
      }
      await db
        .delete(tutorAssignmentsTable)
        .where(eq(tutorAssignmentsTable.tutorUserId, loser.id));

      const loserMemberships = await db
        .select()
        .from(courseMembershipsTable)
        .where(eq(courseMembershipsTable.userId, loser.id));
      for (const membership of loserMemberships) {
        await db
          .insert(courseMembershipsTable)
          .values({
            courseId: membership.courseId,
            userId: winner.id,
            membershipRole: "tutor",
            subject: membership.subject,
          })
          .onConflictDoUpdate({
            target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
            set: { membershipRole: "tutor" },
          });
      }
      await db
        .delete(courseMembershipsTable)
        .where(eq(courseMembershipsTable.userId, loser.id));
    }

    await db
      .update(tutorProfilesTable)
      .set({ userId: null, updatedAt: new Date() })
      .where(eq(tutorProfilesTable.userId, loser.id));

    await db
      .update(usersTable)
      .set({
        clerkUserId: `${retiredXavierClerkMarker(RETIRED_XAVIER_CLERK_USER_ID)}:${loser.id}`,
        email: `retired+${loser.id.replaceAll("-", "")}@retired.accepted.local`,
        displayName: /xavier/i.test(loser.displayName)
          ? "Xavier Morales (superseded)"
          : loser.displayName,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, loser.id));
  }

  const profiles = await db.select().from(tutorProfilesTable);
  const winnerProfile =
    profiles.find(
      (profile) => normalizeEmail(profile.email) === CANONICAL_XAVIER_EMAIL,
    ) ??
    profiles.find(
      (profile) =>
        profile.userId === winner?.id && profile.name === CANONICAL_XAVIER_NAME,
    );

  if (winnerProfile) {
    await db
      .update(tutorProfilesTable)
      .set({
        email: CANONICAL_XAVIER_EMAIL,
        name: CANONICAL_XAVIER_NAME,
        userId: winnerProfile.userId ?? winner?.id ?? winnerProfile.userId,
        active: true,
        bookingEligible: true,
        publicApproved: true,
        updatedAt: new Date(),
      })
      .where(eq(tutorProfilesTable.id, winnerProfile.id));

    const loserProfiles = profiles.filter((profile) => {
      if (profile.id === winnerProfile.id) return false;
      const email = normalizeEmail(profile.email);
      return (
        email === CANONICAL_XAVIER_EMAIL ||
        RETIRED_EMAILS.includes(email as (typeof RETIRED_EMAILS)[number]) ||
        profile.name === CANONICAL_XAVIER_NAME
      );
    });

    for (const profile of loserProfiles) {
      const [winnerConnection] = await db
        .select({ id: calendarConnectionsTable.id })
        .from(calendarConnectionsTable)
        .where(eq(calendarConnectionsTable.tutorProfileId, winnerProfile.id))
        .limit(1);
      if (!winnerConnection) {
        await db
          .update(calendarConnectionsTable)
          .set({ tutorProfileId: winnerProfile.id, updatedAt: new Date() })
          .where(eq(calendarConnectionsTable.tutorProfileId, profile.id));
      }
      await db
        .update(tutorCompensationRatesTable)
        .set({ tutorProfileId: winnerProfile.id })
        .where(eq(tutorCompensationRatesTable.tutorProfileId, profile.id));
      await db
        .update(tutorProfilesTable)
        .set({
          userId: null,
          active: false,
          bookingEligible: false,
          publicApproved: false,
          email:
            normalizeEmail(profile.email) === CANONICAL_XAVIER_EMAIL
              ? `retired+xavier-duplicate-${profile.id.slice(0, 8)}@retired.accepted.local`
              : profile.email,
          internalNotes: [profile.internalNotes, SUPERSEDED_XAVIER_GRANT_NOTE]
            .filter(Boolean)
            .join("\n"),
          updatedAt: new Date(),
        })
        .where(eq(tutorProfilesTable.id, profile.id));
    }
  }

  const grants = await db.select().from(portalAccessGrantsTable);
  for (const grant of grants) {
    const email = normalizeEmail(grant.email);
    const isCanonical =
      grant.clerkUserId === CANONICAL_XAVIER_CLERK_USER_ID ||
      email === CANONICAL_XAVIER_EMAIL;
    const isRetired =
      isRetiredXavierClerkUserId(grant.clerkUserId) ||
      grant.clerkUserId === RETIRED_XAVIER_CLERK_USER_ID ||
      RETIRED_EMAILS.includes(email as (typeof RETIRED_EMAILS)[number]);

    if (isCanonical && !isRetired) {
      await db
        .update(portalAccessGrantsTable)
        .set({
          clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
          email: CANONICAL_XAVIER_EMAIL,
          displayName: CANONICAL_XAVIER_NAME,
          userId: winner?.id ?? grant.userId,
          active: true,
          revokedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(portalAccessGrantsTable.id, grant.id));
      continue;
    }
    if (isRetired) {
      await db
        .update(portalAccessGrantsTable)
        .set({
          active: false,
          clerkUserId: grant.clerkUserId?.startsWith("retired:")
            ? grant.clerkUserId
            : retiredXavierClerkMarker(RETIRED_XAVIER_CLERK_USER_ID),
          notes:
            grant.notes?.startsWith("SUPERSEDED:")
              ? grant.notes
              : SUPERSEDED_XAVIER_GRANT_NOTE,
          revokedAt: grant.revokedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(portalAccessGrantsTable.id, grant.id));
    }
  }
}

export function isRetiredOverviewUser(user: {
  clerkUserId?: string | null;
  email?: string | null;
}): boolean {
  return (
    isRetiredXavierClerkUserId(user.clerkUserId) ||
    Boolean(user.email?.toLowerCase().endsWith("@retired.accepted.local"))
  );
}
