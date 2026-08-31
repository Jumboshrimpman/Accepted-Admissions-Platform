import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  createGoogleEvent,
  decryptCalendarToken,
  deleteGoogleEvent,
  encryptCalendarToken,
  exchangeGoogleCode,
  getGoogleCalendarConfig,
  googleCalendarCompletionHtml,
  googleCalendarAuthorizationUrl,
  listGoogleBusyWindows,
  readCalendarOAuthState,
  refreshGoogleAccessToken,
  updateGoogleEvent,
} from "../lib/google-calendar";
import {
  calendarEventPayload,
  generateAvailableSlots,
  overlapsBusyWindow,
  type AvailabilityRule,
  type BusyWindow,
} from "../lib/booking";
import {
  TAITO_FALL_2026_SESSIONS,
  TAITO_SESSION_TIMEZONE,
  sessionTitle,
  taitoSessionDateTime,
} from "../lib/session-schedule";
import {
  createCheckoutSession,
  createHostedInvoice,
  stripeErrorMessage,
  voidHostedInvoice,
} from "../lib/payment-service";
import {
  AttachQuestionToAssignmentBody,
  AttachQuestionToAssignmentParams,
  AttachQuestionToAssignmentResponse,
  CreateContentSourceBody,
  CreateContentSourceResponse,
  CreateCurriculumBlockBody,
  GeneratePracticeQuestionsBody,
  GeneratePracticeQuestionsParams,
  GeneratePracticeQuestionsResponse,
  CreateCurriculumBlockParams,
  CreateCurriculumBlockResponse,
  GetAssignmentParams,
  GetAssignmentResponse,
  GetAttemptParams,
  GetAttemptResponse,
  GetCourseParams,
  GetCourseResponse,
  GetCurrentUserResponse,
  GetDashboardResponse,
  GetSessionParams,
  GetSessionResponse,
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
  ListCoursesResponse,
  ListContentSourcesQueryParams,
  ListContentSourcesResponse,
  ListQuestionBankQueryParams,
  ListQuestionBankResponse,
  ListReviewQueueResponse,
  ListSessionArtifactsParams,
  ListSessionArtifactsResponse,
  UpdateQuestionBankItemBody,
  UpdateQuestionBankItemParams,
  UpdateQuestionBankItemResponse,
  PauseAttemptParams,
  PauseAttemptResponse,
  ResumeAttemptParams,
  ResumeAttemptResponse,
  SaveAttemptResponseBody,
  SaveAttemptResponseParams,
  SaveAttemptResponseResponse,
  StartAttemptParams,
  StartAttemptResponse,
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
  UpdateCurriculumBlockBody,
  UpdateCurriculumBlockParams,
  UpdateCurriculumBlockResponse,
  UpdateReviewQueueItemBody,
  UpdateReviewQueueItemParams,
  UpdateReviewQueueItemResponse,
  UpsertSessionArtifactBody,
  UpsertSessionArtifactParams,
  UpsertSessionArtifactResponse,
} from "@workspace/api-zod";
import {
  configuredAccess,
  normalizeProvisionedEmail,
  type ConfiguredAccess,
  verifiedPrimaryEmail,
} from "../lib/access-config";
import {
  contentSourcesTable,
  assignmentQuestionsTable,
  assignmentsTable,
  attemptsTable,
  auditLogsTable,
  availabilityRulesTable,
  calendarConnectionsTable,
  clientRequestsTable,
  courseMembershipsTable,
  coursesTable,
  curriculumBlocksTable,
  creditLedgerTable,
  db,
  invoicesTable,
  paymentsTable,
  publicContentTable,
  questionsTable,
  responsesTable,
  reviewQueueTable,
  satProductsTable,
  sessionArtifactsTable,
  sessionsTable,
  timerEventsTable,
  tutorProfilesTable,
  tutorAssignmentsTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
} from "@workspace/db";

type AuthedRequest = Request & { appUser?: AppUser };

const router: IRouter = Router();

function claimString(claims: unknown, key: string): string | undefined {
  if (!claims || typeof claims !== "object") return undefined;
  const value = (claims as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function subjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.startsWith("sat")) return "sat";
  if (normalized.startsWith("ielts") || normalized.startsWith("english")) {
    return "ielts";
  }
  return normalized;
}

function publicAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  throw new Error("APP_ORIGIN must be configured for hosted payment redirects");
}

async function ensureSeedData(): Promise<string> {
  const [existing] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, "Fall 2026 SAT & IELTS"))
    .limit(1);
  if (existing) {
    await reconcileTaitoSessions(existing.id);
    return existing.id;
  }

  const [course] = await db
    .insert(coursesTable)
    .values({
      title: "Fall 2026 SAT & IELTS",
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
      goalSummary:
        "Build SAT Reading & Writing accuracy, pacing, and IELTS confidence through focused weekly practice.",
      meetUrl: "https://meet.google.com/",
      driveUrl: "https://drive.google.com/",
    })
    .returning();

  const seededSessions = await db
    .insert(sessionsTable)
    .values(
      TAITO_FALL_2026_SESSIONS.map(({ dateKey, subject, tutorName }) => ({
        courseId: course.id,
        dateTime: taitoSessionDateTime(dateKey),
        timezone: TAITO_SESSION_TIMEZONE,
        subject,
        title: sessionTitle(subject, tutorName),
        status: "published" as const,
        hasHomework: subject === "SAT",
      })),
    )
    .returning();
  await reconcileTaitoSessions(course.id);

  await db.insert(curriculumBlocksTable).values([
    {
      sessionId: seededSessions[0]!.id,
      kind: "objectives",
      position: 0,
      visibility: "both",
      status: "published",
      config: {
        title: "Session goals",
        items: [
          "Review summer progress",
          "Complete a baseline timed mini-section",
          "Set measurable Fall goals",
        ],
      },
    },
    {
      sessionId: seededSessions[0]!.id,
      kind: "timeline",
      position: 1,
      visibility: "both",
      status: "published",
      config: {
        items: [
          { minutes: 10, label: "SAT Math focus drill" },
          { minutes: 45, label: "Reading & Writing review" },
          { minutes: 5, label: "Goals and next steps" },
        ],
      },
    },
  ]);

  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      courseId: course.id,
      sessionId: seededSessions[0]!.id,
      title: "Baseline Reading & Writing Mini-Section",
      subject: "SAT Reading & Writing",
      instructions:
        "Complete this original mini-section independently. You may pause, but all question content will be hidden while paused.",
      status: "published",
      deadline: new Date("2026-10-01T12:00:00.000Z"),
      timeLimitMinutes: 12,
      maxAttempts: 2,
    })
    .returning();

  const createdQuestions = await db
    .insert(questionsTable)
    .values([
      {
        subject: "SAT Reading & Writing",
        domain: "Standard English Conventions",
        skill: "Boundaries",
        questionType: "multiple_choice",
        difficulty: "medium",
        stimulus:
          "The community archive contains letters, maps, and photographs from the town's earliest residents. Together, these materials reveal how the waterfront changed over time.",
        prompt:
          "Which choice most effectively combines the sentences while maintaining standard English conventions?",
        choices: [
          { id: "a", label: "A", text: "residents, together these" },
          { id: "b", label: "B", text: "residents; together, these" },
          { id: "c", label: "C", text: "residents together these" },
          { id: "d", label: "D", text: "residents: together these" },
        ],
        correctAnswer: "b",
        explanation:
          "A semicolon correctly joins two independent clauses, and the introductory adverb is followed by a comma.",
      },
      {
        subject: "SAT Reading & Writing",
        domain: "Information and Ideas",
        skill: "Command of Evidence",
        questionType: "multiple_choice",
        difficulty: "hard",
        stimulus:
          "In a greenhouse study, seedlings receiving six hours of filtered light grew taller than seedlings receiving six hours of direct light, while both groups received equal water and nutrients.",
        prompt: "Which conclusion is best supported by the study?",
        choices: [
          { id: "a", label: "A", text: "Filtered light always improves plant health." },
          { id: "b", label: "B", text: "Water affected the groups differently." },
          { id: "c", label: "C", text: "Light conditions may influence seedling height." },
          { id: "d", label: "D", text: "Direct light prevents all seedling growth." },
        ],
        correctAnswer: "c",
        explanation:
          "The controlled comparison supports a limited conclusion about a possible relationship between light conditions and height.",
      },
      {
        subject: "SAT Reading & Writing",
        domain: "Expression of Ideas",
        skill: "Transitions",
        questionType: "multiple_choice",
        difficulty: "medium",
        stimulus:
          "The first prototype was inexpensive to produce. _____, it was too fragile for repeated classroom use.",
        prompt: "Which choice completes the text with the most logical transition?",
        choices: [
          { id: "a", label: "A", text: "Similarly" },
          { id: "b", label: "B", text: "However" },
          { id: "c", label: "C", text: "For example" },
          { id: "d", label: "D", text: "Therefore" },
        ],
        correctAnswer: "b",
        explanation:
          "The second sentence contrasts the prototype's low cost with its lack of durability, so “However” is logical.",
      },
    ])
    .returning();

  await db.insert(assignmentQuestionsTable).values(
    createdQuestions.map((question, index) => ({
      assignmentId: assignment.id,
      questionId: question.id,
      position: index,
      predictionFirst: index !== 1,
    })),
  );

  return course.id;
}

async function reconcileTaitoSessions(courseId: string): Promise<void> {
  const [courseSessions, tutorProfiles, users] = await Promise.all([
    db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.courseId, courseId)),
    db
      .select({
        id: tutorProfilesTable.id,
        userId: tutorProfilesTable.userId,
        email: tutorProfilesTable.email,
        name: tutorProfilesTable.name,
      })
      .from(tutorProfilesTable)
      .where(
        inArray(tutorProfilesTable.email, [
          "eunice_chon@berkeley.edu",
          "nika.raiffe@gmail.com",
        ]),
      ),
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(
        inArray(usersTable.email, [
          "taito0525@gmail.com",
          "eunice_chon@berkeley.edu",
          "nika.raiffe@gmail.com",
        ]),
      ),
  ]);
  const student = users.find((user) => user.email === "taito0525@gmail.com");
  const sessionsByDate = new Map<string, (typeof courseSessions)[number]>();
  for (const session of courseSessions) {
    const dateKey = session.dateTime.toISOString().slice(0, 10);
    if (!sessionsByDate.has(dateKey)) sessionsByDate.set(dateKey, session);
  }

  for (const scheduled of TAITO_FALL_2026_SESSIONS) {
    const dateTime = taitoSessionDateTime(scheduled.dateKey);
    const existing = sessionsByDate.get(scheduled.dateKey);
    const profile = tutorProfiles.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const account = users.find(
      (candidate) => candidate.email === scheduled.tutorEmail,
    );
    const tutorUserId =
      profile?.userId ?? account?.id ?? existing?.tutorUserId ?? null;
    const clientUserId = student?.id ?? existing?.clientUserId ?? null;
    const values = {
      dateTime,
      timezone: TAITO_SESSION_TIMEZONE,
      subject: scheduled.subject,
      title: sessionTitle(scheduled.subject, scheduled.tutorName),
      status: "published" as const,
      durationMinutes: 60,
      hasHomework: scheduled.subject === "SAT",
      tutorUserId,
      clientUserId,
    };

    if (existing) {
      if (
        existing.providerEventId &&
        existing.dateTime.getTime() !== dateTime.getTime()
      ) {
        throw new Error(
          `Cannot move Taito session ${existing.id} because it has a provider calendar event.`,
        );
      }
      await db
        .update(sessionsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(sessionsTable.id, existing.id));
    } else {
      await db.insert(sessionsTable).values({
        courseId,
        ...values,
        bookingStatus: "confirmed",
      });
    }
  }
}

