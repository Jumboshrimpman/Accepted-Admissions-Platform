import { and, eq, inArray, sql } from "drizzle-orm";
import {
  availabilityRulesTable,
  courseMembershipsTable,
  coursesTable,
  db,
  portalAccessGrantsTable,
  satProductsTable,
  tutorAssignmentsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { envRoleCategoriesForIdentity } from "./access-config.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { XAVIER_BOOKING_WEEKLY_HOURS } from "./booking.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  COLLEGE_CONSULTING_COURSE_ID,
  COLLEGE_CONSULTING_PRODUCTS,
  COLLEGE_CONSULTING_SUBJECT,
  COLLEGE_CONSULTING_TERM,
  NEEL_DHARNI_USER_ID,
  NEEL_DISPLAY_NAME,
  NEEL_PLACEHOLDER_EMAIL,
  NIKA_CONSULTING_EMAIL,
  NIKA_CONSULTING_NAME,
  VICTORIA_DISPLAY_NAME,
  VICTORIA_INTENDED_EMAIL,
  VICTORIA_PLACEHOLDER_EMAIL,
  VICTORIA_USER_ID,
  decidePlaceholderLink,
  isProductionClerkUserId,
  normalizeConsultingEmail,
  type PlaceholderLinkStopReason,
} from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SHARED_FALL_MEETING_URL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
} from "./xavier-identity.ts";

/**
 * Startup provisioning for College Consulting.
 * Looks up existing rows only. Does not call Clerk, send mail, or create calendar events.
 */

export type CollegeConsultingProvisionStatus = {
  nikaEmail: string;
  nikaClerkUserId: string | null;
  neelLinked: boolean;
  neelUserId: string;
  neelEmail: string | null;
  neelStoppedReason: PlaceholderLinkStopReason | null;
  victoriaLinked: boolean;
  victoriaUserId: string;
  victoriaPlaceholderEmail: string;
  victoriaIntendedEmail: string;
  victoriaEmail: string | null;
  victoriaStoppedReason: PlaceholderLinkStopReason | null;
};

const EMPTY_STATUS: CollegeConsultingProvisionStatus = {
  nikaEmail: NIKA_CONSULTING_EMAIL,
  nikaClerkUserId: null,
  neelLinked: false,
  neelUserId: NEEL_DHARNI_USER_ID,
  neelEmail: null,
  neelStoppedReason: null,
  victoriaLinked: false,
  victoriaUserId: VICTORIA_USER_ID,
  victoriaPlaceholderEmail: VICTORIA_PLACEHOLDER_EMAIL,
  victoriaIntendedEmail: VICTORIA_INTENDED_EMAIL,
  victoriaEmail: null,
  victoriaStoppedReason: null,
};

let lastStatus: CollegeConsultingProvisionStatus = { ...EMPTY_STATUS };

export function collegeConsultingProvisionStatus(): CollegeConsultingProvisionStatus {
  return lastStatus;
}

function pendingClerkUserId(email: string): string {
  return `pending:${normalizeConsultingEmail(email)}`;
}

async function clerkOwnerId(clerkUserId: string): Promise<string | null> {
  if (!clerkUserId) return null;
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  return owner?.id ?? null;
}

async function ensureCatalogProducts(): Promise<void> {
  for (const product of COLLEGE_CONSULTING_PRODUCTS) {
    const [existing] = await db
      .select({ id: satProductsTable.id })
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, product.slug))
      .limit(1);
    if (!existing) {
      await db.insert(satProductsTable).values({
        slug: product.slug,
        name: product.name,
        description: product.description,
        durationHours: 1,
        totalPriceCents: product.hourlyRateCents,
        effectiveHourlyRateCents: product.hourlyRateCents,
        active: true,
      });
      continue;
    }
    await db
      .update(satProductsTable)
      .set({
        name: product.name,
        description: product.description,
        durationHours: 1,
        totalPriceCents: product.hourlyRateCents,
        effectiveHourlyRateCents: product.hourlyRateCents,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(satProductsTable.id, existing.id));
  }
}

async function ensureCourse(): Promise<void> {
  await db
    .insert(coursesTable)
    .values({
      id: COLLEGE_CONSULTING_COURSE_ID,
      title: COLLEGE_CONSULTING_SUBJECT,
      subject: COLLEGE_CONSULTING_SUBJECT,
      term: COLLEGE_CONSULTING_TERM,
      status: "active",
      goalSummary: "College consulting. No curriculum, quizzes, or pre-work.",
      meetUrl: SHARED_FALL_MEETING_URL,
    })
    .onConflictDoNothing();
  await db
    .update(coursesTable)
    .set({ meetUrl: SHARED_FALL_MEETING_URL })
    .where(
      and(
        eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID),
        sql`${coursesTable.meetUrl} is null OR ${coursesTable.meetUrl} = ''`,
      ),
    );
}

