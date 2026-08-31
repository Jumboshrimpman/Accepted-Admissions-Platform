import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const roleEnum = pgEnum("app_role", [
  "administrator",
  "tutor",
  "student",
  "viewer",
]);
export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "published",
  "completed",
  "archived",
]);
export const attemptStatusEnum = pgEnum("attempt_status", [
  "active",
  "paused",
  "submitted",
  "expired",
]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
    role: roleEnum("role").notNull().default("student"),
    timezone: text("timezone").notNull().default("America/New_York"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId),
    uniqueIndex("users_email_idx").on(table.email),
  ],
);

export const coursesTable = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  term: text("term").notNull(),
  status: text("status").notNull().default("active"),
  goalSummary: text("goal_summary"),
  meetUrl: text("meet_url"),
  driveUrl: text("drive_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courseMembershipsTable = pgTable(
  "course_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => coursesTable.id),
    userId: uuid("user_id").notNull().references(() => usersTable.id),
    membershipRole: roleEnum("membership_role").notNull(),
    subject: text("subject").notNull().default("all"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("course_member_unique_idx").on(table.courseId, table.userId),
  ],
);

export const tutorAssignmentsTable = pgTable(
  "tutor_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id").notNull().references(() => coursesTable.id),
    tutorUserId: uuid("tutor_user_id").notNull().references(() => usersTable.id),
    studentUserId: uuid("student_user_id").notNull().references(() => usersTable.id),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tutor_assignment_unique_idx").on(
      table.courseId,
      table.tutorUserId,
      table.studentUserId,
      table.subject,
    ),
  ],
);

export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => coursesTable.id),
  clientUserId: uuid("client_user_id").references(() => usersTable.id),
  tutorUserId: uuid("tutor_user_id").references(() => usersTable.id),
  dateTime: timestamp("date_time", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  durationMinutes: numeric("duration_minutes", { mode: "number" }).notNull().default(60),
  bookingStatus: text("booking_status").notNull().default("confirmed"),
  providerEventId: text("provider_event_id"),
  providerEventUrl: text("provider_event_url"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  hasHomework: boolean("has_homework").notNull().default(false),
  hasReport: boolean("has_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const curriculumBlocksTable = pgTable("curriculum_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  kind: text("kind").notNull(),
  position: numeric("position", { mode: "number" }).notNull(),
  visibility: text("visibility").notNull().default("both"),
  status: contentStatusEnum("status").notNull().default("draft"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignmentsTable = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => coursesTable.id),
  sessionId: uuid("session_id").references(() => sessionsTable.id),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  instructions: text("instructions").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  deadline: timestamp("deadline", { withTimezone: true }),
  timeLimitMinutes: numeric("time_limit_minutes", { mode: "number" }).notNull(),
  maxAttempts: numeric("max_attempts", { mode: "number" }).notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionsTable = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  domain: text("domain").notNull(),
  skill: text("skill").notNull(),
  questionType: text("question_type").notNull(),
  difficulty: text("difficulty").notNull(),
  stimulus: text("stimulus"),
  prompt: text("prompt").notNull(),
  choices: jsonb("choices")
    .$type<Array<{ id: string; label: string; text: string }>>()
    .notNull()
    .default([]),
  correctAnswer: text("correct_answer").notNull(),
  explanation: text("explanation").notNull(),
  sourceType: text("source_type").notNull().default("original"),
  sourceId: uuid("source_id").references(() => contentSourcesTable.id),
  reviewStatus: text("review_status").notNull().default("reviewed"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  generationMethod: text("generation_method").notNull().default("tutor-authored"),
  reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentSourcesTable = pgTable("content_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => coursesTable.id),
  importedBy: uuid("imported_by").notNull().references(() => usersTable.id),
  subject: text("subject").notNull().default("all"),
  title: text("title").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceUrl: text("source_url"),
  originalFilename: text("original_filename"),
  authorizationNote: text("authorization_note").notNull(),
  extractedText: text("extracted_text"),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("imported"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assignmentQuestionsTable = pgTable(
  "assignment_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => assignmentsTable.id),
    questionId: uuid("question_id").notNull().references(() => questionsTable.id),
    position: numeric("position", { mode: "number" }).notNull(),
    predictionFirst: boolean("prediction_first").notNull().default(false),
  },
  (table) => [
    uniqueIndex("assignment_question_unique_idx").on(
      table.assignmentId,
      table.questionId,
    ),
  ],
);

export const attemptsTable = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignmentsTable.id),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  status: attemptStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  score: numeric("score", { mode: "number" }),
});

export const responsesTable = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => attemptsTable.id),
    questionId: uuid("question_id").notNull().references(() => questionsTable.id),
    prediction: text("prediction"),
    predictionLocked: boolean("prediction_locked").notNull().default(false),
    finalAnswer: text("final_answer"),
    flagged: boolean("flagged").notNull().default(false),
    timeSpentSeconds: numeric("time_spent_seconds", { mode: "number" }).notNull().default(0),
    correct: boolean("correct"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("response_attempt_question_idx").on(
      table.attemptId,
      table.questionId,
    ),
  ],
);