async function ensureUpgradeSeedData(): Promise<void> {
  await db
    .insert(tutorProfilesTable)
    .values([
      {
        email: "xsfam6@gmail.com",
        name: "Xavier Morales",
        title: "SAT & Math Tutor",
        photoUrl:
          "https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp",
        photoAltText: "Xavier Morales, SAT and Math Tutor",
        biography:
          "Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He is a 2024 Rhodes Scholar, studying Philosophy for his Masters at Oxford until 2026. Xavier is also an incoming member of the 2029 Harvard Law School class.",
        subjects: ["SAT", "Math"],
        linkedinUrl: "https://www.linkedin.com/in/xavier-morales-8830821a5/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: true,
      },
      {
        email: "eunice_chon@berkeley.edu",
        name: "Eunice Chon",
        title: "Scholarship Tutor",
        photoUrl:
          "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg",
        photoAltText: "Eunice Chon, Scholarship Tutor",
        biography:
          "Eunice Chon is a third-year at Harvard College studying History of Science and Philosophy, with a secondary in Global Health and Health Policy. She is passionate about disability advocacy and law, including mental health justice and activism. She is a Coca-Cola Scholar.",
        subjects: ["Scholarships", "College admissions"],
        linkedinUrl: "https://linkedin.com/in/eunicechon",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: true,
      },
      {
        email: "nika.raiffe@gmail.com",
        name: "Nika Raiffe",
        title: "English & IELTS Tutor",
        subjects: ["English", "IELTS"],
        publicApproved: false,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(satProductsTable)
    .values([
      {
        slug: "single-sat-session",
        name: "Single SAT session",
        description: "One focused 60-minute SAT tutoring session.",
        durationHours: 1,
        totalPriceCents: 17500,
        effectiveHourlyRateCents: 17500,
      },
      {
        slug: "sat-10-hour-package",
        name: "SAT 10-hour package",
        description: "Ten hours of flexible SAT tutoring with one shared balance.",
        durationHours: 10,
        totalPriceCents: 150000,
        effectiveHourlyRateCents: 15000,
      },
      {
        slug: "sat-20-hour-package",
        name: "SAT 20-hour package",
        description: "Twenty hours of flexible SAT tutoring with one shared balance.",
        durationHours: 20,
        totalPriceCents: 240000,
        effectiveHourlyRateCents: 12000,
      },
    ])
    .onConflictDoNothing();

  const [singleSession] = await db
    .select()
    .from(satProductsTable)
    .where(eq(satProductsTable.slug, "single-sat-session"))
    .limit(1);
  const [pendingMichelle] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "michaelmakarem@gmail.com"))
    .limit(1);
  const michelle =
    pendingMichelle ??
    (
      await db
        .insert(usersTable)
        .values({
          clerkUserId: "pending:michaelmakarem@gmail.com",
          email: "michaelmakarem@gmail.com",
          displayName: "Michelle Makarem",
          role: "student",
        })
        .returning()
    )[0];
  const courseId = await ensureSeedData();
  if (michelle) {
    await db
      .insert(courseMembershipsTable)
      .values({
        courseId,
        userId: michelle.id,
        membershipRole: "student",
        subject: "SAT",
      })
      .onConflictDoNothing();
    const [existingCredit] = await db
      .select({ id: creditLedgerTable.id })
      .from(creditLedgerTable)
      .where(
        and(
          eq(creditLedgerTable.clientUserId, michelle.id),
          eq(creditLedgerTable.entryType, "original"),
          eq(creditLedgerTable.note, "Prepaid 60-minute SAT session"),
        ),
      )
      .limit(1);
    if (!existingCredit && singleSession) {
      await db.insert(creditLedgerTable).values({
        clientUserId: michelle.id,
        productId: singleSession.id,
        entryType: "original",
        hours: 1,
        note: "Prepaid 60-minute SAT session",
      });
    }
  }

  const seededTutors = await db
    .select({ id: tutorProfilesTable.id, name: tutorProfilesTable.name })
    .from(tutorProfilesTable)
    .where(inArray(tutorProfilesTable.name, ["Xavier Morales", "Eunice Chon"]));
  for (const tutor of seededTutors) {
    const [rule] = await db
      .select({ id: availabilityRulesTable.id })
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, tutor.id))
      .limit(1);
    if (!rule) {
      await db.insert(availabilityRulesTable).values({
        tutorProfileId: tutor.id,
        timezone: "America/New_York",
        weeklyHours:
          tutor.name === "Xavier Morales"
            ? {
                "1": [{ start: "09:00", end: "17:00" }],
                "2": [{ start: "09:00", end: "17:00" }],
                "3": [{ start: "09:00", end: "17:00" }],
                "4": [{ start: "09:00", end: "17:00" }],
                "5": [{ start: "09:00", end: "17:00" }],
              }
            : {
                "1": [{ start: "10:00", end: "18:00" }],
                "2": [{ start: "10:00", end: "18:00" }],
                "3": [{ start: "10:00", end: "18:00" }],
                "4": [{ start: "10:00", end: "18:00" }],
                "5": [{ start: "10:00", end: "18:00" }],
              },
        bookingNoticeMinutes: 1440,
        bufferMinutes: 15,
        blackoutDates: [],
      });
    }
  }

  await db
    .insert(publicContentTable)
    .values([
      {
        slug: "sat",
        pageType: "sat-offerings",
        title: "SAT tutoring",
        seoTitle: "SAT tutoring | Accepted Admissions",
        seoDescription:
          "Focused SAT tutoring with flexible session products and a clear credit-based scheduling flow.",
        body: {
          sections: [
            "Work with an SAT tutor around the skills and score goals that matter most.",
            "Choose a single session or package, then use purchased hours to schedule eligible tutoring.",
          ],
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "our-team",
        pageType: "team",
        title: "Our Team",
        seoTitle: "Our Team | Accepted Admissions",
        seoDescription:
          "Meet the tutors behind Accepted Admissions and learn how their experience shapes thoughtful student support.",
        body: {
          intro: "Choose the expert best fit for you.",
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "past-success",
        pageType: "success",
        title: "Past Success",
        seoTitle: "Past Student Success | Accepted Admissions",
        seoDescription:
          "Read an approved student testimonial and explore a sample of schools Accepted Admissions students have been accepted to.",
        body: {
          intro:
            "This is a sample of the schools our students have been accepted to. We work hard to get our students into the schools of their dreams. As recent students, we have a nuanced understanding of our modern world's competitive college application process landscape.",
          testimonial: {
            quote:
              "Really happy with my experience with Accepted Admissions. It was an advantage to have on-the-ground Harvard students who are current with applications advising me for cheaper than huge firms. It was nice to work with tutors who all had an Ivy League backgrounds.",
            attribution: "Sarah M.",
            attributionMode: "named",
          },
          schoolLogos: [
            {
              name: "Harvard University",
              src: "https://static.wixstatic.com/media/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png",
              alt: "Harvard University logo",
            },
            {
              name: "Princeton University",
              src: "https://static.wixstatic.com/media/2c8654_d6d5f4729bd048ddb2366f66b32506c4~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/princeton%20logo.png",
              alt: "Princeton University logo",
            },
            {
              name: "MIT",
              src: "https://static.wixstatic.com/media/2c8654_e7dedad8e02d43e6965cb5d8054d6c15~mv2.jpg/v1/crop/x_276,y_222,w_528,h_425/fill/w_296,h_238,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/MIT_edited.jpg",
              alt: "MIT logo",
            },
            {
              name: "University of Chicago",
              src: "https://static.wixstatic.com/media/2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg",
              alt: "University of Chicago logo",
            },
            {
              name: "Georgetown University",
              src: "https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png/v1/fill/w_266,h_266,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Georgetown-University-Logo.png",
              alt: "Georgetown University logo",
            },
            {
              name: "Boston University",
              src: "https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png/v1/fill/w_250,h_250,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Boston_University_seal.svg.png",
              alt: "Boston University seal",
            },
            {
              name: "Claremont McKenna College",
              src: "https://static.wixstatic.com/media/2c8654_69f9b18f19db4eb68fa898beeaec3768~mv2.png/v1/fill/w_266,h_277,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/CMC%20Seal.png",
              alt: "Claremont McKenna College seal",
            },
          ],
        },
        status: "published",
        publishedAt: new Date(),
      },
    ])
    .onConflictDoNothing();
}

async function syncConfiguredAccess(
  user: AppUser,
  access: ConfiguredAccess,
): Promise<void> {
  if (access.role === "viewer") {
    const [, targetEmail] = access.subject.split(":");
    if (!targetEmail) return;
    const [student] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, targetEmail))
      .limit(1);
    if (!student) return;
    await db
      .insert(viewerLinksTable)
      .values({
        viewerUserId: user.id,
        studentUserId: student.id,
        relationship: "read-only viewer",
      })
      .onConflictDoUpdate({
        target: [viewerLinksTable.viewerUserId, viewerLinksTable.studentUserId],
        set: { active: true },
      });
    return;
  }
  if (access.role === "administrator") return;

  const courseId = await ensureSeedData();
  await db
    .insert(courseMembershipsTable)
    .values({
      courseId,
      userId: user.id,
      membershipRole: access.role,
      subject: access.subject,
    })
    .onConflictDoUpdate({
      target: [courseMembershipsTable.courseId, courseMembershipsTable.userId],
      set: { membershipRole: access.role, subject: access.subject },
    });
  if (access.role === "tutor") {
    await db
      .update(tutorProfilesTable)
      .set({ userId: user.id, bookingEligible: true, updatedAt: new Date() })
      .where(eq(tutorProfilesTable.email, user.email));
  }

  const students = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(
      courseMembershipsTable,
      and(
        eq(courseMembershipsTable.userId, usersTable.id),
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.membershipRole, "student"),
      ),
    );
  const tutors = await db
    .select({
      userId: courseMembershipsTable.userId,
      subject: courseMembershipsTable.subject,
    })
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.membershipRole, "tutor"),
      ),
    );
  for (const tutor of tutors) {
    for (const student of students) {
      await db
        .insert(tutorAssignmentsTable)
        .values({
          courseId,
          tutorUserId: tutor.userId,
          studentUserId: student.id,
          subject: tutor.subject,
        })
        .onConflictDoNothing();
    }
  }
}

async function clerkIdentity(
  auth: ReturnType<typeof getAuth>,
  clerkUserId: string,
  appUser?: AppUser,
  requireVerifiedEmail = false,
): Promise<{ email?: string; displayName?: string }> {
  let email = claimString(auth.sessionClaims, "email");
  let displayName =
    claimString(auth.sessionClaims, "name") ??
    claimString(auth.sessionClaims, "firstName");
  const needsVerifiedIdentity =
    requireVerifiedEmail ||
    !email ||
    appUser?.email.endsWith("@users.accepted.local") === true;
  if (needsVerifiedIdentity || !displayName) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    email =
      (requireVerifiedEmail
        ? verifiedPrimaryEmail(clerkUser)
        : clerkUser.primaryEmailAddress?.emailAddress) ??
      (requireVerifiedEmail ? undefined : email);
    displayName =
      displayName ??
      clerkUser.fullName ??
      clerkUser.firstName ??
      clerkUser.username ??
      undefined;
  }
  return { email, displayName };
}

async function requireAppUser(
  req: AuthedRequest,
  res: Response,
  next: () => void,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId =
    claimString(auth.sessionClaims, "userId") ?? auth.userId ?? undefined;
  if (!clerkUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let [appUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  const initialAccess = configuredAccess(clerkUserId);
  let configured = initialAccess.access;
  let configurationConflict = initialAccess.conflict;
  let identity: { email?: string; displayName?: string } | undefined;
  if (!configured) {
    try {
      identity = await clerkIdentity(auth, clerkUserId, appUser, true);
      const emailAccess = configuredAccess(
        clerkUserId,
        identity.email ? normalizeProvisionedEmail(identity.email) : undefined,
      );
      configured = emailAccess.access;
      configurationConflict = emailAccess.conflict;
    } catch {
      res.status(502).json({
        code: "IDENTITY_LOOKUP_FAILED",
        error: "The signed-in account could not be verified right now.",
      });
      return;
    }
  }
  if (configurationConflict) {
    if (appUser) {
      await db.insert(auditLogsTable).values({
        actorUserId: appUser.id,
        action: "access.denied",
        entityType: "portal",
        entityId: req.path,
        metadata: {
          method: req.method,
          reason: "conflicting_email_provisioning",
        },
      });
    }
    req.log?.error(
      {
        clerkUserId,
        email: identity?.email
          ? normalizeProvisionedEmail(identity.email)
          : undefined,
      },
      "Conflicting portal email provisioning",
    );
    res.status(503).json({
      code: "PORTAL_ACCESS_CONFIGURATION_ERROR",
      error: "Portal access configuration is invalid; contact an administrator",
    });
    return;
  }
  if (!configured) {
    if (appUser) {
      await db.insert(auditLogsTable).values({
        actorUserId: appUser.id,
        action: "access.denied",
        entityType: "portal",
        entityId: req.path,
        metadata: { method: req.method, reason: "identity_not_provisioned" },
      });
    }
    res.status(403).json({
      code: "IDENTITY_NOT_PROVISIONED",
      error: "Portal access has not been provisioned for this account",
    });
    return;
  }
  if (
    !identity &&
    (!appUser ||
      appUser.role === "tutor" ||
      !claimString(auth.sessionClaims, "email"))
  ) {
    try {
      identity = await clerkIdentity(auth, clerkUserId, appUser);
    } catch {
      res.status(502).json({
        code: "IDENTITY_LOOKUP_FAILED",
        error: "The signed-in account could not be verified right now.",
      });
      return;
    }
  }
  if (!appUser) {
    const email =
      (identity?.email
        ? normalizeProvisionedEmail(identity.email)
        : undefined) ??
      `${clerkUserId.replace(/[^a-zA-Z0-9_-]/g, "")}@users.accepted.local`;
    const displayName = identity?.displayName ?? "Accepted Admissions user";
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (existingUser) {
      [appUser] = await db
        .update(usersTable)
        .set({
          clerkUserId,
          displayName,
          role: configured.role,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingUser.id))
        .returning();
    } else {
      [appUser] = await db
        .insert(usersTable)
        .values({
          clerkUserId,
          email,
          displayName,
          role: configured.role,
        })
        .returning();
    }
    await db.insert(auditLogsTable).values({
      actorUserId: appUser.id,
      action: "access.provisioned",
      entityType: "user",
      entityId: appUser.id,
      metadata: { role: configured.role, subject: configured.subject },
    });
  } else if (
    identity?.email &&
    appUser.email !== normalizeProvisionedEmail(identity.email)
  ) {
    [appUser] = await db
      .update(usersTable)
      .set({
        email: normalizeProvisionedEmail(identity.email),
        ...(identity.displayName ? { displayName: identity.displayName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, appUser.id))
      .returning();
  }
  if (appUser.role !== configured.role) {
    await db.insert(auditLogsTable).values({
      actorUserId: appUser.id,
      action: "access.denied",
      entityType: "portal",
      entityId: req.path,
      metadata: { method: req.method, reason: "role_provisioning_mismatch" },
    });
    res.status(403).json({
      code: "ROLE_PROVISIONING_MISMATCH",
      error:
        "Portal role provisioning is out of sync; contact an administrator",
    });
    return;
  }
  await syncConfiguredAccess(appUser, configured);
  req.appUser = appUser;
  next();
}

function ensureRole(
  roles: AppUser["role"][],
): (req: AuthedRequest, res: Response, next: () => void) => void {
  return (req, res, next) => {
    if (!req.appUser || !roles.includes(req.appUser.role)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    next();
  };
}

async function resolveCalendarProfileForUser(
  user: AppUser,
  requestedProfileId?: string,
  createIfMissing = false,
): Promise<typeof tutorProfilesTable.$inferSelect | undefined> {
  const [linkedProfile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(
      requestedProfileId
        ? eq(tutorProfilesTable.id, requestedProfileId)
        : eq(tutorProfilesTable.userId, user.id),
    )
    .limit(1);
  if (requestedProfileId || linkedProfile) return linkedProfile;

  const [unlinkedProfile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(
      and(
        eq(tutorProfilesTable.email, user.email),
        isNull(tutorProfilesTable.userId),
      ),
    )
    .limit(1);
  if (unlinkedProfile) {
    const [claimedProfile] = await db
      .update(tutorProfilesTable)
      .set({
        userId: user.id,
        bookingEligible: user.role === "tutor",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tutorProfilesTable.id, unlinkedProfile.id),
          isNull(tutorProfilesTable.userId),
        ),
      )
      .returning();
    return claimedProfile;
  }
  if (!createIfMissing) return undefined;

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

  const [racedProfile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, user.id))
    .limit(1);
  return racedProfile;
}

async function visibleCourseIds(user: AppUser): Promise<string[]> {
  if (user.role === "administrator") {
    return (await db.select({ id: coursesTable.id }).from(coursesTable)).map(
      (row) => row.id,
    );
  }
  if (user.role === "viewer") {
    return (
      await db
        .select({ id: courseMembershipsTable.courseId })
        .from(viewerLinksTable)
        .innerJoin(
          courseMembershipsTable,
          eq(courseMembershipsTable.userId, viewerLinksTable.studentUserId),
        )
        .where(
          and(
            eq(viewerLinksTable.viewerUserId, user.id),
            eq(viewerLinksTable.active, true),
            eq(courseMembershipsTable.membershipRole, "student"),
          ),
        )
    ).map((row) => row.id);
  }
  return (
    await db
      .select({ id: courseMembershipsTable.courseId })
      .from(courseMembershipsTable)
      .where(
        and(
          eq(courseMembershipsTable.userId, user.id),
          eq(courseMembershipsTable.membershipRole, user.role),
        ),
      )
  ).map((row) => row.id);
}

async function canAccessCourse(
  user: AppUser,
  courseId: string,
  subject?: string,
): Promise<boolean> {
  if (user.role === "administrator") return true;
  if (user.role === "viewer") {
    const [link] = await db
      .select({ id: viewerLinksTable.id })
      .from(viewerLinksTable)
      .innerJoin(
        courseMembershipsTable,
        and(
          eq(courseMembershipsTable.userId, viewerLinksTable.studentUserId),
          eq(courseMembershipsTable.courseId, courseId),
          eq(courseMembershipsTable.membershipRole, "student"),
        ),
      )
      .where(
        and(
          eq(viewerLinksTable.viewerUserId, user.id),
          eq(viewerLinksTable.active, true),
        ),
      )
      .limit(1);
    return Boolean(link);
  }
  const [membership] = await db
    .select()
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.userId, user.id),
        eq(courseMembershipsTable.membershipRole, user.role),
      ),
    )
    .limit(1);
  if (!membership) return false;
  return (
    !subject ||
    membership.subject === "all" ||
    subjectFamily(membership.subject) === subjectFamily(subject)
  );
}

async function dataSubjectUserId(user: AppUser): Promise<string> {
  if (user.role !== "viewer") return user.id;
  const [link] = await db
    .select({ studentUserId: viewerLinksTable.studentUserId })
    .from(viewerLinksTable)
    .where(
      and(
        eq(viewerLinksTable.viewerUserId, user.id),
        eq(viewerLinksTable.active, true),
      ),
    )
    .limit(1);
  return link?.studentUserId ?? user.id;
}

async function courseSubjectForUser(
  user: AppUser,
  courseId: string,
): Promise<string> {
  if (user.role === "administrator") return "all";
  const [membership] = await db
    .select({ subject: courseMembershipsTable.subject })
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.courseId, courseId),
        eq(courseMembershipsTable.userId, user.id),
        eq(courseMembershipsTable.membershipRole, user.role),
      ),
    )
    .limit(1);
  return membership?.subject ?? "";
}