async function ensureWeeklyHours(tutorProfileId: string): Promise<void> {
  const [rule] = await db
    .select({ id: availabilityRulesTable.id })
    .from(availabilityRulesTable)
    .where(eq(availabilityRulesTable.tutorProfileId, tutorProfileId))
    .limit(1);
  if (rule) return;
  await db.insert(availabilityRulesTable).values({
    tutorProfileId,
    timezone: "America/New_York",
    weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
    bookingNoticeMinutes: 1440,
    bufferMinutes: 15,
    blackoutDates: [],
  });
}

async function ensureNika(): Promise<string | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, NIKA_CONSULTING_EMAIL))
    .limit(1);
  const [grant] = await db
    .select()
    .from(portalAccessGrantsTable)
    .where(eq(portalAccessGrantsTable.email, NIKA_CONSULTING_EMAIL))
    .limit(1);
  const clerkUserId =
    [user?.clerkUserId, grant?.clerkUserId].find((id) => isProductionClerkUserId(id)) ??
    null;
  if (
    user?.role === "administrator" ||
    envRoleCategoriesForIdentity(clerkUserId ?? undefined, NIKA_CONSULTING_EMAIL).includes(
      "administrator",
    )
  ) {
    return clerkUserId;
  }
  let nikaUser = user ?? null;
  if (!nikaUser) {
    const owner = clerkUserId ? await clerkOwnerId(clerkUserId) : null;
    if (!owner) {
      const [created] = await db
        .insert(usersTable)
        .values({
          clerkUserId: clerkUserId ?? pendingClerkUserId(NIKA_CONSULTING_EMAIL),
          email: NIKA_CONSULTING_EMAIL,
          displayName: NIKA_CONSULTING_NAME,
          role: "tutor",
          title: "Admissions Tutor",
        })
        .returning();
      nikaUser = created ?? null;
    }
  } else if (
    clerkUserId &&
    !isProductionClerkUserId(nikaUser.clerkUserId) &&
    (await clerkOwnerId(clerkUserId)) === null
  ) {
    const [updated] = await db
      .update(usersTable)
      .set({ clerkUserId, updatedAt: new Date() })
      .where(eq(usersTable.id, nikaUser.id))
      .returning();
    if (updated) nikaUser = updated;
  }
  const notes =
    "College Consulting provider. Clerk id is taken from the existing user or grant. No Clerk invitation was sent.";
  if (!grant) {
    await db.insert(portalAccessGrantsTable).values({
      email: NIKA_CONSULTING_EMAIL,
      clerkUserId: nikaUser?.clerkUserId ?? clerkUserId ?? pendingClerkUserId(NIKA_CONSULTING_EMAIL),
      displayName: NIKA_CONSULTING_NAME,
      roleCategory: "english_tutor",
      active: true,
      notes,
      userId: nikaUser?.id ?? null,
    });
  } else if (nikaUser) {
    const nextClerk = isProductionClerkUserId(grant.clerkUserId)
      ? grant.clerkUserId
      : nikaUser.clerkUserId;
    await db
      .update(portalAccessGrantsTable)
      .set({
        clerkUserId: nextClerk,
        userId: nikaUser.id,
        active: true,
        revokedAt: null,
        notes: grant.notes?.includes("No Clerk invitation") ? grant.notes : notes,
        updatedAt: new Date(),
      })
      .where(eq(portalAccessGrantsTable.id, grant.id));
  }
  const [profile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.email, NIKA_CONSULTING_EMAIL))
    .limit(1);
  if (profile) {
    const subjects = [...new Set([...(profile.subjects ?? []), COLLEGE_CONSULTING_SUBJECT])];
    await db
      .update(tutorProfilesTable)
      .set({
        subjects,
        bookingEligible: true,
        active: true,
        ...(nikaUser ? { userId: profile.userId ?? nikaUser.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tutorProfilesTable.id, profile.id));
    await ensureWeeklyHours(profile.id);
  }
  return isProductionClerkUserId(nikaUser?.clerkUserId) ? nikaUser!.clerkUserId : clerkUserId;
}

async function ensurePlaceholderClient(input: {
  targetUserId: string;
  placeholderEmail: string;
  displayName: string;
  role: "student" | "tutor";
  grantRole: "student" | "tutor";
  allowedGrantRoles: readonly string[];
  requireKnownClerkId: boolean;
  title: string | null;
  notes: string;
}): Promise<{ linked: boolean; email: string | null; stoppedReason: PlaceholderLinkStopReason | null; userId: string | null }> {
  const email = normalizeConsultingEmail(input.placeholderEmail);
  const [byId] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, input.targetUserId))
    .limit(1);
  const loginEmail = byId ? normalizeConsultingEmail(byId.email) : email;
  if (loginEmail === VICTORIA_INTENDED_EMAIL && !byId) {
    return { linked: false, email: null, stoppedReason: "identity_not_verified", userId: null };
  }
  const [byEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, loginEmail))
    .limit(1);
  const existingUser = byId ?? byEmail ?? null;
  const [grant] = await db
    .select()
    .from(portalAccessGrantsTable)
    .where(eq(portalAccessGrantsTable.email, existingUser ? normalizeConsultingEmail(existingUser.email) : email))
    .limit(1);
  const candidateClerk = [grant?.clerkUserId, existingUser?.clerkUserId].find((id) =>
    isProductionClerkUserId(id),
  );
  const envRoleCategories = envRoleCategoriesForIdentity(
    candidateClerk ?? existingUser?.clerkUserId,
    existingUser?.email ?? email,
  );
  const decision = decidePlaceholderLink({
    targetUserId: input.targetUserId,
    existingUser: existingUser
      ? {
          id: existingUser.id,
          role: existingUser.role,
          clerkUserId: existingUser.clerkUserId,
        }
      : null,
    activeGrantUserId: grant?.userId ?? null,
    grantClerkUserId: grant?.clerkUserId ?? null,
    grantRoleCategory: grant?.roleCategory ?? null,
    allowedGrantRoles: input.allowedGrantRoles,
    envRoleCategories,
    requireKnownClerkId: input.requireKnownClerkId,
    clerkIdOwnerUserId: candidateClerk ? await clerkOwnerId(candidateClerk) : null,
  });
  if (decision.action === "stop") {
    return {
      linked: false,
      email: existingUser?.email ?? null,
      stoppedReason: decision.reason,
      userId: existingUser?.id ?? null,
    };
  }
  const clerkUserId =
    decision.mode === "existing"
      ? decision.clerkUserId
      : decision.clerkUserId || pendingClerkUserId(email);
  let user = byId ?? null;
  if (!user && decision.mode === "create") {
    const [created] = await db
      .insert(usersTable)
      .values({
        id: input.targetUserId,
        clerkUserId,
        email,
        displayName: input.displayName,
        role: input.role,
        title: input.title,
      })
      .returning();
    user = created ?? null;
  }
  if (!user) {
    return { linked: false, email: null, stoppedReason: "identity_not_verified", userId: null };
  }
  const grantEmail = normalizeConsultingEmail(user.email);
  if (!grant) {
    await db.insert(portalAccessGrantsTable).values({
      email: grantEmail,
      clerkUserId: user.clerkUserId,
      displayName: input.displayName,
      roleCategory: input.grantRole,
      active: true,
      notes: input.notes,
      userId: user.id,
    });
  } else if (grant.userId === user.id || !grant.userId) {
    await db
      .update(portalAccessGrantsTable)
      .set({
        userId: user.id,
        displayName: grant.displayName || input.displayName,
        active: true,
        revokedAt: null,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(eq(portalAccessGrantsTable.id, grant.id));
  }
  return { linked: true, email: user.email, stoppedReason: null, userId: user.id };
}

async function ensureMembership(
  userId: string,
  membershipRole: "student" | "tutor",
): Promise<void> {
  await db
    .insert(courseMembershipsTable)
    .values({
      courseId: COLLEGE_CONSULTING_COURSE_ID,
      userId,
      membershipRole,
      subject: COLLEGE_CONSULTING_SUBJECT,
    })
    .onConflictDoNothing();
}

async function ensureAssignment(tutorUserId: string, studentUserId: string): Promise<void> {
  await db
    .insert(tutorAssignmentsTable)
    .values({
      courseId: COLLEGE_CONSULTING_COURSE_ID,
      tutorUserId,
      studentUserId,
      subject: COLLEGE_CONSULTING_SUBJECT,
    })
    .onConflictDoNothing();
}

async function ensureVictoriaProfile(userId: string, email: string): Promise<void> {
  const notes = `Temporary tutor login ${VICTORIA_PLACEHOLDER_EMAIL}. Intended email ${VICTORIA_INTENDED_EMAIL} is not provisioned and must not be contacted. Swap users.email, portal_access_grants.email, and tutor_profiles.email for ${VICTORIA_USER_ID} later. No Clerk invitation was sent.`;
  const [byUser] = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, userId))
    .limit(1);
  const [byEmail] = byUser
    ? []
    : await db
        .select()
        .from(tutorProfilesTable)
        .where(eq(tutorProfilesTable.email, normalizeConsultingEmail(email)))
        .limit(1);
  const profile = byUser ?? byEmail ?? null;
  if (!profile) {
    const [created] = await db
      .insert(tutorProfilesTable)
      .values({
        userId,
        email: normalizeConsultingEmail(email),
        name: VICTORIA_DISPLAY_NAME,
        title: "College Consulting Tutor",
        subjects: [COLLEGE_CONSULTING_SUBJECT],
        publicApproved: false,
        active: true,
        bookingEligible: true,
        calendarStatus: "disconnected",
        internalNotes: notes,
      })
      .returning();
    if (created) await ensureWeeklyHours(created.id);
    return;
  }
  if (profile.userId && profile.userId !== userId) return;
  await db
    .update(tutorProfilesTable)
    .set({
      userId,
      email: normalizeConsultingEmail(email),
      name: VICTORIA_DISPLAY_NAME,
      bookingEligible: true,
      active: true,
      subjects: [...new Set([...(profile.subjects ?? []), COLLEGE_CONSULTING_SUBJECT])],
      internalNotes: notes,
      updatedAt: new Date(),
    })
    .where(eq(tutorProfilesTable.id, profile.id));
  await ensureWeeklyHours(profile.id);
}

