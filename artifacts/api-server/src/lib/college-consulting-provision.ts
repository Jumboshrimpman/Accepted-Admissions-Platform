import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
  VICTORIA_BIOGRAPHY,
  VICTORIA_BOOKING_TAGLINE,
  VICTORIA_PREVIOUS_BIOGRAPHY,
  VICTORIA_DISPLAY_NAME,
  VICTORIA_INTENDED_EMAIL,
  VICTORIA_PHOTO_ALT_TEXT,
  VICTORIA_PHOTO_URL,
  VICTORIA_PLACEHOLDER_DISPLAY_NAME,
  VICTORIA_PLACEHOLDER_EMAIL,
  VICTORIA_USER_ID,
  decidePlaceholderLink,
  isProductionClerkUserId,
  normalizeConsultingEmail,
  portalAccessRevoked,
  type PlaceholderLinkStopReason,
} from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NIKA_BOOKING_TAGLINE, XAVIER_BOOKING_TAGLINE } from "./public-team-roster.ts";
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

type ProvisionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PROVISION_LOCK_KEY = "college-consulting-provision";

function pendingClerkUserId(email: string): string {
  return `pending:${normalizeConsultingEmail(email)}`;
}

async function clerkOwnerId(tx: ProvisionTx, clerkUserId: string): Promise<string | null> {
  if (!clerkUserId) return null;
  const [owner] = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  return owner?.id ?? null;
}

async function ensureCatalogProducts(tx: ProvisionTx): Promise<void> {
  for (const product of COLLEGE_CONSULTING_PRODUCTS) {
    await tx
      .insert(satProductsTable)
      .values({
        slug: product.slug,
        name: product.name,
        description: product.description,
        durationHours: 1,
        totalPriceCents: product.hourlyRateCents,
        effectiveHourlyRateCents: product.hourlyRateCents,
        active: true,
      })
      .onConflictDoNothing({ target: satProductsTable.slug });
  }
}

async function ensureCourse(tx: ProvisionTx): Promise<void> {
  await tx
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
    .onConflictDoNothing({ target: coursesTable.id });
  await tx
    .update(coursesTable)
    .set({ meetUrl: SHARED_FALL_MEETING_URL })
    .where(
      and(
        eq(coursesTable.id, COLLEGE_CONSULTING_COURSE_ID),
        sql`${coursesTable.meetUrl} is null OR ${coursesTable.meetUrl} = ''`,
      ),
    );
}

async function ensureWeeklyHours(tx: ProvisionTx, tutorProfileId: string): Promise<void> {
  const [rule] = await tx
    .select({ id: availabilityRulesTable.id })
    .from(availabilityRulesTable)
    .where(eq(availabilityRulesTable.tutorProfileId, tutorProfileId))
    .limit(1);
  if (rule) return;
  await tx.insert(availabilityRulesTable).values({
    tutorProfileId,
    timezone: "America/New_York",
    weeklyHours: XAVIER_BOOKING_WEEKLY_HOURS,
    bookingNoticeMinutes: 1440,
    bufferMinutes: 15,
    blackoutDates: [],
  });
}