async function canAccessStudent(
  user: AppUser,
  courseId: string,
  studentUserId: string,
  subject?: string,
): Promise<boolean> {
  if (user.role === "administrator") return true;
  if (user.role === "student") return user.id === studentUserId;
  const conditions = [
    eq(tutorAssignmentsTable.courseId, courseId),
    eq(tutorAssignmentsTable.tutorUserId, user.id),
    eq(tutorAssignmentsTable.studentUserId, studentUserId),
  ];
  if (subject) {
    conditions.push(
      sql`(
        lower(${tutorAssignmentsTable.subject}) = 'all'
        OR lower(${tutorAssignmentsTable.subject}) LIKE ${subjectFamily(subject) + "%"}
      )`,
    );
  }
  const [assignment] = await db
    .select({ id: tutorAssignmentsTable.id })
    .from(tutorAssignmentsTable)
    .where(and(...conditions))
    .limit(1);
  return Boolean(assignment);
}

function tutorShape(user: AppUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.displayName,
    specialty: user.role === "tutor" ? "Assigned tutor" : "Program administrator",
    avatarUrl: null,
  };
}

async function sessionTutorShape(session: {
  tutorUserId: string | null;
  dateTime: Date;
}) {
  const scheduled = TAITO_FALL_2026_SESSIONS.find(
    (candidate) =>
      candidate.dateKey === session.dateTime.toISOString().slice(0, 10),
  );
  if (scheduled) {
    const [profile] = await db
      .select({
        id: tutorProfilesTable.id,
        name: tutorProfilesTable.name,
        title: tutorProfilesTable.title,
        photoUrl: tutorProfilesTable.photoUrl,
      })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.email, scheduled.tutorEmail))
      .limit(1);
    if (profile) {
      return {
        id: profile.id,
        name: profile.name,
        specialty: profile.title,
        avatarUrl: profile.photoUrl,
      };
    }
  }
  if (!session.tutorUserId) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.tutorUserId))
    .limit(1);
  return tutorShape(user ?? null);
}

async function courseShape(courseId: string, user?: AppUser) {
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  if (!course) return null;
  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, course.id));
  const membership = user && user.role !== "administrator"
    ? (
        await db
          .select({ subject: courseMembershipsTable.subject })
          .from(courseMembershipsTable)
          .where(
            and(
              eq(courseMembershipsTable.courseId, course.id),
              eq(courseMembershipsTable.userId, user.id),
              eq(courseMembershipsTable.membershipRole, user.role),
            ),
          )
          .limit(1)
      )[0]
    : null;
  const sessionsForUser = membership && membership.subject !== "all"
    ? courseSessions.filter(
        (session) =>
          subjectFamily(session.subject) === subjectFamily(membership.subject),
      )
    : courseSessions;
  const tutorMemberships = await db
    .select({ user: usersTable, subject: courseMembershipsTable.subject })
    .from(courseMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
    .where(
      and(
        eq(courseMembershipsTable.courseId, course.id),
        eq(courseMembershipsTable.membershipRole, "tutor"),
      ),
    );
  const visibleTutorMemberships =
    user?.role === "tutor" && membership && membership.subject !== "all"
      ? tutorMemberships.filter(
          ({ user: tutor, subject: tutorSubject }) =>
            tutor.id === user.id ||
            subjectFamily(membership.subject) === subjectFamily(tutorSubject),
        )
      : tutorMemberships;
  return {
    id: course.id,
    title: course.title,
    subject: course.subject,
    term: course.term,
    status: course.status,
    sessionCount: sessionsForUser.length,
    completedSessionCount: sessionsForUser.filter((s) => s.status === "completed")
      .length,
    tutors: visibleTutorMemberships.map(({ user }) => tutorShape(user)!),
  };
}

async function timerSummary(attemptId: string) {
  const events = await db
    .select()
    .from(timerEventsTable)
    .where(eq(timerEventsTable.attemptId, attemptId))
    .orderBy(asc(timerEventsTable.at));
  let activeSeconds = 0;
  let pausedSeconds = 0;
  let pauseCount = 0;
  let activeStart: Date | null = null;
  let pauseStart: Date | null = null;
  for (const event of events) {
    if (event.type === "started" || event.type === "resumed") {
      if (pauseStart) {
        pausedSeconds += Math.max(
          0,
          Math.floor((event.at.getTime() - pauseStart.getTime()) / 1000),
        );
        pauseStart = null;
      }
      activeStart = event.at;
    } else if (event.type === "paused" || event.type === "submitted") {
      if (activeStart) {
        activeSeconds += Math.max(
          0,
          Math.floor((event.at.getTime() - activeStart.getTime()) / 1000),
        );
        activeStart = null;
      }
      if (event.type === "paused") {
        pauseCount += 1;
        pauseStart = event.at;
      }
    }
  }
  const now = new Date();
  if (activeStart) {
    activeSeconds += Math.max(
      0,
      Math.floor((now.getTime() - activeStart.getTime()) / 1000),
    );
  }
  if (pauseStart) {
    pausedSeconds += Math.max(
      0,
      Math.floor((now.getTime() - pauseStart.getTime()) / 1000),
    );
  }
  return {
    activeSeconds,
    pausedSeconds,
    pauseCount,
    timerEvents: events.map((event) => ({ type: event.type, at: event.at })),
  };
}

async function attemptShape(attemptId: string) {
  const [attempt] = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) return null;
  const saved = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attempt.id));
  return {
    id: attempt.id,
    assignmentId: attempt.assignmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    ...(await timerSummary(attempt.id)),
    responses: saved.map((response) => ({
      questionId: response.questionId,
      prediction: response.prediction,
      predictionLocked: response.predictionLocked,
      finalAnswer: response.finalAnswer,
      flagged: response.flagged,
      savedAt: response.savedAt,
    })),
  };
}

async function canAccessAttempt(user: AppUser, attemptId: string) {
  const [record] = await db
    .select({
      attempt: attemptsTable,
      courseId: assignmentsTable.courseId,
      subject: assignmentsTable.subject,
    })
    .from(attemptsTable)
    .innerJoin(
      assignmentsTable,
      eq(assignmentsTable.id, attemptsTable.assignmentId),
    )
    .where(eq(attemptsTable.id, attemptId));
  if (!record) return null;
  if (user.role === "student") {
    return record.attempt.userId === user.id ? record : null;
  }
  if (user.role === "viewer") {
    const subjectUserId = await dataSubjectUserId(user);
    return record.attempt.userId === subjectUserId ? record : null;
  }
  if (!(await canAccessCourse(user, record.courseId, record.subject))) return null;
  if (
    user.role === "tutor" &&
    !(await canAccessStudent(
      user,
      record.courseId,
      record.attempt.userId,
      record.subject,
    ))
  ) {
    return null;
  }
  return record;
}

async function enforceTimeLimit(attemptId: string) {
  const [record] = await db
    .select({
      attempt: attemptsTable,
      timeLimitMinutes: assignmentsTable.timeLimitMinutes,
    })
    .from(attemptsTable)
    .innerJoin(
      assignmentsTable,
      eq(assignmentsTable.id, attemptsTable.assignmentId),
    )
    .where(eq(attemptsTable.id, attemptId));
  if (!record || record.attempt.status === "submitted") return record?.attempt;
  const timing = await timerSummary(attemptId);
  if (timing.activeSeconds >= record.timeLimitMinutes * 60) {
    const [expired] = await db
      .update(attemptsTable)
      .set({ status: "expired" })
      .where(eq(attemptsTable.id, attemptId))
      .returning();
    return expired;
  }
  return record.attempt;
}

const requestRateLimit = new Map<string, number>();

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

async function ensurePublicPlatformData(): Promise<void> {
  await ensureUpgradeSeedData();
}

class BookingError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function asDate(value: unknown): Date {
  if (typeof value !== "string") throw new BookingError(400, "INVALID_TIME", "A valid start time is required.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BookingError(400, "INVALID_TIME", "A valid start time is required.");
  }
  return date;
}

function durationFromBody(value: unknown): number {
  const duration = value === undefined ? 60 : Number(value);
  if (!Number.isInteger(duration) || duration < 30 || duration > 180 || duration % 30 !== 0) {
    throw new BookingError(400, "INVALID_DURATION", "Duration must be a 30-minute increment between 30 and 180 minutes.");
  }
  return duration;
}

async function calendarAccess(tutorProfileId: string) {
  const [connection] = await db
    .select()
    .from(calendarConnectionsTable)
    .where(
      and(
        eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
        eq(calendarConnectionsTable.provider, "google"),
        eq(calendarConnectionsTable.status, "connected"),
      ),
    )
    .limit(1);
  if (!connection?.encryptedAccessToken || !connection.calendarId) return null;
  try {
    let accessToken = decryptCalendarToken(connection.encryptedAccessToken);
    if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt <= new Date()) {
      if (!connection.encryptedRefreshToken) return null;
      const refreshed = await refreshGoogleAccessToken(
        decryptCalendarToken(connection.encryptedRefreshToken),
      );
      accessToken = refreshed.accessToken;
      await db
        .update(calendarConnectionsTable)
        .set({
          encryptedAccessToken: encryptCalendarToken(accessToken),
          accessTokenExpiresAt: refreshed.expiresIn
            ? new Date(Date.now() + refreshed.expiresIn * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnectionsTable.id, connection.id));
    }
    return { connection, accessToken };
  } catch {
    await db
      .update(calendarConnectionsTable)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(calendarConnectionsTable.id, connection.id));
    await db
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: new Date() })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
    return null;
  }
}

async function bookingTutor(tutorProfileId: string) {
  const [tutor] = await db
    .select()
    .from(tutorProfilesTable)
    .where(
      and(
        eq(tutorProfilesTable.id, tutorProfileId),
        eq(tutorProfilesTable.active, true),
        eq(tutorProfilesTable.bookingEligible, true),
      ),
    )
    .limit(1);
  if (!tutor) throw new BookingError(404, "TUTOR_NOT_FOUND", "That tutor is not available for booking.");
  const [rule] = await db
    .select()
    .from(availabilityRulesTable)
    .where(eq(availabilityRulesTable.tutorProfileId, tutorProfileId))
    .limit(1);
  if (!rule) throw new BookingError(409, "AVAILABILITY_NOT_CONFIGURED", "This tutor has not configured availability.");
  return { tutor, rule };
}

