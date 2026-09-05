import { clerkClient, getAuth } from "@clerk/express";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  createGoogleEvent,
  decryptCalendarToken,
  deleteGoogleEvent,
  exchangeGoogleCode,
  getGoogleCalendarConfig,
  googleCalendarCompletionHtml,
  googleCalendarAuthorizationUrl,
  normalizeGoogleCalendarStatus,
  listGoogleBusyWindows,
  readCalendarOAuthState,
  refreshGoogleAccessToken,
  updateGoogleEvent,
} from "../lib/google-calendar";
import {
  disconnectGoogleCalendarConnection,
  markGoogleCalendarDisconnected,
  persistGoogleCalendarConnection,
  saveRefreshedGoogleAccessToken,
} from "../lib/calendar-persistence";
import {
  acquireBookingLocks,
  assertNoScheduleConflict,
  BookingServiceError,
  cancelBookingWithCreditPolicy,
  insertConfirmedBookingWithDebit,
  listSharedMeetBusyWindows,
  lockClientCreditsAndRequireHours,
  notifyAdministratorsOfBooking,
  recordBookingConfirmedAudit,
  requireStudentBooker,
  rollbackBookingAfterCalendarFailure,
} from "../lib/booking-service";
import { sessionClaimsSharedFallMeet } from "../lib/shared-meet-conflict";
import {
  calendarEventPayload,
  generateAvailableSlots,
  overlapsBusyWindow,
  type AvailabilityRule,
  type BusyWindow,
} from "../lib/booking";
import {
  SHARED_FALL_MEETING_URL,
  TAITO_FALL_2026_SESSIONS,
  TAITO_SESSION_TIMEZONE,
  TAITO_STUDENT_DISPLAY_NAME,
  TAITO_STUDENT_EMAIL,
  calendarEventUrlForSession,
  isTaitoFallSession,
  isFall2026Term,
  meetingUrlForTerm,
  selfServeSatBookingForEmail,
  sessionTitle,
  taitoSessionDateTime,
} from "../lib/session-schedule";
import { buildAttemptAnalysis } from "../lib/assessment-analysis";
import {
  FULL_SAT_DIAGNOSTIC_QUESTIONS,
  HARD_BANK_SEED_QUESTIONS,
} from "../lib/sat-assessment-content";
import {
  enqueueMissedReviewItems,
  prepareSessionCurriculum,
} from "../lib/session-curriculum-prep";
import {
  canViewSession,
  publicSessionShape,
  reconcileTaitoSessions,
  visibleSessionsForUser,
} from "../lib/session-privacy";
import {
  clientForAdminPreview,
  dashboardSessionShape,
  dashboardSessionsForUser,
} from "../lib/dashboard-data";
import {
  courseForTutorAssignments,
  reconcileTutorAssignments,
} from "../lib/tutor-assignment-reconciliation";
import { recordSuccessfulLogin } from "../lib/login-activity";
import {
  isLibraryAssetKind,
  libraryAssetBlockKind,
  libraryAssetToBlockConfig,
} from "../lib/curriculum-library";
import {
  APPROVED_PUBLIC_TEAM_PORTRAITS,
  APPROVED_SCHOOL_LOGOS,
  LEGACY_WIX_PUBLIC_TEAM_PORTRAITS,
  MIRRORED_PORTRAIT_RECONCILIATIONS,
  PUBLIC_TUTOR_ORDER,
  publicTeamPortrait,
  rewriteLegacyWixMediaUrl,
  rewriteLegacyWixSchoolLogos,
} from "../lib/public-team-roster";
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
  AttachSessionLibraryAssetBody,
  AttachSessionLibraryAssetParams,
  AttachSessionLibraryAssetResponse,
  CreateAdminAssignmentBody,
  CreateAdminAssignmentResponse,
  CreateAdminAccessGrantBody,
  CreateAdminAccessGrantResponse,
  CreateAdminLibraryAssetBody,
  CreateAdminLibraryAssetResponse,
  CreateAdminSessionBody,
  CreateAdminSessionResponse,
  GetAdminClientDashboardParams,
  GetAdminClientDashboardResponse,
  ListAdminAccessGrantsResponse,
  UpdateAdminAccessGrantBody,
  UpdateAdminAccessGrantParams,
  UpdateAdminAccessGrantResponse,
  UpdateAdminNotificationBody,
  UpdateAdminNotificationParams,
  UpdateAdminNotificationResponse,
  UpdateAdminGuidanceRequestBody,
  UpdateAdminGuidanceRequestParams,
  UpdateAdminGuidanceRequestResponse,
  GetAdaptiveCurriculumParams,
  GetAdaptiveCurriculumResponse,
  GetAdminCurriculumQueryParams,
  GetAdminCurriculumResponse,
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
  GetAttemptResultParams,
  GetAttemptResultResponse,
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
  ListReviewSubmissionsResponse,
  ListSessionArtifactsParams,
  ListSessionArtifactsResponse,
  RefreshAdaptiveCurriculumParams,
  RefreshAdaptiveCurriculumResponse,
  UpdateAdaptiveRecommendationBody,
  UpdateAdaptiveRecommendationParams,
  UpdateAdaptiveRecommendationResponse,
  UpdateAdminAssignmentBody,
  UpdateAdminAssignmentParams,
  UpdateAdminAssignmentResponse,
  UpdateAdminLibraryAssetBody,
  UpdateAdminLibraryAssetParams,
  UpdateAdminLibraryAssetResponse,
  UpdateAdminProgramBody,
  UpdateAdminProgramParams,
  UpdateAdminProgramResponse,
  UpdateAdminSessionBody,
  UpdateAdminSessionParams,
  UpdateAdminSessionResponse,
  UpdateAssignmentQuestionBody,
  UpdateAssignmentQuestionParams,
  UpdateAssignmentQuestionResponse,
  RemoveQuestionFromAssignmentParams,
  RemoveQuestionFromAssignmentResponse,
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
  UpdateAttemptReviewBody,
  UpdateAttemptReviewParams,
  UpdateAttemptReviewResponse,
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
  accessFromRoleCategory,
  configuredAccessConflicts,
  envRoleCategoriesForIdentity,
  isProvisionableRoleCategory,
  normalizeProvisionedEmail,
  resolvePortalAccess,
  subjectsForRoleCategory,
  tutorTitleForRoleCategory,
  type ConfiguredAccess,
  type DatabaseAccessGrant,
  type ProvisionableRoleCategory,
  verifiedPrimaryEmail,
} from "../lib/access-config";
import {
  parseTutorProfileEditableFields,
  safePublicUrl,
  tutorProfileApprovalError,
} from "../lib/tutor-profile-fields";
import {
  contentSourcesTable,
  assignmentQuestionsTable,
  assignmentsTable,
  adaptiveRecommendationsTable,
  adminNotificationsTable,
  attemptsTable,
  auditLogsTable,
  availabilityRulesTable,
  calendarConnectionsTable,
  clientRequestsTable,
  courseMembershipsTable,
  coursesTable,
  curriculumBlocksTable,
  curriculumLibraryAssetsTable,
  creditLedgerTable,
  db,
  invoicesTable,
  loginActivityTable,
  paymentsTable,
  portalAccessGrantsTable,
  publicContentTable,
  questionsTable,
  responsesTable,
  reviewQueueTable,
  satProductsTable,
  sessionArtifactsTable,
  sessionsTable,
  stripeTransfersTable,
  timerEventsTable,
  tutorProfilesTable,
  tutorCompensationRatesTable,
  tutorAssignmentsTable,
  usersTable,
  viewerLinksTable,
  type AppUser,
  type PortalAccessGrant,
} from "@workspace/db";

type AuthedRequest = Request & { appUser?: AppUser };

const router: IRouter = Router();
const XAVIER_NAME = "Xavier Morales";
const EUNICE_NAME = "Eunice Chon";
/** Prepaid SAT credits may be booked with either SAT tutor's calendar. */
const SAT_BOOKING_TUTOR_NAMES = [XAVIER_NAME, EUNICE_NAME] as const;
/** Legacy tutor compensation seed only — not used for student Checkout settlement. */
const XAVIER_TUTOR_SHARE_CENTS = 6_500;
const SINGLE_SAT_SESSION_SLUG = "single-sat-session";
const TEN_SAT_SESSION_PACKAGE_SLUG = "ten-sat-session-package";
const SAT_HOURLY_RATE_CENTS = 13_000;
const SINGLE_SAT_SESSION_PRICE_CENTS = SAT_HOURLY_RATE_CENTS;
const TEN_SAT_SESSION_PACKAGE_PRICE_CENTS = SAT_HOURLY_RATE_CENTS * 10;
const ACCEPTED_SAT_CATALOG = [
  {
    slug: SINGLE_SAT_SESSION_SLUG,
    name: "Single SAT Session",
    description:
      "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
    durationHours: 1,
    totalPriceCents: SINGLE_SAT_SESSION_PRICE_CENTS,
    effectiveHourlyRateCents: SAT_HOURLY_RATE_CENTS,
  },
  {
    slug: TEN_SAT_SESSION_PACKAGE_SLUG,
    name: "Ten SAT Session Package",
    description:
      "Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on our SAT tutors’ available calendar.",
    durationHours: 10,
    totalPriceCents: TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
    effectiveHourlyRateCents: SAT_HOURLY_RATE_CENTS,
  },
] as const;
const ACCEPTED_SAT_CATALOG_SLUGS = new Set(ACCEPTED_SAT_CATALOG.map((product) => product.slug));
const NIKA_NAME = "Nika Raiffe";
const NIKA_EMAIL = "nika.raiffe@gmail.com";
const NIKA_APPROVED_PHOTO_URL = APPROVED_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"];
const NIKA_LEGACY_SEED_PHOTO_URL = LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Kya Brooks"];
const NIKA_LEGACY_APPROVED_WIX_PHOTO_URL =
  LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"];
const RYO_VIEWER_EMAIL = "ryo@jaac.co.jp";
const TAITO_VIEWER_RELATIONSHIP =
  "view only mirror of Taito’s client account";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function creditHoursSummary(
  entries: Array<{ entryType: string; hours: number }>,
): { purchasedHours: number; usedHours: number; remainingHours: number } {
  let purchasedHours = 0;
  let usedHours = 0;
  let restoredHours = 0;
  for (const entry of entries) {
    if (entry.entryType === "original" || entry.entryType === "adjustment_credit") {
      purchasedHours += entry.hours;
    } else if (
      entry.entryType === "debit" ||
      entry.entryType === "adjustment_debit" ||
      entry.entryType === "refund"
    ) {
      usedHours += entry.hours;
    } else if (entry.entryType === "restored") {
      restoredHours += entry.hours;
    }
  }
  const remainingHours = purchasedHours - usedHours + restoredHours;
  return { purchasedHours, usedHours, remainingHours };
}

function isAcceptedSatCatalogProduct(product: {
  slug: string;
  active: boolean;
  durationHours: number;
  totalPriceCents: number;
}): boolean {
  const expected = ACCEPTED_SAT_CATALOG.find((item) => item.slug === product.slug);
  return Boolean(
    expected &&
      product.active &&
      product.durationHours === expected.durationHours &&
      product.totalPriceCents === expected.totalPriceCents,
  );
}

const SAT_DIAGNOSTIC_QUESTIONS = FULL_SAT_DIAGNOSTIC_QUESTIONS;

const SAT_HOMEWORK_SETS = [
  {
    dateKey: "2026-10-09",
    title: "SAT Homework — Grammar and Boundaries",
    instructions:
      "Complete this original practice set independently. Use your explanations to identify one grammar rule to revisit before the next SAT session.",
    questions: [
      {
        prompt: "The science club meets every Thursday _____ its members often stay late to finish experiments.",
        domain: "Standard English Conventions",
        skill: "Boundaries",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Thursday, its" },
          { id: "b", label: "B", text: "Thursday; its" },
          { id: "c", label: "C", text: "Thursday its" },
          { id: "d", label: "D", text: "Thursday: its" },
        ],
        correctAnswer: "b",
        explanation: "A semicolon joins the two independent clauses.",
      },
      {
        prompt: "The volunteers brought _____ own tools to the restoration project.",
        domain: "Standard English Conventions",
        skill: "Form, Structure, and Sense",
        difficulty: "foundational",
        choices: [
          { id: "a", label: "A", text: "there" },
          { id: "b", label: "B", text: "they're" },
          { id: "c", label: "C", text: "their" },
          { id: "d", label: "D", text: "theirs" },
        ],
        correctAnswer: "c",
        explanation: "The possessive determiner “their” modifies “own tools.”",
      },
      {
        prompt: "The new schedule is more flexible _____ it still protects the team's planning time.",
        domain: "Standard English Conventions",
        skill: "Boundaries",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "flexible, it" },
          { id: "b", label: "B", text: "flexible; it" },
          { id: "c", label: "C", text: "flexible it" },
          { id: "d", label: "D", text: "flexible: it" },
        ],
        correctAnswer: "b",
        explanation: "The semicolon separates two complete clauses.",
      },
      {
        prompt: "The committee reviewed the proposal carefully and _____ a revised budget.",
        domain: "Standard English Conventions",
        skill: "Subject-Verb Agreement",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "recommend" },
          { id: "b", label: "B", text: "recommends" },
          { id: "c", label: "C", text: "recommending" },
          { id: "d", label: "D", text: "has recommend" },
        ],
        correctAnswer: "a",
        explanation: "The plural subject “committee” is treated as a group taking “recommend” here.",
      },
    ],
  },
  {
    dateKey: "2026-10-16",
    title: "SAT Homework — Evidence and Inference",
    instructions:
      "Read each original passage closely. Choose the answer supported by the stated evidence rather than by an absolute claim.",
    questions: [
      {
        prompt: "Which conclusion is best supported by the survey?",
        stimulus: "After the park added shaded benches, afternoon visits increased by 18 percent compared with the previous summer.",
        domain: "Information and Ideas",
        skill: "Command of Evidence",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Shaded benches may have encouraged more afternoon visits." },
          { id: "b", label: "B", text: "Every resident prefers shaded benches." },
          { id: "c", label: "C", text: "The benches caused every visit to the park." },
          { id: "d", label: "D", text: "Afternoon visits never occurred before the change." },
        ],
        correctAnswer: "a",
        explanation: "The comparison supports a cautious possible relationship, not an absolute conclusion.",
      },
      {
        prompt: "Which choice best states the central idea of the text?",
        stimulus: "A small archive digitized its handwritten maps and added searchable labels. Researchers can now find patterns without handling the fragile originals.",
        domain: "Information and Ideas",
        skill: "Central Ideas and Details",
        difficulty: "foundational",
        choices: [
          { id: "a", label: "A", text: "Digitization improved access while protecting fragile maps." },
          { id: "b", label: "B", text: "Researchers no longer study maps." },
          { id: "c", label: "C", text: "Handwritten maps are impossible to search." },
          { id: "d", label: "D", text: "The archive discarded its original collection." },
        ],
        correctAnswer: "a",
        explanation: "The text names both searchable access and protection of the originals.",
      },
      {
        prompt: "What does the phrase “measured optimism” most nearly suggest in the text?",
        stimulus: "The first results were promising, but the engineers expressed measured optimism until a larger trial could confirm the pattern.",
        domain: "Information and Ideas",
        skill: "Words in Context",
        difficulty: "hard",
        choices: [
          { id: "a", label: "A", text: "Confidence tempered by caution" },
          { id: "b", label: "B", text: "Complete rejection of the results" },
          { id: "c", label: "C", text: "Excitement unrelated to evidence" },
          { id: "d", label: "D", text: "Certainty that no trial is needed" },
        ],
        correctAnswer: "a",
        explanation: "The engineers are hopeful but wait for more evidence before drawing a firm conclusion.",
      },
      {
        prompt: "Which choice most logically completes the text?",
        stimulus: "The town planted native flowers along the creek. By midsummer, the new strip attracted more bees than the mowed grass had.",
        domain: "Information and Ideas",
        skill: "Inferences",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Native flowers may provide a better habitat for bees." },
          { id: "b", label: "B", text: "Mowed grass is never found near creeks." },
          { id: "c", label: "C", text: "Bees avoid every kind of flower." },
          { id: "d", label: "D", text: "The creek became deeper after planting." },
        ],
        correctAnswer: "a",
        explanation: "The observed increase supports a limited inference about habitat.",
      },
    ],
  },
  {
    dateKey: "2026-10-30",
    title: "SAT Homework — Transitions and Purpose",
    instructions:
      "Complete this original practice set, then explain how each transition connects the surrounding ideas.",
    questions: [
      {
        prompt: "Which choice completes the text with the most logical transition?",
        stimulus: "The first design was inexpensive. _____, it required frequent repairs.",
        domain: "Expression of Ideas",
        skill: "Transitions",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "However" },
          { id: "b", label: "B", text: "Likewise" },
          { id: "c", label: "C", text: "For example" },
          { id: "d", label: "D", text: "As a result" },
        ],
        correctAnswer: "a",
        explanation: "“However” introduces the contrast between low cost and frequent repairs.",
      },
      {
        prompt: "Which choice completes the text with the most logical transition?",
        stimulus: "The trail was closed for repairs. _____, hikers used the nearby riverside path.",
        domain: "Expression of Ideas",
        skill: "Transitions",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Nevertheless" },
          { id: "b", label: "B", text: "As a result" },
          { id: "c", label: "C", text: "In particular" },
          { id: "d", label: "D", text: "Similarly" },
        ],
        correctAnswer: "b",
        explanation: "The second sentence is a consequence of the closure.",
      },
      {
        prompt: "What is the primary purpose of the sentence in the text?",
        stimulus: "The garden's water use fell by a third after drip lines replaced overhead sprinklers.",
        domain: "Expression of Ideas",
        skill: "Text Structure and Purpose",
        difficulty: "hard",
        choices: [
          { id: "a", label: "A", text: "To provide evidence of the system's efficiency" },
          { id: "b", label: "B", text: "To introduce an unrelated concern" },
          { id: "c", label: "C", text: "To question whether the garden exists" },
          { id: "d", label: "D", text: "To describe the garden's history" },
        ],
        correctAnswer: "a",
        explanation: "The water-use statistic supports a claim about efficiency.",
      },
      {
        prompt: "Which choice completes the text with the most logical transition?",
        stimulus: "The team expected the test to take one week. _____, an equipment delay extended it to three weeks.",
        domain: "Expression of Ideas",
        skill: "Transitions",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Instead" },
          { id: "b", label: "B", text: "For instance" },
          { id: "c", label: "C", text: "In addition" },
          { id: "d", label: "D", text: "Similarly" },
        ],
        correctAnswer: "a",
        explanation: "“Instead” signals the actual outcome in contrast to the expectation.",
      },
    ],
  },
  {
    dateKey: "2026-11-06",
    title: "SAT Homework — Sentence Structure Check",
    instructions:
      "Complete this original mini-section before the session. Focus on complete clauses and subject-verb agreement.",
    questions: [
      {
        prompt: "The robotics team tested the new sensor twice _____ both trials produced the same reading.",
        domain: "Standard English Conventions",
        skill: "Boundaries",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "twice, both" },
          { id: "b", label: "B", text: "twice; both" },
          { id: "c", label: "C", text: "twice both" },
          { id: "d", label: "D", text: "twice and both" },
        ],
        correctAnswer: "b",
        explanation: "A semicolon correctly joins the two complete, closely related clauses.",
      },
      {
        prompt: "A collection of field notes _____ how the shoreline changed over three decades.",
        domain: "Standard English Conventions",
        skill: "Subject-Verb Agreement",
        difficulty: "foundational",
        choices: [
          { id: "a", label: "A", text: "show" },
          { id: "b", label: "B", text: "shows" },
          { id: "c", label: "C", text: "have shown" },
          { id: "d", label: "D", text: "showing" },
        ],
        correctAnswer: "b",
        explanation: "The singular subject “collection” takes the singular verb “shows.”",
      },
    ],
  },
  {
    dateKey: "2026-11-20",
    title: "SAT Homework — Main Ideas and Evidence",
    instructions:
      "Complete this original mini-section before the session. Choose only conclusions that stay within the evidence.",
    questions: [
      {
        prompt: "Which choice best states the main idea of the text?",
        stimulus:
          "A neighborhood theater began offering captioned performances twice each month. Attendance increased, and several patrons reported that they could follow the dialogue more easily.",
        domain: "Information and Ideas",
        skill: "Central Ideas and Details",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "Captioned performances improved access for some patrons." },
          { id: "b", label: "B", text: "The theater stopped presenting live performances." },
          { id: "c", label: "C", text: "Every patron prefers captions at all times." },
          { id: "d", label: "D", text: "Attendance declined after captions were introduced." },
        ],
        correctAnswer: "a",
        explanation: "The text connects captions with increased access without making an absolute claim.",
      },
      {
        prompt: "Which conclusion is best supported by the observation?",
        stimulus:
          "During a month-long trial, buses using a dedicated lane arrived more consistently than buses traveling in mixed traffic on the same route.",
        domain: "Information and Ideas",
        skill: "Command of Evidence",
        difficulty: "hard",
        choices: [
          { id: "a", label: "A", text: "Dedicated lanes may improve bus arrival consistency." },
          { id: "b", label: "B", text: "Mixed traffic prevents every bus from arriving." },
          { id: "c", label: "C", text: "All transit routes need identical schedules." },
          { id: "d", label: "D", text: "The trial measured passenger satisfaction only." },
        ],
        correctAnswer: "a",
        explanation: "The comparison supports a cautious conclusion about arrival consistency.",
      },
    ],
  },
  {
    dateKey: "2026-11-27",
    title: "SAT Homework — Words in Context",
    instructions:
      "Complete this original mini-section before the session. Use the surrounding sentence to test each word's precise meaning.",
    questions: [
      {
        prompt: "As used in the text, what does “reserved” most nearly mean?",
        stimulus:
          "Although the architect was enthusiastic about the early sketches, she remained reserved until the safety review was complete.",
        domain: "Craft and Structure",
        skill: "Words in Context",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "cautious" },
          { id: "b", label: "B", text: "scheduled" },
          { id: "c", label: "C", text: "isolated" },
          { id: "d", label: "D", text: "celebratory" },
        ],
        correctAnswer: "a",
        explanation: "Waiting for the safety review shows that “reserved” means cautious or restrained.",
      },
      {
        prompt: "As used in the text, what does “sustain” most nearly mean?",
        stimulus:
          "The organizers needed a funding plan that could sustain the free concert series for more than one season.",
        domain: "Craft and Structure",
        skill: "Words in Context",
        difficulty: "foundational",
        choices: [
          { id: "a", label: "A", text: "criticize" },
          { id: "b", label: "B", text: "maintain" },
          { id: "c", label: "C", text: "shorten" },
          { id: "d", label: "D", text: "announce" },
        ],
        correctAnswer: "b",
        explanation: "The plan must keep the concert series operating, so “sustain” means maintain.",
      },
    ],
  },
  {
    dateKey: "2026-12-11",
    title: "SAT Homework — Rhetorical Synthesis",
    instructions:
      "Complete this original mini-section before the session. Use only the notes relevant to the stated writing goal.",
    questions: [
      {
        prompt: "Which choice most effectively emphasizes the program's growth?",
        stimulus:
          "Notes: The garden program began in 2022 with 12 volunteers. In 2026, 46 volunteers maintained six neighborhood plots.",
        domain: "Expression of Ideas",
        skill: "Rhetorical Synthesis",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "The program uses neighborhood plots." },
          { id: "b", label: "B", text: "From 12 volunteers in 2022, the program grew to 46 volunteers maintaining six plots in 2026." },
          { id: "c", label: "C", text: "Some volunteers enjoy gardening." },
          { id: "d", label: "D", text: "The year 2026 followed the year 2022." },
        ],
        correctAnswer: "b",
        explanation: "Choice B uses both dates and volunteer counts to make the growth clear.",
      },
      {
        prompt: "Which choice most effectively introduces the researcher's method?",
        stimulus:
          "Notes: Dr. Lin compared temperature readings from shaded and unshaded roofs. Sensors recorded data every ten minutes for eight weeks.",
        domain: "Expression of Ideas",
        skill: "Rhetorical Synthesis",
        difficulty: "hard",
        choices: [
          { id: "a", label: "A", text: "Dr. Lin likes several kinds of buildings." },
          { id: "b", label: "B", text: "Roof temperatures can change." },
          { id: "c", label: "C", text: "For eight weeks, Dr. Lin used sensors to compare shaded and unshaded roof temperatures at ten-minute intervals." },
          { id: "d", label: "D", text: "The study ended after the sensors were purchased." },
        ],
        correctAnswer: "c",
        explanation: "Choice C accurately combines the comparison, recording interval, and study duration.",
      },
    ],
  },
  {
    dateKey: "2026-12-18",
    title: "SAT Homework — Fall Mixed Review",
    instructions:
      "Complete this original cumulative mini-section before the final Fall session. Note the reasoning step you most want to review.",
    questions: [
      {
        prompt: "Which choice completes the text with the most logical transition?",
        stimulus:
          "The first map showed only major roads. _____, the revised map included walking paths and public stairways.",
        domain: "Expression of Ideas",
        skill: "Transitions",
        difficulty: "medium",
        choices: [
          { id: "a", label: "A", text: "By contrast" },
          { id: "b", label: "B", text: "For example" },
          { id: "c", label: "C", text: "Therefore" },
          { id: "d", label: "D", text: "Likewise" },
        ],
        correctAnswer: "a",
        explanation: "The revised map contains information the first map omitted, so a contrast is needed.",
      },
      {
        prompt: "Which inference is best supported by the text?",
        stimulus:
          "After the library moved its returns desk closer to the entrance, the average line became shorter even though daily visitor totals stayed about the same.",
        domain: "Information and Ideas",
        skill: "Inferences",
        difficulty: "hard",
        choices: [
          { id: "a", label: "A", text: "The new desk location may have made returns more efficient." },
          { id: "b", label: "B", text: "The library had no visitors before the change." },
          { id: "c", label: "C", text: "Every visitor returned a book." },
          { id: "d", label: "D", text: "Daily visitor totals doubled." },
        ],
        correctAnswer: "a",
        explanation: "Shorter lines with similar visitor totals support a cautious inference about efficiency.",
      },
    ],
  },
] as const;