async function ensureNika(tx: ProvisionTx): Promise<string | null> {
  const [user] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, NIKA_CONSULTING_EMAIL))
    .limit(1);
  const [grant] = await tx
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
  // Nika already has portal access. Do not create a user or grant, and do not turn a revoked row back on.
  if (!user || !grant || portalAccessRevoked(grant)) {
    return clerkUserId;
  }
  let nikaUser = user;
  if (
    clerkUserId &&
    !isProductionClerkUserId(nikaUser.clerkUserId) &&
    (await clerkOwnerId(tx, clerkUserId)) === null
  ) {
    const [updated] = await tx
      .update(usersTable)
      .set({ clerkUserId, updatedAt: new Date() })
      .where(eq(usersTable.id, nikaUser.id))
      .returning();
    if (updated) nikaUser = updated;
  }
  if (
    isProductionClerkUserId(nikaUser.clerkUserId) &&
    !isProductionClerkUserId(grant.clerkUserId)
  ) {
    await tx
      .update(portalAccessGrantsTable)
      .set({ clerkUserId: nikaUser.clerkUserId, userId: nikaUser.id, updatedAt: new Date() })
      .where(eq(portalAccessGrantsTable.id, grant.id));
  } else if (!grant.userId) {
    await tx
      .update(portalAccessGrantsTable)
      .set({ userId: nikaUser.id, updatedAt: new Date() })
      .where(eq(portalAccessGrantsTable.id, grant.id));
  }
  const [profile] = await tx
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.email, NIKA_CONSULTING_EMAIL))
    .limit(1);
  if (!profile || portalAccessRevoked(profile)) return clerkUserId;
  const subjects = [...new Set([...(profile.subjects ?? []), COLLEGE_CONSULTING_SUBJECT])];
  const subjectsChanged = subjects.length !== (profile.subjects ?? []).length;
  const linkUser = !profile.userId;
  if (subjectsChanged || !profile.bookingEligible || linkUser) {
    await tx
      .update(tutorProfilesTable)
      .set({
        ...(subjectsChanged ? { subjects } : {}),
        ...(!profile.bookingEligible ? { bookingEligible: true } : {}),
        ...(linkUser ? { userId: nikaUser.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tutorProfilesTable.id, profile.id));
  }
  await ensureWeeklyHours(tx, profile.id);
  return isProductionClerkUserId(nikaUser.clerkUserId) ? nikaUser.clerkUserId : clerkUserId;
}

async function ensurePlaceholderClient(tx: ProvisionTx, input: {
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
  const [byId] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, input.targetUserId))
    .limit(1);
  const loginEmail = byId ? normalizeConsultingEmail(byId.email) : email;
  if (loginEmail === VICTORIA_INTENDED_EMAIL && !byId) {
    return { linked: false, email: null, stoppedReason: "identity_not_verified", userId: null };
  }
  const [byEmail] = await tx
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, loginEmail))
    .limit(1);
  const existingUser = byId ?? byEmail ?? null;
  const [grant] = await tx
    .select()
    .from(portalAccessGrantsTable)
    .where(eq(portalAccessGrantsTable.email, existingUser ? normalizeConsultingEmail(existingUser.email) : email))
    .limit(1);
  if (portalAccessRevoked(grant)) {
    return {
      linked: false,
      email: existingUser?.email ?? null,
      stoppedReason: "access_revoked",
      userId: existingUser?.id ?? null,
    };
  }
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
    clerkIdOwnerUserId: candidateClerk ? await clerkOwnerId(tx, candidateClerk) : null,
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
    await tx
      .insert(usersTable)
      .values({
        id: input.targetUserId,
        clerkUserId,
        email,
        displayName: input.displayName,
        role: input.role,
        title: input.title,
      })
      .onConflictDoNothing();
    const [created] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, input.targetUserId))
      .limit(1);
    user = created ?? null;
  }
  if (!user) {
    return { linked: false, email: null, stoppedReason: "identity_not_verified", userId: null };
  }
  const grantEmail = normalizeConsultingEmail(user.email);
  if (!grant) {
    await tx
      .insert(portalAccessGrantsTable)
      .values({
        email: grantEmail,
        clerkUserId: user.clerkUserId,
        displayName: input.displayName,
        roleCategory: input.grantRole,
        active: true,
        notes: input.notes,
        userId: user.id,
      })
      .onConflictDoNothing({ target: portalAccessGrantsTable.email });
    const [stored] = await tx
      .select()
      .from(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.email, grantEmail))
      .limit(1);
    if (!stored || portalAccessRevoked(stored) || (stored.userId && stored.userId !== user.id)) {
      return {
        linked: false,
        email: user.email,
        stoppedReason: stored && portalAccessRevoked(stored) ? "access_revoked" : "grant_points_at_other_user",
        userId: user.id,
      };
    }
    if (!stored.userId) {
      await tx
        .update(portalAccessGrantsTable)
        .set({ userId: user.id, updatedAt: new Date() })
        .where(eq(portalAccessGrantsTable.id, stored.id));
    }
  } else if (!grant.userId) {
    await tx
      .update(portalAccessGrantsTable)
      .set({
        userId: user.id,
        ...(grant.displayName?.trim() ? {} : { displayName: input.displayName }),
        updatedAt: new Date(),
      })
      .where(eq(portalAccessGrantsTable.id, grant.id));
  }
  return { linked: true, email: user.email, stoppedReason: null, userId: user.id };
}