async function slotsForTutor(
  tutorProfileId: string,
  from: Date,
  to: Date,
  durationMinutes: number,
) {
  if (to <= from || to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new BookingError(400, "INVALID_RANGE", "Availability requests must cover a positive range of 31 days or less.");
  }
  const { tutor, rule } = await bookingTutor(tutorProfileId);
  const access = await calendarAccess(tutorProfileId);
  if (!access) {
    return { tutor, rule, access: null, slots: [] as string[] };
  }
  let busyWindows: BusyWindow[];
  try {
    busyWindows = await listGoogleBusyWindows(
      access.accessToken,
      access.connection.calendarId!,
      from,
      to,
    );
  } catch {
    await db
      .update(calendarConnectionsTable)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(calendarConnectionsTable.id, access.connection.id));
    await db
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: new Date() })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
    return { tutor, rule, access: null, slots: [] as string[] };
  }
  const [bookedSessions] = await Promise.all([
    db
      .select({
        dateTime: sessionsTable.dateTime,
        durationMinutes: sessionsTable.durationMinutes,
      })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.tutorUserId, tutor.userId ?? ""),
          inArray(sessionsTable.bookingStatus, ["confirmed", "rescheduled"]),
          sql`${sessionsTable.dateTime} < ${to}`,
          sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${from}`,
        ),
      ),
  ]);
  const bookedWindows: BusyWindow[] = bookedSessions.map((session) => ({
    start: session.dateTime.toISOString(),
    end: new Date(session.dateTime.getTime() + session.durationMinutes * 60_000).toISOString(),
  }));
  const availabilityRule: AvailabilityRule = {
    timezone: rule.timezone,
    weeklyHours: (rule.weeklyHours ?? {}) as Record<string, { start: string; end: string }[]>,
    bookingNoticeMinutes: rule.bookingNoticeMinutes,
    bufferMinutes: rule.bufferMinutes,
    blackoutDates: rule.blackoutDates,
  };
  return {
    tutor,
    rule,
    access,
    slots: generateAvailableSlots(
      availabilityRule,
      from,
      to,
      durationMinutes,
      busyWindows,
      bookedWindows,
    ),
  };
}

async function studentCourseForBooking(userId: string): Promise<{ id: string; subject: string }> {
  const memberships = await db
    .select({ id: courseMembershipsTable.courseId, subject: courseMembershipsTable.subject })
    .from(courseMembershipsTable)
    .where(
      and(
        eq(courseMembershipsTable.userId, userId),
        eq(courseMembershipsTable.membershipRole, "student"),
      ),
    );
  const membership = memberships.find((item) => subjectFamily(item.subject) === "sat" || item.subject === "all");
  if (!membership) throw new BookingError(409, "SAT_MEMBERSHIP_REQUIRED", "An active SAT student membership is required to book.");
  return { id: membership.id, subject: membership.subject === "all" ? "SAT" : membership.subject };
}

async function sessionForActor(sessionId: string, user: AppUser) {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session || !session.clientUserId) throw new BookingError(404, "SESSION_NOT_FOUND", "Booking session not found.");
  const subjectUserId = await dataSubjectUserId(user);
  const allowed =
    user.role === "administrator" ||
    session.clientUserId === subjectUserId ||
    (user.role === "tutor" && session.tutorUserId === user.id);
  if (!allowed) throw new BookingError(404, "SESSION_NOT_FOUND", "Booking session not found.");
  return session;
}

function sendBookingError(error: unknown, res: Response): void {
  if (error instanceof BookingError) {
    res.status(error.status).json({ code: error.code, error: error.message });
    return;
  }
  res.status(500).json({ error: "Booking service temporarily unavailable" });
}

router.get(
  "/calendar/oauth/callback",
  async (req: AuthedRequest, res): Promise<void> => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const providerError =
      typeof req.query.error === "string" ? req.query.error : undefined;
    if (!state) {
      res
        .status(400)
        .type("html")
        .send(
          googleCalendarCompletionHtml({
            success: false,
            outcome: "failed",
            message: "Calendar authorization was not completed.",
          }),
        );
      return;
    }
    try {
      const stateData = readCalendarOAuthState(state);
      if (!stateData) {
        res
          .status(400)
          .type("html")
          .send(
            googleCalendarCompletionHtml({
              success: false,
              outcome: "failed",
              message: "Calendar authorization expired. Please try again.",
            }),
          );
        return;
      }
      const [profile] = await db
        .select({
          id: tutorProfilesTable.id,
          email: tutorProfilesTable.email,
        })
        .from(tutorProfilesTable)
        .where(
          and(
            eq(tutorProfilesTable.id, stateData.tutorProfileId),
            eq(tutorProfilesTable.userId, stateData.appUserId),
          ),
        )
        .limit(1);
      if (!profile) {
        res
          .status(403)
          .type("html")
          .send(
            googleCalendarCompletionHtml({
              success: false,
              outcome: "rejected",
              message: "Calendar authorization belongs to a different portal account.",
            }),
          );
        return;
      }
      if (providerError) {
        res
          .status(400)
          .type("html")
          .send(
            googleCalendarCompletionHtml({
              success: false,
              outcome: "cancelled",
              message: "Google authorization was cancelled. No calendar changes were made.",
            }),
          );
        return;
      }
      if (!code) {
        res
          .status(400)
          .type("html")
          .send(
            googleCalendarCompletionHtml({
              success: false,
              outcome: "failed",
              message: "Google did not return an authorization code. Please try again.",
            }),
          );
        return;
      }
      const tokens = await exchangeGoogleCode(code);
      if (tokens.email.trim().toLowerCase() !== profile.email.trim().toLowerCase()) {
        res
          .status(403)
          .type("html")
          .send(
            googleCalendarCompletionHtml({
              success: false,
              outcome: "rejected",
              message: "Choose the Google account that matches your portal sign-in.",
            }),
          );
        return;
      }
      const [existing] = await db
        .select({ id: calendarConnectionsTable.id })
        .from(calendarConnectionsTable)
        .where(
          and(
            eq(calendarConnectionsTable.tutorProfileId, stateData.tutorProfileId),
            eq(calendarConnectionsTable.provider, "google"),
          ),
        )
        .limit(1);
      const values = {
        status: "connected",
        calendarId: "primary",
        encryptedAccessToken: encryptCalendarToken(tokens.accessToken),
        encryptedRefreshToken: tokens.refreshToken
          ? encryptCalendarToken(tokens.refreshToken)
          : undefined,
        accessTokenExpiresAt: tokens.expiresIn
          ? new Date(Date.now() + tokens.expiresIn * 1000)
          : null,
        connectedAt: new Date(),
        updatedAt: new Date(),
      };
      if (existing) {
        await db
          .update(calendarConnectionsTable)
          .set(values)
          .where(eq(calendarConnectionsTable.id, existing.id));
      } else {
        await db.insert(calendarConnectionsTable).values({
          tutorProfileId: stateData.tutorProfileId,
          provider: "google",
          ...values,
        });
      }
      await db
        .update(tutorProfilesTable)
        .set({ calendarStatus: "connected", updatedAt: new Date() })
        .where(eq(tutorProfilesTable.id, stateData.tutorProfileId));
      res.status(200).type("html").send(googleCalendarCompletionHtml());
    } catch {
      res
        .status(502)
        .type("html")
        .send(
          googleCalendarCompletionHtml({
            success: false,
            outcome: "failed",
            message: "Google Calendar authorization failed. Please try again.",
          }),
        );
    }
  },
);

router.get("/public/products", async (_req, res): Promise<void> => {
  await ensurePublicPlatformData();
  const products = await db
    .select()
    .from(satProductsTable)
    .where(eq(satProductsTable.active, true))
    .orderBy(asc(satProductsTable.durationHours));
  res.json(
    products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      durationHours: product.durationHours,
      totalPriceCents: product.totalPriceCents,
      effectiveHourlyRateCents: product.effectiveHourlyRateCents,
    })),
  );
});

router.get("/public/tutors", async (_req, res): Promise<void> => {
  await ensurePublicPlatformData();
  const tutors = await db
    .select({
      id: tutorProfilesTable.id,
      name: tutorProfilesTable.name,
      title: tutorProfilesTable.title,
      photoUrl: tutorProfilesTable.photoUrl,
      photoAltText: tutorProfilesTable.photoAltText,
      biography: tutorProfilesTable.biography,
      subjects: tutorProfilesTable.subjects,
      linkedinUrl: tutorProfilesTable.linkedinUrl,
      bookingEligible: tutorProfilesTable.bookingEligible,
      calendarStatus: tutorProfilesTable.calendarStatus,
    })
    .from(tutorProfilesTable)
    .where(
      and(
        eq(tutorProfilesTable.active, true),
        eq(tutorProfilesTable.publicApproved, true),
      ),
    )
    .orderBy(asc(tutorProfilesTable.name));
  res.json(tutors);
});

router.get("/public/content/:slug", async (req, res): Promise<void> => {
  await ensurePublicPlatformData();
  const [content] = await db
    .select()
    .from(publicContentTable)
    .where(
      and(
        eq(publicContentTable.slug, req.params.slug),
        eq(publicContentTable.status, "published"),
      ),
    )
    .limit(1);
  if (!content) {
    res.status(404).json({ error: "Published content not found" });
    return;
  }
  res.json({
    slug: content.slug,
    pageType: content.pageType,
    title: content.title,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    body: content.body,
  });
});

router.get(
  "/admin/tutors",
  requireAppUser,
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    await ensureUpgradeSeedData();
    const tutors = await db
      .select({
        id: tutorProfilesTable.id,
        email: tutorProfilesTable.email,
        name: tutorProfilesTable.name,
        title: tutorProfilesTable.title,
        photoUrl: tutorProfilesTable.photoUrl,
        photoAltText: tutorProfilesTable.photoAltText,
        biography: tutorProfilesTable.biography,
        subjects: tutorProfilesTable.subjects,
        linkedinUrl: tutorProfilesTable.linkedinUrl,
        publicApproved: tutorProfilesTable.publicApproved,
        active: tutorProfilesTable.active,
        bookingEligible: tutorProfilesTable.bookingEligible,
      })
      .from(tutorProfilesTable)
      .orderBy(asc(tutorProfilesTable.name));
    res.json(tutors);
  },
);

router.patch(
  "/admin/tutors/:id",
  requireAppUser,
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const tutorId = typeof req.params.id === "string" ? req.params.id : "";
    if (!tutorId) {
      res.status(400).json({ error: "Tutor profile is required" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const stringFields = [
      "name",
      "title",
      "photoUrl",
      "photoAltText",
      "biography",
      "linkedinUrl",
    ] as const;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of stringFields) {
      if (field in body && (typeof body[field] === "string" || body[field] === null)) {
        updates[field] = body[field];
      }
    }
    if ("subjects" in body && Array.isArray(body.subjects) && body.subjects.every((item) => typeof item === "string")) {
      updates.subjects = body.subjects;
    }
    for (const field of ["publicApproved", "active", "bookingEligible"] as const) {
      if (field in body && typeof body[field] === "boolean") updates[field] = body[field];
    }
    if (updates.publicApproved === true) {
      const biography = updates.biography ?? (
        await db
          .select({ biography: tutorProfilesTable.biography })
          .from(tutorProfilesTable)
          .where(eq(tutorProfilesTable.id, tutorId))
          .limit(1)
      )[0]?.biography;
      if (typeof biography !== "string" || !biography.trim()) {
        res.status(400).json({ error: "An approved tutor needs a biography." });
        return;
      }
    }
    const [saved] = await db
      .update(tutorProfilesTable)
      .set(updates)
      .where(eq(tutorProfilesTable.id, tutorId))
      .returning({
        id: tutorProfilesTable.id,
        email: tutorProfilesTable.email,
        name: tutorProfilesTable.name,
        title: tutorProfilesTable.title,
        photoUrl: tutorProfilesTable.photoUrl,
        photoAltText: tutorProfilesTable.photoAltText,
        biography: tutorProfilesTable.biography,
        subjects: tutorProfilesTable.subjects,
        linkedinUrl: tutorProfilesTable.linkedinUrl,
        publicApproved: tutorProfilesTable.publicApproved,
        active: tutorProfilesTable.active,
        bookingEligible: tutorProfilesTable.bookingEligible,
      });
    if (!saved) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "public.tutor_updated",
      entityType: "tutor_profile",
      entityId: saved.id,
      metadata: { publicApproved: saved.publicApproved },
    });
    res.json(saved);
  },
);

router.get(
  "/admin/public-content",
  requireAppUser,
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    await ensureUpgradeSeedData();
    res.json(
      await db
        .select()
        .from(publicContentTable)
        .where(inArray(publicContentTable.pageType, ["team", "success"]))
        .orderBy(asc(publicContentTable.slug)),
    );
  },
);

router.patch(
  "/admin/public-content/:slug",
  requireAppUser,
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    if (!slug) {
      res.status(400).json({ error: "Public content slug is required" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.appUser!.id };
    for (const field of ["title", "seoTitle", "seoDescription"] as const) {
      if (field in body && (typeof body[field] === "string" || body[field] === null)) {
        updates[field] = body[field];
      }
    }
    if ("body" in body && body.body && typeof body.body === "object" && !Array.isArray(body.body)) {
      updates.body = body.body;
    }
    if ("status" in body && ["draft", "published", "archived"].includes(String(body.status))) {
      updates.status = body.status;
      updates.publishedAt = body.status === "published" ? new Date() : null;
    }
    const [saved] = await db
      .update(publicContentTable)
      .set(updates)
      .where(eq(publicContentTable.slug, slug))
      .returning();
    if (!saved) {
      res.status(404).json({ error: "Public content not found" });
      return;
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "public.content_updated",
      entityType: "public_content",
      entityId: saved.id,
      metadata: { slug: saved.slug, status: saved.status },
    });
    res.json(saved);
  },
);

router.post("/public/client-requests", async (req, res): Promise<void> => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const lastRequest = requestRateLimit.get(ip) ?? 0;
  if (now - lastRequest < 60_000) {
    res.status(429).json({ error: "Please wait before sending another request." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const requiredFields = [
    "guardianName",
    "studentName",
    "email",
    "phone",
    "gradeOrGraduationYear",
    "currentSchool",
    "serviceRequested",
    "goals",
    "schedulingAvailability",
    "referralSource",
  ];
  if (
    requiredFields.some((field) => !stringField(body, field)) ||
    body.consentToContact !== true ||
    body.privacyAcknowledged !== true
  ) {
    res.status(400).json({
      error: "Complete all required fields and accept contact and privacy terms.",
    });
    return;
  }
  const email = stringField(body, "email").toLowerCase();
  const phone = stringField(body, "phone").replace(/[^\d+]/g, "");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.replace(/\D/g, "").length < 10
  ) {
    res.status(400).json({ error: "Enter a valid email address and phone number." });
    return;
  }
  const [lead] = await db
    .insert(clientRequestsTable)
    .values({
      guardianName: stringField(body, "guardianName"),
      studentName: stringField(body, "studentName"),
      email,
      phone,
      gradeOrGraduationYear: stringField(body, "gradeOrGraduationYear"),
      currentSchool: stringField(body, "currentSchool"),
      serviceRequested: stringField(body, "serviceRequested"),
      currentSatTotal: stringField(body, "currentSatTotal") || null,
      currentReadingWriting: stringField(body, "currentReadingWriting") || null,
      currentMath: stringField(body, "currentMath") || null,
      targetSatScore: stringField(body, "targetSatScore") || null,
      plannedTestDate: stringField(body, "plannedTestDate") || null,
      goals: stringField(body, "goals"),
      schedulingAvailability: stringField(body, "schedulingAvailability"),
      referralSource: stringField(body, "referralSource"),
      consentToContact: true,
      privacyAcknowledged: true,
      sourcePage: stringField(body, "sourcePage") || "/client-request",
    })
    .returning({ id: clientRequestsTable.id });
  requestRateLimit.set(ip, now);
  res.status(201).json({
    id: lead!.id,
    status: "received",
    message: "Thanks — your request has been received.",
  });
});

router.use(requireAppUser);

router.use((req: AuthedRequest, res: Response, next: () => void) => {
  if (
    req.appUser?.role === "viewer" &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    res.status(403).json({
      code: "VIEW_ONLY",
      error: "This account is view-only and cannot modify portal data.",
    });
    return;
  }
  next();
});

router.get(
  "/calendar/connections",
  ensureRole(["student", "tutor", "administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const tutorProfile = await resolveCalendarProfileForUser(req.appUser!);
    const rows = await db
      .select({
        id: calendarConnectionsTable.id,
        tutorProfileId: calendarConnectionsTable.tutorProfileId,
        provider: calendarConnectionsTable.provider,
        status: calendarConnectionsTable.status,
        connectedAt: calendarConnectionsTable.connectedAt,
      })
      .from(calendarConnectionsTable)
      .innerJoin(
        tutorProfilesTable,
        eq(tutorProfilesTable.id, calendarConnectionsTable.tutorProfileId),
      )
      .where(
        tutorProfile
          ? eq(calendarConnectionsTable.tutorProfileId, tutorProfile.id)
          : sql`false`,
      );
    res.json(rows);
  },
);

router.get(
  "/calendar/connect",
  ensureRole(["student", "tutor", "administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const requestedProfileId =
      typeof req.query.tutorProfileId === "string" ? req.query.tutorProfileId : undefined;
    const profile = await resolveCalendarProfileForUser(
      req.appUser!,
      requestedProfileId,
      true,
    );
    if (!profile || profile.userId !== req.appUser!.id) {
      res.status(404).json({ code: "TUTOR_NOT_FOUND", error: "Tutor profile not found." });
      return;
    }
    if (!getGoogleCalendarConfig()) {
      res.status(503).json({
        code: "CALENDAR_NOT_CONFIGURED",
        error: "Google Calendar OAuth is not configured for this workspace.",
      });
      return;
    }
    const authorizationUrl = googleCalendarAuthorizationUrl(
      profile.id,
      req.appUser!.id,
      profile.email,
    );
    if (req.query.redirect === "1") {
      res.redirect(authorizationUrl);
      return;
    }
    res.json({ authorizationUrl });
  },
);

router.delete(
  "/calendar/connections/:tutorProfileId",
  ensureRole(["student", "tutor", "administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const tutorProfileId =
      typeof req.params.tutorProfileId === "string" ? req.params.tutorProfileId : "";
    const [profile] = await db
      .select({ id: tutorProfilesTable.id, userId: tutorProfilesTable.userId })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, tutorProfileId))
      .limit(1);
    if (!profile || profile.userId !== req.appUser!.id) {
      res.status(404).json({ code: "TUTOR_NOT_FOUND", error: "Tutor profile not found." });
      return;
    }
    await db
      .update(calendarConnectionsTable)
      .set({
        status: "disconnected",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        accessTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, profile.id),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      );
    await db
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: new Date() })
      .where(eq(tutorProfilesTable.id, profile.id));
    res.status(204).send();
  },
);

router.get("/booking/tutors", async (_req: AuthedRequest, res): Promise<void> => {
  await ensureUpgradeSeedData();
  const tutors = await db
    .select({
      id: tutorProfilesTable.id,
      name: tutorProfilesTable.name,
      title: tutorProfilesTable.title,
      photoUrl: tutorProfilesTable.photoUrl,
      biography: tutorProfilesTable.biography,
      subjects: tutorProfilesTable.subjects,
      calendarStatus: tutorProfilesTable.calendarStatus,
    })
    .from(tutorProfilesTable)
    .where(
      and(
        eq(tutorProfilesTable.active, true),
        eq(tutorProfilesTable.bookingEligible, true),
      ),
    )
    .orderBy(asc(tutorProfilesTable.name));
  res.json(
    tutors.map((tutor) => ({
      ...tutor,
      providerStatus: tutor.calendarStatus === "connected" ? "connected" : "disconnected",
    })),
  );
});

router.get("/booking/availability", async (req: AuthedRequest, res): Promise<void> => {
  try {
    const tutorProfileId =
      typeof req.query.tutorProfileId === "string" ? req.query.tutorProfileId : "";
    const from = asDate(req.query.from);
    const to = asDate(req.query.to);
    const durationMinutes = durationFromBody(req.query.durationMinutes);
    if (!tutorProfileId) throw new BookingError(400, "INVALID_TUTOR", "A tutor is required.");
    const result = await slotsForTutor(tutorProfileId, from, to, durationMinutes);
    res.json({
      tutor: {
        id: result.tutor.id,
        name: result.tutor.name,
        title: result.tutor.title,
        timezone: result.rule.timezone,
      },
      providerStatus: result.access ? "connected" : "disconnected",
      slots: result.slots,
    });
  } catch (error) {
    sendBookingError(error, res);
  }
});

router.get("/booking/sessions", async (req: AuthedRequest, res): Promise<void> => {
  const subjectUserId = await dataSubjectUserId(req.appUser!);
  const sessions = await db
    .select({
      id: sessionsTable.id,
      courseId: sessionsTable.courseId,
      tutorProfileId: tutorProfilesTable.id,
      tutorName: tutorProfilesTable.name,
      dateTime: sessionsTable.dateTime,
      timezone: sessionsTable.timezone,
      subject: sessionsTable.subject,
      title: sessionsTable.title,
      durationMinutes: sessionsTable.durationMinutes,
      bookingStatus: sessionsTable.bookingStatus,
      providerEventId: sessionsTable.providerEventId,
      providerEventUrl: sessionsTable.providerEventUrl,
      cancellationReason: sessionsTable.cancellationReason,
    })
    .from(sessionsTable)
    .leftJoin(tutorProfilesTable, eq(tutorProfilesTable.userId, sessionsTable.tutorUserId))
    .where(eq(sessionsTable.clientUserId, subjectUserId))
    .orderBy(asc(sessionsTable.dateTime));
  res.json(sessions);
});

router.post("/booking/sessions", async (req: AuthedRequest, res): Promise<void> => {
  try {
    if (req.appUser!.role !== "student") {
      throw new BookingError(403, "STUDENT_ONLY", "Only a student can reserve a prepaid session.");
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tutorProfileId = stringField(body, "tutorProfileId");
    const start = asDate(body.startTime);
    const durationMinutes = durationFromBody(body.durationMinutes);
    if (!tutorProfileId) throw new BookingError(400, "INVALID_TUTOR", "A tutor is required.");
    const { tutor, rule, access, slots } = await slotsForTutor(
      tutorProfileId,
      new Date(start.getTime() - 1),
      new Date(start.getTime() + durationMinutes * 60_000 + 1),
      durationMinutes,
    );
    if (!access) throw new BookingError(409, "CALENDAR_DISCONNECTED", "This tutor's calendar is disconnected.");
    if (!slots.includes(start.toISOString())) {
      throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available. Choose another slot.");
    }
    const course = await studentCourseForBooking(req.appUser!.id);
    const created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`booking:${tutorProfileId}:${start.toISOString()}`}))`,
      );
      const [conflict] = await tx
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.tutorUserId, tutor.userId ?? ""),
            inArray(sessionsTable.bookingStatus, ["confirmed", "rescheduled"]),
            sql`${sessionsTable.dateTime} < ${start}`,
            sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${start}`,
          ),
        )
        .limit(1);
      if (conflict) throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available.");
      let liveBusyWindows: BusyWindow[];
      try {
        liveBusyWindows = await listGoogleBusyWindows(
          access.accessToken,
          access.connection.calendarId!,
          start,
          new Date(start.getTime() + durationMinutes * 60_000),
        );
      } catch {
        throw new BookingError(
          503,
          "CALENDAR_UNAVAILABLE",
          "The tutor calendar could not be checked. Your credit was not used.",
        );
      }
      if (
        overlapsBusyWindow(
          start,
          new Date(start.getTime() + durationMinutes * 60_000),
          liveBusyWindows,
          rule.bufferMinutes,
        )
      ) {
        throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available.");
      }
      await tx.execute(
        sql`select id from credit_ledger where client_user_id = ${req.appUser!.id} for update`,
      );
      const entries = await tx
        .select({ entryType: creditLedgerTable.entryType, hours: creditLedgerTable.hours })
        .from(creditLedgerTable)
        .where(eq(creditLedgerTable.clientUserId, req.appUser!.id));
      const remainingHours = entries.reduce(
        (total, entry) =>
          total +
          (["original", "restored", "adjustment_credit"].includes(entry.entryType)
            ? entry.hours
            : -entry.hours),
        0,
      );
      if (remainingHours < durationMinutes / 60) {
        throw new BookingError(409, "INSUFFICIENT_CREDIT", "You do not have enough prepaid hours for this session.");
      }
      const [session] = await tx
        .insert(sessionsTable)
        .values({
          courseId: course.id,
          clientUserId: req.appUser!.id,
          tutorUserId: tutor.userId,
          dateTime: start,
          timezone: rule.timezone,
          subject: "SAT",
          title: `SAT session with ${tutor.name}`,
          status: "published",
          durationMinutes,
          bookingStatus: "confirmed",
        })
        .returning();
      await tx.insert(creditLedgerTable).values({
        clientUserId: req.appUser!.id,
        productId: null,
        sessionId: session!.id,
        entryType: "debit",
        hours: durationMinutes / 60,
        referenceType: "session",
        referenceId: session!.id,
        note: `Reserved SAT session with ${tutor.name}`,
      });
      return session!;
    });
    try {
      const event = await createGoogleEvent(
        access.accessToken,
        access.connection.calendarId!,
        calendarEventPayload(
          created.title,
          start,
          durationMinutes,
          rule.timezone,
          req.appUser!.email,
        ),
      );
      const [updated] = await db
        .update(sessionsTable)
        .set({
          providerEventId: event.id ?? null,
          providerEventUrl: event.htmlLink ?? null,
          updatedAt: new Date(),
        })
        .where(eq(sessionsTable.id, created.id))
        .returning();
      res.status(201).json(updated ?? created);
    } catch {
      await db.transaction(async (tx) => {
        await tx
          .update(sessionsTable)
          .set({
            bookingStatus: "cancelled",
            cancelledAt: new Date(),
            cancellationReason: "Calendar event could not be created",
            updatedAt: new Date(),
          })
          .where(eq(sessionsTable.id, created.id));
        await tx.insert(creditLedgerTable).values({
          clientUserId: req.appUser!.id,
          sessionId: created.id,
          entryType: "restored",
          hours: durationMinutes / 60,
          referenceType: "session",
          referenceId: created.id,
          note: "Restored after calendar event creation failed",
        });
      });
      throw new BookingError(503, "CALENDAR_UNAVAILABLE", "The tutor calendar could not be updated. Your credit was not used.");
    }
  } catch (error) {
    sendBookingError(error, res);
  }
});

router.post("/booking/sessions/:sessionId/cancel", async (req: AuthedRequest, res): Promise<void> => {
  try {
    const sessionId = typeof req.params.sessionId === "string" ? req.params.sessionId : "";
    const session = await sessionForActor(sessionId, req.appUser!);
    if (session.bookingStatus === "cancelled") {
      res.json(session);
      return;
    }
    if (session.dateTime <= new Date()) {
      throw new BookingError(409, "SESSION_STARTED", "A session that has started cannot be cancelled.");
    }
    if (session.providerEventId && session.tutorUserId) {
      const profile = await db
        .select({ id: tutorProfilesTable.id })
        .from(tutorProfilesTable)
        .where(eq(tutorProfilesTable.userId, session.tutorUserId))
        .limit(1);
      const access = profile[0] ? await calendarAccess(profile[0].id) : null;
      if (!access) throw new BookingError(409, "CALENDAR_DISCONNECTED", "The tutor's calendar is disconnected.");
      await deleteGoogleEvent(access.accessToken, access.connection.calendarId!, session.providerEventId);
    }
    const reason = stringField((req.body ?? {}) as Record<string, unknown>, "reason") || "Cancelled by client";
    const [updated] = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from sessions where id = ${session.id} for update`);
      const [current] = await tx
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, session.id));
      if (!current || current.bookingStatus === "cancelled") return [current];
      const [saved] = await tx
        .update(sessionsTable)
        .set({
          bookingStatus: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(sessionsTable.id, session.id))
        .returning();
      await tx.insert(creditLedgerTable).values({
        clientUserId: current.clientUserId!,
        sessionId: current.id,
        entryType: "restored",
        hours: current.durationMinutes / 60,
        referenceType: "session",
        referenceId: current.id,
        note: "Credit restored after session cancellation",
      });
      return [saved];
    });
    res.json(updated);
  } catch (error) {
    sendBookingError(error, res);
  }
});