type SeedSatQuestion = {
  prompt: string;
  stimulus?: string | null;
  domain: string;
  skill: string;
  difficulty: "foundational" | "medium" | "hard";
  choices: readonly { id: string; label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  subject?: string;
};

async function ensureSatAssessmentSeed(courseId: string): Promise<void> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, courseId));
  const satSessions = new Map(
    sessions
      .filter((session) => session.subject === "SAT")
      .map((session) => [session.dateTime.getTime(), session]),
  );

  async function ensureAssignment(
    session: typeof sessions[number],
    title: string,
    instructions: string,
    timeLimitMinutes: number,
    deadline: Date | null,
    maxAttempts: number,
    questions: readonly SeedSatQuestion[],
  ) {
    let [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.courseId, courseId),
          eq(assignmentsTable.title, title),
        ),
      )
      .limit(1);
    if (
      !assignment &&
      (title.startsWith("SAT Diagnostic") || title.startsWith("Full SAT Practice Diagnostic"))
    ) {
      [assignment] = await db
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.courseId, courseId),
            inArray(assignmentsTable.title, [
              "Baseline Reading & Writing Mini-Section",
              "SAT Diagnostic — Reading & Writing",
            ]),
          ),
        )
        .limit(1);
    }
    if (!assignment) {
      [assignment] = await db
        .insert(assignmentsTable)
        .values({
          courseId,
          sessionId: session.id,
          title,
          subject: "SAT Reading & Writing",
          instructions,
          status: "published",
          deadline,
          timeLimitMinutes,
          maxAttempts,
        })
        .returning();
    } else {
      [assignment] = await db
        .update(assignmentsTable)
        .set({
          sessionId: session.id,
          deliveryPhase: "before_session",
          title,
          instructions,
          status: "published",
          deadline,
          timeLimitMinutes,
          maxAttempts,
        })
        .where(eq(assignmentsTable.id, assignment.id))
        .returning();
    }
    for (const [position, question] of questions.entries()) {
      let [storedQuestion] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.prompt, question.prompt))
        .limit(1);
      if (!storedQuestion) {
        [storedQuestion] = await db
          .insert(questionsTable)
          .values({
            subject: question.subject ?? "SAT Reading & Writing",
            domain: question.domain,
            skill: question.skill,
            questionType: "multiple_choice",
            difficulty: question.difficulty,
            stimulus: "stimulus" in question ? question.stimulus : null,
            prompt: question.prompt,
            choices: [...question.choices],
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            sourceType: "original",
            generationMethod: "tutor-authored",
            reviewStatus: "approved",
            tags: ["sat-original"],
          })
          .returning();
      }
      const [existingLink] = await db
        .select({ id: assignmentQuestionsTable.id })
        .from(assignmentQuestionsTable)
        .where(
          and(
            eq(assignmentQuestionsTable.assignmentId, assignment.id),
            eq(assignmentQuestionsTable.questionId, storedQuestion.id),
          ),
        )
        .limit(1);
      if (!existingLink) {
        await db.insert(assignmentQuestionsTable).values({
          assignmentId: assignment.id,
          questionId: storedQuestion.id,
          position,
          predictionFirst: position % 3 !== 1,
        });
      }
    }
  }

  const diagnosticSession = satSessions.get(
    taitoSessionDateTime("2026-10-02").getTime(),
  );
  if (diagnosticSession) {
    await ensureAssignment(
      diagnosticSession,
      "Full SAT Practice Diagnostic",
      "Complete this original timed SAT practice test (Reading & Writing + Math) independently before the October 2 session. Your score and adaptive analysis help your tutors understand strengths, weaknesses, and the first session focus.",
      65,
      new Date("2026-10-01T12:00:00.000Z"),
      1,
      SAT_DIAGNOSTIC_QUESTIONS,
    );
  }
  for (const homework of SAT_HOMEWORK_SETS) {
    const session = satSessions.get(taitoSessionDateTime(homework.dateKey).getTime());
    if (session) {
      await ensureAssignment(
        session,
        homework.title,
        homework.instructions,
        15,
        new Date(session.dateTime.getTime() - 24 * 60 * 60 * 1000),
        2,
        homework.questions,
      );
    }
  }
  for (const session of satSessions.values()) {
    await ensureDuringSessionAssignment(session);
  }

  for (const question of HARD_BANK_SEED_QUESTIONS) {
    const [existingHard] = await db
      .select({ id: questionsTable.id })
      .from(questionsTable)
      .where(eq(questionsTable.prompt, question.prompt))
      .limit(1);
    if (!existingHard) {
      await db.insert(questionsTable).values({
        subject: question.subject ?? "SAT Reading & Writing",
        domain: question.domain,
        skill: question.skill,
        questionType: "multiple_choice",
        difficulty: question.difficulty,
        stimulus: "stimulus" in question ? question.stimulus ?? null : null,
        prompt: question.prompt,
        choices: [...question.choices],
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        sourceType: "original",
        generationMethod: "tutor-authored",
        reviewStatus: "approved",
        tags: ["sat-hard-bank"],
        reviewedAt: new Date(),
      });
    }
  }

  await db
    .update(questionsTable)
    .set({ reviewStatus: "approved", reviewedAt: new Date() })
    .where(
      and(
        eq(questionsTable.sourceType, "original"),
        eq(questionsTable.reviewStatus, "reviewed"),
      ),
    );
}

async function ensureSeedData(): Promise<string> {
  const [existing] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.title, "Fall 2026 SAT & IELTS"))
    .limit(1);
  if (existing) {
    await reconcileTaitoSessions(existing.id);
    await ensureSatAssessmentSeed(existing.id);
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
      meetUrl: SHARED_FALL_MEETING_URL,
      driveUrl: null,
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
        title: sessionTitle(TAITO_STUDENT_DISPLAY_NAME, subject, tutorName),
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

  await ensureSatAssessmentSeed(course.id);
  return course.id;
}

async function ensureUpgradeSeedData(): Promise<void> {
  await db.execute(sql`
    UPDATE tutor_profiles
    SET email = 'xaver.rmz6@gmail.com', updated_at = now()
    WHERE lower(email) = lower('xsfam6@gmail.com')
      AND NOT EXISTS (
        SELECT 1 FROM tutor_profiles AS other
        WHERE lower(other.email) = lower('xaver.rmz6@gmail.com')
      )
  `);
  await db
    .insert(tutorProfilesTable)
    .values([
      {
        email: "xaver.rmz6@gmail.com",
        name: "Xavier Morales",
        title: "SAT & Math Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"],
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
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Eunice Chon"],
        photoAltText: "Eunice Chon, Scholarship Tutor",
        biography:
          "Eunice Chon is a third-year at Harvard College studying History of Science and Philosophy, with a secondary in Global Health and Health Policy. She is passionate about disability advocacy and law, including mental health justice and activism. She is a Coca-Cola Scholar.",
        subjects: ["SAT", "Scholarships", "College admissions"],
        linkedinUrl: "https://linkedin.com/in/eunicechon",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: true,
      },
      {
        email: "nika.raiffe@gmail.com",
        name: "Nika Raiffe",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"],
        photoAltText: "Nika Raiffe, Admissions Tutor",
        subjects: ["College admissions"],
        linkedinUrl: "https://www.linkedin.com/in/nika-raiffe",
        publicApproved: true,
        biography:
          "Nika Raiffe is a sophomore studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She grew up in Eastern Europe, before graduating from Stuyvesant High School.",
        calendarStatus: "disconnected",
        bookingEligible: true,
      },
      {
        email: "public-rosanna-kataja@seed.invalid",
        name: "Rosanna Kataja",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Rosanna Kataja"],
        photoAltText: "Rosanna Kataja, Admissions Tutor",
        biography:
          "Rosanna Kataja is a 2024 graduate of Harvard University, where she studied economics. She is a Fulbright Finland Scholar. Her essays were featured in the book Top 50 Harvard Essays. She has worked in finance for Citi and specialized in college admissions for 2+ years.",
        subjects: ["College admissions"],
        linkedinUrl: "https://www.linkedin.com/in/rosannakataja/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-sophia-lamas@seed.invalid",
        name: "Sophia Lamas",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Sophia Lamas"],
        photoAltText: "Sophia Lamas, Admissions Tutor",
        biography:
          "Sophia Lamas is a 2024 graduate of Stanford with a degree in International Relations and Middle Eastern Studies. There, she served as the Vice President of Stanford's Questbridge College Program Chapter. She is now pursuing her Master’s in Middle East Studies at George Washington University, specializing in Arabic and Conflict Resolution.",
        subjects: ["College admissions"],
        linkedinUrl: "https://www.linkedin.com/in/sophia-lamas/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-aurelia-finch@seed.invalid",
        name: "Aurelia Finch",
        title: "Admissions Tutor - UK",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Aurelia Finch"],
        photoAltText: "Aurelia Finch, Admissions Tutor - UK",
        biography:
          "Aurelia graduated with an MPhil in Modern Middle Eastern Studies from the University of Oxford in 2024, after completing her undergraduate studies in Arabic and Spanish at the University of Durham with first class honours. She is now Director of the UK-MENA Network.",
        subjects: ["College admissions"],
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-kya-brooks@seed.invalid",
        name: "Kya Brooks",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"],
        photoAltText: "Kya Brooks, Admissions Tutor",
        biography:
          "Kya is a senior at Harvard studying economics and the History of Art and Literature. She works in investment finance, consulting, and is a professional model for Wilhelmina Co. Kya is a Coca-Cola Scholar.",
        subjects: ["College admissions"],
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-michael-pecorara@seed.invalid",
        name: "Michael Pecorara",
        title: "SAT and LSAT Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
        photoAltText: "Michael Pecorara, SAT and LSAT Tutor",
        biography:
          "Michael Pecorara is a senior at Harvard University with a concentration in Economics, Government Secondary, and Chinese Language Citation. He has previously worked for a law firm and led one of Harvard's International Relations organizations.",
        subjects: ["SAT", "LSAT"],
        linkedinUrl: "https://www.linkedin.com/in/michaelpecorara/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-kyle-englander@seed.invalid",
        name: "Kyle Englander",
        title: "Scholarship Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"],
        photoAltText: "Kyle Englander, Scholarship Tutor",
        biography:
          "Kyle Englander is a 2024 graduate of Harvard University where he studied economics. Kyle has a background in finance, venture capital, and private equity. He received his commission from the U.S. Navy where he currently serves as an officer.",
        subjects: ["Scholarships", "College admissions"],
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-daniel-salgado-alvarez@seed.invalid",
        name: "Daniel Salgado-Alvarez",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"],
        photoAltText: "Daniel Salgado-Alvarez, Admissions Tutor",
        biography:
          "Daniel is a 2024 graduate of Harvard, who studied sociology and East Asian studies. He is a first-generation college student and the son of Mexican immigrants. In college, he worked at the Peace Corps and the U.S. Department of State. He is a 2024 Fulbright Recipient.",
        subjects: ["College admissions"],
        linkedinUrl: "https://www.linkedin.com/in/daniel-salgado-alvarez-249232191/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
      {
        email: "public-sama-noori@seed.invalid",
        name: "Sama Noori",
        title: "Admissions Tutor",
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"],
        photoAltText: "Sama Noori, Admissions Tutor",
        biography:
          "Sama is a member of Harvard's Class of 2024 with her Bachelor's and Master's in Middle East Studies. She has worked in finance for Bank of America and in government for 3 years at the U.S. Department of State. She has been a college admissions consultant for 5 years and Director of Admissions at a top 100 educational company. She also has professional experience teaching in the Virginia school system. Sama works on operations for Accepted.",
        subjects: ["College admissions", "Operations"],
        linkedinUrl: "https://www.linkedin.com/in/samanoori/",
        publicApproved: true,
        calendarStatus: "disconnected",
        bookingEligible: false,
      },
    ])
    .onConflictDoNothing();

  // Nika was part of the original private seed. Promote only the untouched
  // private record so administrator edits remain the source of truth.
  await db
    .update(tutorProfilesTable)
    .set({
      title: "Admissions Tutor",
      photoUrl: NIKA_APPROVED_PHOTO_URL,
      photoAltText: "Nika Raiffe, Admissions Tutor",
      biography:
        "Nika Raiffe is a sophomore studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She grew up in Eastern Europe, before graduating from Stuyvesant High School.",
      subjects: ["College admissions"],
      linkedinUrl: "https://www.linkedin.com/in/nika-raiffe",
      publicApproved: true,
      bookingEligible: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tutorProfilesTable.email, NIKA_EMAIL),
        eq(tutorProfilesTable.title, "English & IELTS Tutor"),
        sql`${tutorProfilesTable.subjects} = '["English", "IELTS"]'::jsonb`,
        eq(tutorProfilesTable.publicApproved, false),
        isNull(tutorProfilesTable.photoUrl),
      ),
    );

  await db
    .update(tutorProfilesTable)
    .set({ photoUrl: NIKA_APPROVED_PHOTO_URL, updatedAt: new Date() })
    .where(
      and(
        eq(tutorProfilesTable.email, NIKA_EMAIL),
        isNull(tutorProfilesTable.userId),
        or(
          isNull(tutorProfilesTable.photoUrl),
          eq(tutorProfilesTable.photoUrl, ""),
          eq(tutorProfilesTable.photoUrl, NIKA_LEGACY_SEED_PHOTO_URL),
          eq(tutorProfilesTable.photoUrl, NIKA_LEGACY_APPROVED_WIX_PHOTO_URL),
        ),
      ),
    );
  await db
    .update(tutorProfilesTable)
    .set({ photoAltText: "Nika Raiffe, Admissions Tutor", updatedAt: new Date() })
    .where(
      and(
        eq(tutorProfilesTable.email, NIKA_EMAIL),
        isNull(tutorProfilesTable.userId),
        or(isNull(tutorProfilesTable.photoAltText), eq(tutorProfilesTable.photoAltText, "")),
      ),
    );

  for (const update of MIRRORED_PORTRAIT_RECONCILIATIONS) {
    await db
      .update(tutorProfilesTable)
      .set({
        photoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS[update.name],
        photoAltText: update.photoAltText,
        ...("biography" in update ? { biography: update.biography } : {}),
        ...("linkedinUrl" in update ? { linkedinUrl: update.linkedinUrl } : {}),
      })
      .where(
        and(
          eq(tutorProfilesTable.email, update.email),
          isNull(tutorProfilesTable.userId),
          eq(tutorProfilesTable.name, update.name),
          eq(tutorProfilesTable.updatedAt, tutorProfilesTable.createdAt),
          update.previousPhotoUrl === null
            ? isNull(tutorProfilesTable.photoUrl)
            : eq(tutorProfilesTable.photoUrl, update.previousPhotoUrl),
        ),
      );
  }

  // Rewrite any remaining known Wix CDN portrait URLs to first-party assets so
  // the public site does not depend on the retired Wix marketing site.
  for (const name of PUBLIC_TUTOR_ORDER) {
    const legacyUrl = LEGACY_WIX_PUBLIC_TEAM_PORTRAITS[name];
    const localUrl = APPROVED_PUBLIC_TEAM_PORTRAITS[name];
    if (legacyUrl === localUrl) continue;
    await db
      .update(tutorProfilesTable)
      .set({ photoUrl: localUrl, updatedAt: new Date() })
      .where(eq(tutorProfilesTable.photoUrl, legacyUrl));
  }
  for (const legacyUrl of [
    "https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp",
    "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg",
  ] as const) {
    await db
      .update(tutorProfilesTable)
      .set({ photoUrl: rewriteLegacyWixMediaUrl(legacyUrl), updatedAt: new Date() })
      .where(eq(tutorProfilesTable.photoUrl, legacyUrl));
  }

  await db
    .update(coursesTable)
    .set({ driveUrl: null })
    .where(
      or(
        sql`${coursesTable.driveUrl} ILIKE '%drive.google.com%'`,
        sql`${coursesTable.driveUrl} ILIKE '%docs.google.com%'`,
      ),
    );

  // Catalog prices are owned by migration 0019_accepted_admissions_sat_catalog.
  // Do not upsert or reset sat_products prices/Stripe IDs from GET-driven seed paths.
  // Complimentary credits are granted only through the audited admin credit-adjustment action.
  // Soften leftover marketing copy that names individual SAT tutors.
  await db
    .update(satProductsTable)
    .set({
      description: "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(satProductsTable.slug, SINGLE_SAT_SESSION_SLUG),
        sql`${satProductsTable.description} ILIKE '%Xavier or Eunice%'`,
      ),
    );
  await db
    .update(satProductsTable)
    .set({
      description:
        "Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on our SAT tutors’ available calendar.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(satProductsTable.slug, TEN_SAT_SESSION_PACKAGE_SLUG),
        sql`${satProductsTable.description} ILIKE '%Xavier or Eunice%'`,
      ),
    );

  // Ensure Eunice remains bookable for prepaid SAT credits without overwriting admin edits
  // to biography or title; only add SAT when the untouched seed subject list is present.
  await db
    .update(tutorProfilesTable)
    .set({
      subjects: ["SAT", "Scholarships", "College admissions"],
      bookingEligible: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tutorProfilesTable.email, "eunice_chon@berkeley.edu"),
        eq(tutorProfilesTable.name, EUNICE_NAME),
        or(
          sql`${tutorProfilesTable.subjects} = '["Scholarships", "College admissions"]'::jsonb`,
          sql`${tutorProfilesTable.subjects} = '["SAT", "Scholarships", "College admissions"]'::jsonb`,
        ),
      ),
    );

  const seededTutors = await db
    .select({ id: tutorProfilesTable.id, name: tutorProfilesTable.name })
    .from(tutorProfilesTable)
    .where(inArray(tutorProfilesTable.name, ["Xavier Morales", "Eunice Chon"]));
  for (const tutor of seededTutors) {
    if (tutor.name === XAVIER_NAME) {
      await db
        .update(tutorCompensationRatesTable)
        .set({ endedAt: new Date() })
        .where(
          and(
            eq(tutorCompensationRatesTable.tutorProfileId, tutor.id),
            isNull(tutorCompensationRatesTable.endedAt),
            sql`${tutorCompensationRatesTable.hourlyRateCents} <> ${XAVIER_TUTOR_SHARE_CENTS}`,
          ),
        );
      const [currentRate] = await db
        .select({ id: tutorCompensationRatesTable.id })
        .from(tutorCompensationRatesTable)
        .where(
          and(
            eq(tutorCompensationRatesTable.tutorProfileId, tutor.id),
            eq(tutorCompensationRatesTable.hourlyRateCents, XAVIER_TUTOR_SHARE_CENTS),
            isNull(tutorCompensationRatesTable.endedAt),
          ),
        )
        .limit(1);
      if (!currentRate) {
        await db.insert(tutorCompensationRatesTable).values({
          tutorProfileId: tutor.id,
          hourlyRateCents: XAVIER_TUTOR_SHARE_CENTS,
          effectiveFrom: new Date(),
        });
      }
    }
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
          "Explore prepaid SAT session credits at $130/hour, see approved prices, and continue to secure checkout.",
        body: {
          heroLead:
            "Purchase a single hour or a ten-hour package at $130 per credit. Funds settle with Accepted Admissions; credits unlock after a verified Stripe payment and can be booked with our SAT tutors.",
          offersIntro:
            "Book hourly ($130 for one credit) or buy ten hours at once ($1,300). Use credits anytime on our SAT tutors’ available calendar.",
          sections: [
            "Review the current single-hour and ten-hour SAT tutoring credits available online.",
            "Sign in to purchase, then use verified prepaid credits to schedule with our SAT tutors in the client portal.",
          ],
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "home",
        pageType: "home",
        title: "A clear next step for your college goals.",
        seoTitle: "Accepted Admissions | Your next step, made clear",
        seoDescription:
          "Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance.",
        body: {
          heroEyebrow: "For students and families planning what comes next",
          heroTitle: "A clear next step for your college goals.",
          heroLead:
            "Harvard students and recent graduates provide focused one-on-one SAT tutoring, with thoughtful guidance for families whose needs go beyond a single session.",
          satPathTitle: "Need SAT tutoring now?",
          satPathBlurb:
            "Purchase one hour or a ten-hour package at $130 per credit, then book open times with our SAT tutors.",
          guidancePathTitle: "Need a broader conversation?",
          guidancePathBlurb:
            "Admissions guidance, IELTS support, or another request starts with a private inquiry—not checkout.",
          satServiceTitle: "SAT tutoring",
          satServiceBlurb:
            "Explore the current one-session offer, review what happens after checkout, and meet the team to learn about our tutors.",
          guidanceServiceTitle: "Broader guidance",
          guidanceServiceBlurb:
            "If you are exploring admissions planning, IELTS support, or a different need, share the context privately. We will review it before discussing fit.",
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "site-settings",
        pageType: "settings",
        title: "Site settings",
        seoTitle: "Accepted Admissions site settings",
        seoDescription: "Public contact email and site-wide settings for Accepted Admissions.",
        body: {
          contactEmail: "admin@acceptedadmissions.org",
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "our-team",
        pageType: "team",
        title: "Meet Our Team",
        seoTitle: "Meet Our Team | Accepted Admissions",
        seoDescription:
          "Meet the approved public profiles behind Accepted Admissions and decide whether to request SAT or broader guidance.",
        body: {
          intro: "Choose the expert best fit for you.",
        },
        status: "published",
        publishedAt: new Date(),
      },
      {
        slug: "past-success",
        pageType: "success",
        title: "Student Stories",
        seoTitle: "Student Stories | Accepted Admissions",
        seoDescription:
          "Read an approved student perspective and view destination details published by Accepted Admissions.",
        body: {
          intro:
            "This page shares an approved student perspective and published destination examples. These records provide context, not a promise of a particular admission result.",
          testimonial: {
            quote:
              "Really happy with my experience with Accepted Admissions. It was an advantage to have on-the-ground Harvard students who are current with applications advising me for cheaper than huge firms. It was nice to work with tutors who all had an Ivy League backgrounds.",
            attribution: "Sarah M.",
            attributionMode: "named",
          },
          schoolLogos: [...APPROVED_SCHOOL_LOGOS],
        },
        status: "published",
        publishedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // Refresh only untouched seed records. Admin-edited records retain their
  // published content and remain the source of truth for the public site.
  await db
    .update(publicContentTable)
    .set({
      title: "Meet Our Team",
      seoTitle: "Meet Our Team | Accepted Admissions",
      body: { intro: "Choose the expert best fit for you." },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(publicContentTable.slug, "our-team"),
        eq(publicContentTable.title, "Meet the Team"),
        isNull(publicContentTable.updatedBy),
      ),
    );

  const [satSeed] = await db
    .select()
    .from(publicContentTable)
    .where(
      and(
        eq(publicContentTable.slug, "sat"),
        isNull(publicContentTable.updatedBy),
      ),
    )
    .limit(1);
  const satBody =
    satSeed?.body && typeof satSeed.body === "object" && !Array.isArray(satSeed.body)
      ? (satSeed.body as Record<string, unknown>)
      : null;
  const satSections = Array.isArray(satBody?.sections)
    ? satBody.sections.filter((section): section is string => typeof section === "string")
    : [];
  const satCopyMentionsNamedTutors = [satBody?.heroLead, satBody?.offersIntro, ...satSections].some(
    (value) => typeof value === "string" && /Xavier or Eunice/i.test(value),
  );
  if (
    satSeed &&
    (satCopyMentionsNamedTutors ||
      satSections.some((section) => section.includes("single SAT tutoring session currently available")) ||
      (typeof satSeed.seoDescription === "string" &&
        satSeed.seoDescription.includes("current 60-minute SAT tutoring offer")))
  ) {
    await db
      .update(publicContentTable)
      .set({
        seoDescription:
          "Explore prepaid SAT session credits at $130/hour, see approved prices, and continue to secure checkout.",
        body: {
          heroLead:
            "Purchase a single hour or a ten-hour package at $130 per credit. Funds settle with Accepted Admissions; credits unlock after a verified Stripe payment and can be booked with our SAT tutors.",
          offersIntro:
            "Book hourly ($130 for one credit) or buy ten hours at once ($1,300). Use credits anytime on our SAT tutors’ available calendar.",
          sections: [
            "Review the current single-hour and ten-hour SAT tutoring credits available online.",
            "Sign in to purchase, then use verified prepaid credits to schedule with our SAT tutors in the client portal.",
          ],
        },
        updatedAt: new Date(),
      })
      .where(eq(publicContentTable.id, satSeed.id));
  }

  const [successSeed] = await db
    .select()
    .from(publicContentTable)
    .where(
      and(
        eq(publicContentTable.slug, "past-success"),
        isNull(publicContentTable.updatedBy),
      ),
    )
    .limit(1);
  const successBody =
    successSeed?.body && typeof successSeed.body === "object" && !Array.isArray(successSeed.body)
      ? (successSeed.body as Record<string, unknown>)
      : null;
  const successIntro =
    typeof successBody?.intro === "string" ? successBody.intro : "";
  if (
    successSeed &&
    (successIntro.includes("This is a sample of the schools") ||
      successIntro.includes("get our students into the schools of their dreams"))
  ) {
    await db
      .update(publicContentTable)
      .set({
        title: "Student Stories",
        seoTitle: "Student Stories | Accepted Admissions",
        seoDescription:
          "Read an approved student perspective and view destination examples published by Accepted Admissions.",
        body: {
          ...successBody,
          intro:
            "This page shares an approved student perspective and published destination examples. These records provide context, not a promise of a particular admission result.",
        },
        updatedAt: new Date(),
      })
      .where(eq(publicContentTable.id, successSeed.id));
  }

  // Rewrite known Wix CDN school logos on every past-success record so published
  // pages keep working after the Wix site is shut down. Custom admin URLs that
  // are not in the legacy map are left unchanged.
  const pastSuccessPages = await db
    .select({ id: publicContentTable.id, body: publicContentTable.body })
    .from(publicContentTable)
    .where(eq(publicContentTable.slug, "past-success"));
  for (const page of pastSuccessPages) {
    if (!page.body || typeof page.body !== "object" || Array.isArray(page.body)) continue;
    const body = page.body as Record<string, unknown>;
    const rewrittenLogos = rewriteLegacyWixSchoolLogos(body.schoolLogos);
    if (!rewrittenLogos) continue;
    await db
      .update(publicContentTable)
      .set({
        body: { ...body, schoolLogos: rewrittenLogos },
        updatedAt: new Date(),
      })
      .where(eq(publicContentTable.id, page.id));
  }
}

async function loadActiveDatabaseAccessGrants(
  clerkUserId?: string,
  email?: string,
): Promise<DatabaseAccessGrant[]> {
  const normalizedEmail = email ? normalizeProvisionedEmail(email) : undefined;
  const identityFilters = [
    ...(clerkUserId
      ? [eq(portalAccessGrantsTable.clerkUserId, clerkUserId)]
      : []),
    ...(normalizedEmail
      ? [eq(portalAccessGrantsTable.email, normalizedEmail)]
      : []),
  ];
  if (identityFilters.length === 0) return [];
  const rows = await db
    .select({
      email: portalAccessGrantsTable.email,
      clerkUserId: portalAccessGrantsTable.clerkUserId,
      roleCategory: portalAccessGrantsTable.roleCategory,
      active: portalAccessGrantsTable.active,
    })
    .from(portalAccessGrantsTable)
    .where(
      and(eq(portalAccessGrantsTable.active, true), or(...identityFilters)),
    );
  return rows.map((row) => ({
    email: row.email,
    clerkUserId: row.clerkUserId,
    roleCategory: row.roleCategory,
    active: row.active,
  }));
}

async function resolveIdentityAccess(
  clerkUserId: string,
  email?: string,
): Promise<ReturnType<typeof resolvePortalAccess>> {
  const databaseGrants = await loadActiveDatabaseAccessGrants(
    clerkUserId,
    email,
  );
  return resolvePortalAccess(clerkUserId, email, { databaseGrants });
}

function adminAccessGrantShape(grant: PortalAccessGrant) {
  const access = accessFromRoleCategory(grant.roleCategory);
  return {
    id: grant.id,
    email: grant.email,
    clerkUserId: grant.clerkUserId,
    displayName: grant.displayName,
    roleCategory: grant.roleCategory,
    role: access.role as "tutor" | "student",
    subject: access.subject,
    active: grant.active,
    notes: grant.notes,
    userId: grant.userId,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
    revokedAt: grant.revokedAt ? grant.revokedAt.toISOString() : null,
  };
}

function pendingClerkUserId(email: string): string {
  return `pending:${normalizeProvisionedEmail(email)}`;
}

function looksLikeClerkUserId(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= 3 &&
    !trimmed.includes("@") &&
    !trimmed.startsWith("pending:")
  );
}

async function ensureProvisionedAppUser(input: {
  email: string;
  displayName: string;
  roleCategory: ProvisionableRoleCategory;
  clerkUserId?: string | null;
}): Promise<AppUser> {
  const email = normalizeProvisionedEmail(input.email);
  const access = accessFromRoleCategory(input.roleCategory);
  const desiredClerkUserId =
    input.clerkUserId && looksLikeClerkUserId(input.clerkUserId)
      ? input.clerkUserId.trim()
      : pendingClerkUserId(email);

  const [byEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  const [byClerk] =
    desiredClerkUserId && !desiredClerkUserId.startsWith("pending:")
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, desiredClerkUserId))
          .limit(1)
      : [];

  if (byClerk && byEmail && byClerk.id !== byEmail.id) {
    throw new Error("CLERK_USER_EMAIL_CONFLICT");
  }

  const existing = byEmail ?? byClerk;
  let user: AppUser;
  if (existing) {
    const nextClerkUserId =
      existing.clerkUserId.startsWith("pending:") ||
      existing.clerkUserId === desiredClerkUserId
        ? desiredClerkUserId
        : existing.clerkUserId;
    [user] = await db
      .update(usersTable)
      .set({
        displayName: input.displayName.trim(),
        role: access.role,
        clerkUserId: nextClerkUserId,
        email,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existing.id))
      .returning();
  } else {
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: desiredClerkUserId,
        email,
        displayName: input.displayName.trim(),
        role: access.role,
      })
      .returning();
  }

  await syncConfiguredAccess(user!, access);

  if (access.role === "tutor") {
    const subjects = subjectsForRoleCategory(input.roleCategory);
    const title = tutorTitleForRoleCategory(
      input.roleCategory as Exclude<ProvisionableRoleCategory, "student">,
    );
    const [existingProfile] = await db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.email, email))
      .limit(1);
    if (existingProfile) {
      await db
        .update(tutorProfilesTable)
        .set({
          userId: user!.id,
          name: input.displayName.trim(),
          title,
          subjects,
          active: true,
          bookingEligible: true,
          updatedAt: new Date(),
        })
        .where(eq(tutorProfilesTable.id, existingProfile.id));
    } else {
      await db.insert(tutorProfilesTable).values({
        userId: user!.id,
        email,
        name: input.displayName.trim(),
        title,
        subjects,
        active: true,
        bookingEligible: true,
        publicApproved: false,
      });
    }
  } else {
    await db
      .update(tutorProfilesTable)
      .set({
        active: false,
        bookingEligible: false,
        updatedAt: new Date(),
      })
      .where(eq(tutorProfilesTable.email, email));
  }

  return user!;
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
      .where(
        and(
          eq(usersTable.email, normalizeProvisionedEmail(targetEmail)),
          eq(usersTable.role, "student"),
        ),
      )
      .limit(1);
    await db
      .update(viewerLinksTable)
      .set({ active: false })
      .where(
        and(
          eq(viewerLinksTable.viewerUserId, user.id),
          ...(student
            ? [ne(viewerLinksTable.studentUserId, student.id)]
            : []),
        ),
      );
    if (!student) return;
    await db
      .insert(viewerLinksTable)
      .values({
        viewerUserId: user.id,
        studentUserId: student.id,
        relationship: TAITO_VIEWER_RELATIONSHIP,
      })
      .onConflictDoUpdate({
        target: [viewerLinksTable.viewerUserId, viewerLinksTable.studentUserId],
        set: { active: true, relationship: TAITO_VIEWER_RELATIONSHIP },
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
  if (
    access.role === "student" &&
    normalizeProvisionedEmail(user.email) === TAITO_STUDENT_EMAIL
  ) {
    const [viewer] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, RYO_VIEWER_EMAIL),
          eq(usersTable.role, "viewer"),
        ),
      )
      .limit(1);
    if (viewer) {
      await db
        .update(viewerLinksTable)
        .set({ active: false })
        .where(
          and(
            eq(viewerLinksTable.viewerUserId, viewer.id),
            ne(viewerLinksTable.studentUserId, user.id),
          ),
        );
      await db
        .insert(viewerLinksTable)
        .values({
          viewerUserId: viewer.id,
          studentUserId: user.id,
          relationship: TAITO_VIEWER_RELATIONSHIP,
        })
        .onConflictDoUpdate({
          target: [viewerLinksTable.viewerUserId, viewerLinksTable.studentUserId],
          set: { active: true, relationship: TAITO_VIEWER_RELATIONSHIP },
        });
    }
  }

  await reconcileTutorAssignments(courseId);
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
  const initialAccess = await resolveIdentityAccess(clerkUserId);
  let configured = initialAccess.access;
  let configurationConflict = initialAccess.conflict;
  let identity: { email?: string; displayName?: string } | undefined;
  if (!configured && !configurationConflict) {
    try {
      identity = await clerkIdentity(auth, clerkUserId, appUser, true);
      const emailAccess = await resolveIdentityAccess(
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
  if (!appUser && !identity) {
    try {
      identity = await clerkIdentity(auth, clerkUserId, undefined, true);
    } catch {
      res.status(502).json({
        code: "IDENTITY_LOOKUP_FAILED",
        error: "The signed-in account could not be verified right now.",
      });
      return;
    }
  }
  if (
    !identity &&
    (!appUser ||
      appUser.role === "tutor" ||
      !claimString(auth.sessionClaims, "email"))
  ) {
    try {
      identity = await clerkIdentity(auth, clerkUserId, appUser, true);
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
  if (configured.role === "tutor" || configured.role === "student") {
    const grantEmail = normalizeProvisionedEmail(appUser.email);
    await db
      .update(portalAccessGrantsTable)
      .set({
        clerkUserId,
        userId: appUser.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(portalAccessGrantsTable.active, true),
          eq(portalAccessGrantsTable.email, grantEmail),
          or(
            isNull(portalAccessGrantsTable.clerkUserId),
            eq(portalAccessGrantsTable.clerkUserId, clerkUserId),
            eq(
              portalAccessGrantsTable.clerkUserId,
              pendingClerkUserId(grantEmail),
            ),
          ),
        ),
      );
  }
  const clerkSessionId =
    auth.sessionId ?? claimString(auth.sessionClaims, "sid");
  await recordSuccessfulLogin(appUser.id, clerkSessionId);
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

async function canAccessSession(
  user: AppUser,
  session: typeof sessionsTable.$inferSelect,
): Promise<boolean> {
  return canViewSession(user, session);
}

function libraryAssetResponse(
  asset: typeof curriculumLibraryAssetsTable.$inferSelect,
) {
  return {
    id: asset.id,
    title: asset.title,
    kind: isLibraryAssetKind(asset.kind) ? asset.kind : ("resource" as const),
    description: asset.description,
    resourceUrl: asset.resourceUrl,
    body: asset.body,
    createdAt: asset.createdAt,
  };
}

async function studentShape(studentUserId: string) {
  const [student] = await db
    .select({ id: usersTable.id, name: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, studentUserId))
    .limit(1);
  return student ?? null;
}

async function canonicalSessionTitleForPeople(
  clientUserId: string | null | undefined,
  subject: string,
  tutorUserId: string | null | undefined,
): Promise<string> {
  const ids = [clientUserId, tutorUserId].filter(
    (id): id is string => Boolean(id),
  );
  const people =
    ids.length > 0
      ? await db
          .select({ id: usersTable.id, name: usersTable.displayName })
          .from(usersTable)
          .where(inArray(usersTable.id, ids))
      : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  return sessionTitle(
    clientUserId ? names.get(clientUserId) : null,
    subject,
    tutorUserId ? names.get(tutorUserId) : null,
  );
}

async function canonicalSessionTitleForSession(session: {
  clientUserId: string | null;
  tutorUserId: string | null;
  subject: string;
}): Promise<string> {
  return canonicalSessionTitleForPeople(
    session.clientUserId,
    session.subject,
    session.tutorUserId,
  );
}

async function sessionStudentShape(session: {
  clientUserId: string | null;
  dateTime: Date;
  subject: string;
}) {
  const linkedStudent = session.clientUserId
    ? await studentShape(session.clientUserId)
    : null;
  return (
    linkedStudent ??
    (isTaitoFallSession(session) ? { name: TAITO_STUDENT_DISPLAY_NAME } : null)
  );
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
  const sessionsForUser = user
    ? await visibleSessionsForUser(user, course.id)
    : courseSessions;
  const tutorMemberships =
    user?.role === "student" || user?.role === "viewer" || user?.role === "tutor"
      ? await courseForTutorAssignments(
          course.id,
          user,
          user.role === "viewer" ? await dataSubjectUserId(user) : undefined,
        )
      : await db
          .select({ user: usersTable, subject: courseMembershipsTable.subject })
          .from(courseMembershipsTable)
          .innerJoin(usersTable, eq(usersTable.id, courseMembershipsTable.userId))
          .where(
            and(
              eq(courseMembershipsTable.courseId, course.id),
              eq(courseMembershipsTable.membershipRole, "tutor"),
            ),
          );
  return {
    id: course.id,
    title: course.title,
    subject: course.subject,
    term: course.term,
    status: course.status,
    sessionCount: sessionsForUser.length,
    completedSessionCount: sessionsForUser.filter((s) => s.status === "completed")
      .length,
    tutors: tutorMemberships
      .filter(({ user: tutor }) => tutor.role === "tutor")
      .map(({ user: tutor }) => tutorShape(tutor)!),
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
  const [record] = await db
    .select({ attempt: attemptsTable, timeLimitMinutes: assignmentsTable.timeLimitMinutes })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!record) return null;
  const attempt = record.attempt;
  const timing = await timerSummary(attempt.id);
  const saved = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attempt.id));
  return {
    id: attempt.id,
    assignmentId: attempt.assignmentId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    ...timing,
    remainingSeconds: Math.max(
      0,
      record.timeLimitMinutes * 60 - timing.activeSeconds,
    ),
    result:
      attempt.status === "submitted" || attempt.status === "expired"
        ? await storedAttemptResult(attempt.id)
        : null,
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

type AttemptAnalysisPayload = {
  source: "deterministic" | "provider";
  label: string;
  provider: string | null;
  strengths: string[];
  weaknesses: string[];
  mistakePatterns: string[];
  nextFocus: string[];
  feedback: string;
};

type AttemptResultPayload = {
  attemptId: string;
  assignmentId: string;
  assignmentTitle: string;
  studentUserId: string;
  studentName: string;
  sessionId: string | null;
  sessionDateTime: Date | null;
  status: "submitted" | "expired";
  submittedAt: Date | null;
  score: number;
  correctCount: number;
  totalCount: number;
  activeSeconds: number;
  pausedSeconds: number;
  breakdown: Array<{
    skill: string;
    correct: number;
    total: number;
    accuracy: number;
  }>;
  items: Array<{
    questionId: string;
    correct: boolean;
    prediction: string | null;
    finalAnswer: string | null;
    correctAnswer: string;
    explanation: string;
    skill: string;
    questionType: string;
    difficulty: string;
    timeSpentSeconds: number;
    flagged: boolean;
    prompt: string;
    stimulus: string | null;
    choices: Array<{ id: string; label: string; text: string }>;
  }>;
  analysis: AttemptAnalysisPayload;
  studentFeedback: string;
};

async function storedAttemptResult(
  attemptId: string,
  includeTutorFields = false,
) {
  const [attempt] = await db
    .select({
      result: attemptsTable.result,
      tutorNotes: attemptsTable.tutorNotes,
      reviewStatus: attemptsTable.reviewStatus,
      assignmentId: assignmentsTable.id,
      assignmentTitle: assignmentsTable.title,
      studentUserId: usersTable.id,
      studentName: usersTable.displayName,
      sessionId: sessionsTable.id,
      sessionDateTime: sessionsTable.dateTime,
    })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
    .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt?.result) return null;
  return {
    ...(attempt.result as Record<string, unknown>),
    assignmentId: attempt.assignmentId,
    assignmentTitle: attempt.assignmentTitle,
    studentUserId: attempt.studentUserId,
    studentName: attempt.studentName,
    sessionId: attempt.sessionId,
    sessionDateTime: attempt.sessionDateTime,
    ...(includeTutorFields
      ? {
          tutorNotes: attempt.tutorNotes,
          reviewStatus: attempt.reviewStatus,
        }
      : {}),
  };
}

function deterministicAnalysis(
  breakdown: AttemptResultPayload["breakdown"],
  items: Array<
    AttemptResultPayload["items"][number] & {
      domain?: string | null;
      subject?: string | null;
    }
  >,
  score: number,
  assignmentTitle?: string | null,
): AttemptAnalysisPayload {
  return buildAttemptAnalysis(
    breakdown,
    items.map((item) => ({
      correct: item.correct,
      skill: item.skill,
      finalAnswer: item.finalAnswer,
      domain: item.domain ?? null,
      subject: item.subject ?? attemptSubjectFromAssignment(assignmentTitle),
    })),
    score,
    { assignmentTitle },
  );
}

function attemptSubjectFromAssignment(title?: string | null): string {
  if (/math/i.test(title ?? "")) return "SAT Math";
  return "SAT Reading & Writing";
}

async function finalizeAttemptResult(
  attemptId: string,
  status: "submitted" | "expired",
): Promise<AttemptResultPayload | null> {
  const [attempt] = await db
    .select({
      attempt: attemptsTable,
      assignment: assignmentsTable,
      student: usersTable,
      session: sessionsTable,
    })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
    .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) return null;
  if (attempt.attempt.result) {
    return {
      ...(attempt.attempt.result as AttemptResultPayload),
      assignmentId: attempt.assignment.id,
      assignmentTitle: attempt.assignment.title,
      studentUserId: attempt.student.id,
      studentName: attempt.student.displayName,
      sessionId: attempt.session?.id ?? null,
      sessionDateTime: attempt.session?.dateTime ?? null,
    };
  }

  const assignedQuestions = await db
    .select({ question: questionsTable })
    .from(assignmentQuestionsTable)
    .innerJoin(
      questionsTable,
      eq(questionsTable.id, assignmentQuestionsTable.questionId),
    )
    .where(eq(assignmentQuestionsTable.assignmentId, attempt.attempt.assignmentId))
    .orderBy(asc(assignmentQuestionsTable.position));
  const submittedResponses = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.attemptId, attempt.attempt.id));
  const joined = assignedQuestions.map(({ question }) => ({
    question,
    response:
      submittedResponses.find((response) => response.questionId === question.id) ??
      null,
  }));
  let correctCount = 0;
  for (const item of joined) {
    const correct = item.response?.finalAnswer === item.question.correctAnswer;
    if (correct) correctCount += 1;
    if (item.response) {
      await db
        .update(responsesTable)
        .set({ correct })
        .where(eq(responsesTable.id, item.response.id));
    }
  }
  const totalCount = joined.length;
  const score = totalCount === 0 ? 0 : (correctCount / totalCount) * 100;
  const timing = await timerSummary(attempt.attempt.id);
  const bySkill = new Map<string, { correct: number; total: number }>();
  for (const item of joined) {
    const current = bySkill.get(item.question.skill) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (item.response?.finalAnswer === item.question.correctAnswer) current.correct += 1;
    bySkill.set(item.question.skill, current);
  }
  const breakdown = [...bySkill.entries()].map(([skill, value]) => ({
    skill,
    ...value,
    accuracy: value.total === 0 ? 0 : (value.correct / value.total) * 100,
  }));
  const items = joined.map(({ response, question }) => ({
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
    prompt: question.prompt,
    stimulus: question.stimulus,
    choices: question.choices,
    domain: question.domain,
    subject: question.subject,
  }));
  const analysis = deterministicAnalysis(breakdown, items, score, attempt.assignment.title);
  const result: AttemptResultPayload = {
    attemptId: attempt.attempt.id,
    assignmentId: attempt.assignment.id,
    assignmentTitle: attempt.assignment.title,
    studentUserId: attempt.student.id,
    studentName: attempt.student.displayName,
    sessionId: attempt.session?.id ?? null,
    sessionDateTime: attempt.session?.dateTime ?? null,
    status,
    submittedAt: new Date(),
    score,
    correctCount,
    totalCount,
    activeSeconds: timing.activeSeconds,
    pausedSeconds: timing.pausedSeconds,
    breakdown,
    items,
    analysis,
    studentFeedback: analysis.feedback,
  };
  await db
    .update(attemptsTable)
    .set({
      status,
      submittedAt: result.submittedAt,
      score,
      result,
      analysis,
      studentFeedback: analysis.feedback,
      reviewStatus: "new",
    })
    .where(eq(attemptsTable.id, attempt.attempt.id));
  if (status === "submitted") {
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.attempt.id, type: "submitted" });
  }
  await deriveAdaptiveRecommendations(attempt.attempt.id);
  await enqueueMissedReviewItems({
    attemptId: attempt.attempt.id,
    studentUserId: attempt.student.id,
    items: items.map((item) => ({
      questionId: item.questionId,
      skill: item.skill,
      correct: item.correct,
      prompt: item.prompt,
    })),
  });
  if (attempt.session) {
    await prepareSessionCurriculum(attempt.session);
  }
  return result;
}