async function ensureMembership(
  tx: ProvisionTx,
  userId: string,
  membershipRole: "student" | "tutor",
): Promise<void> {
  await tx
    .insert(courseMembershipsTable)
    .values({
      courseId: COLLEGE_CONSULTING_COURSE_ID,
      userId,
      membershipRole,
      subject: COLLEGE_CONSULTING_SUBJECT,
    })
    .onConflictDoNothing();
}

async function ensureAssignment(
  tx: ProvisionTx,
  tutorUserId: string,
  studentUserId: string,
): Promise<void> {
  await tx
    .insert(tutorAssignmentsTable)
    .values({
      courseId: COLLEGE_CONSULTING_COURSE_ID,
      tutorUserId,
      studentUserId,
      subject: COLLEGE_CONSULTING_SUBJECT,
    })
    .onConflictDoNothing();
}

function blankProfileText(value: string | null | undefined): boolean {
  return !value?.trim();
}

async function ensureVictoriaProfile(tx: ProvisionTx, userId: string, email: string): Promise<void> {
  const notes = `Temporary tutor login ${VICTORIA_PLACEHOLDER_EMAIL}. Display name ${VICTORIA_DISPLAY_NAME} (she/her). Intended email ${VICTORIA_INTENDED_EMAIL} is not provisioned and must not be contacted. Swap users.email, portal_access_grants.email, and tutor_profiles.email for ${VICTORIA_USER_ID} later. No Clerk invitation was sent.`;
  const [byUser] = await tx
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, userId))
    .limit(1);
  const [byEmail] = byUser
    ? []
    : await tx
        .select()
        .from(tutorProfilesTable)
        .where(eq(tutorProfilesTable.email, normalizeConsultingEmail(email)))
        .limit(1);
  const profile = byUser ?? byEmail ?? null;
  if (!profile) {
    const [created] = await tx
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
        photoUrl: VICTORIA_PHOTO_URL,
        photoAltText: VICTORIA_PHOTO_ALT_TEXT,
        biography: VICTORIA_BIOGRAPHY,
        tagline: VICTORIA_BOOKING_TAGLINE,
        internalNotes: notes,
      })
      .onConflictDoNothing({ target: tutorProfilesTable.email })
      .returning();
    if (created) await ensureWeeklyHours(tx, created.id);
    await renameVictoriaPlaceholder(tx, userId);
    return;
  }
  if (profile.userId && profile.userId !== userId) return;
  if (portalAccessRevoked(profile)) return;
  const subjects = [...new Set([...(profile.subjects ?? []), COLLEGE_CONSULTING_SUBJECT])];
  await tx
    .update(tutorProfilesTable)
    .set({
      userId,
      email: normalizeConsultingEmail(email),
      name:
        blankProfileText(profile.name) || profile.name?.trim() === VICTORIA_PLACEHOLDER_DISPLAY_NAME
          ? VICTORIA_DISPLAY_NAME
          : profile.name,
      ...(profile.bookingEligible ? {} : { bookingEligible: true }),
      subjects,
      internalNotes: notes,
      ...(blankProfileText(profile.tagline) ? { tagline: VICTORIA_BOOKING_TAGLINE } : {}),
      ...(blankProfileText(profile.biography) || profile.biography?.trim() === VICTORIA_PREVIOUS_BIOGRAPHY
        ? { biography: VICTORIA_BIOGRAPHY }
        : {}),
      ...(profile.photoUrl?.trim()
        ? {}
        : { photoUrl: VICTORIA_PHOTO_URL }),
      ...(!profile.photoUrl?.trim() ||
      blankProfileText(profile.photoAltText) ||
      profile.photoAltText === "Victoria, College Consulting Tutor"
        ? { photoAltText: VICTORIA_PHOTO_ALT_TEXT }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(tutorProfilesTable.id, profile.id));
  await renameVictoriaPlaceholder(tx, userId);
  await ensureWeeklyHours(tx, profile.id);
}

async function renameVictoriaPlaceholder(tx: ProvisionTx, userId: string): Promise<void> {
  await tx
    .update(usersTable)
    .set({ displayName: VICTORIA_DISPLAY_NAME, updatedAt: new Date() })
    .where(
      and(eq(usersTable.id, userId), eq(usersTable.displayName, VICTORIA_PLACEHOLDER_DISPLAY_NAME)),
    );
  await tx
    .update(portalAccessGrantsTable)
    .set({ displayName: VICTORIA_DISPLAY_NAME, updatedAt: new Date() })
    .where(
      and(
        eq(portalAccessGrantsTable.userId, userId),
        eq(portalAccessGrantsTable.displayName, VICTORIA_PLACEHOLDER_DISPLAY_NAME),
        sql`${portalAccessGrantsTable.revokedAt} is null`,
        eq(portalAccessGrantsTable.active, true),
      ),
    );
}

async function ensureBookingTaglines(tx: ProvisionTx): Promise<void> {
  await tx
    .update(tutorProfilesTable)
    .set({ tagline: NIKA_BOOKING_TAGLINE, updatedAt: new Date() })
    .where(
      and(
        eq(tutorProfilesTable.email, NIKA_CONSULTING_EMAIL),
        eq(tutorProfilesTable.active, true),
        isNull(tutorProfilesTable.tagline),
      ),
    );
  const xavierUsers = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      or(
        eq(usersTable.email, CANONICAL_XAVIER_EMAIL),
        eq(usersTable.clerkUserId, CANONICAL_XAVIER_CLERK_USER_ID),
      ),
    );
  const xavierUserIds = xavierUsers.map((user: { id: string }) => user.id);
  await tx
    .update(tutorProfilesTable)
    .set({ tagline: XAVIER_BOOKING_TAGLINE, updatedAt: new Date() })
    .where(
      and(
        or(
          eq(tutorProfilesTable.email, CANONICAL_XAVIER_EMAIL),
          xavierUserIds.length > 0 ? inArray(tutorProfilesTable.userId, xavierUserIds) : sql`false`,
        ),
        eq(tutorProfilesTable.active, true),
        isNull(tutorProfilesTable.tagline),
      ),
    );
}