router.post("/booking/sessions/:sessionId/reschedule", async (req: AuthedRequest, res): Promise<void> => {
  try {
    const sessionId = typeof req.params.sessionId === "string" ? req.params.sessionId : "";
    const session = await sessionForActor(sessionId, req.appUser!);
    if (session.bookingStatus === "cancelled") {
      throw new BookingError(409, "SESSION_CANCELLED", "A cancelled session cannot be rescheduled.");
    }
    const start = asDate((req.body ?? {}).startTime);
    if (start <= new Date()) throw new BookingError(400, "INVALID_TIME", "Choose a future time.");
    const profile = session.tutorUserId
      ? (await db
          .select()
          .from(tutorProfilesTable)
          .where(eq(tutorProfilesTable.userId, session.tutorUserId))
          .limit(1))[0]
      : undefined;
    if (!profile) throw new BookingError(409, "TUTOR_NOT_FOUND", "This session has no bookable tutor.");
    const { rule, access, slots } = await slotsForTutor(
      profile.id,
      new Date(start.getTime() - 1),
      new Date(start.getTime() + session.durationMinutes * 60_000 + 1),
      session.durationMinutes,
    );
    if (!access) throw new BookingError(409, "CALENDAR_DISCONNECTED", "The tutor's calendar is disconnected.");
    if (!slots.includes(start.toISOString())) {
      throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available. Choose another slot.");
    }
    const previousStart = session.dateTime;
    const event = session.providerEventId
      ? await updateGoogleEvent(
          access.accessToken,
          access.connection.calendarId!,
          session.providerEventId,
          calendarEventPayload(
            session.title,
            start,
            session.durationMinutes,
            rule.timezone,
            (await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, session.clientUserId!)).limit(1))[0]?.email ?? "",
          ),
        )
      : null;
    const [updated] = await db
      .update(sessionsTable)
      .set({
        dateTime: start,
        timezone: rule.timezone,
        bookingStatus: "rescheduled",
        providerEventId: event?.id ?? session.providerEventId,
        providerEventUrl: event?.htmlLink ?? session.providerEventUrl,
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id))
      .returning();
    if (!updated) {
      if (session.providerEventId) {
        await updateGoogleEvent(
          access.accessToken,
          access.connection.calendarId!,
          session.providerEventId,
          calendarEventPayload(session.title, previousStart, session.durationMinutes, session.timezone, ""),
        );
      }
      throw new BookingError(500, "RESCHEDULE_FAILED", "The session could not be rescheduled.");
    }
    res.json(updated);
  } catch (error) {
    sendBookingError(error, res);
  }
});

async function financialSummary(clientUserId: string) {
  const [invoiceRows, paymentRows, entries] = await Promise.all([
    db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.clientUserId, clientUserId))
      .orderBy(desc(invoicesTable.createdAt)),
    db
      .select({
        id: paymentsTable.id,
        invoiceId: paymentsTable.invoiceId,
        productId: paymentsTable.productId,
        productName: satProductsTable.name,
        amountCents: paymentsTable.amountCents,
        refundedAmountCents: paymentsTable.refundedAmountCents,
        status: paymentsTable.status,
        method: paymentsTable.method,
        failureReason: paymentsTable.failureReason,
        paidAt: paymentsTable.paidAt,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
      .where(eq(paymentsTable.clientUserId, clientUserId))
      .orderBy(desc(paymentsTable.createdAt)),
    db
      .select({
        id: creditLedgerTable.id,
        clientUserId: creditLedgerTable.clientUserId,
        entryType: creditLedgerTable.entryType,
        hours: creditLedgerTable.hours,
        note: creditLedgerTable.note,
        productId: creditLedgerTable.productId,
        createdAt: creditLedgerTable.createdAt,
      })
      .from(creditLedgerTable)
      .where(eq(creditLedgerTable.clientUserId, clientUserId))
      .orderBy(desc(creditLedgerTable.createdAt)),
  ]);
  const remainingHours = entries.reduce((total, entry) => {
    const positive = ["original", "restored", "adjustment_credit"].includes(entry.entryType);
    return total + (positive ? entry.hours : -entry.hours);
  }, 0);
  return {
    remainingHours,
    invoices: invoiceRows.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      provider: invoice.provider,
      providerInvoiceId: invoice.providerInvoiceId,
      description: invoice.description,
      subtotalCents: invoice.subtotalCents,
      discountCents: invoice.discountCents,
      totalCents: invoice.totalCents,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
    })),
    payments: paymentRows,
    credits: entries,
  };
}

router.get("/financials", async (req: AuthedRequest, res): Promise<void> => {
  const subjectUserId = await dataSubjectUserId(req.appUser!);
  const summary = await financialSummary(subjectUserId);
  res.json({
    ...summary,
    readOnly: req.appUser!.role === "viewer",
    providerStatus: process.env.STRIPE_WEBHOOK_SECRET
      ? "connected"
      : "connected_webhook_setup_required",
  });
});

router.post(
  "/payments/checkout",
  ensureRole(["student"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const productId = stringField((req.body ?? {}) as Record<string, unknown>, "productId");
    const [product] = await db
      .select()
      .from(satProductsTable)
      .where(and(eq(satProductsTable.id, productId), eq(satProductsTable.active, true)))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "SAT product not found" });
      return;
    }
    const [invoice, payment] = await db.transaction(async (tx) => {
      const [createdInvoice] = await tx
        .insert(invoicesTable)
        .values({
          clientUserId: req.appUser!.id,
          status: "pending",
          provider: "stripe_checkout",
          description: product.name,
          subtotalCents: product.totalPriceCents,
          totalCents: product.totalPriceCents,
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: req.appUser!.id,
          invoiceId: createdInvoice!.id,
          productId: product.id,
          amountCents: product.totalPriceCents,
          status: "pending",
          method: "stripe_checkout",
        })
        .returning();
      return [createdInvoice!, createdPayment!];
    });
    try {
      const origin = publicAppOrigin();
      const checkout = await createCheckoutSession({
        user: req.appUser!,
        product,
        invoiceId: invoice.id,
        paymentId: payment.id,
        successUrl: `${origin}/portal?payment=success`,
        cancelUrl: `${origin}/sat?payment=canceled`,
      });
      await db
        .update(paymentsTable)
        .set({
          providerCheckoutSessionId: checkout.id,
          providerPaymentIntentId: checkout.paymentIntentId,
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));
      res.status(201).json({
        paymentId: payment.id,
        invoiceId: invoice.id,
        status: "pending",
        url: checkout.url,
      });
    } catch (error) {
      await db.transaction(async (tx) => {
        await tx
          .update(paymentsTable)
          .set({
            status: "failed",
            failureReason: stripeErrorMessage(error),
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));
        await tx
          .update(invoicesTable)
          .set({ status: "failed" })
          .where(eq(invoicesTable.id, invoice.id));
      });
      res.status(502).json({ error: stripeErrorMessage(error) });
    }
  },
);

router.get(
  "/admin/financials",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    const [clients, products, invoices, payments, credits] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          displayName: usersTable.displayName,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(eq(usersTable.role, "student"))
        .orderBy(asc(usersTable.displayName)),
      db
        .select({
          id: satProductsTable.id,
          slug: satProductsTable.slug,
          name: satProductsTable.name,
          description: satProductsTable.description,
          durationHours: satProductsTable.durationHours,
          totalPriceCents: satProductsTable.totalPriceCents,
          effectiveHourlyRateCents: satProductsTable.effectiveHourlyRateCents,
        })
        .from(satProductsTable)
        .where(eq(satProductsTable.active, true))
        .orderBy(asc(satProductsTable.durationHours)),
      db
        .select({
          id: invoicesTable.id,
          clientUserId: invoicesTable.clientUserId,
          clientName: usersTable.displayName,
          status: invoicesTable.status,
          provider: invoicesTable.provider,
          providerInvoiceId: invoicesTable.providerInvoiceId,
          description: invoicesTable.description,
          subtotalCents: invoicesTable.subtotalCents,
          discountCents: invoicesTable.discountCents,
          totalCents: invoicesTable.totalCents,
          hostedInvoiceUrl: invoicesTable.hostedInvoiceUrl,
          dueAt: invoicesTable.dueAt,
          paidAt: invoicesTable.paidAt,
          createdAt: invoicesTable.createdAt,
        })
        .from(invoicesTable)
        .leftJoin(usersTable, eq(usersTable.id, invoicesTable.clientUserId))
        .orderBy(desc(invoicesTable.createdAt)),
      db
        .select({
          id: paymentsTable.id,
          clientUserId: paymentsTable.clientUserId,
          clientName: usersTable.displayName,
          invoiceId: paymentsTable.invoiceId,
          productId: paymentsTable.productId,
          productName: satProductsTable.name,
          amountCents: paymentsTable.amountCents,
          refundedAmountCents: paymentsTable.refundedAmountCents,
          status: paymentsTable.status,
          method: paymentsTable.method,
          failureReason: paymentsTable.failureReason,
          paidAt: paymentsTable.paidAt,
          createdAt: paymentsTable.createdAt,
        })
        .from(paymentsTable)
        .leftJoin(usersTable, eq(usersTable.id, paymentsTable.clientUserId))
        .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
        .orderBy(desc(paymentsTable.createdAt)),
      db
        .select({
          id: creditLedgerTable.id,
          clientUserId: creditLedgerTable.clientUserId,
          clientName: usersTable.displayName,
          entryType: creditLedgerTable.entryType,
          hours: creditLedgerTable.hours,
          note: creditLedgerTable.note,
          createdAt: creditLedgerTable.createdAt,
        })
        .from(creditLedgerTable)
        .innerJoin(usersTable, eq(usersTable.id, creditLedgerTable.clientUserId))
        .orderBy(desc(creditLedgerTable.createdAt))
        .limit(100),
    ]);
    res.json({ clients, products, invoices, payments, credits });
  },
);