type AdaptiveResultItem = {
  questionId: string;
  correct: boolean;
  skill: string;
  prompt: string;
  finalAnswer?: string | null;
  correctAnswer: string;
};

function adaptiveQuestionShape(
  question: typeof questionsTable.$inferSelect,
  position = 0,
) {
  return {
    id: question.id,
    position,
    subject: question.subject,
    questionType: question.questionType,
    prompt: question.prompt,
    stimulus: question.stimulus,
    choices: question.choices,
    skill: question.skill,
    difficulty: question.difficulty,
    predictionFirst: false,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    sourceType: question.sourceType,
    reviewStatus: question.reviewStatus,
  };
}

async function usedQuestionIdsForStudent(
  courseId: string,
  studentUserId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ questionId: responsesTable.questionId })
    .from(responsesTable)
    .innerJoin(attemptsTable, eq(attemptsTable.id, responsesTable.attemptId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .where(
      and(
        eq(assignmentsTable.courseId, courseId),
        eq(attemptsTable.userId, studentUserId),
      ),
    );
  return new Set(rows.map((row) => row.questionId));
}

function deterministicAdaptiveQuestion(skill: string, subject: string) {
  const normalized = skill.trim().toLowerCase();
  if (normalized.includes("transition")) {
    return {
      stimulus:
        "The design reduced material waste during production. _____, the team continued testing its durability.",
      prompt: "Which choice completes the text with the most logical transition?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "For example" },
        { id: "c", label: "C", text: "Similarly" },
        { id: "d", label: "D", text: "In particular" },
      ],
      correctAnswer: "a",
      explanation:
        "The second sentence introduces a related but contrasting concern, so “However” is the logical transition.",
    };
  }
  if (normalized.includes("evidence") || normalized.includes("inference")) {
    return {
      stimulus:
        "A two-week comparison found that seedlings in the shaded plot retained more water than seedlings in the unshaded plot, while both plots received the same amount of rain.",
      prompt: "Which conclusion is best supported by the evidence?",
      choices: [
        { id: "a", label: "A", text: "Shade may help the soil retain moisture." },
        { id: "b", label: "B", text: "Every plant grows best in shade." },
        { id: "c", label: "C", text: "Rain never reaches shaded plots." },
        { id: "d", label: "D", text: "The comparison proves all soil is identical." },
      ],
      correctAnswer: "a",
      explanation:
        "The controlled comparison supports a limited relationship between shade and moisture retention, not an absolute claim.",
    };
  }
  return {
    stimulus:
      "The neighborhood library added quiet study rooms and extended its evening hours. Attendance increased during the following month.",
    prompt: "Which choice best states the central idea of the text?",
    choices: [
      { id: "a", label: "A", text: "The library closed its study rooms." },
      { id: "b", label: "B", text: "Library changes coincided with increased attendance." },
      { id: "c", label: "C", text: "Only librarians attended in the evening." },
      { id: "d", label: "D", text: "The neighborhood stopped using the library." },
    ],
    correctAnswer: "b",
    explanation:
      "The text connects the library's added access and facilities with increased attendance without claiming that the changes caused every visit.",
  };
}

async function createDeterministicAdaptiveQuestion(
  skill: string,
  subject: string,
  usedQuestionIds: Set<string>,
) {
  const existing = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        eq(questionsTable.subject, subject),
        eq(questionsTable.skill, skill),
        eq(questionsTable.sourceType, "original"),
        eq(questionsTable.generationMethod, "adaptive-deterministic"),
        eq(questionsTable.reviewStatus, "approved"),
      ),
    )
    .orderBy(desc(questionsTable.createdAt));
  const available = existing.find((question) => !usedQuestionIds.has(question.id));
  if (available) return available;

  const template = deterministicAdaptiveQuestion(skill, subject);
  const [created] = await db
    .insert(questionsTable)
    .values({
      subject,
      domain: "Adaptive practice",
      skill,
      questionType: "multiple_choice",
      difficulty: "hard",
      stimulus: template.stimulus,
      prompt: template.prompt,
      choices: template.choices,
      correctAnswer: template.correctAnswer,
      explanation: template.explanation,
      sourceType: "original",
      sourceId: null,
      reviewStatus: "approved",
      tags: [`adaptive:${skill.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`],
      generationMethod: "adaptive-deterministic",
      reviewedAt: new Date(),
    })
    .returning();
  return created;
}

async function ensureHardQuestionFallback(
  session: typeof sessionsTable.$inferSelect,
  courseId: string,
  studentUserId: string,
) {
  const usedQuestionIds = await usedQuestionIdsForStudent(courseId, studentUserId);
  const hardQuestions = await db
    .select({ id: questionsTable.id, subject: questionsTable.subject })
    .from(questionsTable)
    .where(
      and(
        inArray(questionsTable.reviewStatus, ["approved", "reviewed"]),
        eq(questionsTable.sourceType, "original"),
        eq(questionsTable.difficulty, "hard"),
      ),
    );
  const available = hardQuestions.find(
    (question) =>
      subjectFamily(question.subject) === subjectFamily(session.subject) &&
      !usedQuestionIds.has(question.id),
  );
  if (!available) {
    await createDeterministicAdaptiveQuestion(
      "Mixed SAT reasoning",
      session.subject,
      usedQuestionIds,
    );
  }
}

async function deriveAdaptiveRecommendations(attemptId: string): Promise<void> {
  const [record] = await db
    .select({ attempt: attemptsTable, assignment: assignmentsTable, session: sessionsTable })
    .from(attemptsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
    .innerJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!record?.attempt.result) return;
  const result = record.attempt.result as { items?: AdaptiveResultItem[] };
  const missed = (result.items ?? []).filter((item) => item.correct === false);
  if (missed.length === 0) {
    await ensureHardQuestionFallback(
      record.session,
      record.assignment.courseId,
      record.attempt.userId,
    );
    return;
  }

  const existing = await db
    .select({ sourceQuestionId: adaptiveRecommendationsTable.sourceQuestionId })
    .from(adaptiveRecommendationsTable)
    .where(
      and(
        eq(adaptiveRecommendationsTable.sessionId, record.session.id),
        eq(adaptiveRecommendationsTable.sourceAttemptId, attemptId),
      ),
    );
  const existingSourceIds = new Set(existing.map((item) => item.sourceQuestionId));
  const usedQuestionIds = await usedQuestionIdsForStudent(
    record.assignment.courseId,
    record.attempt.userId,
  );
  const approvedOriginals = await db
    .select()
    .from(questionsTable)
    .where(
      and(
        eq(questionsTable.reviewStatus, "approved"),
        eq(questionsTable.sourceType, "original"),
      ),
    );
  const subjectFamilyName = subjectFamily(record.session.subject);
  const candidates = approvedOriginals.filter(
    (question) =>
      subjectFamily(question.subject) === subjectFamilyName &&
      !usedQuestionIds.has(question.id),
  );
  const questionBySkill = new Map<string, typeof questionsTable.$inferSelect>();
  for (const item of missed) {
    if (existingSourceIds.has(item.questionId)) continue;
    let recommended = questionBySkill.get(item.skill);
    if (!recommended) {
      recommended =
        candidates.find((question) => question.skill === item.skill) ??
        (await createDeterministicAdaptiveQuestion(
          item.skill,
          record.session.subject,
          usedQuestionIds,
        ));
      questionBySkill.set(item.skill, recommended);
      usedQuestionIds.add(recommended.id);
    }
    await db
      .insert(adaptiveRecommendationsTable)
      .values({
        sessionId: record.session.id,
        sourceAttemptId: attemptId,
        sourceQuestionId: item.questionId,
        studentUserId: record.attempt.userId,
        skill: item.skill,
        reason: `Missed ${item.skill} on the latest assessment; practice an approved original variant before the session.`,
        recommendedQuestionId: recommended.id,
        status: "recommended",
        position: questionBySkill.size - 1,
      })
      .onConflictDoNothing();
  }
  await db.insert(auditLogsTable).values({
    actorUserId: record.attempt.userId,
    action: "adaptive_curriculum.recommendations_derived",
    entityType: "session",
    entityId: record.session.id,
    metadata: {
      sourceAttemptId: attemptId,
      missedQuestionCount: missed.length,
      skillCount: questionBySkill.size,
    },
  });
}

const requestRateLimit = new Map<string, number>();

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  productId?: string;
};

function parseInvoiceLineItems(
  value: unknown,
  fallback?: InvoiceLineItem,
): InvoiceLineItem[] {
  if (value === undefined) return fallback ? [fallback] : [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 25) {
    throw new Error("Invoice line items must contain between 1 and 25 items");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid invoice line item");
    const row = item as Record<string, unknown>;
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const quantity = Number(row.quantity);
    const unitPriceCents = Number(row.unitPriceCents);
    const productId = typeof row.productId === "string" ? row.productId.trim() : undefined;
    if (
      !description ||
      description.length > 500 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 100 ||
      !Number.isInteger(unitPriceCents) ||
      unitPriceCents < 0 ||
      unitPriceCents > 100_000_000
    ) {
      throw new Error("Each invoice line needs a description, quantity, and valid unit price");
    }
    return { description, quantity, unitPriceCents, ...(productId ? { productId } : {}) };
  });
}

function invoiceTotals(
  lineItems: InvoiceLineItem[],
  discountCents: number,
  taxCents: number,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lineItems.reduce(
    (total, item) => total + Math.round(item.quantity * item.unitPriceCents),
    0,
  );
  const discount = Math.min(subtotalCents, Math.max(0, Math.round(discountCents)));
  const tax = Math.max(0, Math.round(taxCents));
  return { subtotalCents, totalCents: Math.max(0, subtotalCents - discount + tax) };
}

function invoiceDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("dueAt must be a valid date");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("dueAt must be a valid date");
  return date;
}

async function ensurePublicPlatformData(): Promise<void> {
  await ensureUpgradeSeedData();
}


const tutorProfileSelect = {
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
} as const;

async function syncLinkedUserDisplayName(
  userId: string | null | undefined,
  name: string | undefined,
): Promise<void> {
  if (!userId || !name) return;
  await db
    .update(usersTable)
    .set({ displayName: name, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

/** Absolute http(s) URLs or same-origin relative media paths (no protocol-relative or traversal). */
function safePublicMediaUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("..")
  ) {
    return true;
  }
  return safePublicUrl(value);
}

function publicContentPublicationError(
  pageType: string,
  record: {
    title: unknown;
    seoTitle: unknown;
    seoDescription: unknown;
    body: unknown;
  },
): string | null {
  if (typeof record.title !== "string" || !record.title.trim() || record.title.length > 120) {
    return "A published page needs a title of 1–120 characters.";
  }
  if (typeof record.seoTitle !== "string" || !record.seoTitle.trim() || record.seoTitle.length > 70) {
    return "A published page needs an SEO title of 1–70 characters.";
  }
  if (
    typeof record.seoDescription !== "string" ||
    !record.seoDescription.trim() ||
    record.seoDescription.length > 180
  ) {
    return "A published page needs an SEO description of 1–180 characters.";
  }
  if (!record.body || typeof record.body !== "object" || Array.isArray(record.body)) {
    return "A published page needs a valid content body.";
  }

  const body = record.body as Record<string, unknown>;
  if (pageType === "success") {
    if ("intro" in body && (typeof body.intro !== "string" || body.intro.length > 4000)) {
      return "The success-page introduction must be 4,000 characters or fewer.";
    }
    const testimonial = body.testimonial;
    if (testimonial !== undefined && testimonial !== null) {
      if (typeof testimonial !== "object" || Array.isArray(testimonial)) {
        return "Testimonial content must be an object.";
      }
      const item = testimonial as Record<string, unknown>;
      if (item.quote !== undefined && (typeof item.quote !== "string" || item.quote.length > 3000)) {
        return "A testimonial quote must be 3,000 characters or fewer.";
      }
      if (
        item.attributionMode !== undefined &&
        item.attributionMode !== "named" &&
        item.attributionMode !== "anonymous"
      ) {
        return "Testimonial attribution must be named or anonymous.";
      }
      if (item.attributionMode === "named" && (typeof item.attribution !== "string" || !item.attribution.trim())) {
        return "A named testimonial needs an attribution.";
      }
    }
    const logos = body.schoolLogos;
    if (logos !== undefined) {
      if (!Array.isArray(logos) || logos.length > 30) return "School logos must be a list of 30 or fewer items.";
      for (const logo of logos) {
        const item = logo as Record<string, unknown>;
        const name = item?.name;
        const alt = item?.alt;
        if (
          !logo ||
          typeof logo !== "object" ||
          Array.isArray(logo) ||
          typeof name !== "string" ||
          !name.trim() ||
          !safePublicMediaUrl(item.src) ||
          typeof alt !== "string" ||
          !alt.trim()
        ) {
          return "Each school logo needs a name, safe http(s) or site-relative image URL, and alt text.";
        }
      }
    }
  }
  if (pageType === "settings") {
    const email = body.contactEmail;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "A published site-settings record needs a valid contact email.";
    }
  }
  const optionalCopyFields = [
    "heroEyebrow",
    "heroTitle",
    "heroLead",
    "satPathTitle",
    "satPathBlurb",
    "guidancePathTitle",
    "guidancePathBlurb",
    "satServiceTitle",
    "satServiceBlurb",
    "guidanceServiceTitle",
    "guidanceServiceBlurb",
    "offersIntro",
  ] as const;
  if (pageType === "home" || pageType === "sat-offerings") {
    for (const field of optionalCopyFields) {
      if (field in body && body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > 4000)) {
        return "Website copy fields must be 4,000 characters or fewer.";
      }
    }
    if ("sections" in body && body.sections !== undefined) {
      if (!Array.isArray(body.sections) || body.sections.length > 12) {
        return "SAT page sections must be a list of 12 or fewer items.";
      }
      if (body.sections.some((section) => typeof section !== "string" || section.length > 4000)) {
        return "Each SAT page section must be 4,000 characters or fewer.";
      }
    }
  }
  return null;
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
      await saveRefreshedGoogleAccessToken(
        connection.id,
        accessToken,
        refreshed.expiresIn,
      );
    }
    return { connection, accessToken };
  } catch {
    await markGoogleCalendarDisconnected(tutorProfileId, connection.id);
    return null;
  }
}

async function calendarAccessForUser(tutorUserId: string) {
  const [profile] = await db
    .select({
      id: tutorProfilesTable.id,
      calendarStatus: tutorProfilesTable.calendarStatus,
    })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, tutorUserId))
    .limit(1);
  if (!profile || normalizeGoogleCalendarStatus(profile.calendarStatus) !== "connected") {
    return null;
  }
  return calendarAccess(profile.id);
}