export const timerEventsTable = pgTable("timer_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull().references(() => attemptsTable.id),
  type: text("type").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewQueueTable = pgTable("review_queue_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull().references(() => attemptsTable.id),
  questionId: uuid("question_id").notNull().references(() => questionsTable.id),
  studentUserId: uuid("student_user_id").notNull().references(() => usersTable.id),
  skill: text("skill").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  tutorNote: text("tutor_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionArtifactsTable = pgTable(
  "session_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
    createdBy: uuid("created_by").notNull().references(() => usersTable.id),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    visibility: text("visibility").notNull().default("tutor"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("session_artifact_kind_unique_idx").on(table.sessionId, table.kind),
  ],
);

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => usersTable.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const viewerLinksTable = pgTable(
  "viewer_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viewerUserId: uuid("viewer_user_id").notNull().references(() => usersTable.id),
    studentUserId: uuid("student_user_id").notNull().references(() => usersTable.id),
    relationship: text("relationship").notNull().default("read-only viewer"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("viewer_link_unique_idx").on(table.viewerUserId, table.studentUserId),
  ],
);

export const tutorProfilesTable = pgTable(
  "tutor_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull().default("Tutor"),
    photoUrl: text("photo_url"),
    photoAltText: text("photo_alt_text"),
    biography: text("biography"),
    subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
    linkedinUrl: text("linkedin_url"),
    publicApproved: boolean("public_approved").notNull().default(false),
    active: boolean("active").notNull().default(true),
    bookingEligible: boolean("booking_eligible").notNull().default(false),
    calendarStatus: text("calendar_status").notNull().default("disconnected"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tutor_profile_email_idx").on(table.email)],
);

export const tutorCompensationRatesTable = pgTable("tutor_compensation_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tutorProfileId: uuid("tutor_profile_id").notNull().references(() => tutorProfilesTable.id),
  hourlyRateCents: numeric("hourly_rate_cents", { mode: "number" }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const satProductsTable = pgTable(
  "sat_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    durationHours: numeric("duration_hours", { mode: "number" }).notNull(),
    totalPriceCents: numeric("total_price_cents", { mode: "number" }).notNull(),
    effectiveHourlyRateCents: numeric("effective_hourly_rate_cents", { mode: "number" }).notNull(),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sat_product_slug_idx").on(table.slug)],
);

export const invoicesTable = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientUserId: uuid("client_user_id").references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  provider: text("provider").notNull().default("stripe"),
  providerInvoiceId: text("provider_invoice_id"),
  description: text("description").notNull(),
  subtotalCents: numeric("subtotal_cents", { mode: "number" }).notNull(),
  discountCents: numeric("discount_cents", { mode: "number" }).notNull().default(0),
  totalCents: numeric("total_cents", { mode: "number" }).notNull(),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id").references(() => usersTable.id),
    invoiceId: uuid("invoice_id").references(() => invoicesTable.id),
    productId: uuid("product_id").references(() => satProductsTable.id),
    amountCents: numeric("amount_cents", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    method: text("method").notNull().default("stripe"),
    providerEventId: text("provider_event_id"),
    providerPaymentIntentId: text("provider_payment_intent_id"),
    providerCheckoutSessionId: text("provider_checkout_session_id"),
    refundedAmountCents: numeric("refunded_amount_cents", { mode: "number" }).notNull().default(0),
    failureReason: text("failure_reason"),
    internalNote: text("internal_note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_provider_event_idx").on(table.providerEventId),
  ],
);

export const stripeWebhookEventsTable = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stripe_webhook_event_provider_id_idx").on(table.providerEventId),
  ],
);

export const creditLedgerTable = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientUserId: uuid("client_user_id").notNull().references(() => usersTable.id),
    productId: uuid("product_id").references(() => satProductsTable.id),
    sessionId: uuid("session_id").references(() => sessionsTable.id),
    entryType: text("entry_type").notNull(),
    hours: numeric("hours", { mode: "number" }).notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    fulfillmentKey: text("fulfillment_key"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("credit_ledger_fulfillment_key_idx").on(table.fulfillmentKey),
  ],
);

export const clientRequestsTable = pgTable("client_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  guardianName: text("guardian_name").notNull(),
  studentName: text("student_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  gradeOrGraduationYear: text("grade_or_graduation_year").notNull(),
  currentSchool: text("current_school").notNull(),
  serviceRequested: text("service_requested").notNull(),
  currentSatTotal: text("current_sat_total"),
  currentReadingWriting: text("current_reading_writing"),
  currentMath: text("current_math"),
  targetSatScore: text("target_sat_score"),
  plannedTestDate: text("planned_test_date"),
  goals: text("goals").notNull(),
  schedulingAvailability: text("scheduling_availability").notNull(),
  referralSource: text("referral_source").notNull(),
  consentToContact: boolean("consent_to_contact").notNull(),
  privacyAcknowledged: boolean("privacy_acknowledged").notNull(),
  sourcePage: text("source_page").notNull().default("/client-request"),
  status: text("status").notNull().default("new"),
  assignedStaffUserId: uuid("assigned_staff_user_id").references(() => usersTable.id),
  followUpNotes: text("follow_up_notes"),
  conversionStatus: text("conversion_status").notNull().default("unqualified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publicContentTable = pgTable(
  "public_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    pageType: text("page_type").notNull(),
    title: text("title").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
    status: contentStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("public_content_slug_idx").on(table.slug)],
);

export const calendarConnectionsTable = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tutorProfileId: uuid("tutor_profile_id").notNull().references(() => tutorProfilesTable.id),
    provider: text("provider").notNull().default("google"),
    status: text("status").notNull().default("disconnected"),
    calendarId: text("calendar_id"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_connection_profile_provider_idx").on(
      table.tutorProfileId,
      table.provider,
    ),
  ],
);

export const availabilityRulesTable = pgTable("availability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tutorProfileId: uuid("tutor_profile_id").notNull().references(() => tutorProfilesTable.id),
  timezone: text("timezone").notNull().default("America/New_York"),
  weeklyHours: jsonb("weekly_hours").$type<Record<string, unknown>>().notNull().default({}),
  bookingNoticeMinutes: numeric("booking_notice_minutes", { mode: "number" }).notNull().default(1440),
  bufferMinutes: numeric("buffer_minutes", { mode: "number" }).notNull().default(15),
  blackoutDates: jsonb("blackout_dates").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingRecordsTable = pgTable("meeting_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessionsTable.id),
  provider: text("provider").notNull().default("manual"),
  url: text("url").notNull(),
  title: text("title"),
  approvedForStudent: boolean("approved_for_student").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCurriculumBlockSchema =
  createInsertSchema(curriculumBlocksTable).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });
export type AppUser = typeof usersTable.$inferSelect;
export type Attempt = typeof attemptsTable.$inferSelect;