export async function ensureCollegeConsultingProvision(): Promise<CollegeConsultingProvisionStatus> {
  const status = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PROVISION_LOCK_KEY}))`);
    return provisionCollegeConsulting(tx);
  });
  lastStatus = status;
  return lastStatus;
}

async function provisionCollegeConsulting(tx: ProvisionTx): Promise<CollegeConsultingProvisionStatus> {
  await ensureCatalogProducts(tx);
  await ensureCourse(tx);
  await ensureBookingTaglines(tx);
  const nikaClerkUserId = await ensureNika(tx);
  const neel = await ensurePlaceholderClient(tx, {
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
  const victoria = await ensurePlaceholderClient(tx, {
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
    await ensureVictoriaProfile(tx, victoria.userId, victoria.email);
    await ensureMembership(tx, victoria.userId, "tutor");
  }
  if (neel.linked && neel.userId) {
    await ensureMembership(tx, neel.userId, "student");
    const tutorEmails = [NIKA_CONSULTING_EMAIL, CANONICAL_XAVIER_EMAIL];
    const tutors = await tx
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, tutorEmails));
    const xavierByClerk = tutors.some(
      (tutor: { id: string; email: string }) =>
        normalizeConsultingEmail(tutor.email) === normalizeConsultingEmail(CANONICAL_XAVIER_EMAIL),
    )
      ? null
      : (
          await tx
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
    const [nikaUser] = await tx
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, NIKA_CONSULTING_EMAIL))
      .limit(1);
    const [nikaGrant] = nikaUser
      ? await tx
          .select({
            active: portalAccessGrantsTable.active,
            revokedAt: portalAccessGrantsTable.revokedAt,
          })
          .from(portalAccessGrantsTable)
          .where(eq(portalAccessGrantsTable.email, NIKA_CONSULTING_EMAIL))
          .limit(1)
      : [];
    const [nikaProfile] = nikaUser
      ? await tx
          .select({ active: tutorProfilesTable.active })
          .from(tutorProfilesTable)
          .where(eq(tutorProfilesTable.email, NIKA_CONSULTING_EMAIL))
          .limit(1)
      : [];
    if (
      nikaUser &&
      nikaUser.role !== "administrator" &&
      nikaGrant &&
      !portalAccessRevoked(nikaGrant) &&
      nikaProfile &&
      !portalAccessRevoked(nikaProfile)
    ) {
      tutorIds.push(nikaUser.id);
    }
    for (const tutorUserId of [...new Set(tutorIds)]) {
      await ensureMembership(tx, tutorUserId, "tutor");
      await ensureAssignment(tx, tutorUserId, neel.userId);
    }
  }
  return {
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
}