async function bookingTutor(tutorProfileId: string, allowExistingSessionTutor = false) {
  const [tutor] = await db
    .select()
    .from(tutorProfilesTable)
    .where(
      allowExistingSessionTutor
        ? eq(tutorProfilesTable.id, tutorProfileId)
        : and(
            eq(tutorProfilesTable.id, tutorProfileId),
            eq(tutorProfilesTable.active, true),
            eq(tutorProfilesTable.bookingEligible, true),
            inArray(tutorProfilesTable.name, [...SAT_BOOKING_TUTOR_NAMES]),
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
  excludeSessionId?: string,
  allowExistingSessionTutor = false,
) {
  if (to <= from || to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new BookingError(400, "INVALID_RANGE", "Availability requests must cover a positive range of 31 days or less.");
  }
  const { tutor, rule } = await bookingTutor(tutorProfileId, allowExistingSessionTutor);
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
    await markGoogleCalendarDisconnected(
      tutorProfileId,
      access.connection.id,
    );
    return { tutor, rule, access: null, slots: [] as string[] };
  }
  const [bookedSessions, sharedMeetWindows] = await Promise.all([
    db
      .select({
        id: sessionsTable.id,
        dateTime: sessionsTable.dateTime,
        durationMinutes: sessionsTable.durationMinutes,
      })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.tutorUserId, tutor.userId ?? ""),
          inArray(sessionsTable.bookingStatus, ["confirmed", "rescheduled"]),
          sql`${sessionsTable.status} <> 'archived'`,
          sql`${sessionsTable.dateTime} < ${to}`,
          sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${from}`,
          excludeSessionId ? sql`${sessionsTable.id} <> ${excludeSessionId}` : sql`true`,
        ),
      ),
    listSharedMeetBusyWindows({
      start: from,
      end: to,
      excludeSessionId,
    }),
  ]);
  const bookedWindows: BusyWindow[] = [
    ...bookedSessions.map((session) => ({
      start: session.dateTime.toISOString(),
      end: new Date(session.dateTime.getTime() + session.durationMinutes * 60_000).toISOString(),
    })),
    ...sharedMeetWindows,
  ];
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

async function bookingSessionShape(
  session: typeof sessionsTable.$inferSelect,
  extras: { creditRestored?: boolean | null } = {},
) {
  const [tutorProfile] = session.tutorUserId
    ? await db
        .select({ id: tutorProfilesTable.id, name: tutorProfilesTable.name })
        .from(tutorProfilesTable)
        .where(eq(tutorProfilesTable.userId, session.tutorUserId))
        .limit(1)
    : [];
  return {
    id: session.id,
    courseId: session.courseId,
    tutorProfileId: tutorProfile?.id ?? null,
    tutorName: tutorProfile?.name ?? null,
    dateTime: session.dateTime,
    timezone: session.timezone,
    subject: session.subject,
    title: session.title,
    durationMinutes: session.durationMinutes,
    bookingStatus: session.bookingStatus,
    meetingUrl: SHARED_FALL_MEETING_URL,
    calendarEventUrl: calendarEventUrlForSession(session),
    cancellationReason: session.cancellationReason,
    ...(extras.creditRestored !== undefined
      ? { creditRestored: extras.creditRestored }
      : {}),
  };
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
  if (error instanceof BookingError || error instanceof BookingServiceError) {
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
      const verificationStart = new Date();
      await listGoogleBusyWindows(
        tokens.accessToken,
        "primary",
        verificationStart,
        new Date(verificationStart.getTime() + 60_000),
      );
      await persistGoogleCalendarConnection(
        stateData.tutorProfileId,
        tokens,
      );
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
    .where(
      and(
        eq(satProductsTable.active, true),
        inArray(
          satProductsTable.slug,
          [...ACCEPTED_SAT_CATALOG_SLUGS],
        ),
      ),
    )
    .orderBy(asc(satProductsTable.durationHours));
  res.json(
    products
      .filter((product) => isAcceptedSatCatalogProduct(product))
      .map((product) => ({
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
  const [teamPage] = await db
    .select()
    .from(publicContentTable)
    .where(
      and(
        eq(publicContentTable.slug, "our-team"),
        eq(publicContentTable.status, "published"),
      ),
    )
    .limit(1);
  if (!teamPage || publicContentPublicationError(teamPage.pageType, teamPage)) {
    res.status(404).json({ error: "Published team content not found" });
    return;
  }
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
    })
    .from(tutorProfilesTable)
    .where(
      and(
        eq(tutorProfilesTable.active, true),
        eq(tutorProfilesTable.publicApproved, true),
      ),
    )
    .orderBy(asc(tutorProfilesTable.name));
  res.json(
    [...tutors]
      .sort((a, b) => {
        const aIndex = PUBLIC_TUTOR_ORDER.indexOf(a.name as (typeof PUBLIC_TUTOR_ORDER)[number]);
        const bIndex = PUBLIC_TUTOR_ORDER.indexOf(b.name as (typeof PUBLIC_TUTOR_ORDER)[number]);
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .map((tutor) => ({
        ...tutor,
        photoUrl: publicTeamPortrait(tutor.name, tutor.photoUrl),
      })),
  );
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
  const publicationError = publicContentPublicationError(content.pageType, content);
  if (publicationError) {
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
      .select(tutorProfileSelect)
      .from(tutorProfilesTable)
      .orderBy(asc(tutorProfilesTable.name));
    const ordered = [...tutors].sort((left, right) => {
      const leftIndex = PUBLIC_TUTOR_ORDER.indexOf(
        left.name as (typeof PUBLIC_TUTOR_ORDER)[number],
      );
      const rightIndex = PUBLIC_TUTOR_ORDER.indexOf(
        right.name as (typeof PUBLIC_TUTOR_ORDER)[number],
      );
      if (leftIndex === -1 && rightIndex === -1) return left.name.localeCompare(right.name);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    });
    res.json(ordered);
  },
);

router.post(
  "/admin/tutors",
  requireAppUser,
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = stringField(body, "email").toLowerCase();
    if (!email || !email.includes("@") || email.length > 320) {
      res.status(400).json({ error: "A valid email is required to create a profile." });
      return;
    }
    const parsed = parseTutorProfileEditableFields(body, { requireName: true });
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const publicApproved =
      typeof body.publicApproved === "boolean" ? body.publicApproved : false;
    const active = typeof body.active === "boolean" ? body.active : true;
    const bookingEligible =
      typeof body.bookingEligible === "boolean" ? body.bookingEligible : false;
    const title = parsed.updates.title ?? "Tutor";
    const proposed = {
      name: parsed.updates.name!,
      title,
      biography: parsed.updates.biography ?? null,
      photoUrl: parsed.updates.photoUrl ?? null,
      photoAltText: parsed.updates.photoAltText ?? null,
      linkedinUrl: parsed.updates.linkedinUrl ?? null,
      publicApproved,
    };
    const approvalError = tutorProfileApprovalError(proposed);
    if (approvalError) {
      res.status(400).json({ error: approvalError });
      return;
    }
    const [linkedUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    try {
      const [created] = await db
        .insert(tutorProfilesTable)
        .values({
          userId: linkedUser?.id ?? null,
          email,
          name: parsed.updates.name!,
          title,
          photoUrl: parsed.updates.photoUrl ?? null,
          photoAltText: parsed.updates.photoAltText ?? null,
          biography: parsed.updates.biography ?? null,
          subjects: parsed.updates.subjects ?? [],
          linkedinUrl: parsed.updates.linkedinUrl ?? null,
          publicApproved,
          active,
          bookingEligible,
        })
        .returning(tutorProfileSelect);
      if (!created) {
        res.status(500).json({ error: "Could not create tutor profile" });
        return;
      }
      await syncLinkedUserDisplayName(linkedUser?.id, created.name);
      await db.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "public.tutor_created",
        entityType: "tutor_profile",
        entityId: created.id,
        metadata: { email: created.email, publicApproved: created.publicApproved },
      });
      res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) {
        res.status(409).json({ error: "A tutor profile already exists for that email." });
        return;
      }
      throw error;
    }
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
    const parsed = parseTutorProfileEditableFields(body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updates: Record<string, unknown> = {
      ...parsed.updates,
      updatedAt: new Date(),
    };
    for (const field of ["publicApproved", "active", "bookingEligible"] as const) {
      if (field in body && typeof body[field] === "boolean") updates[field] = body[field];
    }
    const [existing] = await db
      .select({
        userId: tutorProfilesTable.userId,
        name: tutorProfilesTable.name,
        title: tutorProfilesTable.title,
        photoUrl: tutorProfilesTable.photoUrl,
        photoAltText: tutorProfilesTable.photoAltText,
        biography: tutorProfilesTable.biography,
        linkedinUrl: tutorProfilesTable.linkedinUrl,
        publicApproved: tutorProfilesTable.publicApproved,
      })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, tutorId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    const proposed = { ...existing, ...updates };
    const approvalError = tutorProfileApprovalError(proposed);
    if (approvalError) {
      res.status(400).json({ error: approvalError });
      return;
    }
    const [saved] = await db
      .update(tutorProfilesTable)
      .set(updates)
      .where(eq(tutorProfilesTable.id, tutorId))
      .returning(tutorProfileSelect);
    if (!saved) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    await syncLinkedUserDisplayName(existing.userId, saved.name);
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
  "/tutor/profile",
  requireAppUser,
  ensureRole(["tutor", "administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const profile = await resolveCalendarProfileForUser(req.appUser!, undefined, true);
    if (!profile) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    res.json({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      title: profile.title,
      photoUrl: profile.photoUrl,
      photoAltText: profile.photoAltText,
      biography: profile.biography,
      subjects: profile.subjects,
      linkedinUrl: profile.linkedinUrl,
      publicApproved: profile.publicApproved,
      active: profile.active,
      bookingEligible: profile.bookingEligible,
    });
  },
);

router.patch(
  "/tutor/profile",
  requireAppUser,
  ensureRole(["tutor", "administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const profile = await resolveCalendarProfileForUser(req.appUser!, undefined, true);
    if (!profile) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    if (profile.userId && profile.userId !== req.appUser!.id && req.appUser!.role !== "administrator") {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = parseTutorProfileEditableFields(body);
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    if (Object.keys(parsed.updates).length === 0) {
      res.status(400).json({ error: "Provide at least one profile field to update." });
      return;
    }
    if (
      parsed.updates.photoUrl &&
      !(parsed.updates.photoAltText ?? profile.photoAltText)?.trim()
    ) {
      res.status(400).json({
        error: "Add short alt text that describes the photo before saving it.",
      });
      return;
    }
    const proposed = {
      name: parsed.updates.name ?? profile.name,
      title: parsed.updates.title ?? profile.title,
      biography: parsed.updates.biography === undefined ? profile.biography : parsed.updates.biography,
      photoUrl: parsed.updates.photoUrl === undefined ? profile.photoUrl : parsed.updates.photoUrl,
      photoAltText:
        parsed.updates.photoAltText === undefined
          ? profile.photoAltText
          : parsed.updates.photoAltText,
      linkedinUrl:
        parsed.updates.linkedinUrl === undefined
          ? profile.linkedinUrl
          : parsed.updates.linkedinUrl,
      publicApproved: profile.publicApproved,
    };
    const approvalError = tutorProfileApprovalError(proposed);
    if (approvalError) {
      res.status(400).json({ error: approvalError });
      return;
    }
    const [saved] = await db
      .update(tutorProfilesTable)
      .set({
        ...parsed.updates,
        userId: profile.userId ?? req.appUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(tutorProfilesTable.id, profile.id))
      .returning(tutorProfileSelect);
    if (!saved) {
      res.status(404).json({ error: "Tutor profile not found" });
      return;
    }
    await syncLinkedUserDisplayName(profile.userId ?? req.appUser!.id, saved.name);
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "tutor.profile_updated",
      entityType: "tutor_profile",
      entityId: saved.id,
      metadata: {
        fields: Object.keys(parsed.updates),
      },
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
    const [existing] = await db
      .select()
      .from(publicContentTable)
      .where(eq(publicContentTable.slug, slug))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Public content not found" });
      return;
    }
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
    const proposed = {
      pageType: existing.pageType,
      title: updates.title ?? existing.title,
      seoTitle: updates.seoTitle ?? existing.seoTitle,
      seoDescription: updates.seoDescription ?? existing.seoDescription,
      body: updates.body ?? existing.body,
    };
    if (updates.status === "published" || (updates.status === undefined && existing.status === "published")) {
      const publicationError = publicContentPublicationError(existing.pageType, proposed);
      if (publicationError) {
        res.status(400).json({ error: publicationError });
        return;
      }
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
    await disconnectGoogleCalendarConnection(profile.id);
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
        inArray(tutorProfilesTable.name, [...SAT_BOOKING_TUTOR_NAMES]),
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
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";
    if (!tutorProfileId) throw new BookingError(400, "INVALID_TUTOR", "A tutor is required.");
    let existingSession: Awaited<ReturnType<typeof sessionForActor>> | undefined;
    if (sessionId) {
      existingSession = await sessionForActor(sessionId, req.appUser!);
      const [requestedTutor] = await db
        .select({ userId: tutorProfilesTable.userId })
        .from(tutorProfilesTable)
        .where(eq(tutorProfilesTable.id, tutorProfileId))
        .limit(1);
      if (!requestedTutor || requestedTutor.userId !== existingSession.tutorUserId) {
        throw new BookingError(400, "INVALID_TUTOR", "The requested tutor does not match this existing session.");
      }
      if (existingSession.durationMinutes !== durationMinutes) {
        throw new BookingError(400, "INVALID_DURATION", "The requested duration does not match this existing session.");
      }
    } else if (durationMinutes !== 60) {
      throw new BookingError(400, "INVALID_DURATION", "SAT sessions must be exactly 60 minutes.");
    }
    const result = await slotsForTutor(
      tutorProfileId,
      from,
      to,
      durationMinutes,
      existingSession?.id,
      Boolean(existingSession),
    );
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
      providerEventUrl: sessionsTable.providerEventUrl,
      cancellationReason: sessionsTable.cancellationReason,
    })
    .from(sessionsTable)
    .leftJoin(tutorProfilesTable, eq(tutorProfilesTable.userId, sessionsTable.tutorUserId))
    .where(eq(sessionsTable.clientUserId, subjectUserId))
    .orderBy(asc(sessionsTable.dateTime));
  res.json(
    sessions.map((session) => ({
      id: session.id,
      courseId: session.courseId,
      tutorProfileId: session.tutorProfileId,
      tutorName: session.tutorName,
      dateTime: session.dateTime,
      timezone: session.timezone,
      subject: session.subject,
      title: session.title,
      durationMinutes: session.durationMinutes,
      bookingStatus: session.bookingStatus,
      meetingUrl: SHARED_FALL_MEETING_URL,
      calendarEventUrl: calendarEventUrlForSession(session),
      cancellationReason: session.cancellationReason,
    })),
  );
});

router.post("/booking/sessions", async (req: AuthedRequest, res): Promise<void> => {
  try {
    requireStudentBooker(req.appUser!);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tutorProfileId = stringField(body, "tutorProfileId");
    const start = asDate(body.startTime);
    const durationMinutes = durationFromBody(body.durationMinutes);
    if (!tutorProfileId) throw new BookingError(400, "INVALID_TUTOR", "A tutor is required.");
    if (durationMinutes !== 60) {
      throw new BookingError(400, "INVALID_DURATION", "SAT sessions must be exactly 60 minutes.");
    }
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
      const participantIds = [tutor.userId, req.appUser!.id].filter(
        (id): id is string => Boolean(id),
      );
      await acquireBookingLocks(tx, participantIds, start.toISOString());
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      await assertNoScheduleConflict(tx, { participantIds, start, end });
      let liveBusyWindows: BusyWindow[];
      try {
        liveBusyWindows = await listGoogleBusyWindows(
          access.accessToken,
          access.connection.calendarId!,
          start,
          end,
        );
      } catch {
        throw new BookingError(
          503,
          "CALENDAR_UNAVAILABLE",
          "The tutor calendar could not be checked. Your credit was not used.",
        );
      }
      if (overlapsBusyWindow(start, end, liveBusyWindows, 0)) {
        throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available.");
      }
      await lockClientCreditsAndRequireHours(tx, req.appUser!.id, durationMinutes / 60);
      return insertConfirmedBookingWithDebit(tx, {
        courseId: course.id,
        clientUserId: req.appUser!.id,
        tutorUserId: tutor.userId,
        start,
        timezone: rule.timezone,
        subject: "SAT",
        title: sessionTitle(req.appUser!.displayName, "SAT", tutor.name),
        durationMinutes,
        tutorName: tutor.name,
      });
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
          SHARED_FALL_MEETING_URL,
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
      const confirmed = updated ?? created;
      await recordBookingConfirmedAudit(req.appUser!.id, confirmed);
      await notifyAdministratorsOfBooking({
        kind: "booking_confirmed",
        sessionId: confirmed.id,
        title: "SAT booking confirmed",
        message: `${req.appUser!.displayName} booked ${confirmed.title} at ${confirmed.dateTime.toISOString()}. Meet: ${SHARED_FALL_MEETING_URL}`,
      });
      res.status(201).json(await bookingSessionShape(confirmed));
    } catch {
      await db.transaction(async (tx) => {
        await rollbackBookingAfterCalendarFailure(tx, {
          sessionId: created.id,
          clientUserId: req.appUser!.id,
          durationMinutes,
          actorUserId: req.appUser!.id,
        });
      });
      throw new BookingError(
        503,
        "CALENDAR_UNAVAILABLE",
        "The tutor calendar could not be updated. Your credit was not used.",
      );
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
      res.json(await bookingSessionShape(session, { creditRestored: false }));
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
    const result = await db.transaction(async (tx) =>
      cancelBookingWithCreditPolicy(tx, {
        session,
        reason,
        actorUserId: req.appUser!.id,
      }),
    );
    await notifyAdministratorsOfBooking({
      kind: "booking_cancelled",
      sessionId: result.session.id,
      title: result.creditRestored ? "SAT booking cancelled — credit restored" : "SAT booking cancelled — credit retained",
      message: `${req.appUser!.displayName} cancelled ${result.session.title}. Credit restored: ${result.creditRestored ? "yes" : "no"}.`,
    });
    res.json(await bookingSessionShape(result.session, { creditRestored: result.creditRestored }));
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
      session.id,
      true,
    );
    if (!access) throw new BookingError(409, "CALENDAR_DISCONNECTED", "The tutor's calendar is disconnected.");
    if (!slots.includes(start.toISOString())) {
      throw new BookingError(409, "SLOT_UNAVAILABLE", "That time is no longer available. Choose another slot.");
    }
    const end = new Date(start.getTime() + session.durationMinutes * 60_000);
    const participantIds = [session.clientUserId, session.tutorUserId].filter(
      (id): id is string => Boolean(id),
    );
    await db.transaction(async (tx) => {
      await acquireBookingLocks(tx, participantIds, start.toISOString());
      await assertNoScheduleConflict(tx, {
        participantIds,
        start,
        end,
        excludeSessionId: session.id,
      });
    });
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
            SHARED_FALL_MEETING_URL,
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
          calendarEventPayload(
            session.title,
            previousStart,
            session.durationMinutes,
            session.timezone,
            "",
            SHARED_FALL_MEETING_URL,
          ),
        );
      }
      throw new BookingError(500, "RESCHEDULE_FAILED", "The session could not be rescheduled.");
    }
    res.json(await bookingSessionShape(updated ?? session));
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
        receiptUrl: paymentsTable.receiptUrl,
        verifiedAt: paymentsTable.verifiedAt,
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
        referenceType: creditLedgerTable.referenceType,
        referenceId: creditLedgerTable.referenceId,
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
  const creditSummary = creditHoursSummary(entries);
  return {
    ...creditSummary,
    remainingHours: creditSummary.remainingHours,
    invoices: invoiceRows.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      provider: invoice.provider,
      providerInvoiceId: invoice.providerInvoiceId,
      description: invoice.description,
      issuerName: invoice.issuerName,
      issuerEmail: invoice.issuerEmail,
      issuerAddress: invoice.issuerAddress,
      clientName: invoice.clientName || null,
      clientEmail: invoice.clientEmail || null,
      lineItems: invoice.lineItems,
      subtotalCents: invoice.subtotalCents,
      discountCents: invoice.discountCents,
      taxCents: invoice.taxCents,
      totalCents: invoice.totalCents,
      paymentInstructions: invoice.paymentInstructions,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      receiptUrl: invoice.receiptUrl,
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
      .where(
        and(
          eq(satProductsTable.id, productId),
          eq(satProductsTable.active, true),
        ),
      )
      .limit(1);
    if (!product || !isAcceptedSatCatalogProduct(product)) {
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
          clientName: req.appUser!.displayName,
          clientEmail: req.appUser!.email,
          lineItems: [{
            description: product.name,
            quantity: 1,
            unitPriceCents: product.totalPriceCents,
            productId: product.id,
          }],
          subtotalCents: product.totalPriceCents,
          totalCents: product.totalPriceCents,
          createdBy: req.appUser!.id,
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: req.appUser!.id,
          invoiceId: createdInvoice!.id,
          productId: product.id,
          amountCents: product.totalPriceCents,
          tutorShareCents: 0,
          platformShareCents: product.totalPriceCents,
          status: "pending",
          method: "stripe_checkout",
          auditMetadata: {
            offer: product.slug,
            owner: "accepted_admissions",
            customerEmail: req.appUser!.email,
            creditsGrantedOnPaidWebhook: product.durationHours,
          },
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
  "/admin/products",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    const products = await db
      .select()
      .from(satProductsTable)
      .orderBy(asc(satProductsTable.durationHours));
    res.json(products);
  },
);

router.post(
  "/admin/products",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug = stringField(body, "slug").toLowerCase();
    const name = stringField(body, "name");
    const description = stringField(body, "description");
    const durationHours = Number(body.durationHours);
    const totalPriceCents = Number(body.totalPriceCents);
    const active = body.active === undefined ? true : body.active === true;
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(slug) ||
      name.length < 2 ||
      name.length > 200 ||
      description.length > 1000 ||
      !Number.isFinite(durationHours) ||
      durationHours < 0.25 ||
      durationHours > 1000 ||
      !Number.isInteger(totalPriceCents) ||
      totalPriceCents < 1 ||
      totalPriceCents > 100_000_000
    ) {
      res.status(400).json({ error: "Enter a valid product slug, name, duration, and price" });
      return;
    }
    try {
      const [product] = await db
        .insert(satProductsTable)
        .values({
          slug,
          name,
          description,
          durationHours,
          totalPriceCents,
          effectiveHourlyRateCents: Math.round(totalPriceCents / durationHours),
          active,
        })
        .returning();
      await db.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "product.created",
        entityType: "sat_product",
        entityId: product!.id,
        metadata: { slug, durationHours, totalPriceCents },
      });
      res.status(201).json(product);
    } catch {
      res.status(409).json({ error: "A product with this slug already exists" });
    }
  },
);

router.patch(
  "/admin/products/:productId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const productId = typeof req.params.productId === "string" ? req.params.productId : "";
    const body = (req.body ?? {}) as Record<string, unknown>;
    const [existing] = await db
      .select()
      .from(satProductsTable)
      .where(eq(satProductsTable.id, productId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "SAT product not found" });
      return;
    }
    const slug = body.slug === undefined ? existing.slug : stringField(body, "slug").toLowerCase();
    const name = body.name === undefined ? existing.name : stringField(body, "name");
    const description =
      body.description === undefined ? existing.description : stringField(body, "description");
    const durationHours =
      body.durationHours === undefined ? existing.durationHours : Number(body.durationHours);
    const totalPriceCents =
      body.totalPriceCents === undefined ? existing.totalPriceCents : Number(body.totalPriceCents);
    const active = body.active === undefined ? existing.active : body.active === true;
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(slug) ||
      name.length < 2 ||
      name.length > 200 ||
      description.length > 1000 ||
      !Number.isFinite(durationHours) ||
      durationHours < 0.25 ||
      durationHours > 1000 ||
      !Number.isInteger(totalPriceCents) ||
      totalPriceCents < 1 ||
      totalPriceCents > 100_000_000
    ) {
      res.status(400).json({ error: "Enter a valid product slug, name, duration, and price" });
      return;
    }
    try {
      const catalogChanged =
        name !== existing.name ||
        description !== existing.description ||
        totalPriceCents !== existing.totalPriceCents;
      const [product] = await db
        .update(satProductsTable)
        .set({
          slug,
          name,
          description,
          durationHours,
          totalPriceCents,
          effectiveHourlyRateCents: Math.round(totalPriceCents / durationHours),
          active,
          ...(catalogChanged ? { stripeProductId: null, stripePriceId: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(satProductsTable.id, productId))
        .returning();
      await db.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: active ? "product.updated" : "product.deactivated",
        entityType: "sat_product",
        entityId: product!.id,
        metadata: { slug, durationHours, totalPriceCents, active },
      });
      res.json(product);
    } catch {
      res.status(409).json({ error: "A product with this slug already exists" });
    }
  },
);

router.get(
  "/admin/financials",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    const [clients, products, invoices, payments, credits, transfers] = await Promise.all([
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
          active: satProductsTable.active,
        })
        .from(satProductsTable)
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
          issuerName: invoicesTable.issuerName,
          issuerEmail: invoicesTable.issuerEmail,
          issuerAddress: invoicesTable.issuerAddress,
          clientEmail: invoicesTable.clientEmail,
          lineItems: invoicesTable.lineItems,
          subtotalCents: invoicesTable.subtotalCents,
          discountCents: invoicesTable.discountCents,
          taxCents: invoicesTable.taxCents,
          totalCents: invoicesTable.totalCents,
          paymentInstructions: invoicesTable.paymentInstructions,
          hostedInvoiceUrl: invoicesTable.hostedInvoiceUrl,
          receiptUrl: invoicesTable.receiptUrl,
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
          tutorShareCents: paymentsTable.tutorShareCents,
          platformShareCents: paymentsTable.platformShareCents,
          refundedAmountCents: paymentsTable.refundedAmountCents,
          status: paymentsTable.status,
          method: paymentsTable.method,
          failureReason: paymentsTable.failureReason,
          receiptUrl: paymentsTable.receiptUrl,
          verifiedAt: paymentsTable.verifiedAt,
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
          productId: creditLedgerTable.productId,
          referenceType: creditLedgerTable.referenceType,
          referenceId: creditLedgerTable.referenceId,
          createdAt: creditLedgerTable.createdAt,
        })
        .from(creditLedgerTable)
        .innerJoin(usersTable, eq(usersTable.id, creditLedgerTable.clientUserId))
        .orderBy(desc(creditLedgerTable.createdAt))
        .limit(100),
      db
        .select({
          id: stripeTransfersTable.id,
          paymentId: stripeTransfersTable.paymentId,
          clientName: usersTable.displayName,
          tutorName: tutorProfilesTable.name,
          amountCents: stripeTransfersTable.amountCents,
          reversedAmountCents: stripeTransfersTable.reversedAmountCents,
          status: stripeTransfersTable.status,
          failureReason: stripeTransfersTable.failureReason,
          createdAt: stripeTransfersTable.createdAt,
        })
        .from(stripeTransfersTable)
        .leftJoin(paymentsTable, eq(paymentsTable.id, stripeTransfersTable.paymentId))
        .leftJoin(usersTable, eq(usersTable.id, paymentsTable.clientUserId))
        .leftJoin(tutorProfilesTable, eq(tutorProfilesTable.id, stripeTransfersTable.tutorProfileId))
        .orderBy(desc(stripeTransfersTable.createdAt)),
    ]);
    res.json({ clients, products, invoices, payments, credits, transfers });
  },
);

router.post(
  "/admin/invoices",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientUserId = stringField(body, "clientUserId");
    const productId = stringField(body, "productId") || undefined;
    const provider = stringField(body, "provider") || "stripe_invoice";
    const rawDays = typeof body.daysUntilDue === "number" ? body.daysUntilDue : 7;
    const daysUntilDue = Math.max(1, Math.min(90, Math.round(rawDays)));
    const [[client], [product]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, clientUserId)).limit(1),
      db
        .select()
        .from(satProductsTable)
        .where(
          productId
            ? and(eq(satProductsTable.id, productId), eq(satProductsTable.active, true))
            : sql`false`,
        )
        .limit(1),
    ]);
    let lineItems: InvoiceLineItem[];
    try {
      lineItems = parseInvoiceLineItems(
        body.lineItems,
        product
          ? {
              description: product.name,
              quantity: 1,
              unitPriceCents: product.totalPriceCents,
              productId: product.id,
            }
          : undefined,
      );
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid line items" });
      return;
    }
    if (!client || client.role !== "student" || (provider === "stripe_invoice" && !product)) {
      res.status(404).json({
        error:
          provider === "stripe_invoice"
            ? "Client and an active SAT product are required for Stripe invoices"
            : "Client not found",
      });
      return;
    }
    if (!["stripe_invoice", "manual"].includes(provider) || lineItems.length === 0) {
      res.status(400).json({ error: "Choose a valid provider and add at least one line item" });
      return;
    }
    const discountCents = Number(body.discountCents ?? 0);
    const taxCents = Number(body.taxCents ?? 0);
    if (
      !Number.isFinite(discountCents) ||
      discountCents < 0 ||
      !Number.isFinite(taxCents) ||
      taxCents < 0
    ) {
      res.status(400).json({ error: "Discount and tax must be non-negative amounts" });
      return;
    }
    const totals = invoiceTotals(lineItems, discountCents, taxCents);
    if (totals.totalCents <= 0) {
      res.status(400).json({ error: "Invoice total must be greater than zero" });
      return;
    }
    if (
      provider === "stripe_invoice" &&
      (!product ||
        lineItems.length !== 1 ||
        lineItems[0]!.productId !== product.id ||
        lineItems[0]!.quantity !== 1 ||
        lineItems[0]!.unitPriceCents !== product.totalPriceCents ||
        discountCents !== 0 ||
        taxCents !== 0)
    ) {
      res.status(400).json({
        error:
          "Stripe hosted invoices must use one catalog product at its current price; use Manual / offline for custom line items, tax, or discounts",
      });
      return;
    }
    let dueAt: Date | null;
    try {
      dueAt =
        invoiceDate(body.dueAt) ??
        new Date(Date.now() + daysUntilDue * 24 * 60 * 60 * 1000);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid due date" });
      return;
    }
    const description = stringField(body, "description") || lineItems[0]!.description;
    const issuerName = stringField(body, "issuerName") || "Accepted Admissions";
    const issuerEmail = stringField(body, "issuerEmail");
    const issuerAddress = stringField(body, "issuerAddress");
    const clientName = stringField(body, "clientName") || client.displayName;
    const clientEmail = stringField(body, "clientEmail") || client.email;
    const paymentInstructions = stringField(body, "paymentInstructions");
    const creditProductId = product?.id ?? lineItems.find((item) => item.productId)?.productId;
    const creditProduct = creditProductId
      ? product?.id === creditProductId
        ? product
        : (
            await db
              .select()
              .from(satProductsTable)
              .where(eq(satProductsTable.id, creditProductId))
              .limit(1)
          )[0]
      : undefined;
    let stripeInvoiceAllocation:
      | { tutorShareCents: number; platformShareCents: number }
      | undefined;
    if (provider === "stripe_invoice") {
      if (!product || !isAcceptedSatCatalogProduct(product)) {
        res.status(400).json({
          error:
            "Stripe invoices are available only for Accepted Admissions SAT catalog products at their current prices.",
        });
        return;
      }
      stripeInvoiceAllocation = {
        tutorShareCents: 0,
        platformShareCents: product.totalPriceCents,
      };
    }
    const [invoice, payment] = await db.transaction(async (tx) => {
      const [createdInvoice] = await tx
        .insert(invoicesTable)
        .values({
          clientUserId: client.id,
          status: "pending",
          provider,
          description,
          issuerName,
          issuerEmail,
          issuerAddress,
          clientName,
          clientEmail,
          lineItems,
          subtotalCents: totals.subtotalCents,
          discountCents: Math.min(totals.subtotalCents, Math.round(discountCents)),
          taxCents: Math.round(taxCents),
          totalCents: totals.totalCents,
          paymentInstructions,
          dueAt,
          createdBy: req.appUser!.id,
          auditMetadata: { createdBy: req.appUser!.id, createdAt: new Date().toISOString() },
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: client.id,
          invoiceId: createdInvoice!.id,
          productId: creditProduct?.id,
          amountCents: totals.totalCents,
          ...stripeInvoiceAllocation,
          status: "pending",
          method: provider,
          auditMetadata: stripeInvoiceAllocation
            ? {
                offer: product!.slug,
                owner: "accepted_admissions",
                customerEmail: client.email,
                ...stripeInvoiceAllocation,
              }
            : undefined,
        })
        .returning();
      return [createdInvoice!, createdPayment!];
    });
    if (provider === "manual") {
      await db.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "invoice.manual_created",
        entityType: "invoice",
        entityId: invoice.id,
        metadata: { clientUserId: client.id, lineItemCount: lineItems.length },
      });
      res.status(201).json(invoice);
      return;
    }
    try {
      const hosted = await createHostedInvoice({
        user: client,
        product: product!,
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
          updatedAt: new Date(),
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
    const requestedProductId = stringField(body, "productId") || undefined;
    const requestedInvoiceId = stringField(body, "invoiceId") || undefined;
    const note = stringField(body, "note");
    const [[client], [requestedInvoice], [requestedProduct]] = await Promise.all([
      db.select().from(usersTable).where(eq(usersTable.id, clientUserId)).limit(1),
      requestedInvoiceId
        ? db.select().from(invoicesTable).where(eq(invoicesTable.id, requestedInvoiceId)).limit(1)
        : Promise.resolve([]),
      requestedProductId
        ? db.select().from(satProductsTable).where(eq(satProductsTable.id, requestedProductId)).limit(1)
        : Promise.resolve([]),
    ]);
    if (!client || client.role !== "student") {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    if (requestedInvoice && requestedInvoice.clientUserId !== client.id) {
      res.status(404).json({ error: "Invoice not found for this client" });
      return;
    }
    const invoiceProductId =
      requestedInvoice?.lineItems.find((item) => item.productId)?.productId;
    const [invoiceProduct] = invoiceProductId
      ? await db.select().from(satProductsTable).where(eq(satProductsTable.id, invoiceProductId)).limit(1)
      : [];
    const product = requestedProduct ?? invoiceProduct;
    if (
      requestedInvoice &&
      requestedProductId &&
      invoiceProductId &&
      requestedProductId !== invoiceProductId
    ) {
      res.status(400).json({ error: "Payment product does not match the invoice" });
      return;
    }
    if (!product) {
      res.status(404).json({ error: "SAT product or invoice line with a product is required" });
      return;
    }
    const amountCents = Number(body.amountCents ?? requestedInvoice?.totalCents ?? product.totalPriceCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      res.status(400).json({ error: "A positive verified payment amount is required" });
      return;
    }
    let payment: typeof paymentsTable.$inferSelect;
    try {
      payment = await db.transaction(async (tx) => {
      const now = new Date();
      let invoice = requestedInvoice;
      if (requestedInvoiceId) {
        await tx.execute(sql`select id from invoices where id = ${requestedInvoiceId} for update`);
        [invoice] = await tx
          .select()
          .from(invoicesTable)
          .where(eq(invoicesTable.id, requestedInvoiceId))
          .limit(1);
        if (!invoice || ["paid", "refunded", "partially_refunded"].includes(invoice.status)) {
          throw new Error("This invoice has already been reconciled");
        }
      } else {
        [invoice] = await tx
          .insert(invoicesTable)
          .values({
            clientUserId: client.id,
            status: "paid",
            provider: "offline",
            description: product.name,
            issuerName: "Accepted Admissions",
            clientName: client.displayName,
            clientEmail: client.email,
            lineItems: [{
              description: product.name,
              quantity: 1,
              unitPriceCents: amountCents,
              productId: product.id,
            }],
            subtotalCents: amountCents,
            totalCents: amountCents,
            paidAt: now,
            createdBy: req.appUser!.id,
          })
          .returning();
      }
      const [previousPayments] = await tx
        .select({
          total: sql<number>`coalesce(sum(${paymentsTable.amountCents}), 0)`,
        })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.invoiceId, invoice!.id),
            inArray(paymentsTable.status, ["paid", "partially_paid"]),
            isNotNull(paymentsTable.verifiedAt),
          ),
        );
      const cumulativeAmount = Number(previousPayments?.total ?? 0) + amountCents;
      const fullyPaid = cumulativeAmount >= invoice!.totalCents;
      const paymentStatus = fullyPaid ? "paid" : "partially_paid";
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: client.id,
          invoiceId: invoice!.id,
          productId: product.id,
          amountCents,
          status: paymentStatus,
          method: "offline",
          internalNote: note || "Offline payment recorded by administrator",
          paidAt: now,
          verifiedAt: now,
          auditMetadata: { verifiedBy: req.appUser!.id, verifiedAt: now.toISOString() },
        })
        .returning();
      if (fullyPaid) {
        await tx
          .insert(creditLedgerTable)
          .values({
            clientUserId: client.id,
            productId: product.id,
            entryType: "original",
            hours: product.durationHours,
            referenceType: "invoice",
            referenceId: invoice!.id,
            fulfillmentKey: `invoice:${invoice!.id}`,
            note: `${product.name} offline payment`,
            createdBy: req.appUser!.id,
          })
          .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey });
      }
      await tx
        .update(invoicesTable)
        .set({ status: paymentStatus, ...(fullyPaid ? { paidAt: now } : {}), updatedAt: now })
        .where(eq(invoicesTable.id, invoice!.id));
      await tx.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: "payment.offline_recorded",
        entityType: "payment",
        entityId: createdPayment!.id,
        metadata: {
          clientUserId: client.id,
          productId: product.id,
          invoiceId: invoice!.id,
          cumulativeAmount,
          fullyPaid,
        },
      });
      return createdPayment!;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "This invoice has already been reconciled") {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
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
    const note = stringField(body, "note").trim();
    if (!Number.isFinite(hours) || hours === 0 || Math.abs(hours) > 100 || note.length < 3) {
      res.status(400).json({
        error: "Enter a non-zero adjustment up to 100 hours and an auditable reason (at least 3 characters)",
      });
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
    const grantedAt = new Date();
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
        createdAt: grantedAt,
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: hours > 0 ? "credit.manual_grant" : "credit.adjusted",
      entityType: "credit_ledger",
      entityId: entry!.id,
      metadata: {
        clientUserId: client.id,
        hours,
        reason: note,
        administratorId: req.appUser!.id,
        administratorEmail: req.appUser!.email,
        grantedAt: grantedAt.toISOString(),
      },
    });
    res.status(201).json({
      ...entry,
      audit: {
        reason: note,
        administratorId: req.appUser!.id,
        administratorEmail: req.appUser!.email,
        grantedAt: grantedAt.toISOString(),
      },
    });
  },
);

router.patch(
  "/admin/invoices/:invoiceId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const invoiceId = typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = body.status === undefined ? undefined : stringField(body, "status");
    if (
      status !== undefined &&
      !["pending", "sent", "overdue", "partially_paid", "paid", "failed", "canceled"].includes(status)
    ) {
      res.status(400).json({ error: "Paid status requires a verified payment reconciliation" });
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
      invoice.provider === "stripe_invoice" &&
      invoice.providerInvoiceId &&
      Object.keys(body).some((key) => key !== "status")
    ) {
      res.status(409).json({
        error: "Sent Stripe invoices cannot be edited locally; cancel and create a new invoice",
      });
      return;
    }
    if (status === "paid") {
      const [verifiedPayment] = await db
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.invoiceId, invoiceId),
            eq(paymentsTable.status, "paid"),
            isNotNull(paymentsTable.verifiedAt),
          ),
        )
        .limit(1);
      if (!verifiedPayment) {
        res.status(409).json({ error: "Only a verified payment can mark an invoice paid" });
        return;
      }
    }
    if (["paid", "refunded", "partially_refunded"].includes(invoice.status) &&
        (status !== undefined || body.lineItems !== undefined || body.totalCents !== undefined)) {
      res.status(409).json({ error: "Settled invoices cannot be edited" });
      return;
    }
    let lineItems = invoice.lineItems;
    try {
      if (body.lineItems !== undefined) lineItems = parseInvoiceLineItems(body.lineItems);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid line items" });
      return;
    }
    const discountCents =
      body.discountCents === undefined ? invoice.discountCents : Number(body.discountCents);
    const taxCents = body.taxCents === undefined ? invoice.taxCents : Number(body.taxCents);
    if (
      !Number.isFinite(discountCents) ||
      discountCents < 0 ||
      !Number.isFinite(taxCents) ||
      taxCents < 0
    ) {
      res.status(400).json({ error: "Discount and tax must be non-negative amounts" });
      return;
    }
    const totals = invoiceTotals(lineItems, discountCents, taxCents);
    let dueAt: Date | null | undefined;
    try {
      dueAt = body.dueAt === undefined ? undefined : invoiceDate(body.dueAt);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid due date" });
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
    const [saved] = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(invoicesTable)
        .set({
          ...(status === undefined ? {} : { status }),
          ...(body.description === undefined ? {} : { description: stringField(body, "description") }),
          ...(body.issuerName === undefined ? {} : { issuerName: stringField(body, "issuerName") }),
          ...(body.issuerEmail === undefined ? {} : { issuerEmail: stringField(body, "issuerEmail") }),
          ...(body.issuerAddress === undefined ? {} : { issuerAddress: stringField(body, "issuerAddress") }),
          ...(body.clientName === undefined ? {} : { clientName: stringField(body, "clientName") }),
          ...(body.clientEmail === undefined ? {} : { clientEmail: stringField(body, "clientEmail") }),
          ...(body.lineItems === undefined ? {} : { lineItems }),
          ...(body.discountCents === undefined ? {} : { discountCents: Math.round(discountCents) }),
          ...(body.taxCents === undefined ? {} : { taxCents: Math.round(taxCents) }),
          ...(body.lineItems === undefined && body.discountCents === undefined && body.taxCents === undefined
            ? {}
            : { subtotalCents: totals.subtotalCents, totalCents: totals.totalCents }),
          ...(body.paymentInstructions === undefined
            ? {}
            : { paymentInstructions: stringField(body, "paymentInstructions") }),
          ...(dueAt === undefined ? {} : { dueAt }),
          updatedAt: new Date(),
        })
        .where(eq(invoicesTable.id, invoiceId))
        .returning();
      if (body.lineItems !== undefined || body.discountCents !== undefined || body.taxCents !== undefined) {
        await tx
          .update(paymentsTable)
          .set({ amountCents: totals.totalCents, updatedAt: new Date() })
          .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.status, "pending")));
      }
      return [result];
    });
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: status ? "invoice.updated" : "invoice.details_updated",
      entityType: "invoice",
      entityId: saved!.id,
      metadata: { status: status ?? "unchanged", fields: Object.keys(body) },
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
  const creditSummary = creditHoursSummary(entries);
  res.json({
    readOnly: req.appUser!.role === "viewer",
    ...creditSummary,
    remainingHours: creditSummary.remainingHours,
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
  async (req: AuthedRequest, res): Promise<void> => {
    await ensureSeedData();
    await ensureUpgradeSeedData();
    const [users, memberships, assignments, audit, loginActivity, guidanceRequests, notifications, platform, connectedCalendars] =
      await Promise.all([
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
      db
        .select({
          id: loginActivityTable.id,
          userId: usersTable.id,
          userName: usersTable.displayName,
          userEmail: usersTable.email,
          role: usersTable.role,
          signedInAt: loginActivityTable.signedInAt,
        })
        .from(loginActivityTable)
        .innerJoin(usersTable, eq(usersTable.id, loginActivityTable.userId))
        .orderBy(desc(loginActivityTable.signedInAt)),
       db
         .select({
           id: clientRequestsTable.id,
           guardianName: clientRequestsTable.guardianName,
           studentName: clientRequestsTable.studentName,
           email: clientRequestsTable.email,
           phone: clientRequestsTable.phone,
           gradeOrGraduationYear: clientRequestsTable.gradeOrGraduationYear,
           currentSchool: clientRequestsTable.currentSchool,
           serviceRequested: clientRequestsTable.serviceRequested,
           currentSatTotal: clientRequestsTable.currentSatTotal,
           currentReadingWriting: clientRequestsTable.currentReadingWriting,
           currentMath: clientRequestsTable.currentMath,
           targetSatScore: clientRequestsTable.targetSatScore,
           plannedTestDate: clientRequestsTable.plannedTestDate,
           goals: clientRequestsTable.goals,
           schedulingAvailability: clientRequestsTable.schedulingAvailability,
           referralSource: clientRequestsTable.referralSource,
           consentToContact: clientRequestsTable.consentToContact,
           privacyAcknowledged: clientRequestsTable.privacyAcknowledged,
           sourcePage: clientRequestsTable.sourcePage,
           status: clientRequestsTable.status,
           assignedStaffUserId: clientRequestsTable.assignedStaffUserId,
           followUpNotes: clientRequestsTable.followUpNotes,
           conversionStatus: clientRequestsTable.conversionStatus,
           createdAt: clientRequestsTable.createdAt,
         })
         .from(clientRequestsTable)
         .orderBy(desc(clientRequestsTable.createdAt)),
      db
        .select({
          id: adminNotificationsTable.id,
          kind: adminNotificationsTable.kind,
          guidanceRequestId: adminNotificationsTable.guidanceRequestId,
          sessionId: adminNotificationsTable.sessionId,
          title: adminNotificationsTable.title,
          message: adminNotificationsTable.message,
          status: adminNotificationsTable.status,
          readAt: adminNotificationsTable.readAt,
          dismissedAt: adminNotificationsTable.dismissedAt,
          createdAt: adminNotificationsTable.createdAt,
        })
        .from(adminNotificationsTable)
        .where(eq(adminNotificationsTable.recipientUserId, req.appUser!.id))
        .orderBy(desc(adminNotificationsTable.createdAt))
        .limit(20),
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
      db
        .select({ count: sql<number>`count(*)` })
        .from(calendarConnectionsTable)
        .where(
          and(
            eq(calendarConnectionsTable.provider, "google"),
            eq(calendarConnectionsTable.status, "connected"),
            isNotNull(calendarConnectionsTable.encryptedAccessToken),
          ),
        ),
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
      loginActivity,
       guidanceRequests,
      notifications,
      accessConflicts: configuredAccessConflicts(),
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
          calendar:
            Number(connectedCalendars[0]?.count ?? 0) > 0
              ? "connected"
              : "disconnected",
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

router.patch(
  "/admin/notifications/:notificationId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminNotificationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateAdminNotificationBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const now = new Date();
    const [notification] = await db
      .update(adminNotificationsTable)
      .set(
        body.data.status === "unread"
          ? { status: "unread", readAt: null, dismissedAt: null }
          : body.data.status === "read"
            ? { status: "read", readAt: now, dismissedAt: null }
            : { status: "dismissed", readAt: now, dismissedAt: now },
      )
      .where(
        and(
          eq(adminNotificationsTable.id, params.data.notificationId),
          eq(adminNotificationsTable.recipientUserId, req.appUser!.id),
        ),
      )
      .returning();

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json(UpdateAdminNotificationResponse.parse(notification));
  },
);

router.patch(
  "/admin/guidance-requests/:requestId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminGuidanceRequestParams.safeParse(req.params);
    const body = UpdateAdminGuidanceRequestBody.safeParse(req.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      adminMutationError(res, "Invalid guidance request update.");
      return;
    }
    if (
      !UUID_PATTERN.test(params.data.requestId) ||
      (body.data.assignedStaffUserId !== undefined &&
        body.data.assignedStaffUserId !== null &&
        !UUID_PATTERN.test(body.data.assignedStaffUserId))
    ) {
      adminMutationError(res, "Invalid guidance request update.");
      return;
    }

    const [existing] = await db
      .select()
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.id, params.data.requestId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Guidance request not found" });
      return;
    }

    const assignedStaffUserId =
      body.data.assignedStaffUserId === undefined
        ? existing.assignedStaffUserId
        : body.data.assignedStaffUserId;
    const assignmentChanged =
      body.data.assignedStaffUserId !== undefined &&
      body.data.assignedStaffUserId !== existing.assignedStaffUserId;
    if (assignedStaffUserId) {
      const [assignedStaff] = await db
        .select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, assignedStaffUserId))
        .limit(1);
      if (!assignedStaff || assignedStaff.role !== "administrator") {
        res.status(400).json({ error: "Assigned staff member must be an administrator." });
        return;
      }
    }

    const [updated] = await db
      .update(clientRequestsTable)
      .set({
        ...(body.data.status === undefined ? {} : { status: body.data.status }),
        ...(body.data.assignedStaffUserId === undefined
          ? {}
          : { assignedStaffUserId }),
        ...(body.data.followUpNotes === undefined
          ? {}
          : { followUpNotes: body.data.followUpNotes?.trim() || null }),
        ...(body.data.conversionStatus === undefined
          ? {}
          : { conversionStatus: body.data.conversionStatus }),
      })
      .where(eq(clientRequestsTable.id, existing.id))
      .returning();

    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "guidance_request.updated",
      entityType: "client_request",
      entityId: updated!.id,
      metadata: {
        fields: Object.keys(body.data),
        status: updated!.status,
        assignedStaffUserId: updated!.assignedStaffUserId,
        conversionStatus: updated!.conversionStatus,
      },
    });
    let notificationDelivery:
      | { status: "sent" | "failed"; error?: string }
      | undefined;
    if (assignmentChanged && updated!.assignedStaffUserId) {
      try {
        await db.insert(adminNotificationsTable).values({
          recipientUserId: updated!.assignedStaffUserId,
          kind: "guidance_request_assigned",
          guidanceRequestId: updated!.id,
          title: "Guidance request assigned to you",
          message: `${updated!.studentName} · ${updated!.serviceRequested} was assigned to you by ${req.appUser!.displayName}.`,
        });
        notificationDelivery = { status: "sent" };
      } catch (error) {
        req.log?.error(
          {
            err: error,
            guidanceRequestId: updated!.id,
            recipientUserId: updated!.assignedStaffUserId,
          },
          "Guidance request assignment notification could not be delivered",
        );
        notificationDelivery = {
          status: "failed",
          error: "Assignment notification could not be delivered.",
        };
      }
    }
    res.json(UpdateAdminGuidanceRequestResponse.parse({
      id: updated!.id,
      guardianName: updated!.guardianName,
      studentName: updated!.studentName,
      email: updated!.email,
      phone: updated!.phone,
      gradeOrGraduationYear: updated!.gradeOrGraduationYear,
      currentSchool: updated!.currentSchool,
      serviceRequested: updated!.serviceRequested,
      currentSatTotal: updated!.currentSatTotal,
      currentReadingWriting: updated!.currentReadingWriting,
      currentMath: updated!.currentMath,
      targetSatScore: updated!.targetSatScore,
      plannedTestDate: updated!.plannedTestDate,
      goals: updated!.goals,
      schedulingAvailability: updated!.schedulingAvailability,
      referralSource: updated!.referralSource,
      consentToContact: updated!.consentToContact,
      privacyAcknowledged: updated!.privacyAcknowledged,
      sourcePage: updated!.sourcePage,
      status: updated!.status,
      assignedStaffUserId: updated!.assignedStaffUserId,
      followUpNotes: updated!.followUpNotes,
      conversionStatus: updated!.conversionStatus,
      createdAt: updated!.createdAt,
      ...(notificationDelivery ? { notificationDelivery } : {}),
    }));
  },
);

async function adminProgramShape(course: typeof coursesTable.$inferSelect) {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${sessionsTable.status} = 'completed')`,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.courseId, course.id));
  return {
    id: course.id,
    title: course.title,
    subject: course.subject,
    term: course.term,
    status: course.status,
    goalSummary: course.goalSummary,
    meetUrl: meetingUrlForTerm(course.term, course.meetUrl),
    driveUrl: null,
    sessionCount: Number(counts?.total ?? 0),
    completedSessionCount: Number(counts?.completed ?? 0),
  };
}

