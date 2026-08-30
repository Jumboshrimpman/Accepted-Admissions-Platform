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
  tutorUserId: uuid("tutor_user_id").references(() => usersTable.id),
  dateTime: timestamp("date_time", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull(),
  subject: text("subject").notNull(),
  title: text("title").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  hasHomework: boolean("has_homework").notNull().default(false),
  hasReport: boolean("has_report").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

export const insertCurriculumBlockSchema =
  createInsertSchema(curriculumBlocksTable).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });
export type AppUser = typeof usersTable.$inferSelect;
export type Attempt = typeof attemptsTable.$inferSelect;