router.post(
  "/admin/invoices",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientUserId = stringField(body, "clientUserId");
    const productId = stringField(body, "productId");
    const rawDays = typeof body.daysUntilDue === "number" ? body.daysUntilDue : 7;
    const daysUntilDue = Math.max(1, Math.min(90, Math.round(rawDays)));
    const [[client], [product]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, clientUserId)).limit(1),
      db
        .select()
        .from(satProductsTable)
        .where(and(eq(satProductsTable.id, productId), eq(satProductsTable.active, true)))
        .limit(1),
    ]);
    if (!client || client.role !== "student" || !product) {
      res.status(404).json({ error: "Client or SAT product not found" });
      return;
    }
    const [invoice, payment] = await db.transaction(async (tx) => {
      const [createdInvoice] = await tx
        .insert(invoicesTable)
        .values({
          clientUserId: client.id,
          status: "pending",
          provider: "stripe_invoice",
          description: product.name,
          subtotalCents: product.totalPriceCents,
          totalCents: product.totalPriceCents,
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: client.id,
          invoiceId: createdInvoice!.id,
          productId: product.id,
          amountCents: product.totalPriceCents,
          status: "pending",
          method: "stripe_invoice",
        })
        .returning();
      return [createdInvoice!, createdPayment!];
    });
    try {
      const hosted = await createHostedInvoice({
        user: client,
        product,
        invoiceId: invoice.id,
        paymentId: payment.id,
        daysUntilDue,
      });
      const [updated] = await db
        .update(invoicesTable)
        .set({
          status: "sent",
          providerInvoiceId: hosted.id,
          hostedInvoiceUrl: hosted.hostedInvoiceUrl,
          dueAt: hosted.dueAt,
        })
        .where(eq(invoicesTable.id, invoice.id))
        .returning();
      await db.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "invoice.hosted_created",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { clientUserId: client.id, productId: product.id },
      });
      res.status(201).json(updated);
    } catch (error) {
      await db.transaction(async (tx) => {
        await tx
          .update(invoicesTable)
          .set({ status: "failed" })
          .where(eq(invoicesTable.id, invoice.id));
        await tx
          .update(paymentsTable)
          .set({
            status: "failed",
            failureReason: stripeErrorMessage(error),
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));
      });
      res.status(502).json({ error: stripeErrorMessage(error) });
    }
  },
);

router.post(
  "/admin/payments/offline",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientUserId = stringField(body, "clientUserId");
    const productId = stringField(body, "productId");
    const note = stringField(body, "note");
    const [[client], [product]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, clientUserId)).limit(1),
      db.select().from(satProductsTable).where(eq(satProductsTable.id, productId)).limit(1),
    ]);
    if (!client || client.role !== "student" || !product) {
      res.status(404).json({ error: "Client or SAT product not found" });
      return;
    }
    const payment = await db.transaction(async (tx) => {
      const now = new Date();
      const [invoice] = await tx
        .insert(invoicesTable)
        .values({
          clientUserId: client.id,
          status: "paid",
          provider: "offline",
          description: product.name,
          subtotalCents: product.totalPriceCents,
          totalCents: product.totalPriceCents,
          paidAt: now,
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: client.id,
          invoiceId: invoice!.id,
          productId: product.id,
          amountCents: product.totalPriceCents,
          status: "paid",
          method: "offline",
          internalNote: note || "Offline payment recorded by administrator",
          paidAt: now,
        })
        .returning();
      await tx.insert(creditLedgerTable).values({
        clientUserId: client.id,
        productId: product.id,
        entryType: "original",
        hours: product.durationHours,
        referenceType: "payment",
        referenceId: createdPayment!.id,
        fulfillmentKey: `payment:${createdPayment!.id}`,
        note: `${product.name} offline payment`,
        createdBy: req.appUser!.id,
      });
      await tx.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "payment.offline_recorded",
        entityType: "payment",
        entityId: createdPayment!.id,
        metadata: { clientUserId: client.id, productId: product.id },
      });
      return createdPayment!;
    });
    res.status(201).json(payment);
  },
);

router.post(
  "/admin/credit-adjustments",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientUserId = stringField(body, "clientUserId");
    const hours = typeof body.hours === "number" ? body.hours : Number.NaN;
    const note = stringField(body, "note");
    if (!Number.isFinite(hours) || hours === 0 || Math.abs(hours) > 100 || note.length < 3) {
      res.status(400).json({ error: "Enter a non-zero adjustment up to 100 hours and a note" });
      return;
    }
    const [client] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, clientUserId))
      .limit(1);
    if (!client || client.role !== "student") {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const [entry] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: client.id,
        entryType: hours > 0 ? "adjustment_credit" : "adjustment_debit",
        hours: Math.abs(hours),
        referenceType: "admin_adjustment",
        referenceId: randomUUID(),
        note,
        createdBy: req.appUser!.id,
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "credit.adjusted",
      entityType: "credit_ledger",
      entityId: entry!.id,
      metadata: { clientUserId: client.id, hours },
    });
    res.status(201).json(entry);
  },
);

router.patch(
  "/admin/invoices/:invoiceId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const invoiceId = typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
    const status = stringField((req.body ?? {}) as Record<string, unknown>, "status");
    if (!["pending", "sent", "overdue", "failed", "canceled"].includes(status)) {
      res.status(400).json({ error: "Invalid invoice status" });
      return;
    }
    const [updated] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId))
      .limit(1);
    const invoice = updated;
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    if (
      status === "canceled" &&
      invoice.provider === "stripe_invoice" &&
      invoice.providerInvoiceId &&
      !["paid", "refunded", "partially_refunded", "canceled"].includes(invoice.status)
    ) {
      try {
        await voidHostedInvoice(invoice.providerInvoiceId, invoice.id);
      } catch (error) {
        res.status(502).json({ error: stripeErrorMessage(error) });
        return;
      }
    }
    const [saved] = await db
      .update(invoicesTable)
      .set({ status })
      .where(eq(invoicesTable.id, invoiceId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "invoice.status_updated",
      entityType: "invoice",
      entityId: saved!.id,
      metadata: { status },
    });
    res.json(saved);
  },
);

router.get("/credits", async (req: AuthedRequest, res): Promise<void> => {
  const subjectUserId = await dataSubjectUserId(req.appUser!);
  const entries = await db
    .select({
      id: creditLedgerTable.id,
      entryType: creditLedgerTable.entryType,
      hours: creditLedgerTable.hours,
      note: creditLedgerTable.note,
      productId: creditLedgerTable.productId,
      createdAt: creditLedgerTable.createdAt,
    })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.clientUserId, subjectUserId))
    .orderBy(desc(creditLedgerTable.createdAt));
  const remainingHours = entries.reduce((total, entry) => {
    const positive = ["original", "restored", "adjustment_credit"].includes(entry.entryType);
    return total + (positive ? entry.hours : -entry.hours);
  }, 0);
  res.json({
    readOnly: req.appUser!.role === "viewer",
    remainingHours,
    entries,
    providerStatus: {
      payments: process.env.STRIPE_WEBHOOK_SECRET
        ? "connected"
        : "connected · webhook setup required",
      calendar: "disconnected",
      email: "not configured",
    },
  });
});

router.get(
  "/admin/overview",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    await ensureSeedData();
    await ensureUpgradeSeedData();
    const [users, memberships, assignments, audit, platform] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          clerkUserId: usersTable.clerkUserId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          role: usersTable.role,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(asc(usersTable.displayName)),
      db
        .select({
          id: courseMembershipsTable.id,
          courseId: courseMembershipsTable.courseId,
          courseTitle: coursesTable.title,
          userId: courseMembershipsTable.userId,
          userName: usersTable.displayName,
          membershipRole: courseMembershipsTable.membershipRole,
          subject: courseMembershipsTable.subject,
        })
        .from(courseMembershipsTable)
        .innerJoin(coursesTable, eq(coursesTable.id, courseMembershipsTable.courseId))
        .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
        .orderBy(asc(coursesTable.title), asc(usersTable.displayName)),
      db
        .select({
          id: tutorAssignmentsTable.id,
          courseId: tutorAssignmentsTable.courseId,
          courseTitle: coursesTable.title,
          tutorUserId: tutorAssignmentsTable.tutorUserId,
          studentUserId: tutorAssignmentsTable.studentUserId,
          subject: tutorAssignmentsTable.subject,
        })
        .from(tutorAssignmentsTable)
        .innerJoin(coursesTable, eq(coursesTable.id, tutorAssignmentsTable.courseId)),
      db
        .select({
          id: auditLogsTable.id,
          action: auditLogsTable.action,
          entityType: auditLogsTable.entityType,
          entityId: auditLogsTable.entityId,
          metadata: auditLogsTable.metadata,
          createdAt: auditLogsTable.createdAt,
        })
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(100),
      Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(usersTable),
        db
          .select({ count: sql<number>`count(*)` })
          .from(usersTable)
          .where(eq(usersTable.role, "student")),
        db
          .select({ count: sql<number>`count(*)` })
          .from(usersTable)
          .where(eq(usersTable.role, "tutor")),
        db
          .select({ count: sql<number>`count(*)` })
          .from(usersTable)
          .where(eq(usersTable.role, "viewer")),
        db
          .select({ count: sql<number>`count(*)` })
          .from(sessionsTable)
          .where(sql`${sessionsTable.dateTime} >= now()`),
        db
          .select({ count: sql<number>`count(*)` })
          .from(clientRequestsTable)
          .where(eq(clientRequestsTable.status, "new")),
        db
          .select({ count: sql<number>`count(*)` })
          .from(invoicesTable)
          .where(inArray(invoicesTable.status, ["pending", "sent", "overdue"])),
        db
          .select({ amount: sql<number>`coalesce(sum(${paymentsTable.amountCents}), 0)` })
          .from(paymentsTable)
          .where(eq(paymentsTable.status, "paid")),
      ]),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    res.json({
      users,
      memberships,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        tutorName: userById.get(assignment.tutorUserId)?.displayName ?? "Unknown tutor",
        studentName: userById.get(assignment.studentUserId)?.displayName ?? "Unknown student",
      })),
      audit,
      platform: {
        totalUsers: Number(platform[0][0]?.count ?? 0),
        clients: Number(platform[1][0]?.count ?? 0),
        tutors: Number(platform[2][0]?.count ?? 0),
        viewers: Number(platform[3][0]?.count ?? 0),
        upcomingSessions: Number(platform[4][0]?.count ?? 0),
        newRequests: Number(platform[5][0]?.count ?? 0),
        outstandingInvoices: Number(platform[6][0]?.count ?? 0),
        collectedRevenueCents: Number(platform[7][0]?.amount ?? 0),
        tutorCostsCents: 0,
        grossProfitCents: Number(platform[7][0]?.amount ?? 0),
        providerStatus: {
          calendar: "disconnected",
          payments: process.env.STRIPE_WEBHOOK_SECRET
            ? "connected"
            : "connected · webhook setup required",
          email: "not configured",
          otter: "disconnected",
        },
      },
    });
  },
);

router.get("/me", async (req: AuthedRequest, res): Promise<void> => {
  const user = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      avatarUrl: null,
    }),
  );
});

router.get("/courses", async (req: AuthedRequest, res): Promise<void> => {
  await ensureSeedData();
  const ids = await visibleCourseIds(req.appUser!);
  const courses = await Promise.all(ids.map((id) => courseShape(id, req.appUser!)));
  res.json(ListCoursesResponse.parse(courses.filter(Boolean)));
});

router.get("/courses/:courseId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await canAccessCourse(req.appUser!, params.data.courseId))) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const base = await courseShape(params.data.courseId, req.appUser!);
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, params.data.courseId));
  if (!base || !course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  const courseSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, params.data.courseId))
    .orderBy(asc(sessionsTable.dateTime));
  const resolvedSessions = (
    await Promise.all(
      courseSessions.map(async (session) =>
        (await canAccessCourse(req.appUser!, session.courseId, session.subject))
          ? session
          : null,
      ),
    )
  ).filter((session): session is (typeof courseSessions)[number] => Boolean(session));
  res.json(
    GetCourseResponse.parse({
      ...base,
      meetUrl: course?.meetUrl ?? null,
      driveUrl: course?.driveUrl ?? null,
      goalSummary: course?.goalSummary ?? null,
      sessions: await Promise.all(
        resolvedSessions.map(async (session) => ({
          ...session,
          tutor: await sessionTutorShape(session),
        })),
      ),
    }),
  );
});

router.get("/dashboard", async (req: AuthedRequest, res): Promise<void> => {
  await ensureSeedData();
  const user = req.appUser!;
  const ids = await visibleCourseIds(user);
  const courses = (
    await Promise.all(ids.map((id) => courseShape(id, user)))
  ).filter(Boolean);
  const upcomingSessions =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(sessionsTable)
          .where(inArray(sessionsTable.courseId, ids))
          .orderBy(asc(sessionsTable.dateTime))
          .limit(12);
  const scopedUpcomingSessions = (
    await Promise.all(
      upcomingSessions
        .map(async (session) =>
          (await canAccessCourse(user, session.courseId, session.subject))
            ? session
            : null,
        ),
    )
  )
    .filter(
      (session): session is (typeof upcomingSessions)[number] =>
        Boolean(session),
    )
    .slice(0, 4);
  const assignments =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.courseId, ids))
          .orderBy(asc(assignmentsTable.deadline));
  const scopedAssignments = (
    await Promise.all(
      assignments.map(async (assignment) =>
        (await canAccessCourse(user, assignment.courseId, assignment.subject))
          ? assignment
          : null,
      ),
    )
  ).filter(
    (assignment): assignment is (typeof assignments)[number] =>
      Boolean(assignment),
  );
  const assignmentIds = scopedAssignments.map((item) => item.id);
  const counts =
    assignmentIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: assignmentQuestionsTable.assignmentId,
            count: sql<number>`count(*)`,
          })
          .from(assignmentQuestionsTable)
          .where(inArray(assignmentQuestionsTable.assignmentId, assignmentIds))
          .groupBy(assignmentQuestionsTable.assignmentId);
  const subjectUserId = await dataSubjectUserId(user);
  const attempts = await db
    .select({ assignmentId: attemptsTable.assignmentId, score: attemptsTable.score })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, subjectUserId))
    .orderBy(desc(attemptsTable.startedAt));
  const assignmentSummaries = scopedAssignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject,
    status: assignment.status,
    deadline: assignment.deadline,
    questionCount:
      Number(counts.find((count) => count.assignmentId === assignment.id)?.count) ||
      0,
    timeLimitMinutes: assignment.timeLimitMinutes,
    attemptCount: attempts.filter((attempt) => attempt.assignmentId === assignment.id)
      .length,
    maxAttempts: assignment.maxAttempts,
    latestScore:
      attempts.find((attempt) => attempt.assignmentId === assignment.id)?.score ??
      null,
  }));
  res.json(
    GetDashboardResponse.parse({
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        avatarUrl: null,
      },
      welcomeMessage: "Your Fall program is ready. Keep building on each session.",
      courses,
      upcomingSessions: await Promise.all(
        scopedUpcomingSessions.map(async (session) => ({
          ...session,
          tutor: await sessionTutorShape(session),
        })),
      ),
      assignments: assignmentSummaries,
      recentScores: attempts
        .filter((attempt) => attempt.score !== null)
        .slice(0, 4)
        .map((attempt, index) => ({
          label: `Mini-section ${attempts.length - index}`,
          score: attempt.score!,
          date: new Date(),
        })),
      reviewSkills: ["Transitions", "Command of Evidence", "Pacing"],
    }),
  );
});