async function adminSessionConflicts(
  payload: {
    tutorUserId?: string | null;
    clientUserId?: string | null;
    dateTime: Date;
    durationMinutes: number;
    courseId?: string | null;
    subject?: string | null;
  },
  excludeSessionId?: string,
  options: { checkProvider?: boolean; strictProvider?: boolean } = {},
) {
  const end = new Date(payload.dateTime.getTime() + payload.durationMinutes * 60_000);
  const rows = await db
    .select({
      id: sessionsTable.id,
      title: sessionsTable.title,
      dateTime: sessionsTable.dateTime,
      durationMinutes: sessionsTable.durationMinutes,
      tutorUserId: sessionsTable.tutorUserId,
      clientUserId: sessionsTable.clientUserId,
      subject: sessionsTable.subject,
      term: coursesTable.term,
      courseMeetUrl: coursesTable.meetUrl,
    })
    .from(sessionsTable)
    .innerJoin(coursesTable, eq(sessionsTable.courseId, coursesTable.id))
    .where(
      and(
        sql`${sessionsTable.status} <> 'archived'`,
        sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
        sql`${sessionsTable.dateTime} < ${end}`,
        sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${payload.dateTime}`,
        excludeSessionId ? sql`${sessionsTable.id} <> ${excludeSessionId}` : sql`true`,
      ),
    );
  const conflicts = rows
    .filter(
      (row) =>
        (payload.tutorUserId && row.tutorUserId === payload.tutorUserId) ||
        (payload.clientUserId && row.clientUserId === payload.clientUserId),
    )
     .map(
      (row) =>
        `${row.title} · ${row.dateTime.toISOString()} (${row.durationMinutes} min)`,
    );
  const [proposedCourse] = payload.courseId
    ? await db
        .select({ term: coursesTable.term, meetUrl: coursesTable.meetUrl })
        .from(coursesTable)
        .where(eq(coursesTable.id, payload.courseId))
        .limit(1)
    : [];
  const proposedClaimsShared = sessionClaimsSharedFallMeet({
    term: proposedCourse?.term,
    courseMeetUrl: proposedCourse?.meetUrl,
    subject: payload.subject,
  });
  if (proposedClaimsShared) {
    for (const row of rows) {
      if (!sessionClaimsSharedFallMeet(row)) continue;
      const label = `Shared Google Meet · ${row.title} · ${row.dateTime.toISOString()} (${row.durationMinutes} min)`;
      if (!conflicts.includes(label) && !conflicts.some((item) => item.startsWith(`${row.title} ·`))) {
        conflicts.push(label);
      }
    }
  }
  if (options.checkProvider === true && payload.tutorUserId) {
    const access = await calendarAccessForUser(payload.tutorUserId);
    if (!access) {
      if (options.strictProvider) {
        throw new BookingError(
          409,
          "CALENDAR_DISCONNECTED",
          "The tutor's Google Calendar is disconnected. Ask the tutor to reconnect before assigning this session.",
        );
      }
    } else {
      try {
        const busyWindows = await listGoogleBusyWindows(
          access.accessToken,
          access.connection.calendarId!,
          payload.dateTime,
          end,
        );
        if (overlapsBusyWindow(payload.dateTime, end, busyWindows, 0)) {
          conflicts.push(
            `Tutor's connected calendar is busy during ${payload.dateTime.toISOString()}–${end.toISOString()}.`,
          );
        }
      } catch {
        if (options.strictProvider) {
          throw new BookingError(
            503,
            "CALENDAR_UNAVAILABLE",
            "The tutor calendar could not be checked. No session was assigned.",
          );
        }
      }
    }
  }
  return conflicts;
}

async function adminSessionShape(
  session: typeof sessionsTable.$inferSelect,
  conflictWith: string[] = [],
) {
  const [[course], people] = await Promise.all([
    db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.id, session.courseId))
      .limit(1),
    db
      .select({ id: usersTable.id, name: usersTable.displayName })
      .from(usersTable)
      .where(
        inArray(
          usersTable.id,
          [session.clientUserId, session.tutorUserId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
  ]);
  const personById = new Map(people.map((person) => [person.id, person.name]));
  const canonicalTitle = sessionTitle(
    session.clientUserId ? personById.get(session.clientUserId) : null,
    session.subject,
    session.tutorUserId ? personById.get(session.tutorUserId) : null,
  );
  return {
    id: session.id,
    courseId: session.courseId,
    programTitle: course?.title ?? "Unknown program",
    dateTime: session.dateTime,
    timezone: session.timezone,
    subject: session.subject,
    title: canonicalTitle,
    status: session.status,
    durationMinutes: session.durationMinutes,
    bookingStatus: session.bookingStatus,
    meetingUrl: meetingUrlForTerm(course?.term, course?.meetUrl),
    calendarEventUrl: calendarEventUrlForSession(session),
    student: personById.has(session.clientUserId ?? "")
      ? { id: session.clientUserId!, name: personById.get(session.clientUserId!)! }
      : isTaitoFallSession(session)
        ? { name: TAITO_STUDENT_DISPLAY_NAME }
        : null,
    tutor: session.tutorUserId
      ? { id: session.tutorUserId, name: personById.get(session.tutorUserId) ?? "Unknown tutor" }
      : null,
    hasHomework: session.hasHomework,
    hasReport: session.hasReport,
    conflict: session.status !== "archived" && session.bookingStatus !== "cancelled" && conflictWith.length > 0,
    conflictWith: session.status !== "archived" && session.bookingStatus !== "cancelled" ? conflictWith : [],
  };
}

async function adminAssignmentShape(assignment: typeof assignmentsTable.$inferSelect) {
  const [[course], [session], [questionCount], [submissionCount]] = await Promise.all([
    db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, assignment.courseId)).limit(1),
    assignment.sessionId
      ? db.select({ title: sessionsTable.title }).from(sessionsTable).where(eq(sessionsTable.id, assignment.sessionId)).limit(1)
      : Promise.resolve([]),
    db.select({ count: sql<number>`count(*)` }).from(assignmentQuestionsTable).where(eq(assignmentQuestionsTable.assignmentId, assignment.id)),
    db.select({ count: sql<number>`count(*)` }).from(attemptsTable).where(and(eq(attemptsTable.assignmentId, assignment.id), inArray(attemptsTable.status, ["submitted", "expired"]))),
  ]);
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    sessionId: assignment.sessionId,
    programTitle: course?.title ?? "Unknown program",
    sessionTitle: session?.title ?? null,
    deliveryPhase: assignment.deliveryPhase,
    title: assignment.title,
    subject: assignment.subject,
    instructions: assignment.instructions,
    status: assignment.status,
    deadline: assignment.deadline,
    timeLimitMinutes: assignment.timeLimitMinutes,
    maxAttempts: assignment.maxAttempts,
    questionCount: Number(questionCount?.count ?? 0),
    submissionCount: Number(submissionCount?.count ?? 0),
  };
}

function adminMutationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

router.get(
  "/admin/access-grants",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    const grants = await db
      .select()
      .from(portalAccessGrantsTable)
      .orderBy(
        desc(portalAccessGrantsTable.active),
        desc(portalAccessGrantsTable.updatedAt),
      );
    res.json(
      ListAdminAccessGrantsResponse.parse({
        grants: grants.map(adminAccessGrantShape),
      }),
    );
  },
);

router.post(
  "/admin/access-grants",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateAdminAccessGrantBody.safeParse(req.body);
    if (!body.success) {
      adminMutationError(res, "Invalid provisioning details.");
      return;
    }
    if (!isProvisionableRoleCategory(body.data.roleCategory)) {
      res.status(400).json({
        error: "Only tutor and student roles can be provisioned here.",
      });
      return;
    }
    const email = normalizeProvisionedEmail(body.data.email);
    if (!email.includes("@")) {
      adminMutationError(res, "A valid email address is required.");
      return;
    }
    const clerkUserId =
      body.data.clerkUserId === undefined || body.data.clerkUserId === null
        ? null
        : body.data.clerkUserId.trim();
    if (clerkUserId && !looksLikeClerkUserId(clerkUserId)) {
      adminMutationError(res, "Clerk user ID looks invalid.");
      return;
    }

    const envCategories = envRoleCategoriesForIdentity(
      clerkUserId ?? undefined,
      email,
    );
    if (envCategories.includes("administrator") || envCategories.includes("viewer")) {
      res.status(409).json({
        error:
          "This identity is already configured as an administrator or viewer in environment allowlists.",
      });
      return;
    }
    const desiredAccess = accessFromRoleCategory(body.data.roleCategory);
    for (const category of envCategories) {
      const envAccess = accessFromRoleCategory(category);
      if (
        envAccess.role !== desiredAccess.role ||
        envAccess.subject !== desiredAccess.subject
      ) {
        res.status(409).json({
          error:
            "This identity already has a conflicting role in environment allowlists.",
        });
        return;
      }
    }

    let user: AppUser;
    try {
      user = await ensureProvisionedAppUser({
        email,
        displayName: body.data.displayName,
        roleCategory: body.data.roleCategory,
        clerkUserId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CLERK_USER_EMAIL_CONFLICT") {
        res.status(409).json({
          error:
            "That Clerk user ID is already linked to a different email address.",
        });
        return;
      }
      throw error;
    }

    const [existingGrant] = await db
      .select()
      .from(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.email, email))
      .limit(1);

    const grantValues = {
      email,
      clerkUserId,
      displayName: body.data.displayName.trim(),
      roleCategory: body.data.roleCategory,
      active: true,
      notes: body.data.notes?.trim() || null,
      provisionedByUserId: req.appUser!.id,
      userId: user.id,
      updatedAt: new Date(),
      revokedAt: null as Date | null,
    };

    const [grant] = existingGrant
      ? await db
          .update(portalAccessGrantsTable)
          .set(grantValues)
          .where(eq(portalAccessGrantsTable.id, existingGrant.id))
          .returning()
      : await db
          .insert(portalAccessGrantsTable)
          .values(grantValues)
          .returning();

    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: existingGrant ? "access.grant.updated" : "access.grant.created",
      entityType: "portal_access_grant",
      entityId: grant!.id,
      metadata: {
        email,
        roleCategory: body.data.roleCategory,
        role: desiredAccess.role,
        subject: desiredAccess.subject,
        userId: user.id,
      },
    });

    res
      .status(201)
      .json(CreateAdminAccessGrantResponse.parse(adminAccessGrantShape(grant!)));
  },
);

router.patch(
  "/admin/access-grants/:grantId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminAccessGrantParams.safeParse(req.params);
    const body = UpdateAdminAccessGrantBody.safeParse(req.body);
    if (!params.success || !body.success) {
      adminMutationError(res, "Invalid access grant update.");
      return;
    }
    const [existing] = await db
      .select()
      .from(portalAccessGrantsTable)
      .where(eq(portalAccessGrantsTable.id, params.data.grantId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Access grant not found" });
      return;
    }

    const nextRoleCategory = body.data.roleCategory ?? existing.roleCategory;
    if (!isProvisionableRoleCategory(nextRoleCategory)) {
      res.status(400).json({
        error: "Only tutor and student roles can be provisioned here.",
      });
      return;
    }
    const nextClerkUserId =
      body.data.clerkUserId === undefined
        ? existing.clerkUserId
        : body.data.clerkUserId === null
          ? null
          : body.data.clerkUserId.trim();
    if (nextClerkUserId && !looksLikeClerkUserId(nextClerkUserId)) {
      adminMutationError(res, "Clerk user ID looks invalid.");
      return;
    }
    const nextActive = body.data.active ?? existing.active;
    const nextDisplayName =
      body.data.displayName?.trim() || existing.displayName;
    const nextNotes =
      body.data.notes === undefined
        ? existing.notes
        : body.data.notes?.trim() || null;

    if (nextActive) {
      const envCategories = envRoleCategoriesForIdentity(
        nextClerkUserId ?? undefined,
        existing.email,
      );
      if (
        envCategories.includes("administrator") ||
        envCategories.includes("viewer")
      ) {
        res.status(409).json({
          error:
            "This identity is already configured as an administrator or viewer in environment allowlists.",
        });
        return;
      }
      const desiredAccess = accessFromRoleCategory(nextRoleCategory);
      for (const category of envCategories) {
        const envAccess = accessFromRoleCategory(category);
        if (
          envAccess.role !== desiredAccess.role ||
          envAccess.subject !== desiredAccess.subject
        ) {
          res.status(409).json({
            error:
              "This identity already has a conflicting role in environment allowlists.",
          });
          return;
        }
      }
    }

    let userId = existing.userId;
    if (nextActive) {
      try {
        const user = await ensureProvisionedAppUser({
          email: existing.email,
          displayName: nextDisplayName,
          roleCategory: nextRoleCategory,
          clerkUserId: nextClerkUserId,
        });
        userId = user.id;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "CLERK_USER_EMAIL_CONFLICT"
        ) {
          res.status(409).json({
            error:
              "That Clerk user ID is already linked to a different email address.",
          });
          return;
        }
        throw error;
      }
    }

    const [grant] = await db
      .update(portalAccessGrantsTable)
      .set({
        displayName: nextDisplayName,
        roleCategory: nextRoleCategory,
        clerkUserId: nextClerkUserId,
        notes: nextNotes,
        active: nextActive,
        userId,
        revokedAt: nextActive ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(portalAccessGrantsTable.id, existing.id))
      .returning();

    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: nextActive ? "access.grant.updated" : "access.grant.revoked",
      entityType: "portal_access_grant",
      entityId: grant!.id,
      metadata: {
        email: grant!.email,
        roleCategory: grant!.roleCategory,
        active: grant!.active,
      },
    });

    res.json(
      UpdateAdminAccessGrantResponse.parse(adminAccessGrantShape(grant!)),
    );
  },
);

router.get(
  "/admin/curriculum",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    await ensureSeedData();
    await ensureUpgradeSeedData();
    const query = GetAdminCurriculumQueryParams.safeParse(req.query);
    if (!query.success) {
      adminMutationError(res, query.error.message);
      return;
    }
    const courseFilter = query.data.courseId
      ? eq(coursesTable.id, query.data.courseId)
      : undefined;
    const [courses, allSessions, allAssignments, blocks, libraryAssets, questions, submissions, tutorProfiles, clients, relationshipRows] =
      await Promise.all([
        db.select().from(coursesTable).where(courseFilter ?? sql`true`).orderBy(asc(coursesTable.title)),
        db
          .select({ session: sessionsTable })
          .from(sessionsTable)
          .innerJoin(coursesTable, eq(coursesTable.id, sessionsTable.courseId))
          .where(courseFilter ?? sql`true`)
          .orderBy(asc(sessionsTable.dateTime)),
        db
          .select({ assignment: assignmentsTable })
          .from(assignmentsTable)
          .innerJoin(coursesTable, eq(coursesTable.id, assignmentsTable.courseId))
          .where(courseFilter ?? sql`true`)
          .orderBy(asc(assignmentsTable.deadline)),
        db
          .select({ block: curriculumBlocksTable })
          .from(curriculumBlocksTable)
          .innerJoin(sessionsTable, eq(sessionsTable.id, curriculumBlocksTable.sessionId))
          .where(courseFilter ? eq(sessionsTable.courseId, query.data.courseId!) : sql`true`)
          .orderBy(asc(curriculumBlocksTable.position)),
        db
          .select()
          .from(curriculumLibraryAssetsTable)
          .orderBy(desc(curriculumLibraryAssetsTable.updatedAt)),
        db.select().from(questionsTable).orderBy(desc(questionsTable.createdAt)),
        db
          .select({ attempt: attemptsTable, assignment: assignmentsTable, student: usersTable })
          .from(attemptsTable)
          .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
          .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
          .where(
            and(
              inArray(attemptsTable.status, ["submitted", "expired"]),
              isNotNull(attemptsTable.submittedAt),
              courseFilter ? eq(assignmentsTable.courseId, query.data.courseId!) : sql`true`,
            ),
          )
          .orderBy(desc(attemptsTable.submittedAt))
          .limit(100),
        db
          .select({
            id: usersTable.id,
            name: tutorProfilesTable.name,
            email: tutorProfilesTable.email,
            subjects: tutorProfilesTable.subjects,
            active: tutorProfilesTable.active,
            calendarStatus: tutorProfilesTable.calendarStatus,
          })
          .from(tutorProfilesTable)
          .innerJoin(usersTable, eq(usersTable.id, tutorProfilesTable.userId))
          .orderBy(asc(tutorProfilesTable.name)),
        db
          .select({ id: usersTable.id, name: usersTable.displayName, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, "student"))
          .orderBy(asc(usersTable.displayName)),
        db
          .select({
            courseId: tutorAssignmentsTable.courseId,
            courseTitle: coursesTable.title,
            tutorUserId: tutorAssignmentsTable.tutorUserId,
            studentUserId: tutorAssignmentsTable.studentUserId,
            subject: tutorAssignmentsTable.subject,
          })
          .from(tutorAssignmentsTable)
          .innerJoin(coursesTable, eq(coursesTable.id, tutorAssignmentsTable.courseId))
          .where(courseFilter ?? sql`true`)
          .orderBy(asc(coursesTable.title), asc(tutorAssignmentsTable.subject)),
      ]);
    const sessions = await Promise.all(
      allSessions.map(async ({ session }) => {
        const conflictWith = await adminSessionConflicts({
          tutorUserId: session.tutorUserId,
          clientUserId: session.clientUserId,
          dateTime: session.dateTime,
          durationMinutes: session.durationMinutes,
          courseId: session.courseId,
          subject: session.subject,
        }, session.id);
        return adminSessionShape(session, conflictWith);
      }),
    );
    const assignments = await Promise.all(allAssignments.map(({ assignment }) => adminAssignmentShape(assignment)));
    const assignedStudentsByTutor = new Map<
      string,
      Array<{ id: string; name: string; courseId: string; courseTitle: string; subject: string }>
    >();
    const assignedTutorsByClient = new Map<
      string,
      Array<{ id: string; name: string; courseId: string; courseTitle: string; subject: string }>
    >();
    for (const relationship of relationshipRows) {
      const tutor = tutorProfiles.find(
        (candidate) => candidate.id === relationship.tutorUserId,
      );
      const student = clients.find(
        (candidate) => candidate.id === relationship.studentUserId,
      );
      if (!tutor || !student) continue;
      const studentSummary = {
        id: student.id,
        name: student.name,
        courseId: relationship.courseId,
        courseTitle: relationship.courseTitle,
        subject: relationship.subject,
      };
      const tutorSummary = {
        id: tutor.id,
        name: tutor.name,
        courseId: relationship.courseId,
        courseTitle: relationship.courseTitle,
        subject: relationship.subject,
      };
      assignedStudentsByTutor.set(
        tutor.id,
        [...(assignedStudentsByTutor.get(tutor.id) ?? []), studentSummary],
      );
      assignedTutorsByClient.set(
        student.id,
        [...(assignedTutorsByClient.get(student.id) ?? []), tutorSummary],
      );
    }
    const tutors = await Promise.all(
      tutorProfiles.map(async (tutor) => {
        const [counts] = await db
          .select({
            total: sql<number>`count(*)`,
            upcoming: sql<number>`count(*) filter (where ${sessionsTable.dateTime} >= now() and ${sessionsTable.status} <> 'archived')`,
          })
          .from(sessionsTable)
          .where(eq(sessionsTable.tutorUserId, tutor.id));
        return {
          ...tutor,
          calendarStatus: normalizeGoogleCalendarStatus(tutor.calendarStatus),
          sessionCount: Number(counts?.total ?? 0),
          upcomingSessionCount: Number(counts?.upcoming ?? 0),
          assignedStudents: assignedStudentsByTutor.get(tutor.id) ?? [],
        };
      }),
    );
    const questionBySubject = new Map<string, { total: number; draft: number; approved: number; rejected: number }>();
    for (const question of questions) {
      const entry = questionBySubject.get(question.subject) ?? { total: 0, draft: 0, approved: 0, rejected: 0 };
      entry.total += 1;
      if (question.reviewStatus === "draft" || question.reviewStatus === "approved" || question.reviewStatus === "rejected") entry[question.reviewStatus] += 1;
      questionBySubject.set(question.subject, entry);
    }
    res.json(
      GetAdminCurriculumResponse.parse({
        programs: await Promise.all(courses.map(adminProgramShape)),
        sessions,
        assignments,
        blocks: blocks.map(({ block }) => block),
        libraryAssets: libraryAssets.map((asset) => ({
          id: asset.id,
          title: asset.title,
          kind: isLibraryAssetKind(asset.kind) ? asset.kind : "resource",
          description: asset.description,
          resourceUrl: asset.resourceUrl,
          body: asset.body,
          createdAt: asset.createdAt,
        })),
        questionStatus: [...questionBySubject.entries()].map(([subject, value]) => ({ subject, ...value })),
        submissions: submissions.map(({ attempt, assignment, student }) => ({
          attemptId: attempt.id,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          studentUserId: student.id,
          studentName: student.displayName,
          status: attempt.status,
          score: attempt.score ?? 0,
          submittedAt: attempt.submittedAt!,
          reviewStatus: attempt.reviewStatus,
          mistakeCount: Array.isArray((attempt.result as Record<string, unknown> | null)?.items)
            ? ((attempt.result as { items: Array<{ correct: boolean }> }).items.filter((item) => !item.correct).length)
            : 0,
        })),
        tutors,
         clients: clients.map((client) => ({
           ...client,
           assignedTutors: assignedTutorsByClient.get(client.id) ?? [],
         })),
      }),
    );
  },
);

router.post(
  "/admin/curriculum/library-assets",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateAdminLibraryAssetBody.safeParse(req.body);
    if (!body.success) {
      adminMutationError(res, body.error.message);
      return;
    }
    const [created] = await db
      .insert(curriculumLibraryAssetsTable)
      .values({
        title: body.data.title.trim(),
        kind: body.data.kind,
        description: body.data.description?.trim() || null,
        resourceUrl: body.data.resourceUrl?.trim() || null,
        body: body.data.body?.trim() || null,
        createdByUserId: req.appUser!.id,
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "curriculum_library_asset.created",
      entityType: "curriculum_library_asset",
      entityId: created!.id,
      metadata: { title: created!.title, kind: created!.kind },
    });
    res.status(201).json(CreateAdminLibraryAssetResponse.parse(libraryAssetResponse(created!)));
  },
);

router.patch(
  "/admin/curriculum/library-assets/:assetId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminLibraryAssetParams.safeParse(req.params);
    const body = UpdateAdminLibraryAssetBody.safeParse(req.body);
    if (!params.success || !body.success) {
      adminMutationError(res, "Invalid library asset update.");
      return;
    }
    const [existing] = await db
      .select()
      .from(curriculumLibraryAssetsTable)
      .where(eq(curriculumLibraryAssetsTable.id, params.data.assetId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Library asset not found" });
      return;
    }
    const [updated] = await db
      .update(curriculumLibraryAssetsTable)
      .set({
        ...(body.data.title === undefined ? {} : { title: body.data.title.trim() }),
        ...(body.data.kind === undefined ? {} : { kind: body.data.kind }),
        ...(body.data.description === undefined
          ? {}
          : { description: body.data.description?.trim() || null }),
        ...(body.data.resourceUrl === undefined
          ? {}
          : { resourceUrl: body.data.resourceUrl?.trim() || null }),
        ...(body.data.body === undefined ? {} : { body: body.data.body?.trim() || null }),
        updatedAt: new Date(),
      })
      .where(eq(curriculumLibraryAssetsTable.id, params.data.assetId))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "curriculum_library_asset.updated",
      entityType: "curriculum_library_asset",
      entityId: updated!.id,
      metadata: { title: updated!.title, kind: updated!.kind },
    });
    res.json(UpdateAdminLibraryAssetResponse.parse(libraryAssetResponse(updated!)));
  },
);

