import { clerkClient, getAuth } from "@clerk/express";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
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
  publicSessionShape,
  reconcileTaitoSessions,
  visibleSessionsForUser,
} from "../lib/session-privacy";
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
  CreateAdminAssignmentBody,
  CreateAdminAssignmentResponse,
  CreateAdminSessionBody,
  CreateAdminSessionResponse,
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
  configuredAccess,
  normalizeProvisionedEmail,
  type ConfiguredAccess,
  verifiedPrimaryEmail,
} from "../lib/access-config";
import {
  contentSourcesTable,
  assignmentQuestionsTable,
  assignmentsTable,
  adaptiveRecommendationsTable,
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

const SAT_DIAGNOSTIC_QUESTIONS = [
  {
    prompt: "Which choice most effectively combines the sentences while maintaining standard English conventions?",
    stimulus:
      "The community archive contains letters, maps, and photographs from the town's earliest residents. Together, these materials reveal how the waterfront changed over time.",
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "medium",
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
    prompt: "Which conclusion is best supported by the study?",
    stimulus:
      "In a greenhouse study, seedlings receiving six hours of filtered light grew taller than seedlings receiving six hours of direct light, while both groups received equal water and nutrients.",
    domain: "Information and Ideas",
    skill: "Command of Evidence",
    difficulty: "hard",
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
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The first prototype was inexpensive to produce. _____, it was too fragile for repeated classroom use.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
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
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "The museum's new exhibit features three artists _____ work explores migration and memory.",
    domain: "Standard English Conventions",
    skill: "Form, Structure, and Sense",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "who's" },
      { id: "b", label: "B", text: "whose" },
      { id: "c", label: "C", text: "whom's" },
      { id: "d", label: "D", text: "who" },
    ],
    correctAnswer: "b",
    explanation: "The possessive relative pronoun “whose” correctly describes the artists' work.",
  },
  {
    prompt: "Which choice most effectively states the main idea of the text?",
    stimulus:
      "Rather than replacing the old footbridge, residents repaired its supports and added a ramp. The project preserved a familiar landmark while making the crossing safer for more people.",
    domain: "Information and Ideas",
    skill: "Central Ideas and Details",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "A landmark was removed after years of neglect." },
      { id: "b", label: "B", text: "Residents balanced preservation with improved access." },
      { id: "c", label: "C", text: "The footbridge was moved to a new location." },
      { id: "d", label: "D", text: "Only visitors use the repaired footbridge." },
    ],
    correctAnswer: "b",
    explanation:
      "The text emphasizes both preserving the bridge and improving its safety and accessibility.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The first trial used recycled paper. _____, the research team tested a version made from agricultural waste.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "In contrast" },
      { id: "b", label: "B", text: "Next" },
      { id: "c", label: "C", text: "For instance" },
      { id: "d", label: "D", text: "Nevertheless" },
    ],
    correctAnswer: "b",
    explanation: "“Next” clearly signals the subsequent step in the team's testing process.",
  },
  {
    prompt: "Which choice best describes the function of the sentence in the text as a whole?",
    stimulus:
      "Many coastal plants tolerate salt in the soil. This adaptation allows them to survive where freshwater species cannot.",
    domain: "Information and Ideas",
    skill: "Text Structure and Purpose",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "It introduces a problem that the next sentence disproves." },
      { id: "b", label: "B", text: "It gives an example that clarifies a broader claim." },
      { id: "c", label: "C", text: "It presents a counterargument to the study." },
      { id: "d", label: "D", text: "It lists two unrelated observations." },
    ],
    correctAnswer: "b",
    explanation:
      "The second sentence explains why salt tolerance matters, clarifying the observation in the first sentence.",
  },
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "The solar panels, installed on the library's roof last spring, _____ enough electricity to power the reading room.",
    domain: "Standard English Conventions",
    skill: "Subject-Verb Agreement",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "generates" },
      { id: "b", label: "B", text: "generate" },
      { id: "c", label: "C", text: "is generating" },
      { id: "d", label: "D", text: "has generated" },
    ],
    correctAnswer: "b",
    explanation: "The plural subject “panels” takes the plural verb “generate.”",
  },
  {
    prompt: "Which choice most logically completes the text?",
    stimulus:
      "The city tested two designs for a protected bike lane. The design with a planted divider received more favorable safety ratings from riders.",
    domain: "Information and Ideas",
    skill: "Inferences",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "Riders preferred the design with a planted divider." },
      { id: "b", label: "B", text: "The city ended all bicycle programs." },
      { id: "c", label: "C", text: "Planting trees always reduces traffic." },
      { id: "d", label: "D", text: "Both designs received identical ratings." },
    ],
    correctAnswer: "a",
    explanation:
      "More favorable ratings indicate that riders preferred the protected-lane design with a planted divider.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The recipe requires only four ingredients. _____, the finished dish has a complex flavor.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "As a result" },
      { id: "b", label: "B", text: "In addition" },
      { id: "c", label: "C", text: "Even so" },
      { id: "d", label: "D", text: "For example" },
    ],
    correctAnswer: "c",
    explanation:
      "“Even so” signals the contrast between the recipe's simplicity and the dish's complex flavor.",
  },
] as const;

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
    if (!assignment && title.startsWith("SAT Diagnostic")) {
      [assignment] = await db
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.courseId, courseId),
            eq(assignmentsTable.title, "Baseline Reading & Writing Mini-Section"),
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
            subject: "SAT Reading & Writing",
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
            reviewStatus: "reviewed",
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
      "SAT Diagnostic — Reading & Writing",
      "Complete this original, full timed SAT Reading & Writing diagnostic independently before the October 2 session. Use the result to identify your strongest skills and the next skills to practice.",
      35,
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
        null,
        2,
        homework.questions,
      );
    }
  }
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

  await ensureSatAssessmentSeed(course.id);
  return course.id;
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
        slug: "sat-5-hour-package",
        name: "SAT 5-hour package",
        description: "Five hours of focused SAT tutoring with a shared balance.",
        durationHours: 5,
        totalPriceCents: 80000,
        effectiveHourlyRateCents: 16000,
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