router.get("/sessions/:sessionId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.sessionId));
  if (
    !session ||
    !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
  ) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const blocks = await db
    .select()
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, session.id))
    .orderBy(asc(curriculumBlocksTable.position));
  const assignments = await assignmentSummariesForUser(
    req.appUser!,
    session.courseId,
    session.id,
  );
  res.json(
    GetSessionResponse.parse({
      ...session,
      tutor: await sessionTutorShape(session),
      blocks:
        req.appUser!.role === "student"
          ? blocks.filter(
              (block) =>
                block.status === "published" && block.visibility !== "tutor",
            )
          : blocks,
      assignments,
      studentNotes: null,
      tutorNotes:
        req.appUser!.role === "student"
          ? null
          : "Review predictions before revealing answer choices.",
      postSessionReportId: null,
    }),
  );
});

async function assignmentSummariesForUser(
  user: AppUser,
  courseId?: string,
  sessionId?: string,
) {
  const ids = await visibleCourseIds(user);
  if (courseId && !(await canAccessCourse(user, courseId))) return [];
  const conditions = [
    inArray(assignmentsTable.courseId, courseId ? [courseId] : ids),
  ];
  if (sessionId) conditions.push(eq(assignmentsTable.sessionId, sessionId));
  const rows =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(assignmentsTable)
          .where(and(...conditions))
          .orderBy(asc(assignmentsTable.deadline));
  const scopedRows = (
    await Promise.all(
      rows.map(async (assignment) =>
        (await canAccessCourse(user, assignment.courseId, assignment.subject))
          ? assignment
          : null,
      ),
    )
  ).filter(
    (assignment): assignment is (typeof rows)[number] => Boolean(assignment),
  );
  return Promise.all(
    scopedRows.map(async (assignment) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, assignment.id));
      const attempts = await db
        .select()
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, assignment.id),
              eq(attemptsTable.userId, await dataSubjectUserId(user)),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt));
      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        status: assignment.status,
        deadline: assignment.deadline,
        questionCount: Number(count),
        timeLimitMinutes: assignment.timeLimitMinutes,
        attemptCount: attempts.length,
        maxAttempts: assignment.maxAttempts,
        latestScore: attempts[0]?.score ?? null,
      };
    }),
  );
}

router.get("/assignments", async (req: AuthedRequest, res): Promise<void> => {
  const query = ListAssignmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let assignments = await assignmentSummariesForUser(
    req.appUser!,
    query.data.courseId,
  );
  if (query.data.status) {
    assignments = assignments.filter((item) => item.status === query.data.status);
  }
  res.json(ListAssignmentsResponse.parse(assignments));
});

router.get(
  "/assignments/:assignmentId",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    if (
      !assignment ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const joined = await db
      .select({
        assignmentQuestion: assignmentQuestionsTable,
        question: questionsTable,
      })
      .from(assignmentQuestionsTable)
      .innerJoin(
        questionsTable,
        eq(questionsTable.id, assignmentQuestionsTable.questionId),
      )
      .where(eq(assignmentQuestionsTable.assignmentId, assignment.id))
      .orderBy(asc(assignmentQuestionsTable.position));
    const [latestAttempt] = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.assignmentId, assignment.id),
          eq(attemptsTable.userId, req.appUser!.id),
        ),
      )
      .orderBy(desc(attemptsTable.startedAt))
      .limit(1);
    const savedResponses = latestAttempt
      ? await db
          .select()
          .from(responsesTable)
          .where(eq(responsesTable.attemptId, latestAttempt.id))
      : [];
    const summary = (
      await assignmentSummariesForUser(req.appUser!, assignment.courseId)
    ).find((item) => item.id === assignment.id)!;
    res.json(
      GetAssignmentResponse.parse({
        ...summary,
        instructions: assignment.instructions,
        questions: joined.map(({ assignmentQuestion, question }) => ({
          id: question.id,
          position: assignmentQuestion.position,
          subject: question.subject,
          questionType: question.questionType,
          prompt: question.prompt,
          stimulus: question.stimulus,
          choices:
            !assignmentQuestion.predictionFirst ||
            savedResponses.some(
              (response) =>
                response.questionId === question.id &&
                response.predictionLocked,
            )
              ? question.choices
              : [],
          skill: question.skill,
          difficulty: question.difficulty,
          predictionFirst: assignmentQuestion.predictionFirst,
        })),
      }),
    );
  },
);

router.post(
  "/assignments/:assignmentId/attempts",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = StartAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    if (
      !assignment ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    if (assignment.deadline && assignment.deadline.getTime() < Date.now()) {
      res.status(409).json({ error: "Assignment deadline has passed" });
      return;
    }
    const existing = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.assignmentId, assignment.id),
          eq(attemptsTable.userId, req.appUser!.id),
        ),
      )
      .orderBy(desc(attemptsTable.startedAt));
    const resumable = existing.find(
      (attempt) => attempt.status === "active" || attempt.status === "paused",
    );
    if (resumable) {
      res.status(201).json(StartAttemptResponse.parse(await attemptShape(resumable.id)));
      return;
    }
    if (existing.length >= assignment.maxAttempts) {
      res.status(409).json({ error: "Attempt limit reached" });
      return;
    }
    const [attempt] = await db
      .insert(attemptsTable)
      .values({ assignmentId: assignment.id, userId: req.appUser!.id })
      .returning();
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "started" });
    res.status(201).json(StartAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.get("/attempts/:attemptId", async (req: AuthedRequest, res): Promise<void> => {
  const params = GetAttemptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await canAccessAttempt(req.appUser!, params.data.attemptId);
  if (!access) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  const attempt = await enforceTimeLimit(access.attempt.id);
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }
  res.json(GetAttemptResponse.parse(await attemptShape(attempt.id)));
});

router.put(
  "/attempts/:attemptId/responses",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = SaveAttemptResponseParams.safeParse(req.params);
    const body = SaveAttemptResponseBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    const [belongsToAssignment] = await db
      .select({ id: assignmentQuestionsTable.id })
      .from(assignmentQuestionsTable)
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, attempt.assignmentId),
          eq(assignmentQuestionsTable.questionId, body.data.questionId),
        ),
      );
    if (!belongsToAssignment) {
      res.status(400).json({ error: "Question is not part of this assignment" });
      return;
    }
    if (attempt.status !== "active") {
      res.status(409).json({ error: "Responses can only be saved while active" });
      return;
    }
    const [existing] = await db
      .select()
      .from(responsesTable)
      .where(
        and(
          eq(responsesTable.attemptId, attempt.id),
          eq(responsesTable.questionId, body.data.questionId),
        ),
      );
    if (
      existing?.predictionLocked &&
      body.data.prediction !== undefined &&
      body.data.prediction !== existing.prediction
    ) {
      res.status(409).json({ error: "Prediction is locked" });
      return;
    }
    const values = {
      attemptId: attempt.id,
      questionId: body.data.questionId,
      prediction: body.data.prediction ?? existing?.prediction ?? null,
      predictionLocked:
        existing?.predictionLocked || body.data.lockPrediction === true,
      finalAnswer: body.data.finalAnswer ?? existing?.finalAnswer ?? null,
      flagged: body.data.flagged ?? existing?.flagged ?? false,
      timeSpentSeconds:
        body.data.timeSpentSeconds ?? existing?.timeSpentSeconds ?? 0,
      savedAt: new Date(),
    };
    const [saved] = await db
      .insert(responsesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [responsesTable.attemptId, responsesTable.questionId],
        set: values,
      })
      .returning();
    res.json(
      SaveAttemptResponseResponse.parse({
        questionId: saved.questionId,
        prediction: saved.prediction,
        predictionLocked: saved.predictionLocked,
        finalAnswer: saved.finalAnswer,
        flagged: saved.flagged,
        savedAt: saved.savedAt,
      }),
    );
  },
);

router.post(
  "/attempts/:attemptId/pause",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = PauseAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    if (attempt.status !== "active") {
      res.status(409).json({ error: "Attempt is not active" });
      return;
    }
    await db
      .update(attemptsTable)
      .set({ status: "paused" })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "paused" });
    res.json(PauseAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.post(
  "/attempts/:attemptId/resume",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = ResumeAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    if (attempt.status !== "paused") {
      res.status(409).json({ error: "Attempt is not paused" });
      return;
    }
    await db
      .update(attemptsTable)
      .set({ status: "active" })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "resumed" });
    res.json(ResumeAttemptResponse.parse(await attemptShape(attempt.id)));
  },
);

router.post(
  "/attempts/:attemptId/submit",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = SubmitAttemptParams.safeParse(req.params);
    const body = SubmitAttemptBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.confirm) {
      res.status(400).json({ error: "Submission confirmation is required" });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId));
    if (
      !attempt ||
      attempt.userId !== req.appUser!.id ||
      attempt.status === "submitted"
    ) {
      res.status(409).json({ error: "Attempt cannot be submitted" });
      return;
    }
    if ((await enforceTimeLimit(attempt.id))?.status === "expired") {
      res.status(409).json({ error: "Time limit reached" });
      return;
    }
    const assignedQuestions = await db
      .select({ question: questionsTable })
      .from(assignmentQuestionsTable)
      .innerJoin(
        questionsTable,
        eq(questionsTable.id, assignmentQuestionsTable.questionId),
      )
      .where(eq(assignmentQuestionsTable.assignmentId, attempt.assignmentId))
      .orderBy(asc(assignmentQuestionsTable.position));
    const submittedResponses = await db
      .select()
      .from(responsesTable)
      .where(eq(responsesTable.attemptId, attempt.id));
    const joined = assignedQuestions.map(({ question }) => ({
      question,
      response:
        submittedResponses.find((response) => response.questionId === question.id) ??
        null,
    }));
    let correctCount = 0;
    for (const item of joined) {
      const correct =
        item.response?.finalAnswer === item.question.correctAnswer;
      if (correct) correctCount += 1;
      if (item.response) {
        await db
          .update(responsesTable)
          .set({ correct })
          .where(eq(responsesTable.id, item.response.id));
      }
      if (!correct) {
        await db.insert(reviewQueueTable).values({
          attemptId: attempt.id,
          questionId: item.question.id,
          studentUserId: req.appUser!.id,
          skill: item.question.skill,
          reason: "Incorrect answer — review during the next session",
        });
      }
    }
    const totalCount = joined.length;
    const score = totalCount === 0 ? 0 : (correctCount / totalCount) * 100;
    await db
      .update(attemptsTable)
      .set({ status: "submitted", submittedAt: new Date(), score })
      .where(eq(attemptsTable.id, attempt.id));
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "submitted" });
    const timing = await timerSummary(attempt.id);
    const bySkill = new Map<string, { correct: number; total: number }>();
    for (const item of joined) {
      const current = bySkill.get(item.question.skill) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (item.response?.finalAnswer === item.question.correctAnswer) {
        current.correct += 1;
      }
      bySkill.set(item.question.skill, current);
    }
    res.json(
      SubmitAttemptResponse.parse({
        attemptId: attempt.id,
        score,
        correctCount,
        totalCount,
        activeSeconds: timing.activeSeconds,
        pausedSeconds: timing.pausedSeconds,
        breakdown: [...bySkill.entries()].map(([skill, value]) => ({
          skill,
          ...value,
          accuracy: value.total === 0 ? 0 : (value.correct / value.total) * 100,
        })),
        items: joined.map(({ response, question }) => ({
          questionId: question.id,
          correct: response?.finalAnswer === question.correctAnswer,
          prediction: response?.prediction ?? null,
          finalAnswer: response?.finalAnswer ?? null,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          skill: question.skill,
          questionType: question.questionType,
          difficulty: question.difficulty,
          timeSpentSeconds: response?.timeSpentSeconds ?? 0,
          flagged: response?.flagged ?? false,
        })),
      }),
    );
  },
);

router.post(
  "/sessions/:sessionId/blocks",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = CreateCurriculumBlockParams.safeParse(req.params);
    const body = CreateCurriculumBlockBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [created] = await db
      .insert(curriculumBlocksTable)
      .values({
        sessionId: params.data.sessionId,
        kind: body.data.kind,
        position: body.data.position ?? 0,
        visibility: body.data.visibility,
        status: "draft",
        config: body.data.config,
      })
      .returning();
    res.status(201).json(CreateCurriculumBlockResponse.parse(created));
  },
);

router.patch(
  "/blocks/:blockId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateCurriculumBlockParams.safeParse(req.params);
    const body = UpdateCurriculumBlockBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleBlock] = await db
      .select({
        id: curriculumBlocksTable.id,
        courseId: sessionsTable.courseId,
        subject: sessionsTable.subject,
      })
      .from(curriculumBlocksTable)
      .innerJoin(
        sessionsTable,
        eq(sessionsTable.id, curriculumBlocksTable.sessionId),
      )
      .where(eq(curriculumBlocksTable.id, params.data.blockId));
    if (
      !visibleBlock ||
      !(await canAccessCourse(
        req.appUser!,
        visibleBlock.courseId,
        visibleBlock.subject,
      ))
    ) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    const [updated] = await db
      .update(curriculumBlocksTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(curriculumBlocksTable.id, params.data.blockId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "curriculum_block.updated",
      entityType: "curriculum_block",
      entityId: updated.id,
      metadata: { status: updated.status },
    });
    res.json(UpdateCurriculumBlockResponse.parse(updated));
  },
);

function contentSourceShape(source: typeof contentSourcesTable.$inferSelect) {
  return {
    id: source.id,
    courseId: source.courseId,
    subject: source.subject,
    title: source.title,
    sourceKind: source.sourceKind,
    sourceUrl: source.sourceUrl,
    originalFilename: source.originalFilename,
    authorizationNote: source.authorizationNote,
    provenance: source.provenance,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function questionBankShape(question: typeof questionsTable.$inferSelect) {
  return {
    id: question.id,
    subject: question.subject,
    domain: question.domain,
    skill: question.skill,
    questionType: question.questionType,
    difficulty: question.difficulty,
    stimulus: question.stimulus,
    prompt: question.prompt,
    choices: question.choices,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    sourceType: question.sourceType,
    sourceId: question.sourceId,
    reviewStatus: question.reviewStatus,
    tags: question.tags,
    generationMethod: question.generationMethod,
    rejectionReason: question.rejectionReason,
    reviewedAt: question.reviewedAt,
    createdAt: question.createdAt,
  };
}

function sourceConcepts(text: string, focus: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "because",
    "before",
    "being",
    "between",
    "could",
    "every",
    "first",
    "from",
    "have",
    "into",
    "lesson",
    "more",
    "other",
    "should",
    "their",
    "there",
    "these",
    "they",
    "this",
    "through",
    "using",
    "were",
    "which",
    "while",
    "with",
    "would",
  ]);
  const counts = new Map<string, number>();
  const words = text
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? [];
  for (const word of words) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const extracted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([word]) => word)
    .slice(0, 16);
  return [
    ...new Set([
      ...focus.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [],
      ...extracted,
    ]),
  ];
}