router.patch(
  "/admin/programs/:programId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminProgramParams.safeParse(req.params);
    const body = UpdateAdminProgramBody.safeParse(req.body);
    if (!params.success || !body.success) {
      adminMutationError(res, "Invalid program update.");
      return;
    }
    const [existing] = await db.select().from(coursesTable).where(eq(coursesTable.id, params.data.programId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    const nextTerm = body.data.term === undefined ? existing.term : body.data.term.trim();
    const updates = {
      ...(body.data.title === undefined ? {} : { title: body.data.title.trim() }),
      ...(body.data.subject === undefined ? {} : { subject: body.data.subject.trim() }),
      ...(body.data.term === undefined ? {} : { term: nextTerm }),
      ...(body.data.status === undefined ? {} : { status: body.data.status }),
      ...(body.data.goalSummary === undefined ? {} : { goalSummary: body.data.goalSummary?.trim() || null }),
      ...(isFall2026Term(nextTerm)
        ? { meetUrl: SHARED_FALL_MEETING_URL }
        : body.data.meetUrl === undefined
          ? {}
          : { meetUrl: body.data.meetUrl?.trim() || null }),
      ...(body.data.driveUrl === undefined ? {} : { driveUrl: body.data.driveUrl?.trim() || null }),
    };
    const [updated] = await db.update(coursesTable).set(updates).where(eq(coursesTable.id, existing.id)).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: updated!.status === "archived" ? "program.archived" : "program.updated",
      entityType: "course",
      entityId: updated!.id,
      metadata: { status: updated!.status },
    });
    res.json(UpdateAdminProgramResponse.parse(await adminProgramShape(updated!)));
  },
);

router.post(
  "/admin/assignments",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateAdminAssignmentBody.safeParse(req.body);
    if (!body.success) {
      adminMutationError(res, "Invalid assignment details.");
      return;
    }
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, body.data.courseId)).limit(1);
    if (!course) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    if (body.data.sessionId) {
      const [session] = await db.select({ id: sessionsTable.id, courseId: sessionsTable.courseId, subject: sessionsTable.subject }).from(sessionsTable).where(eq(sessionsTable.id, body.data.sessionId)).limit(1);
      if (!session || session.courseId !== body.data.courseId) {
        res.status(404).json({ error: "Session not found in this program" });
        return;
      }
      if (subjectFamily(session.subject) !== subjectFamily(body.data.subject)) {
        res.status(400).json({ error: "Assignment subject must match the linked session subject" });
        return;
      }
    }
    const [created] = await db.insert(assignmentsTable).values({
      courseId: body.data.courseId,
      sessionId: body.data.sessionId ?? null,
      deliveryPhase: body.data.deliveryPhase,
      title: body.data.title.trim(),
      subject: body.data.subject.trim(),
      instructions: body.data.instructions.trim(),
      status: body.data.status ?? "draft",
      deadline: body.data.deadline ?? null,
      timeLimitMinutes: body.data.timeLimitMinutes,
      maxAttempts: body.data.maxAttempts ?? 1,
    }).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "assignment.created",
      entityType: "assignment",
      entityId: created!.id,
      metadata: { courseId: created!.courseId, sessionId: created!.sessionId, status: created!.status },
    });
    res.status(201).json(CreateAdminAssignmentResponse.parse(await adminAssignmentShape(created!)));
  },
);

router.patch(
  "/admin/assignments/:assignmentId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminAssignmentParams.safeParse(req.params);
    const body = UpdateAdminAssignmentBody.safeParse(req.body);
    if (!params.success || !body.success) {
      adminMutationError(res, "Invalid assignment update.");
      return;
    }
    const [existing] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, params.data.assignmentId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const courseId = body.data.courseId ?? existing.courseId;
    const sessionId = body.data.sessionId === undefined ? existing.sessionId : body.data.sessionId;
    const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
    if (!course) {
      res.status(404).json({ error: "Program not found" });
      return;
    }
    if (sessionId) {
      const [session] = await db.select({ courseId: sessionsTable.courseId, subject: sessionsTable.subject }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
      if (!session || session.courseId !== courseId) {
        res.status(404).json({ error: "Session not found in this program" });
        return;
      }
      const assignmentSubject = body.data.subject ?? existing.subject;
      if (subjectFamily(session.subject) !== subjectFamily(assignmentSubject)) {
        res.status(400).json({ error: "Assignment subject must match the linked session subject" });
        return;
      }
    }
    const [updated] = await db.update(assignmentsTable).set({
      courseId,
      sessionId,
      ...(body.data.deliveryPhase === undefined ? {} : { deliveryPhase: body.data.deliveryPhase }),
      ...(body.data.title === undefined ? {} : { title: body.data.title.trim() }),
      ...(body.data.subject === undefined ? {} : { subject: body.data.subject.trim() }),
      ...(body.data.instructions === undefined ? {} : { instructions: body.data.instructions.trim() }),
      ...(body.data.status === undefined ? {} : { status: body.data.status }),
      ...(body.data.deadline === undefined ? {} : { deadline: body.data.deadline }),
      ...(body.data.timeLimitMinutes === undefined ? {} : { timeLimitMinutes: body.data.timeLimitMinutes }),
      ...(body.data.maxAttempts === undefined ? {} : { maxAttempts: body.data.maxAttempts }),
    }).where(eq(assignmentsTable.id, existing.id)).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: updated!.status === "archived" ? "assignment.archived" : "assignment.updated",
      entityType: "assignment",
      entityId: updated!.id,
      metadata: { courseId: updated!.courseId, sessionId: updated!.sessionId, status: updated!.status },
    });
    res.json(UpdateAdminAssignmentResponse.parse(await adminAssignmentShape(updated!)));
  },
);

async function validateAdminSessionPeople(clientUserId: string | null | undefined, tutorUserId: string | null | undefined) {
  const ids = [clientUserId, tutorUserId].filter((id): id is string => Boolean(id));
  if (ids.length === 0) return true;
  const people = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, ids));
  return people.length === ids.length && people.every((person) =>
    (clientUserId ? person.id !== clientUserId || person.role === "student" : true) &&
    (tutorUserId ? person.id !== tutorUserId || person.role === "tutor" : true),
  );
}

router.post(
  "/admin/sessions",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = CreateAdminSessionBody.safeParse(req.body);
    if (!body.success) {
      adminMutationError(res, "Invalid session details.");
      return;
    }
    const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, body.data.courseId)).limit(1);
    if (!course || !(await validateAdminSessionPeople(body.data.clientUserId, body.data.tutorUserId))) {
      res.status(404).json({ error: "Program or assigned person not found" });
      return;
    }
    let conflictWith: string[];
    try {
      conflictWith = await adminSessionConflicts({
        tutorUserId: body.data.tutorUserId,
        clientUserId: body.data.clientUserId,
        dateTime: body.data.dateTime,
        durationMinutes: body.data.durationMinutes,
        courseId: body.data.courseId,
        subject: body.data.subject,
      }, undefined, { checkProvider: true, strictProvider: true });
    } catch (error) {
      if (error instanceof BookingError) {
        sendBookingError(error, res);
        return;
      }
      throw error;
    }
    if (conflictWith.length > 0) {
      res.status(409).json({ code: "SCHEDULE_CONFLICT", error: "This session conflicts with existing scheduling data.", conflicts: conflictWith });
      return;
    }
    const title = await canonicalSessionTitleForPeople(
      body.data.clientUserId,
      body.data.subject,
      body.data.tutorUserId,
    );
    const [created] = await db.insert(sessionsTable).values({
      courseId: body.data.courseId,
      clientUserId: body.data.clientUserId ?? null,
      tutorUserId: body.data.tutorUserId ?? null,
      dateTime: body.data.dateTime,
      timezone: body.data.timezone.trim(),
      subject: body.data.subject.trim(),
      title,
      status: body.data.status ?? "draft",
      durationMinutes: body.data.durationMinutes,
      bookingStatus: body.data.bookingStatus ?? "confirmed",
    }).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "session.created",
      entityType: "session",
      entityId: created!.id,
      metadata: { courseId: created!.courseId, status: created!.status },
    });
    res.status(201).json(CreateAdminSessionResponse.parse(await adminSessionShape(created!)));
  },
);

router.patch(
  "/admin/sessions/:sessionId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdminSessionParams.safeParse(req.params);
    const body = UpdateAdminSessionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      adminMutationError(res, "Invalid session update.");
      return;
    }
    const [existing] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, params.data.sessionId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const nextPeople = {
      clientUserId: body.data.clientUserId === undefined ? existing.clientUserId : body.data.clientUserId,
      tutorUserId: body.data.tutorUserId === undefined ? existing.tutorUserId : body.data.tutorUserId,
    };
    const nextSubject = body.data.subject?.trim() ?? existing.subject;
    const next = {
      courseId: body.data.courseId ?? existing.courseId,
      ...nextPeople,
      dateTime: body.data.dateTime ?? existing.dateTime,
      timezone: body.data.timezone?.trim() ?? existing.timezone,
      subject: nextSubject,
      title: await canonicalSessionTitleForPeople(
        nextPeople.clientUserId,
        nextSubject,
        nextPeople.tutorUserId,
      ),
      status: body.data.status ?? existing.status,
      durationMinutes: body.data.durationMinutes ?? existing.durationMinutes,
      bookingStatus: body.data.bookingStatus ?? existing.bookingStatus,
    };
    const [course] = await db.select({ id: coursesTable.id, term: coursesTable.term }).from(coursesTable).where(eq(coursesTable.id, next.courseId)).limit(1);
    if (!course || !(await validateAdminSessionPeople(next.clientUserId, next.tutorUserId))) {
      res.status(404).json({ error: "Program or assigned person not found" });
      return;
    }
    let conflictWith: string[];
    try {
      const unchangedCalendarMeeting =
        Boolean(existing.providerEventId) &&
        existing.tutorUserId === next.tutorUserId &&
        existing.dateTime.getTime() === next.dateTime.getTime() &&
        existing.durationMinutes === next.durationMinutes;
      conflictWith = next.status === "archived" || next.bookingStatus === "cancelled"
        ? []
        : await adminSessionConflicts(next, existing.id, {
            checkProvider: !unchangedCalendarMeeting,
            strictProvider: true,
          });
    } catch (error) {
      if (error instanceof BookingError) {
        sendBookingError(error, res);
        return;
      }
      throw error;
    }
    if (conflictWith.length > 0) {
      res.status(409).json({ code: "SCHEDULE_CONFLICT", error: "This session conflicts with existing scheduling data.", conflicts: conflictWith });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(sessionsTable)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(sessionsTable.id, existing.id))
        .returning();
      if (!saved) {
        throw new Error("SESSION_UPDATE_FAILED");
      }
      await tx.insert(auditLogsTable).values({
        actorUserId: req.appUser!.id,
        action: saved.status === "archived" ? "session.archived" : "session.updated",
        entityType: "session",
        entityId: saved.id,
        metadata: { courseId: saved.courseId, status: saved.status },
      });
      return saved;
    });
    res.json(UpdateAdminSessionResponse.parse(await adminSessionShape(updated)));
  },
);

router.get("/me", async (req: AuthedRequest, res): Promise<void> => {
  const user = req.appUser!;
  let avatarUrl: string | null = null;
  if (user.role === "tutor" || user.role === "administrator") {
    const profile = await resolveCalendarProfileForUser(user);
    avatarUrl = profile?.photoUrl ?? null;
  }
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      avatarUrl,
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
        (await canAccessSession(req.appUser!, session))
          ? session
          : null,
      ),
    )
  ).filter((session): session is (typeof courseSessions)[number] => Boolean(session));
  res.json(
    GetCourseResponse.parse({
      ...base,
       meetUrl: meetingUrlForTerm(course?.term, course?.meetUrl ?? null),
      driveUrl: null,
      goalSummary: course?.goalSummary ?? null,
      sessions: await Promise.all(
        resolvedSessions.map(async (session) => {
          const tutor = await sessionTutorShape(session);
          const student = await sessionStudentShape(session);
          return {
            ...publicSessionShape(
              session,
              sessionTitle(student?.name, session.subject, tutor?.name),
            ),
            tutor,
            meetingUrl: meetingUrlForTerm(course.term, course.meetUrl ?? null),
            calendarEventUrl: calendarEventUrlForSession(session),
          };
        }),
      ),
    }),
  );
});

async function reviewSubmissionsForUser(user: AppUser) {
  const courseIds = await visibleCourseIds(user);
  const rows =
    courseIds.length === 0
      ? []
      : await db
          .select({
            attempt: attemptsTable,
            assignment: assignmentsTable,
            student: usersTable,
            session: sessionsTable,
          })
          .from(attemptsTable)
          .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
          .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
          .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
          .where(
            and(
              inArray(assignmentsTable.courseId, courseIds),
              inArray(attemptsTable.status, ["submitted", "expired"]),
              isNotNull(attemptsTable.result),
              isNotNull(attemptsTable.submittedAt),
            ),
          )
          .orderBy(desc(attemptsTable.submittedAt));
  const visibleRows = (
    await Promise.all(
      rows.map(async (row) =>
        (await canAccessStudent(
          user,
          row.assignment.courseId,
          row.student.id,
          row.assignment.subject,
        ))
          ? row
          : null,
      ),
    )
  ).filter((row): row is (typeof rows)[number] => Boolean(row));
  return visibleRows
    .filter((row) => Boolean(row.attempt.submittedAt))
    .map(({ attempt, assignment, student, session }) => ({
      attemptId: attempt.id,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      studentUserId: student.id,
      studentName: student.displayName,
      sessionId: session?.id ?? null,
      sessionDateTime: session?.dateTime ?? null,
      status: attempt.status,
      score: attempt.score ?? 0,
      submittedAt: attempt.submittedAt!,
      reviewStatus: attempt.reviewStatus,
      mistakeCount: Array.isArray(
        (attempt.result as Record<string, unknown> | null)?.items,
      )
        ? (
            attempt.result as {
              items: Array<{ correct: boolean }>;
            }
          ).items.filter((item) => !item.correct).length
        : 0,
      tutorNotes: attempt.tutorNotes,
      analysisPreview:
        typeof (attempt.analysis as { feedback?: unknown } | null)?.feedback ===
        "string"
          ? (attempt.analysis as { feedback: string }).feedback
          : typeof (attempt.result as { analysis?: { feedback?: unknown } } | null)
                ?.analysis?.feedback === "string"
            ? (attempt.result as { analysis: { feedback: string } }).analysis
                .feedback
            : null,
      nextFocus: Array.isArray(
        (attempt.analysis as { nextFocus?: unknown } | null)?.nextFocus,
      )
        ? ((attempt.analysis as { nextFocus: string[] }).nextFocus ?? [])
        : Array.isArray(
              (attempt.result as { analysis?: { nextFocus?: unknown } } | null)
                ?.analysis?.nextFocus,
            )
          ? ((attempt.result as { analysis: { nextFocus: string[] } }).analysis
              .nextFocus ?? [])
          : [],
    }));
}

async function dashboardDataForUser(user: AppUser) {
  await ensureSeedData();
  const ids = await visibleCourseIds(user);
  const subjectUserId = await dataSubjectUserId(user);
  const courses = (
    await Promise.all(ids.map((id) => courseShape(id, user)))
  ).filter(Boolean);
  const courseRows =
    ids.length === 0
      ? []
      : await db
           .select({ id: coursesTable.id, term: coursesTable.term, meetUrl: coursesTable.meetUrl })
          .from(coursesTable)
          .where(inArray(coursesTable.id, ids));
  const meetingUrls = new Map(
    courseRows.map((course) => [
      course.id,
      meetingUrlForTerm(course.term, course.meetUrl),
    ]),
  );
  const scopedSessions = await dashboardSessionsForUser(user);
  const attempts = await db
    .select({
      id: attemptsTable.id,
      assignmentId: attemptsTable.assignmentId,
      status: attemptsTable.status,
      score: attemptsTable.score,
      startedAt: attemptsTable.startedAt,
      submittedAt: attemptsTable.submittedAt,
      result: attemptsTable.result,
      analysis: attemptsTable.analysis,
    })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, subjectUserId))
    .orderBy(desc(attemptsTable.startedAt));
  const assignmentSummaries = await assignmentSummariesForUser(user);
  const assignmentById = new Map(assignmentSummaries.map((assignment) => [assignment.id, assignment]));
  const curriculumSessions = await Promise.all(
    scopedSessions.map(async (session) => {
      const preparation =
        assignmentSummaries.find(
          (assignment) =>
            assignment.sessionId === session.id &&
            assignment.deliveryPhase === "before_session" &&
            subjectFamily(assignment.subject) === subjectFamily(session.subject),
        ) ?? null;
      const latestAttempt = preparation
        ? attempts.find((attempt) => attempt.assignmentId === preparation.id)
        : undefined;
      const latestResult =
        latestAttempt &&
        (latestAttempt.status === "submitted" || latestAttempt.status === "expired")
          ? {
              status: latestAttempt.status,
              score: latestAttempt.score,
              attemptId: latestAttempt.id,
              analysis:
                latestAttempt.analysis ??
                (latestAttempt.result as { analysis?: Record<string, unknown> } | null)
                  ?.analysis ??
                null,
            }
          : null;
      const analysis = latestResult?.analysis as
        | { nextFocus?: unknown[]; weaknesses?: unknown[] }
        | null
        | undefined;
      const currentFocus =
        (analysis?.nextFocus ?? []).find(
          (item): item is string => typeof item === "string",
        ) ??
        (analysis?.weaknesses ?? []).find(
          (item): item is string => typeof item === "string",
        ) ??
        (session.subject.toUpperCase() === "IELTS"
          ? "Build confident English communication across the next skill."
          : "Strengthen evidence-based reasoning and precise conventions.");
      const attemptStatus = preparation?.latestAttemptStatus;
      const readiness =
        session.status === "completed"
          ? "complete"
          : attemptStatus === "active" || attemptStatus === "paused"
            ? "in_progress"
            : latestResult
              ? "ready"
              : preparation
                ? "not_started"
                : "ready";
      const nextAction = latestResult
        ? "Review feedback"
        : attemptStatus === "active" || attemptStatus === "paused"
          ? "Continue preparation"
          : preparation
            ? "Start preparation"
            : "Open session plan";
      return {
        ...dashboardSessionShape(
          session,
          await sessionTutorShape(session),
          meetingUrls.get(session.courseId) ?? null,
          user.role === "tutor" || user.role === "administrator"
            ? session.clientUserId
              ? await studentShape(session.clientUserId)
              : null
            : undefined,
        ),
        readiness,
        nextAction,
        preparation,
        latestResult,
        currentFocus,
      };
    }),
  );
  const completedSessions = scopedSessions.filter(
    (session) => session.status === "completed",
  ).length;
  const scoredAttempts = attempts.filter((attempt) => attempt.score !== null);
  const analysisValues = attempts
    .map((attempt) => attempt.analysis ?? (attempt.result as Record<string, unknown> | null)?.analysis)
    .filter((analysis): analysis is Record<string, unknown> => Boolean(analysis));
  const uniqueStrings = (values: unknown) =>
    [...new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [])];
  const strengths = uniqueStrings(analysisValues.flatMap((analysis) => analysis.strengths)).slice(0, 3);
  const weaknesses = uniqueStrings(analysisValues.flatMap((analysis) => analysis.weaknesses)).slice(0, 3);
  const tutorAssignments =
    user.role === "tutor"
      ? await db
          .select({
            id: usersTable.id,
            name: usersTable.displayName,
            courseId: coursesTable.id,
            courseTitle: coursesTable.title,
            subject: tutorAssignmentsTable.subject,
          })
          .from(tutorAssignmentsTable)
          .innerJoin(usersTable, eq(usersTable.id, tutorAssignmentsTable.studentUserId))
          .innerJoin(coursesTable, eq(coursesTable.id, tutorAssignmentsTable.courseId))
          .where(eq(tutorAssignmentsTable.tutorUserId, user.id))
      : [];
  const reviewSubmissions =
    user.role === "tutor" || user.role === "administrator"
      ? await reviewSubmissionsForUser(user)
      : [];
  const openReviewItems =
    user.role === "tutor" || user.role === "administrator"
      ? await db
          .select({
            id: reviewQueueTable.id,
            studentUserId: reviewQueueTable.studentUserId,
            courseId: assignmentsTable.courseId,
            subject: assignmentsTable.subject,
          })
          .from(reviewQueueTable)
          .innerJoin(attemptsTable, eq(attemptsTable.id, reviewQueueTable.attemptId))
          .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
          .where(
            and(
              eq(reviewQueueTable.status, "open"),
              inArray(assignmentsTable.courseId, ids),
            ),
          )
          .then((items) =>
            Promise.all(
              items.map(async (item) =>
                (await canAccessStudent(
                  user,
                  item.courseId,
                  item.studentUserId,
                  item.subject,
                ))
                  ? item
                  : null,
              ),
            ),
          )
          .then((items) => items.filter(Boolean))
      : [];
  const [billingUser] =
    user.id === subjectUserId
      ? [{ email: user.email }]
      : await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, subjectUserId))
          .limit(1);
  const creditEntries = await db
    .select({
      entryType: creditLedgerTable.entryType,
      hours: creditLedgerTable.hours,
    })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.clientUserId, subjectUserId));
  const remainingHours = creditEntries.reduce((total, entry) => {
    const positive = ["original", "restored", "adjustment_credit"].includes(entry.entryType);
    return total + (positive ? entry.hours : -entry.hours);
  }, 0);
  const creditSummary = creditHoursSummary(creditEntries);
  return GetDashboardResponse.parse({
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
        scopedSessions
          .filter((session) => session.dateTime.getTime() >= Date.now())
          .slice(0, 12)
          .map(async (session) => {
            const student = session.clientUserId
              ? await studentShape(session.clientUserId)
              : null;
            return dashboardSessionShape(
              session,
              await sessionTutorShape(session),
              meetingUrls.get(session.courseId) ?? null,
              user.role === "tutor" || user.role === "administrator"
                ? student
                : undefined,
              student?.name ?? null,
            );
          }),
      ),
      curriculumSessions,
      assignments: assignmentSummaries,
      recentScores: attempts
        .filter((attempt) => attempt.score !== null)
        .slice(0, 4)
        .map((attempt, index) => ({
          label: assignmentById.get(attempt.assignmentId)?.title ?? `Practice ${attempts.length - index}`,
          score: attempt.score!,
          date: attempt.submittedAt ?? attempt.startedAt,
        })),
      reviewSkills: weaknesses.length > 0 ? weaknesses : ["Keep building consistency"],
      credits: {
        purchasedHours: creditSummary.purchasedHours,
        usedHours: creditSummary.usedHours,
        remainingHours: creditSummary.remainingHours,
        readOnly: user.role === "viewer",
        selfServeSatBooking: selfServeSatBookingForEmail(
          billingUser?.email ?? user.email,
        ),
      },
      progress: {
        totalSessions: scopedSessions.length,
        completedSessions,
        averageScore:
          scoredAttempts.length > 0
            ? scoredAttempts.reduce((total, attempt) => total + attempt.score!, 0) /
              scoredAttempts.length
            : null,
        strengths,
        weaknesses,
      },
      assignedStudents: tutorAssignments,
      newSubmissions: reviewSubmissions.filter(
        (submission) => submission.reviewStatus !== "reviewed",
      ),
      openReviewCount: openReviewItems.length,
    });
}

router.get(
  "/admin/clients/:clientId/dashboard",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetAdminClientDashboardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!UUID_PATTERN.test(params.data.clientId)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }
    const client = await clientForAdminPreview(
      req.appUser!,
      params.data.clientId,
    );
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const dashboard = await dashboardDataForUser(client);
    const eligibleTutors = await db
      .select({
        id: tutorProfilesTable.id,
        name: tutorProfilesTable.name,
        title: tutorProfilesTable.title,
        photoUrl: tutorProfilesTable.photoUrl,
        biography: tutorProfilesTable.biography,
        subjects: tutorProfilesTable.subjects,
        active: tutorProfilesTable.active,
        bookingEligible: tutorProfilesTable.bookingEligible,
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
    const previewTutor = eligibleTutors[0];
    const [bookingSessions, financials] = await Promise.all([
      db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.clientUserId, client.id))
        .orderBy(asc(sessionsTable.dateTime)),
      financialSummary(client.id),
    ]);
    let previewBooking: {
      calendarStatus: "connected" | "disconnected" | "unavailable";
      availability: {
        tutor: {
          id: string;
          name: string;
          title: string;
          timezone: string;
        };
        providerStatus: "connected" | "disconnected";
        slots: string[];
      } | null;
      sessions: Awaited<ReturnType<typeof bookingSessionShape>>[];
    };
    if (!previewTutor) {
      previewBooking = {
        calendarStatus: "unavailable",
        availability: null,
        sessions: await Promise.all(bookingSessions.map((session) => bookingSessionShape(session))),
      };
    } else {
      const from = new Date();
      const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
      try {
        const availability = await slotsForTutor(
          previewTutor.id,
          from,
          to,
          60,
        );
        previewBooking = {
          calendarStatus: availability.access ? "connected" : "disconnected",
          availability: {
            tutor: {
              id: availability.tutor.id,
              name: availability.tutor.name,
              title: availability.tutor.title,
              timezone: availability.rule.timezone,
            },
            providerStatus: availability.access ? "connected" : "disconnected",
            slots: availability.slots,
          },
          sessions: await Promise.all(bookingSessions.map((session) => bookingSessionShape(session))),
        };
      } catch {
        previewBooking = {
          calendarStatus: "unavailable",
          availability: null,
          sessions: await Promise.all(bookingSessions.map((session) => bookingSessionShape(session))),
        };
      }
    }
    res.json(
      GetAdminClientDashboardResponse.parse({
        ...dashboard,
        adminPreview: true,
        previewOffer: {
          name: "Single SAT Session",
          description:
            "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
          priceCents: SINGLE_SAT_SESSION_PRICE_CENTS,
          durationMinutes: 60,
        },
        previewFinancials: {
          ...financials,
          readOnly: true,
          providerStatus: process.env.STRIPE_WEBHOOK_SECRET
            ? "connected"
            : "connected_webhook_setup_required",
        },
        previewBooking,
        credits: {
          ...dashboard.credits,
          readOnly: true,
        },
      }),
    );
  },
);