async function studentShape(studentUserId: string) {
  const [student] = await db
    .select({ id: usersTable.id, name: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, studentUserId))
    .limit(1);
  return student ?? null;
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
  const sessionsForUser = user
    ? await visibleSessionsForUser(user, course.id)
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
    })
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt?.result) return null;
  return {
    ...(attempt.result as Record<string, unknown>),
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
  items: AttemptResultPayload["items"],
  score: number,
): AttemptAnalysisPayload {
  const strengths = breakdown
    .filter((skill) => skill.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% accuracy)`);
  const weaknesses = breakdown
    .filter((skill) => skill.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((skill) => `${skill.skill} (${Math.round(skill.accuracy)}% accuracy)`);
  const mistakesBySkill = new Map<string, number>();
  for (const item of items) {
    if (!item.correct) {
      mistakesBySkill.set(item.skill, (mistakesBySkill.get(item.skill) ?? 0) + 1);
    }
  }
  const mistakePatterns = [...mistakesBySkill.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([skill, count]) =>
      `${skill}: ${count} ${count === 1 ? "miss" : "misses"}${items.some((item) => !item.correct && item.skill === skill && !item.finalAnswer) ? " or unanswered item" : ""}`,
    );
  const nextFocus = (weaknesses.length > 0
    ? weaknesses
    : strengths.slice().reverse()
  )
    .slice(0, 3)
    .map((skill) => skill.replace(/ \(\d+% accuracy\)$/, ""));
  if (nextFocus.length === 0) nextFocus.push("Keep practicing mixed SAT Reading & Writing sets.");
  const feedback =
    score >= 80
      ? "You are building a strong foundation. Keep your accuracy steady while practicing under the time limit."
      : score >= 60
        ? "You have a useful foundation. Review the focus areas below, then retry a short mixed set under time."
        : "Start with the focus areas below and explain each missed answer before moving to another timed set.";
  return {
    source: "deterministic",
    label: "Deterministic skill analysis",
    provider: null,
    strengths: strengths.length > 0 ? strengths : ["No skill reached 80% yet; every item gives us a useful starting point."],
    weaknesses: weaknesses.length > 0 ? weaknesses : ["No major weakness identified in this set."],
    mistakePatterns: mistakePatterns.length > 0 ? mistakePatterns : ["No incorrect responses in this attempt."],
    nextFocus,
    feedback,
  };
}

async function finalizeAttemptResult(
  attemptId: string,
  status: "submitted" | "expired",
): Promise<AttemptResultPayload | null> {
  const [attempt] = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.id, attemptId))
    .limit(1);
  if (!attempt) return null;
  if (attempt.result) return attempt.result as AttemptResultPayload;

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
  const timing = await timerSummary(attempt.id);
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
  }));
  const analysis = deterministicAnalysis(breakdown, items, score);
  const result: AttemptResultPayload = {
    attemptId: attempt.id,
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
    .where(eq(attemptsTable.id, attempt.id));
  if (status === "submitted") {
    await db
      .insert(timerEventsTable)
      .values({ attemptId: attempt.id, type: "submitted" });
  }
  await deriveAdaptiveRecommendations(attempt.id);
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
        eq(questionsTable.reviewStatus, "approved"),
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
    await markGoogleCalendarDisconnected(
      tutorProfileId,
      access.connection.id,
    );
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
  return {
    remainingHours,
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
          status: "pending",
          method: provider,
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
    const [users, memberships, assignments, audit, platform, connectedCalendars] =
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
    meetUrl: course.meetUrl,
    driveUrl: course.driveUrl,
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
  },
  excludeSessionId?: string,
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
    })
    .from(sessionsTable)
    .where(
      and(
        sql`${sessionsTable.status} <> 'archived'`,
        sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
        sql`${sessionsTable.dateTime} < ${end}`,
        sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${payload.dateTime}`,
        excludeSessionId ? sql`${sessionsTable.id} <> ${excludeSessionId}` : sql`true`,
      ),
    );
  return rows
    .filter(
      (row) =>
        (payload.tutorUserId && row.tutorUserId === payload.tutorUserId) ||
        (payload.clientUserId && row.clientUserId === payload.clientUserId),
    )
    .map(
      (row) =>
        `${row.title} · ${row.dateTime.toISOString()} (${row.durationMinutes} min)`,
    );
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
  return {
    id: session.id,
    courseId: session.courseId,
    programTitle: course?.title ?? "Unknown program",
    dateTime: session.dateTime,
    timezone: session.timezone,
    subject: session.subject,
    title: session.title,
    status: session.status,
    durationMinutes: session.durationMinutes,
    bookingStatus: session.bookingStatus,
    meetingUrl: course?.meetUrl ?? null,
    student: session.clientUserId
      ? { id: session.clientUserId, name: personById.get(session.clientUserId) ?? "Unknown student" }
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
    const [courses, allSessions, allAssignments, blocks, questions, submissions, tutorProfiles, clients] =
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
          })
          .from(tutorProfilesTable)
          .innerJoin(usersTable, eq(usersTable.id, tutorProfilesTable.userId))
          .orderBy(asc(tutorProfilesTable.name)),
        db
          .select({ id: usersTable.id, name: usersTable.displayName, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, "student"))
          .orderBy(asc(usersTable.displayName)),
      ]);
    const sessions = await Promise.all(
      allSessions.map(async ({ session }) => {
        const conflictWith = await adminSessionConflicts({
          tutorUserId: session.tutorUserId,
          clientUserId: session.clientUserId,
          dateTime: session.dateTime,
          durationMinutes: session.durationMinutes,
        }, session.id);
        return adminSessionShape(session, conflictWith);
      }),
    );
    const assignments = await Promise.all(allAssignments.map(({ assignment }) => adminAssignmentShape(assignment)));
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
          sessionCount: Number(counts?.total ?? 0),
          upcomingSessionCount: Number(counts?.upcoming ?? 0),
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
    const attention: Array<{ kind: string; label: string; detail: string; severity: "info" | "warning" | "urgent" }> = [];
    for (const assignment of assignments.filter((item) => item.status === "draft")) {
      attention.push({ kind: "assignment", label: "Draft assignment", detail: `${assignment.title} still needs publication.`, severity: "warning" });
    }
    for (const item of [...questionBySubject.entries()].filter(([, value]) => value.draft > 0 || value.rejected > 0)) {
      attention.push({ kind: "question-bank", label: "Question review", detail: `${item[0]} has ${item[1].draft} draft and ${item[1].rejected} rejected item(s).`, severity: "warning" });
    }
    for (const session of sessions.filter((item) => item.conflict)) {
      attention.push({ kind: "conflict", label: "Scheduling conflict", detail: `${session.title} overlaps another internal session.`, severity: "urgent" });
    }
    for (const session of sessions.filter((item) => !item.tutor || !item.student)) {
      attention.push({ kind: "session", label: "Incomplete session assignment", detail: `${session.title} needs a ${!session.tutor ? "tutor" : "student"}.`, severity: "warning" });
    }
    res.json(
      GetAdminCurriculumResponse.parse({
        programs: await Promise.all(courses.map(adminProgramShape)),
        sessions,
        assignments,
        blocks: blocks.map(({ block }) => block),
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
        clients,
        attention,
      }),
    );
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
    const updates = {
      ...(body.data.title === undefined ? {} : { title: body.data.title.trim() }),
      ...(body.data.subject === undefined ? {} : { subject: body.data.subject.trim() }),
      ...(body.data.term === undefined ? {} : { term: body.data.term.trim() }),
      ...(body.data.status === undefined ? {} : { status: body.data.status }),
      ...(body.data.goalSummary === undefined ? {} : { goalSummary: body.data.goalSummary?.trim() || null }),
      ...(body.data.meetUrl === undefined ? {} : { meetUrl: body.data.meetUrl?.trim() || null }),
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
      const [session] = await db.select({ id: sessionsTable.id, courseId: sessionsTable.courseId }).from(sessionsTable).where(eq(sessionsTable.id, body.data.sessionId)).limit(1);
      if (!session || session.courseId !== body.data.courseId) {
        res.status(404).json({ error: "Session not found in this program" });
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
      const [session] = await db.select({ courseId: sessionsTable.courseId }).from(sessionsTable).where(eq(sessionsTable.id, sessionId)).limit(1);
      if (!session || session.courseId !== courseId) {
        res.status(404).json({ error: "Session not found in this program" });
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
    const conflictWith = await adminSessionConflicts({
      tutorUserId: body.data.tutorUserId,
      clientUserId: body.data.clientUserId,
      dateTime: body.data.dateTime,
      durationMinutes: body.data.durationMinutes,
    });
    if (conflictWith.length > 0) {
      res.status(409).json({ code: "SCHEDULE_CONFLICT", error: "This session overlaps another internal session.", conflicts: conflictWith });
      return;
    }
    const [created] = await db.insert(sessionsTable).values({
      courseId: body.data.courseId,
      clientUserId: body.data.clientUserId ?? null,
      tutorUserId: body.data.tutorUserId ?? null,
      dateTime: body.data.dateTime,
      timezone: body.data.timezone.trim(),
      subject: body.data.subject.trim(),
      title: body.data.title.trim(),
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
    const next = {
      courseId: body.data.courseId ?? existing.courseId,
      clientUserId: body.data.clientUserId === undefined ? existing.clientUserId : body.data.clientUserId,
      tutorUserId: body.data.tutorUserId === undefined ? existing.tutorUserId : body.data.tutorUserId,
      dateTime: body.data.dateTime ?? existing.dateTime,
      timezone: body.data.timezone?.trim() ?? existing.timezone,
      subject: body.data.subject?.trim() ?? existing.subject,
      title: body.data.title?.trim() ?? existing.title,
      status: body.data.status ?? existing.status,
      durationMinutes: body.data.durationMinutes ?? existing.durationMinutes,
      bookingStatus: body.data.bookingStatus ?? existing.bookingStatus,
    };
    const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, next.courseId)).limit(1);
    if (!course || !(await validateAdminSessionPeople(next.clientUserId, next.tutorUserId))) {
      res.status(404).json({ error: "Program or assigned person not found" });
      return;
    }
    const conflictWith = next.status === "archived" || next.bookingStatus === "cancelled"
      ? []
      : await adminSessionConflicts(next, existing.id);
    if (conflictWith.length > 0) {
      res.status(409).json({ code: "SCHEDULE_CONFLICT", error: "This session overlaps another internal session.", conflicts: conflictWith });
      return;
    }
    const [updated] = await db.update(sessionsTable).set({ ...next, updatedAt: new Date() }).where(eq(sessionsTable.id, existing.id)).returning();
    await db.insert(auditLogsTable).values({
      actorUserId: req.appUser!.id,
      action: updated!.status === "archived" ? "session.archived" : "session.updated",
      entityType: "session",
      entityId: updated!.id,
      metadata: { courseId: updated!.courseId, status: updated!.status },
    });
    res.json(UpdateAdminSessionResponse.parse(await adminSessionShape(updated!)));
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
          ...publicSessionShape(session),
          tutor: await sessionTutorShape(session),
          meetingUrl: session.providerEventUrl ?? course.meetUrl ?? null,
        })),
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
          })
          .from(attemptsTable)
          .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
          .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
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
    .map(({ attempt, assignment, student }) => ({
      attemptId: attempt.id,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      studentUserId: student.id,
      studentName: student.displayName,
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
    }));
}