router.get(
  "/content-sources",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const query = ListContentSourcesQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!(await canAccessCourse(req.appUser!, query.data.courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const sources = await db
      .select()
      .from(contentSourcesTable)
      .where(eq(contentSourcesTable.courseId, query.data.courseId))
      .orderBy(desc(contentSourcesTable.createdAt));
    const visibleSources = (
      await Promise.all(
        sources.map(async (source) =>
          req.appUser!.role === "administrator" ||
          (await canAccessCourse(
            req.appUser!,
            source.courseId,
            source.subject,
          ))
            ? source
            : null,
        ),
      )
    ).filter(
      (source): source is (typeof sources)[number] => Boolean(source),
    );
    res.json(ListContentSourcesResponse.parse(visibleSources.map(contentSourceShape)));
  },
);

router.post(
  "/content-sources",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateContentSourceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const subject =
      req.appUser!.role === "tutor"
        ? await courseSubjectForUser(req.appUser!, body.data.courseId)
        : "all";
    if (
      !(await canAccessCourse(
        req.appUser!,
        body.data.courseId,
        subject || undefined,
      ))
    ) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (!body.data.sourceUrl && !body.data.extractedText) {
      res.status(400).json({
        error: "Provide a source URL or authorized extracted text",
      });
      return;
    }
    const [source] = await db
      .insert(contentSourcesTable)
      .values({
        courseId: body.data.courseId,
        importedBy: req.appUser!.id,
        subject: subject || "all",
        title: body.data.title.trim(),
        sourceKind: body.data.sourceKind,
        sourceUrl: body.data.sourceUrl ?? null,
        originalFilename: body.data.originalFilename ?? null,
        authorizationNote: body.data.authorizationNote.trim(),
        extractedText: body.data.extractedText ?? null,
        provenance: {
          ...(body.data.provenance ?? {}),
          importedAt: new Date().toISOString(),
          importedByRole: req.appUser!.role,
        },
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "content_source.imported",
      entityType: "content_source",
      entityId: source!.id,
      metadata: {
        courseId: source!.courseId,
        sourceKind: source!.sourceKind,
      },
    });
    res
      .status(201)
      .json(CreateContentSourceResponse.parse(contentSourceShape(source!)));
  },
);

router.post(
  "/content-sources/:sourceId/generate",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GeneratePracticeQuestionsParams.safeParse(req.params);
    const body = GeneratePracticeQuestionsBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [record] = await db
      .select({ source: contentSourcesTable, course: coursesTable })
      .from(contentSourcesTable)
      .innerJoin(coursesTable, eq(coursesTable.id, contentSourcesTable.courseId))
      .where(eq(contentSourcesTable.id, params.data.sourceId));
    if (
      !record ||
      !(await canAccessCourse(
        req.appUser!,
        record.source.courseId,
        record.source.subject,
      ))
    ) {
      res.status(404).json({ error: "Content source not found" });
      return;
    }

    if (!record.source.extractedText?.trim() || record.source.extractedText.trim().length < 40) {
      res.status(400).json({
        error:
          "Authorized extracted text is required before practice can be generated",
      });
      return;
    }

    // Extract concepts, never sentences or answer keys. Drafts use newly written
    // scenarios so the source informs the practice without being reproduced.
    const focus = body.data.focus.trim().replace(/\s+/g, " ");
    const count = body.data.count ?? 3;
    const concepts = sourceConcepts(record.source.extractedText, focus);
    if (concepts.length < 2) {
      res.status(400).json({
        error: "The extracted text does not contain enough distinct concepts",
      });
      return;
    }
    const templates = [
      {
        prompt: (primary: string, secondary: string) =>
          `Which plan best helps the student explain the relationship between ${primary} and ${secondary}?`,
        choices: [
          "State a specific relationship and test it against a new example.",
          "List both terms without explaining how they connect.",
          "Replace both terms with a broader unsupported claim.",
          "Ignore the relationship and summarize an unrelated detail.",
        ],
        correctAnswer: "a",
        explanation:
          "A specific relationship tested with a new example demonstrates transferable understanding without copying the source.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `A student is comparing ${primary} and ${secondary}. Which revision produces the clearest evidence-based distinction?`,
        choices: [
          "Treat the two concepts as identical without support.",
          "Name a relevant difference and explain why it matters in a new case.",
          "Choose whichever concept appears first.",
          "Add a conclusion that neither concept supports.",
        ],
        correctAnswer: "b",
        explanation:
          "Naming and applying a relevant distinction shows accurate analysis while keeping the example original.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `Which question would best check whether a learner can transfer ideas about ${primary} and ${secondary} to unfamiliar material?`,
        choices: [
          "Can the learner repeat a sentence from the source?",
          "Can the learner identify which word appeared more often?",
          "Can the learner apply the relationship to a new scenario and justify it?",
          "Can the learner recall the source title?",
        ],
        correctAnswer: "c",
        explanation:
          "Transfer requires applying the underlying relationship to a new context and supporting the choice.",
      },
      {
        prompt: (primary: string, secondary: string) =>
          `Which response best synthesizes the lesson's treatment of ${primary} and ${secondary}?`,
        choices: [
          "A copied sentence with no interpretation.",
          "A claim based only on personal preference.",
          "A summary of one term that omits the other.",
          "An original claim that connects both concepts and stays within the available support.",
        ],
        correctAnswer: "d",
        explanation:
          "A synthesis must connect both concepts in an original, supportable claim.",
      },
    ];
    const created = await db
      .insert(questionsTable)
      .values(
        Array.from({ length: count }, (_, index) => {
          const primary = concepts[(index * 2) % concepts.length]!;
          const secondary = concepts[(index * 2 + 1) % concepts.length]!;
          const template = templates[index % templates.length]!;
          return {
            subject: record.source.subject === "all"
              ? record.course.subject
              : record.source.subject,
            domain: "Source-guided practice",
            skill: focus,
            questionType: "multiple_choice",
            difficulty: body.data.difficulty ?? "medium",
            stimulus:
              `In a new learning scenario, a student must connect the concepts of ${primary} and ${secondary} without relying on memorized wording.`,
            prompt: template.prompt(primary, secondary),
            choices: template.choices.map((text, choiceIndex) => ({
              id: String.fromCharCode(97 + choiceIndex),
              label: String.fromCharCode(65 + choiceIndex),
              text,
            })),
            correctAnswer: template.correctAnswer,
            explanation: template.explanation,
            sourceType: "authorized-source-derived",
            sourceId: record.source.id,
            reviewStatus: "draft",
            tags: [focus.toLowerCase(), primary, secondary],
            generationMethod: "source-aware-generator",
          };
        }),
      )
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_questions.generated",
      entityType: "content_source",
      entityId: record.source.id,
      metadata: { count: created.length, reviewStatus: "draft" },
    });
    res
      .status(201)
      .json(
        GeneratePracticeQuestionsResponse.parse(created.map(questionBankShape)),
      );
  },
);

router.get(
  "/question-bank",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const query = ListQuestionBankQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (!(await canAccessCourse(req.appUser!, query.data.courseId))) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    const conditions = [eq(contentSourcesTable.courseId, query.data.courseId)];
    if (query.data.reviewStatus) {
      conditions.push(eq(questionsTable.reviewStatus, query.data.reviewStatus));
    }
    const rows = await db
      .select({ question: questionsTable })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(and(...conditions))
      .orderBy(desc(questionsTable.createdAt));
    const visibleRows = (
      await Promise.all(
        rows.map(async ({ question }) =>
          (await canAccessCourse(
            req.appUser!,
            query.data.courseId,
            question.subject,
          ))
            ? question
            : null,
        ),
      )
    ).filter((question): question is (typeof rows)[number]["question"] =>
      Boolean(question),
    );
    res.json(ListQuestionBankResponse.parse(visibleRows.map(questionBankShape)));
  },
);

router.patch(
  "/question-bank/:questionId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateQuestionBankItemParams.safeParse(req.params);
    const body = UpdateQuestionBankItemBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleQuestion] = await db
      .select({
        question: questionsTable,
        courseId: contentSourcesTable.courseId,
        subject: contentSourcesTable.subject,
      })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(eq(questionsTable.id, params.data.questionId));
    if (
      !visibleQuestion ||
      !(await canAccessCourse(
        req.appUser!,
        visibleQuestion.courseId,
      visibleQuestion.question.subject || visibleQuestion.subject,
      ))
    ) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    if (
      body.data.reviewStatus === "rejected" &&
      !body.data.rejectionReason?.trim()
    ) {
      res.status(400).json({ error: "A rejection reason is required" });
      return;
    }
    const isReviewed =
      body.data.reviewStatus === "approved" ||
      body.data.reviewStatus === "rejected";
    const [updated] = await db
      .update(questionsTable)
      .set({
        ...body.data,
        rejectionReason:
          body.data.reviewStatus === "approved"
            ? null
            : body.data.rejectionReason,
        reviewedBy: isReviewed ? req.appUser!.id : null,
        reviewedAt: isReviewed ? new Date() : null,
      })
      .where(eq(questionsTable.id, params.data.questionId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_question.reviewed",
      entityType: "question",
      entityId: updated!.id,
      metadata: { reviewStatus: updated!.reviewStatus },
    });
    res.json(
      UpdateQuestionBankItemResponse.parse(questionBankShape(updated!)),
    );
  },
);

router.post(
  "/assignments/:assignmentId/questions",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = AttachQuestionToAssignmentParams.safeParse(req.params);
    const body = AttachQuestionToAssignmentBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    const [questionRecord] = await db
      .select({ question: questionsTable, courseId: contentSourcesTable.courseId })
      .from(questionsTable)
      .innerJoin(
        contentSourcesTable,
        eq(contentSourcesTable.id, questionsTable.sourceId),
      )
      .where(eq(questionsTable.id, body.data.questionId));
    if (
      !assignment ||
      !questionRecord ||
      assignment.courseId !== questionRecord.courseId ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      )) ||
      !(await canAccessCourse(
        req.appUser!,
        questionRecord.courseId,
        questionRecord.question.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment or question not found" });
      return;
    }
    if (questionRecord.question.reviewStatus !== "approved") {
      res.status(400).json({
        error: "Only tutor-approved questions can be attached to assignments",
      });
      return;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.assignmentId, assignment.id));
    await db
      .insert(assignmentQuestionsTable)
      .values({
        assignmentId: assignment.id,
        questionId: questionRecord.question.id,
        position: body.data.position ?? Number(count),
        predictionFirst: body.data.predictionFirst ?? false,
      })
      .onConflictDoNothing();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "practice_question.attached",
      entityType: "assignment",
      entityId: assignment.id,
      metadata: { questionId: questionRecord.question.id },
    });
    res
      .status(201)
      .json(
        AttachQuestionToAssignmentResponse.parse(
          questionBankShape(questionRecord.question),
        ),
      );
  },
);

router.get(
  "/sessions/:sessionId/artifacts",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = ListSessionArtifactsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const artifacts = await db
      .select()
      .from(sessionArtifactsTable)
      .where(eq(sessionArtifactsTable.sessionId, session.id))
      .orderBy(asc(sessionArtifactsTable.kind));
    const visible =
      req.appUser!.role === "student"
        ? artifacts.filter(
            (artifact) =>
              artifact.kind === "report" &&
              artifact.visibility === "course" &&
              artifact.status === "published",
          )
        : artifacts;
    res.json(ListSessionArtifactsResponse.parse(visible));
  },
);

router.put(
  "/sessions/:sessionId/artifacts",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpsertSessionArtifactParams.safeParse(req.params);
    const body = UpsertSessionArtifactBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const isPublishedReport =
      body.data.kind === "report" && body.data.status === "published";
    const values = {
      sessionId: session.id,
      createdBy: req.appUser!.id,
      kind: body.data.kind,
      content: body.data.content.trim(),
      visibility: isPublishedReport ? "course" : "tutor",
      status: isPublishedReport ? "published" : "draft",
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(sessionArtifactsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [sessionArtifactsTable.sessionId, sessionArtifactsTable.kind],
        set: {
          content: values.content,
          visibility: values.visibility,
          status: values.status,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    if (isPublishedReport) {
      await db
        .update(sessionsTable)
        .set({ hasReport: true })
        .where(eq(sessionsTable.id, session.id));
    }
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: `session_${body.data.kind}.saved`,
      entityType: "session",
      entityId: session.id,
      metadata: { visibility: values.visibility },
    });
    res.json(UpsertSessionArtifactResponse.parse(saved));
  },
);

router.get(
  "/review-queue",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const courseIds = await visibleCourseIds(req.appUser!);
    const rows =
      courseIds.length === 0
        ? []
        : await db
      .select({
        item: reviewQueueTable,
        student: usersTable,
        assignment: assignmentsTable,
        response: responsesTable,
      })
      .from(reviewQueueTable)
      .innerJoin(usersTable, eq(usersTable.id, reviewQueueTable.studentUserId))
      .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
      .innerJoin(
        assignmentsTable,
        eq(assignmentsTable.id, attemptsTable.assignmentId),
      )
      .leftJoin(
        responsesTable,
        and(
          eq(responsesTable.attemptId, reviewQueueTable.attemptId),
          eq(responsesTable.questionId, reviewQueueTable.questionId),
        ),
      )
      .where(inArray(assignmentsTable.courseId, courseIds))
      .orderBy(desc(reviewQueueTable.createdAt));
    const visibleRows = (
      await Promise.all(
        rows.map(async (row) =>
          (await canAccessStudent(
            req.appUser!,
            row.assignment.courseId,
            row.item.studentUserId,
            row.assignment.subject,
          ))
            ? row
            : null,
        ),
      )
    ).filter((row): row is (typeof rows)[number] => Boolean(row));
    res.json(
      ListReviewQueueResponse.parse(
        visibleRows.map(({ item, student, response }) => ({
          id: item.id,
          attemptId: item.attemptId,
          questionId: item.questionId,
          studentName: student.displayName,
          skill: item.skill,
          reason: item.reason,
          prediction: response?.prediction ?? null,
          finalAnswer: response?.finalAnswer ?? null,
          status: item.status,
          tutorNote: item.tutorNote,
        })),
      ),
    );
  },
);

router.patch(
  "/review-queue/:itemId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateReviewQueueItemParams.safeParse(req.params);
    const body = UpdateReviewQueueItemBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [visibleItem] = await db
      .select({
        id: reviewQueueTable.id,
        courseId: assignmentsTable.courseId,
        subject: assignmentsTable.subject,
        studentUserId: reviewQueueTable.studentUserId,
      })
      .from(reviewQueueTable)
      .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
      .innerJoin(
        assignmentsTable,
        eq(assignmentsTable.id, attemptsTable.assignmentId),
      )
      .where(eq(reviewQueueTable.id, params.data.itemId));
    if (
      !visibleItem ||
      !(await canAccessStudent(
        req.appUser!,
        visibleItem.courseId,
        visibleItem.studentUserId,
        visibleItem.subject,
      ))
    ) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const [updated] = await db
      .update(reviewQueueTable)
      .set(body.data)
      .where(eq(reviewQueueTable.id, params.data.itemId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Review item not found" });
      return;
    }
    const [student] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.studentUserId));
    const [response] = await db
      .select()
      .from(responsesTable)
      .where(
        and(
          eq(responsesTable.attemptId, updated.attemptId),
          eq(responsesTable.questionId, updated.questionId),
        ),
      );
    res.json(
      UpdateReviewQueueItemResponse.parse({
        id: updated.id,
        attemptId: updated.attemptId,
        questionId: updated.questionId,
        studentName: student?.displayName ?? "Student",
        skill: updated.skill,
        reason: updated.reason,
        prediction: response?.prediction ?? null,
        finalAnswer: response?.finalAnswer ?? null,
        status: updated.status,
        tutorNote: updated.tutorNote,
      }),
    );
  },
);

export default router;