router.get("/dashboard", async (req: AuthedRequest, res): Promise<void> => {
  res.json(await dashboardDataForUser(req.appUser!));
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
  if (!session || !(await canAccessSession(req.appUser!, session))) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const subjectUserId = await dataSubjectUserId(req.appUser!);
  const [course] = await db
    .select({ term: coursesTable.term, meetUrl: coursesTable.meetUrl })
    .from(coursesTable)
    .where(eq(coursesTable.id, session.courseId))
    .limit(1);
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
  const homeworkUserId = session.clientUserId ?? subjectUserId;
  const homework = await Promise.all(
    assignments.map(async (assignment) => {
      const [attempt] = await db
        .select({
          id: attemptsTable.id,
          status: attemptsTable.status,
          score: attemptsTable.score,
          result: attemptsTable.result,
          analysis: attemptsTable.analysis,
        })
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, assignment.id),
            eq(attemptsTable.userId, homeworkUserId),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt))
        .limit(1);
      const result = attempt?.result as Record<string, unknown> | null | undefined;
      const resultItems = Array.isArray(result?.items)
        ? (result.items as Array<{ correct?: boolean }>)
        : [];
      const analysis = (attempt?.analysis ?? result?.analysis) as Record<string, unknown> | null | undefined;
      return {
        assignmentId: assignment.id,
        title: assignment.title,
        status: assignment.status,
        deadline: assignment.deadline,
        attemptId: attempt?.id ?? null,
        attemptStatus: attempt?.status ?? null,
        score: attempt?.score ?? null,
        mistakeCount: resultItems.filter((item) => item.correct === false).length,
        analysis: analysis ?? null,
      };
    }),
  );
  const [tutorNote] = await db
    .select({ content: sessionArtifactsTable.content })
    .from(sessionArtifactsTable)
    .where(
      and(
        eq(sessionArtifactsTable.sessionId, session.id),
        eq(sessionArtifactsTable.kind, "tutor_notes"),
      ),
    )
    .orderBy(desc(sessionArtifactsTable.updatedAt))
    .limit(1);
  res.json(
    GetSessionResponse.parse({
      ...publicSessionShape(session),
      tutor: await sessionTutorShape(session),
      meetingUrl: meetingUrlForTerm(course?.term, course?.meetUrl ?? null),
      calendarEventUrl: calendarEventUrlForSession(session),
      student:
        req.appUser!.role === "tutor" || req.appUser!.role === "administrator"
          ? await sessionStudentShape(session)
          : undefined,
      blocks:
        req.appUser!.role !== "administrator" && req.appUser!.role !== "tutor"
          ? blocks.filter(
              (block) =>
                block.status === "published" && block.visibility !== "tutor",
            )
          : blocks,
      assignments,
      studentNotes: null,
      tutorNotes:
        req.appUser!.role !== "administrator" && req.appUser!.role !== "tutor"
          ? null
          : tutorNote?.content ?? null,
      postSessionReportId: null,
      homework,
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
  const subjectUserId = await dataSubjectUserId(user);
  return Promise.all(
    scopedRows.map(async (assignment) => {
      if (
        (user.role === "student" || user.role === "viewer") &&
        (assignment.status === "draft" || assignment.status === "archived")
      ) {
        return null;
      }
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
              eq(attemptsTable.userId, subjectUserId),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt));
      return {
        id: assignment.id,
        sessionId: assignment.sessionId,
        deliveryPhase:
          assignment.deliveryPhase === "during_session"
            ? "during_session"
            : "before_session",
        title: assignment.title,
        subject: assignment.subject,
        status: assignment.status,
        deadline: assignment.deadline,
        questionCount: Number(count),
        timeLimitMinutes: assignment.timeLimitMinutes,
        attemptCount: attempts.length,
        maxAttempts: assignment.maxAttempts,
        latestScore: attempts[0]?.score ?? null,
        latestAttemptId: attempts[0]?.id ?? null,
        latestAttemptStatus: attempts[0]?.status ?? null,
      };
    }),
  ).then((items) =>
    items.filter((item): item is NonNullable<typeof item> => item !== null),
  );
}

async function ensureDuringSessionAssignment(
  session: typeof sessionsTable.$inferSelect,
): Promise<typeof assignmentsTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.sessionId, session.id),
        eq(assignmentsTable.deliveryPhase, "during_session"),
      ),
    )
    .orderBy(asc(assignmentsTable.createdAt))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(assignmentsTable)
    .values({
      courseId: session.courseId,
      sessionId: session.id,
      deliveryPhase: "during_session",
      title: `During session practice — ${session.title}`,
      subject: session.subject,
      instructions:
        "Work through this original practice sequence with your tutor during the session.",
      status: "draft",
      timeLimitMinutes: 30,
      maxAttempts: 1,
    })
    .returning();
  return created!;
}

async function adaptiveCurriculumForSession(
  session: typeof sessionsTable.$inferSelect,
  user: AppUser,
) {
  const summaries = await assignmentSummariesForUser(user, session.courseId, session.id);
  const homework =
    summaries.find((assignment) => assignment.deliveryPhase === "before_session") ??
    summaries[0] ??
    null;
  const subjectUserId = session.clientUserId ?? (await dataSubjectUserId(user));
  const [latestAttempt] = homework
    ? await db
        .select()
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, homework.id),
            eq(attemptsTable.userId, subjectUserId),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt))
        .limit(1)
    : [];
  const result = latestAttempt?.result as
    | { items?: AdaptiveResultItem[] }
    | null
    | undefined;
  const isStaff = user.role === "administrator" || user.role === "tutor";
  const completed = latestAttempt?.status === "submitted" || latestAttempt?.status === "expired";
  let sessionPrep: {
    mode: string;
    summary: string;
    duringAssignmentId: string | null;
    attachedQuestionCount: number;
  } | null = null;
  if (isStaff) {
    if (completed && latestAttempt) {
      await deriveAdaptiveRecommendations(latestAttempt.id);
    }
    const prep = await prepareSessionCurriculum(session);
    sessionPrep = {
      mode: prep.mode,
      summary: prep.summary,
      duringAssignmentId: prep.duringAssignmentId,
      attachedQuestionCount: prep.attachedQuestionCount,
    };
  }
  const mistakes =
    isStaff && completed
      ? (result?.items ?? [])
          .filter((item) => item.correct === false)
          .map((item) => ({
            questionId: item.questionId,
            skill: item.skill,
            prompt: item.prompt,
            finalAnswer: item.finalAnswer ?? null,
            correctAnswer: item.correctAnswer,
            reason: `The latest assessment response missed ${item.skill}.`,
          }))
      : [];
  const recommendationRows =
    isStaff && completed
      ? await db
          .select({
            recommendation: adaptiveRecommendationsTable,
            question: questionsTable,
          })
          .from(adaptiveRecommendationsTable)
          .leftJoin(
            questionsTable,
            eq(
              questionsTable.id,
              adaptiveRecommendationsTable.recommendedQuestionId,
            ),
          )
          .where(eq(adaptiveRecommendationsTable.sessionId, session.id))
          .orderBy(
            asc(adaptiveRecommendationsTable.position),
            asc(adaptiveRecommendationsTable.createdAt),
          )
      : [];
  const hardQuestions: ReturnType<typeof adaptiveQuestionShape>[] = [];
  if (isStaff && completed) {
    const usedQuestionIds = await usedQuestionIdsForStudent(
      session.courseId,
      subjectUserId,
    );
    const hardPool = await db
      .select()
      .from(questionsTable)
      .where(
        and(
          inArray(questionsTable.reviewStatus, ["approved", "reviewed"]),
          eq(questionsTable.sourceType, "original"),
          eq(questionsTable.difficulty, "hard"),
        ),
      );
    hardQuestions.push(
      ...hardPool
        .filter(
          (question) =>
            subjectFamily(question.subject) === subjectFamily(session.subject) &&
            !usedQuestionIds.has(question.id),
        )
        .slice(0, 8)
        .map((question, index) => adaptiveQuestionShape(question, index)),
    );
  }
  const blocks = await db
    .select()
    .from(curriculumBlocksTable)
    .where(
      and(
        eq(curriculumBlocksTable.sessionId, session.id),
        eq(curriculumBlocksTable.status, "published"),
      ),
    )
    .orderBy(asc(curriculumBlocksTable.position));
  const [notes] = await db
    .select({ content: sessionArtifactsTable.content })
    .from(sessionArtifactsTable)
    .where(
      and(
        eq(sessionArtifactsTable.sessionId, session.id),
        eq(sessionArtifactsTable.kind, "tutor_notes"),
      ),
    )
    .limit(1);
  return {
    sessionId: session.id,
    homework,
    mistakes,
    recommendations: recommendationRows.map(({ recommendation, question }) => ({
      id: recommendation.id,
      sourceAttemptId: recommendation.sourceAttemptId,
      sourceQuestionId: recommendation.sourceQuestionId,
      studentUserId: recommendation.studentUserId,
      skill: recommendation.skill,
      reason: recommendation.reason,
      status:
        recommendation.status === "accepted" || recommendation.status === "dismissed"
          ? recommendation.status
          : "recommended",
      position: recommendation.position,
      question:
        isStaff && question
          ? adaptiveQuestionShape(question, recommendation.position)
          : null,
    })),
    hardQuestions,
    tutorNotes: isStaff ? notes?.content ?? null : null,
    publishedBlocks: isStaff
      ? blocks
      : blocks.filter((block) => block.visibility !== "tutor"),
    sessionPrep,
  };
}

router.get(
  "/sessions/:sessionId/adaptive-curriculum",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetAdaptiveCurriculumParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId))
      .limit(1);
    if (!session || !(await canAccessSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(
      GetAdaptiveCurriculumResponse.parse(
        await adaptiveCurriculumForSession(session, req.appUser!),
      ),
    );
  },
);

router.post(
  "/sessions/:sessionId/adaptive-curriculum",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = RefreshAdaptiveCurriculumParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId))
      .limit(1);
    if (!session || !(await canAccessSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const homework = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.sessionId, session.id),
          eq(assignmentsTable.deliveryPhase, "before_session"),
        ),
      )
      .limit(1);
    if (homework[0]) {
      const [attempt] = await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.assignmentId, homework[0].id),
            eq(attemptsTable.userId, session.clientUserId ?? ""),
            inArray(attemptsTable.status, ["submitted", "expired"]),
          ),
        )
        .orderBy(desc(attemptsTable.startedAt))
        .limit(1);
      if (attempt) await deriveAdaptiveRecommendations(attempt.id);
    }
    await prepareSessionCurriculum(session);
    res
      .status(201)
      .json(
        RefreshAdaptiveCurriculumResponse.parse(
          await adaptiveCurriculumForSession(session, req.appUser!),
        ),
      );
  },
);

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
    assignments = assignments.filter(
      (item): item is NonNullable<typeof item> =>
        item !== null && item.status === query.data.status,
    );
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
      || ((req.appUser!.role === "student" || req.appUser!.role === "viewer") &&
        (assignment.status === "draft" || assignment.status === "archived"))
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
    const visibleQuestions =
      req.appUser!.role === "student" || req.appUser!.role === "viewer"
        ? joined.filter(
            ({ question }) =>
              question.reviewStatus === "reviewed" ||
              question.reviewStatus === "approved",
          )
        : joined;
    const [latestAttempt] = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.assignmentId, assignment.id),
          eq(attemptsTable.userId, await dataSubjectUserId(req.appUser!)),
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
    ).find(
      (item): item is NonNullable<typeof item> =>
        item !== null && item.id === assignment.id,
    )!;
    res.json(
      GetAssignmentResponse.parse({
        ...summary,
        instructions: assignment.instructions,
        questions: visibleQuestions.map(({ assignmentQuestion, question }) => ({
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
    if (req.appUser!.role !== "student") {
      res.status(403).json({ error: "Only students can start assignments" });
      return;
    }
    if (assignment.status !== "published") {
      res.status(409).json({ error: "This assignment is not available to start" });
      return;
    }
    const unreviewedQuestions = await db
      .select({ id: questionsTable.id, reviewStatus: questionsTable.reviewStatus })
      .from(assignmentQuestionsTable)
      .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, assignment.id),
          sql`${questionsTable.reviewStatus} NOT IN ('reviewed', 'approved')`,
        ),
      );
    if (unreviewedQuestions.length > 0) {
      res.status(409).json({ error: "This assignment contains unpublished questions" });
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
  if (attempt.status === "expired" && !attempt.result) {
    await finalizeAttemptResult(attempt.id, "expired");
  }
  res.json(GetAttemptResponse.parse(await attemptShape(attempt.id)));
});

router.get(
  "/attempts/:attemptId/result",
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetAttemptResultParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canAccessAttempt(req.appUser!, params.data.attemptId);
    if (!access) {
      res.status(404).json({ error: "Attempt result not found" });
      return;
    }
    if (access.attempt.status === "expired" && !access.attempt.result) {
      await finalizeAttemptResult(access.attempt.id, "expired");
    }
    const result = await storedAttemptResult(
      params.data.attemptId,
      req.appUser!.role === "tutor" || req.appUser!.role === "administrator",
    );
    if (!result) {
      res.status(404).json({ error: "Attempt result not found" });
      return;
    }
    res.json(GetAttemptResultResponse.parse(result));
  },
);

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
    if (!attempt || attempt.userId !== req.appUser!.id) {
      res.status(409).json({ error: "Attempt cannot be submitted" });
      return;
    }
    if (attempt.status === "submitted") {
      const stored = await storedAttemptResult(attempt.id);
      if (stored) {
        res.json(SubmitAttemptResponse.parse(stored));
      } else {
        res.status(409).json({ error: "Attempt result is unavailable" });
      }
      return;
    }
    const currentAttempt = await enforceTimeLimit(attempt.id);
    if (!currentAttempt) {
      res.status(409).json({ error: "Attempt cannot be submitted" });
      return;
    }
    const resultStatus = currentAttempt.status === "expired" ? "expired" : "submitted";
    const result = await finalizeAttemptResult(attempt.id, resultStatus);
    if (!result) {
      res.status(409).json({ error: "Attempt result could not be created" });
      return;
    }
    res.json(SubmitAttemptResponse.parse(result));
  },
);

router.get(
  "/review-submissions",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const courseIds = await visibleCourseIds(req.appUser!);
    const rows =
      courseIds.length === 0
        ? []
        : await db
            .select({
              attempt: attemptsTable,
              assignment: assignmentsTable,
              student: usersTable,
              session: sessionsTable,
            })
            .from(attemptsTable)
            .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
            .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
            .leftJoin(sessionsTable, eq(sessionsTable.id, assignmentsTable.sessionId))
            .where(
              and(
                inArray(assignmentsTable.courseId, courseIds),
                inArray(attemptsTable.status, ["submitted", "expired"]),
                isNotNull(attemptsTable.result),
                isNotNull(attemptsTable.submittedAt),
              ),
            )
            .orderBy(desc(attemptsTable.submittedAt));
    const visibleRows = (
      await Promise.all(
        rows.map(async (row) =>
          (await canAccessStudent(
            req.appUser!,
            row.assignment.courseId,
            row.student.id,
            row.assignment.subject,
          ))
            ? row
            : null,
        ),
      )
    ).filter((row): row is (typeof rows)[number] => Boolean(row));
    res.json(
      ListReviewSubmissionsResponse.parse(
        visibleRows
          .filter((row) => Boolean(row.attempt.submittedAt))
          .map(({ attempt, assignment, student, session }) => ({
            attemptId: attempt.id,
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            studentUserId: student.id,
            studentName: student.displayName,
            sessionId: session?.id ?? null,
            sessionDateTime: session?.dateTime ?? null,
            status: attempt.status,
            score: attempt.score ?? 0,
            submittedAt: attempt.submittedAt!,
            reviewStatus: attempt.reviewStatus,
            mistakeCount: Array.isArray(
              (attempt.result as Record<string, unknown> | null)?.items,
            )
              ? (
                  attempt.result as {
                    items: Array<{ correct: boolean }>;
                  }
                ).items.filter((item) => !item.correct).length
              : 0,
            tutorNotes: attempt.tutorNotes,
          })),
      ),
    );
  },
);

router.patch(
  "/attempts/:attemptId/review",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAttemptReviewParams.safeParse(req.params);
    const body = UpdateAttemptReviewBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid review update" });
      return;
    }
    const access = await canAccessAttempt(req.appUser!, params.data.attemptId);
    if (!access) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }
    const [attempt] = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.id, params.data.attemptId))
      .limit(1);
    if (!attempt?.result) {
      res.status(404).json({ error: "Attempt result not found" });
      return;
    }
    const [updated] = await db
      .update(attemptsTable)
      .set({
        reviewStatus: body.data.reviewStatus ?? attempt.reviewStatus,
        tutorNotes:
          body.data.tutorNotes !== undefined
            ? body.data.tutorNotes
            : attempt.tutorNotes,
      })
      .where(eq(attemptsTable.id, attempt.id))
      .returning();
    res.json(
      UpdateAttemptReviewResponse.parse(
        await storedAttemptResult(updated!.id, true),
      ),
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
    if (!session || !(await canAccessSession(req.appUser!, session))) {
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

router.post(
  "/sessions/:sessionId/library-assets",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = AttachSessionLibraryAssetParams.safeParse(req.params);
    const body = AttachSessionLibraryAssetBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid library attachment." });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId));
    if (!session || !(await canAccessSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [asset] = await db
      .select()
      .from(curriculumLibraryAssetsTable)
      .where(eq(curriculumLibraryAssetsTable.id, body.data.libraryAssetId))
      .limit(1);
    if (!asset) {
      res.status(404).json({ error: "Library asset not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(curriculumBlocksTable)
      .where(
        and(
          eq(curriculumBlocksTable.sessionId, session.id),
          eq(curriculumBlocksTable.libraryAssetId, asset.id),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(201).json(AttachSessionLibraryAssetResponse.parse(existing));
      return;
    }
    const [positionRow] = await db
      .select({
        position: sql<number>`coalesce(max(${curriculumBlocksTable.position}), -1)`,
      })
      .from(curriculumBlocksTable)
      .where(eq(curriculumBlocksTable.sessionId, session.id));
    const [created] = await db
      .insert(curriculumBlocksTable)
      .values({
        sessionId: session.id,
        libraryAssetId: asset.id,
        kind: libraryAssetBlockKind(asset),
        position: Number(positionRow?.position ?? -1) + 1,
        visibility: "both",
        status: "published",
        config: libraryAssetToBlockConfig(asset),
      })
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "curriculum_library_asset.attached",
      entityType: "curriculum_block",
      entityId: created!.id,
      metadata: {
        sessionId: session.id,
        libraryAssetId: asset.id,
        title: asset.title,
      },
    });
    res.status(201).json(AttachSessionLibraryAssetResponse.parse(created!));
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
        session: sessionsTable,
      })
      .from(curriculumBlocksTable)
      .innerJoin(
        sessionsTable,
        eq(sessionsTable.id, curriculumBlocksTable.sessionId),
      )
      .where(eq(curriculumBlocksTable.id, params.data.blockId));
    if (!visibleBlock || !(await canAccessSession(req.appUser!, visibleBlock.session))) {
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
    const [course] = await db
      .select({ subject: coursesTable.subject })
      .from(coursesTable)
      .where(eq(coursesTable.id, query.data.courseId))
      .limit(1);
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
    const originalQuestions = course
      ? await db
          .select()
          .from(questionsTable)
          .where(
            and(
              isNull(questionsTable.sourceId),
              eq(questionsTable.reviewStatus, query.data.reviewStatus ?? "approved"),
            ),
          )
          .then((items) =>
            items.filter(
              (question) =>
                subjectFamily(question.subject) === subjectFamily(course.subject),
            ),
          )
      : [];
    const questionIds = new Set(visibleRows.map((question) => question.id));
    res.json(
      ListQuestionBankResponse.parse(
        [...visibleRows, ...originalQuestions.filter((question) => !questionIds.has(question.id))]
          .map(questionBankShape),
      ),
    );
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
      .select({ question: questionsTable })
      .from(questionsTable)
      .where(eq(questionsTable.id, params.data.questionId));
    const [questionSource] = visibleQuestion?.question.sourceId
      ? await db
          .select({
            courseId: contentSourcesTable.courseId,
            subject: contentSourcesTable.subject,
          })
          .from(contentSourcesTable)
          .where(eq(contentSourcesTable.id, visibleQuestion.question.sourceId))
          .limit(1)
      : [];
    let accessibleQuestion = false;
    if (visibleQuestion && questionSource) {
      accessibleQuestion = await canAccessCourse(
        req.appUser!,
        questionSource.courseId,
        visibleQuestion.question.subject || questionSource.subject,
      );
    } else if (visibleQuestion) {
      const accessibleCourses = await visibleCourseIds(req.appUser!);
      accessibleQuestion = (
        await Promise.all(
          accessibleCourses.map((courseId) =>
            canAccessCourse(req.appUser!, courseId, visibleQuestion.question.subject),
          ),
        )
      ).some(Boolean);
    }
    if (
      !visibleQuestion ||
      !accessibleQuestion
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
      .select({ question: questionsTable })
      .from(questionsTable)
      .where(eq(questionsTable.id, body.data.questionId));
    const [sourceRecord] = questionRecord?.question.sourceId
      ? await db
          .select({ courseId: contentSourcesTable.courseId })
          .from(contentSourcesTable)
          .where(eq(contentSourcesTable.id, questionRecord.question.sourceId))
          .limit(1)
      : [];
    if (
      !assignment ||
      !questionRecord ||
      subjectFamily(assignment.subject) !==
        subjectFamily(questionRecord.question.subject) ||
      !(await canAccessCourse(
        req.appUser!,
        assignment.courseId,
        assignment.subject,
      )) ||
      (sourceRecord &&
        (sourceRecord.courseId !== assignment.courseId ||
          !(await canAccessCourse(
            req.appUser!,
            sourceRecord.courseId,
            questionRecord.question.subject,
          ))))
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
    if (assignment.deliveryPhase === "during_session") {
      await db
        .update(assignmentsTable)
        .set({ status: "published" })
        .where(eq(assignmentsTable.id, assignment.id));
    }
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

router.patch(
  "/assignments/:assignmentId/questions/:questionId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAssignmentQuestionParams.safeParse(req.params);
    const body = UpdateAssignmentQuestionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid assignment question update" });
      return;
    }
    const [record] = await db
      .select({ assignmentQuestion: assignmentQuestionsTable, assignment: assignmentsTable, question: questionsTable })
      .from(assignmentQuestionsTable)
      .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
      .innerJoin(questionsTable, eq(questionsTable.id, assignmentQuestionsTable.questionId))
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, params.data.assignmentId),
          eq(assignmentQuestionsTable.questionId, params.data.questionId),
        ),
      )
      .limit(1);
    if (
      !record ||
      !(await canAccessCourse(
        req.appUser!,
        record.assignment.courseId,
        record.assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment question not found" });
      return;
    }
    const [updated] = await db
      .update(assignmentQuestionsTable)
      .set(body.data)
      .where(eq(assignmentQuestionsTable.id, record.assignmentQuestion.id))
      .returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "assignment_question.updated",
      entityType: "assignment",
      entityId: record.assignment.id,
      metadata: { questionId: record.question.id, position: updated!.position },
    });
    res.json(
      UpdateAssignmentQuestionResponse.parse({
        id: record.question.id,
        position: updated!.position,
        subject: record.question.subject,
        questionType: record.question.questionType,
        prompt: record.question.prompt,
        stimulus: record.question.stimulus,
        choices: record.question.choices,
        skill: record.question.skill,
        difficulty: record.question.difficulty,
        predictionFirst: updated!.predictionFirst,
      }),
    );
  },
);

router.delete(
  "/assignments/:assignmentId/questions/:questionId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = RemoveQuestionFromAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [record] = await db
      .select({ assignmentQuestion: assignmentQuestionsTable, assignment: assignmentsTable })
      .from(assignmentQuestionsTable)
      .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignmentQuestionsTable.assignmentId))
      .where(
        and(
          eq(assignmentQuestionsTable.assignmentId, params.data.assignmentId),
          eq(assignmentQuestionsTable.questionId, params.data.questionId),
        ),
      )
      .limit(1);
    if (
      !record ||
      !(await canAccessCourse(
        req.appUser!,
        record.assignment.courseId,
        record.assignment.subject,
      ))
    ) {
      res.status(404).json({ error: "Assignment question not found" });
      return;
    }
    await db
      .delete(assignmentQuestionsTable)
      .where(eq(assignmentQuestionsTable.id, record.assignmentQuestion.id));
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: "assignment_question.removed",
      entityType: "assignment",
      entityId: record.assignment.id,
      metadata: { questionId: params.data.questionId },
    });
    res.status(204).send();
  },
);

router.patch(
  "/adaptive-recommendations/:recommendationId",
  ensureRole(["administrator", "tutor"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = UpdateAdaptiveRecommendationParams.safeParse(req.params);
    const body = UpdateAdaptiveRecommendationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid recommendation update" });
      return;
    }
    const [record] = await db
      .select({ recommendation: adaptiveRecommendationsTable, session: sessionsTable })
      .from(adaptiveRecommendationsTable)
      .innerJoin(sessionsTable, eq(sessionsTable.id, adaptiveRecommendationsTable.sessionId))
      .where(eq(adaptiveRecommendationsTable.id, params.data.recommendationId))
      .limit(1);
    if (
      !record ||
      !(await canAccessStudent(
        req.appUser!,
        record.session.courseId,
        record.session.clientUserId ?? "",
        record.session.subject,
      ))
    ) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    let assignmentId = body.data.assignmentId ?? null;
    if (body.data.status === "accepted") {
      const [question] = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.id, record.recommendation.recommendedQuestionId ?? ""));
      if (!question || (question.reviewStatus !== "approved" && question.reviewStatus !== "reviewed")) {
        res.status(400).json({ error: "Only approved practice can be accepted" });
        return;
      }
      const assignment = assignmentId
        ? (await db
            .select()
            .from(assignmentsTable)
            .where(eq(assignmentsTable.id, assignmentId))
            .limit(1))[0]
        : await ensureDuringSessionAssignment(record.session);
      if (
        !assignment ||
        assignment.sessionId !== record.session.id ||
        assignment.deliveryPhase !== "during_session" ||
        !(await canAccessCourse(
          req.appUser!,
          assignment.courseId,
          assignment.subject,
        ))
      ) {
        res.status(404).json({ error: "During-session assignment not found" });
        return;
      }
      assignmentId = assignment.id;
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assignmentQuestionsTable)
        .where(eq(assignmentQuestionsTable.assignmentId, assignment.id));
      await db
        .insert(assignmentQuestionsTable)
        .values({
          assignmentId: assignment.id,
          questionId: question.id,
          position: body.data.position ?? Number(count),
        })
        .onConflictDoNothing();
      await db
        .update(assignmentsTable)
        .set({ status: "published" })
        .where(eq(assignmentsTable.id, assignment.id));
    }
    const [updated] = await db
      .update(adaptiveRecommendationsTable)
      .set({
        status: body.data.status,
        position: body.data.position ?? record.recommendation.position,
        updatedAt: new Date(),
      })
      .where(eq(adaptiveRecommendationsTable.id, record.recommendation.id))
      .returning();
    const [question] = updated?.recommendedQuestionId
      ? await db
          .select()
          .from(questionsTable)
          .where(eq(questionsTable.id, updated.recommendedQuestionId))
          .limit(1)
      : [];
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: `adaptive_recommendation.${body.data.status}`,
      entityType: "session",
      entityId: record.session.id,
      metadata: { recommendationId: updated!.id, assignmentId },
    });
    res.json(
      UpdateAdaptiveRecommendationResponse.parse({
        id: updated!.id,
        sourceAttemptId: updated!.sourceAttemptId,
        sourceQuestionId: updated!.sourceQuestionId,
        studentUserId: updated!.studentUserId,
        skill: updated!.skill,
        reason: updated!.reason,
        status: updated!.status,
        position: updated!.position,
        question: question ? adaptiveQuestionShape(question, updated!.position) : null,
      }),
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
    if (!session || !(await canAccessSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const artifacts = await db
      .select()
      .from(sessionArtifactsTable)
      .where(eq(sessionArtifactsTable.sessionId, session.id))
      .orderBy(asc(sessionArtifactsTable.kind));
    const visible =
      req.appUser!.role !== "administrator" && req.appUser!.role !== "tutor"
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
    if (!session || !(await canAccessSession(req.appUser!, session))) {
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