export async function ensureCollegeConsultingProvision(): Promise<CollegeConsultingProvisionStatus> {
  await ensureCatalogProducts();
  await ensureCourse();
  const nikaClerkUserId = await ensureNika();
  const neel = await ensurePlaceholderClient({
    targetUserId: NEEL_DHARNI_USER_ID,
    placeholderEmail: NEEL_PLACEHOLDER_EMAIL,
    displayName: NEEL_DISPLAY_NAME,
    role: "student",
    grantRole: "student",
    allowedGrantRoles: ["student"],
    requireKnownClerkId: true,
    title: null,
    notes:
      "Neel Dharni placeholder login. Bookings use this user id. Change users.email and portal_access_grants.email together later. No Clerk invitation was sent.",
  });
  const victoria = await ensurePlaceholderClient({
    targetUserId: VICTORIA_USER_ID,
    placeholderEmail: VICTORIA_PLACEHOLDER_EMAIL,
    displayName: VICTORIA_DISPLAY_NAME,
    role: "tutor",
    grantRole: "tutor",
    allowedGrantRoles: ["tutor"],
    requireKnownClerkId: false,
    title: "College Consulting Tutor",
    notes: `Temporary Victoria tutor login for testing. Intended email ${VICTORIA_INTENDED_EMAIL} is not provisioned. No Clerk invitation was sent.`,
  });
  if (victoria.linked && victoria.userId && victoria.email) {
    await ensureVictoriaProfile(victoria.userId, victoria.email);
    await ensureMembership(victoria.userId, "tutor");
  }
  if (neel.linked && neel.userId) {
    await ensureMembership(neel.userId, "student");
    const tutorEmails = [NIKA_CONSULTING_EMAIL, CANONICAL_XAVIER_EMAIL];
    const tutors = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, tutorEmails));
    const xavierByClerk = tutors.some(
      (tutor: { id: string; email: string }) =>
        normalizeConsultingEmail(tutor.email) === normalizeConsultingEmail(CANONICAL_XAVIER_EMAIL),
    )
      ? null
      : (
          await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.clerkUserId, CANONICAL_XAVIER_CLERK_USER_ID))
            .limit(1)
        )[0];
    const tutorIds = [
      ...tutors.map((tutor: { id: string; email: string }) => tutor.id),
      ...(xavierByClerk ? [xavierByClerk.id] : []),
      ...(victoria.userId ? [victoria.userId] : []),
    ];
    const [nikaUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, NIKA_CONSULTING_EMAIL))
      .limit(1);
    if (nikaUser) tutorIds.push(nikaUser.id);
    for (const tutorUserId of [...new Set(tutorIds)]) {
      await ensureMembership(tutorUserId, "tutor");
      await ensureAssignment(tutorUserId, neel.userId);
    }
  }
  lastStatus = {
    nikaEmail: NIKA_CONSULTING_EMAIL,
    nikaClerkUserId,
    neelLinked: neel.linked,
    neelUserId: NEEL_DHARNI_USER_ID,
    neelEmail: neel.email,
    neelStoppedReason: neel.stoppedReason,
    victoriaLinked: victoria.linked,
    victoriaUserId: VICTORIA_USER_ID,
    victoriaPlaceholderEmail: VICTORIA_PLACEHOLDER_EMAIL,
    victoriaIntendedEmail: VICTORIA_INTENDED_EMAIL,
    victoriaEmail: victoria.email,
    victoriaStoppedReason: victoria.stoppedReason,
  };
  return lastStatus;
}
