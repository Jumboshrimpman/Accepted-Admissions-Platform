import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  claimableEmailsForUser,
  isRetiredTutorProfile,
  portalEmailsForGoogleMatch,
  scoreCalendarProfile,
  selectBestCalendarProfile,
} from "./calendar-profile-match.ts";

export {
  claimableEmailsForUser,
  isRetiredTutorProfile,
  portalEmailsForGoogleMatch,
  scoreCalendarProfile,
  selectBestCalendarProfile,
};
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
  CANONICAL_XAVIER_NAME,
  RETIRED_XAVIER_EMAILS,
  isCanonicalXavierEmail,
} from "./xavier-identity.ts";

export type CalendarTutorProfile = typeof tutorProfilesTable.$inferSelect;

export type CalendarOAuthProfileRow = {
  id: string;
  email: string;
  userEmail: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function emailMatchSql(emails: string[]) {
  return or(
    ...emails.map(
      (email) => sql`lower(${tutorProfilesTable.email}) = ${email}`,
    ),
  );
}

export async function resolveCalendarProfileForUser(
  user: AppUser,
  requestedProfileId?: string,
  createIfMissing = false,
): Promise<CalendarTutorProfile | undefined> {
  const linked = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, user.id));
  const usableLinked = linked.filter((profile) => !isRetiredTutorProfile(profile));

  if (requestedProfileId) {
    return usableLinked.find((profile) => profile.id === requestedProfileId);
  }

  const bestLinked = selectBestCalendarProfile(usableLinked, user);
  if (bestLinked) return bestLinked;

  const claimEmails = claimableEmailsForUser(user);
  if (claimEmails.length > 0) {
    const unlinked = await db
      .select()
      .from(tutorProfilesTable)
      .where(and(isNull(tutorProfilesTable.userId), emailMatchSql(claimEmails)));
    const bestUnlinked = selectBestCalendarProfile(unlinked, user);
    if (bestUnlinked) {
      const [claimed] = await db
        .update(tutorProfilesTable)
        .set({
          userId: user.id,
          bookingEligible: user.role === "tutor" ? true : bestUnlinked.bookingEligible,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tutorProfilesTable.id, bestUnlinked.id),
            isNull(tutorProfilesTable.userId),
          ),
        )
        .returning();
      if (claimed) return claimed;
    }
  }

  if (!createIfMissing) return undefined;

  const [existingByEmail] = claimEmails.length
    ? await db
        .select()
        .from(tutorProfilesTable)
        .where(emailMatchSql(claimEmails))
        .limit(1)
    : [];
  if (existingByEmail && !isRetiredTutorProfile(existingByEmail)) {
    return existingByEmail.userId === user.id ? existingByEmail : undefined;
  }

  const [createdProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: user.id,
      email: user.email,
      name: user.displayName,
      title: "Calendar account",
      subjects: [],
      bookingEligible: user.role === "tutor",
      calendarStatus: "disconnected",
    })
    .onConflictDoNothing({ target: tutorProfilesTable.email })
    .returning();
  if (createdProfile) return createdProfile;

  const raced = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, user.id));
  return selectBestCalendarProfile(raced, user);
}

export async function resolveCalendarProfileForOAuthState(state: {
  tutorProfileId: string;
  appUserId: string;
}): Promise<{ profile?: CalendarOAuthProfileRow; remapped: boolean }> {
  const [exact] = await db
    .select({
      id: tutorProfilesTable.id,
      email: tutorProfilesTable.email,
      userEmail: usersTable.email,
    })
    .from(tutorProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, tutorProfilesTable.userId))
    .where(
      and(
        eq(tutorProfilesTable.id, state.tutorProfileId),
        eq(tutorProfilesTable.userId, state.appUserId),
      ),
    )
    .limit(1);
  if (exact) return { profile: exact, remapped: false };

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, state.appUserId))
    .limit(1);
  if (!user) return { remapped: false };

  const current = await resolveCalendarProfileForUser(user);
  if (!current) return { remapped: false };

  const [joined] = await db
    .select({
      id: tutorProfilesTable.id,
      email: tutorProfilesTable.email,
      userEmail: usersTable.email,
    })
    .from(tutorProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, tutorProfilesTable.userId))
    .where(eq(tutorProfilesTable.id, current.id))
    .limit(1);
  return {
    profile: joined,
    remapped: current.id !== state.tutorProfileId,
  };
}

export async function xavierCalendarIdentityAlignment(): Promise<{
  aligned: boolean;
  canonicalClerkPresent: boolean;
  userEmail?: string;
  userId?: string;
  profileCount: number;
  profiles: Array<{
    id: string;
    userId: string | null;
    email: string;
    active: boolean;
    bookingEligible: boolean;
    calendarStatus: string;
    retired: boolean;
    linkedToCanonicalUser: boolean;
  }>;
}> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, CANONICAL_XAVIER_CLERK_USER_ID))
    .limit(1);
  const profiles = await db.select().from(tutorProfilesTable);
  const xavierProfiles = profiles.filter((profile) => {
    const email = normalizeEmail(profile.email);
    return (
      email === CANONICAL_XAVIER_EMAIL ||
      RETIRED_XAVIER_EMAILS.includes(email as (typeof RETIRED_XAVIER_EMAILS)[number]) ||
      profile.name === CANONICAL_XAVIER_NAME ||
      (email.endsWith("@retired.accepted.local") && /xavier/i.test(profile.name ?? ""))
    );
  });
  const mapped = xavierProfiles.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    email: profile.email,
    active: profile.active,
    bookingEligible: profile.bookingEligible,
    calendarStatus: profile.calendarStatus,
    retired: isRetiredTutorProfile(profile),
    linkedToCanonicalUser: Boolean(user && profile.userId === user.id),
  }));
  return {
    aligned: Boolean(
      user &&
        isCanonicalXavierEmail(user.email) &&
        mapped.some(
          (profile) =>
            profile.linkedToCanonicalUser &&
            isCanonicalXavierEmail(profile.email) &&
            profile.active &&
            !profile.retired,
        ),
    ),
    canonicalClerkPresent: Boolean(user),
    userEmail: user?.email,
    userId: user?.id,
    profileCount: mapped.length,
    profiles: mapped,
  };
}