router.get("/dashboard", async (req: AuthedRequest, res): Promise<void> => {
  await ensureSeedData();
  const user = req.appUser!;
  const ids = await visibleCourseIds(user);
  const subjectUserId = await dataSubjectUserId(user);
  const courses = (
    await Promise.all(ids.map((id) => courseShape(id, user)))
  ).filter(Boolean);
  const courseRows =
    ids.length === 0
      ? []
      : await db
          .select({ id: coursesTable.id, meetUrl: coursesTable.meetUrl })
          .from(coursesTable)
          .where(inArray(coursesTable.id, ids));
  const meetingUrls = new Map(courseRows.map((course) => [course.id, course.meetUrl]));
  const scopedSessions = (
    await Promise.all(
      ids.map((courseId) => visibleSessionsForUser(user, courseId)),
    )
  )
    .flat()
    .filter((session) => {
      if (user.role === "student" || user.role === "viewer") {
        return session.clientUserId === subjectUserId;
      }
      if (user.role === "tutor") return session.tutorUserId === user.id;
      return true;
    })
    .sort((left, right) => left.dateTime.getTime() - right.dateTime.getTime())
  const scopedUpcomingSessions = scopedSessions
    .filter((session) => session.dateTime.getTime() >= Date.now())
    .slice(0, 12);
  const attempts = await db
    .select({
      assignmentId: attemptsTable.assignmentId,
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
          ...publicSessionShape(session),
          tutor: await sessionTutorShape(session),
          meetingUrl: session.providerEventUrl ?? meetingUrls.get(session.courseId) ?? null,
          ...(user.role === "tutor" || user.role === "administrator"
            ? {
                student: session.clientUserId
                  ? await studentShape(session.clientUserId)
                  : null,
              }
            : {}),
        })),
      ),
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
        remainingHours,
        readOnly: user.role === "viewer",
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
  const subjectUserId = await dataSubjectUserId(req.appUser!);
  if (
    (req.appUser!.role === "student" || req.appUser!.role === "viewer") &&
    session.clientUserId !== subjectUserId
  ) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (
    req.appUser!.role === "tutor" &&
    session.tutorUserId !== req.appUser!.id &&
    (!session.clientUserId ||
      !(await canAccessStudent(
        req.appUser!,
        session.courseId,
        session.clientUserId,
        session.subject,
      )))
  ) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [course] = await db
    .select({ meetUrl: coursesTable.meetUrl })
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
      meetingUrl: session.providerEventUrl ?? course?.meetUrl ?? null,
      student:
        req.appUser!.role === "tutor" || req.appUser!.role === "administrator"
          ? session.clientUserId
            ? await studentShape(session.clientUserId)
            : null
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
      status: "published",
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
          eq(questionsTable.reviewStatus, "approved"),
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
    if (
      !session ||
      !(await canAccessCourse(req.appUser!, session.courseId, session.subject))
    ) {
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
    if (
      !session ||
      !(await canAccessStudent(
        req.appUser!,
        session.courseId,
        session.clientUserId ?? "",
        session.subject,
      ))
    ) {
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
    await ensureDuringSessionAssignment(session);
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
            })
            .from(attemptsTable)
            .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
            .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
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
          .map(({ attempt, assignment, student }) => ({
            attemptId: attempt.id,
            assignmentId: assignment.id,
            assignmentTitle: assignment.title,
            studentUserId: student.id,
            studentName: student.displayName,
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
      if (!question || question.reviewStatus !== "approved") {
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