import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OCT23_IN_SESSION_ATTEMPT_ID,
  ensureInSessionAttemptsStayOpen,
  inSessionDeliverySkipsTimeLimit,
  serverTimeLimitReached,
  shouldReopenExpiredInSessionAttempt,
} from "./in-session-time-limit.ts";
import { hardSatShortfallBlockedByAssignedSet } from "./sat-hard-sets.ts";

test("in-session work never reaches the server time limit", () => {
  assert.equal(inSessionDeliverySkipsTimeLimit("during_session"), true);
  assert.equal(inSessionDeliverySkipsTimeLimit("before_session"), false);
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "during_session",
      timeLimitMinutes: 30,
      activeSeconds: 30 * 60 + 5,
    }),
    false,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 25,
      activeSeconds: 25 * 60,
    }),
    true,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 60,
      activeSeconds: 59 * 60,
    }),
    false,
  );
  assert.equal(
    shouldReopenExpiredInSessionAttempt({
      deliveryPhase: "during_session",
      status: "expired",
      attemptId: "11111111-1111-4111-8111-111111111111",
    }),
    true,
  );
  assert.equal(
    shouldReopenExpiredInSessionAttempt({
      deliveryPhase: "during_session",
      status: "expired",
      attemptId: OCT23_IN_SESSION_ATTEMPT_ID,
    }),
    false,
  );
  assert.equal(
    shouldReopenExpiredInSessionAttempt({
      deliveryPhase: "during_session",
      status: "submitted",
      attemptId: "11111111-1111-4111-8111-111111111111",
    }),
    false,
  );
  assert.equal(
    shouldReopenExpiredInSessionAttempt({
      deliveryPhase: "before_session",
      status: "expired",
      attemptId: "11111111-1111-4111-8111-111111111111",
    }),
    false,
  );
});

test("a full assigned hard set blocks the empty-pool shortfall alert", () => {
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      assignedPrework: 40,
      assignedInSession: 20,
      fullPrework: 40,
      fullInSession: 20,
    }),
    true,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      assignedPrework: 0,
      assignedInSession: 20,
      fullPrework: 40,
      fullInSession: 20,
    }),
    false,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      assignedPrework: 40,
      assignedInSession: 19,
      fullPrework: 40,
      fullInSession: 20,
    }),
    false,
  );
});

test("expiry check and startup repair are wired without email", () => {
  const platform = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const startup = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  assert.match(platform, /serverTimeLimitReached/);
  assert.match(platform, /reopenExpiredInSessionAttempt/);
  assert.match(platform, /OCT23_IN_SESSION_ATTEMPT_ID/);
  assert.match(startup, /ensureInSessionAttemptsStayOpen/);
  assert.match(hardSets, /resolveHardSatShortfallAlert/);
  assert.match(hardSets, /hardSatShortfallBlockedByAssignedSet/);
  assert.doesNotMatch(platform, /sendEmail|nodemailer|resend/i);
});

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test(
  "reopens expired in-session attempts and leaves timed quizzes and the Oct 23 result",
  { skip: !hasDatabase },
  async () => {
    const { and, eq, inArray } = await import("drizzle-orm");
    const { assignmentsTable, attemptsTable, coursesTable, db, usersTable } = await import(
      "@workspace/db"
    );
    const suffix = randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdCourseIds: string[] = [];
    const createdAssignmentIds: string[] = [];
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `In-session repair ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    createdCourseIds.push(course!.id);
    const [student] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `user_in_session_${suffix}`,
        email: `in-session-${suffix}@example.com`,
        displayName: "In Session Fixture",
        role: "student",
      })
      .returning();
    createdUserIds.push(student!.id);
    const insertAssignment = async (deliveryPhase: "during_session" | "before_session", minutes: number, maxAttempts: number) => {
      const [created] = await db
        .insert(assignmentsTable)
        .values({
          courseId: course!.id,
          deliveryPhase,
          title: `Repair ${deliveryPhase} ${suffix}`,
          subject: "SAT",
          instructions: "Fixture",
          status: "published",
          timeLimitMinutes: minutes,
          maxAttempts,
        })
        .returning();
      createdAssignmentIds.push(created!.id);
      return created!;
    };
    try {
      const during = await insertAssignment("during_session", 30, 1);
      const timed = await insertAssignment("before_session", 25, 1);
      const [expiredDuring] = await db
        .insert(attemptsTable)
        .values({
          assignmentId: during.id,
          userId: student!.id,
          status: "expired",
          result: { score: 10, kept: false },
          score: 10,
        })
        .returning();
      const [openDuring] = await db
        .insert(attemptsTable)
        .values({
          assignmentId: during.id,
          userId: student!.id,
          status: "active",
        })
        .returning();
      const [expiredTimed] = await db
        .insert(attemptsTable)
        .values({
          assignmentId: timed.id,
          userId: student!.id,
          status: "expired",
          result: { score: 80 },
          score: 80,
        })
        .returning();
      await db.delete(attemptsTable).where(eq(attemptsTable.id, OCT23_IN_SESSION_ATTEMPT_ID));
      await db.insert(attemptsTable).values({
        id: OCT23_IN_SESSION_ATTEMPT_ID,
        assignmentId: during.id,
        userId: student!.id,
        status: "expired",
        result: { score: 40, history: true },
        score: 40,
      });

      const first = await ensureInSessionAttemptsStayOpen();
      assert.equal(first.reopened, 1);
      assert.equal(first.protectedLeft, 1);
      assert.ok(first.alreadyOpen >= 1);
      const [reopened] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.id, expiredDuring!.id));
      assert.equal(reopened?.status, "active");
      assert.equal(reopened?.result, null);
      assert.equal(reopened?.score, null);
      const [stillOpen] = await db
        .select({ status: attemptsTable.status })
        .from(attemptsTable)
        .where(eq(attemptsTable.id, openDuring!.id));
      assert.equal(stillOpen?.status, "active");
      const [timedStill] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.id, expiredTimed!.id));
      assert.equal(timedStill?.status, "expired");
      assert.deepEqual(timedStill?.result, { score: 80 });
      const [protectedRow] = await db
        .select()
        .from(attemptsTable)
        .where(eq(attemptsTable.id, OCT23_IN_SESSION_ATTEMPT_ID));
      assert.equal(protectedRow?.status, "expired");
      assert.deepEqual(protectedRow?.result, { score: 40, history: true });
      const [timedAssignment] = await db
        .select({
          timeLimitMinutes: assignmentsTable.timeLimitMinutes,
          maxAttempts: assignmentsTable.maxAttempts,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, timed.id));
      assert.equal(Number(timedAssignment?.timeLimitMinutes), 25);
      assert.equal(Number(timedAssignment?.maxAttempts), 1);

      const second = await ensureInSessionAttemptsStayOpen();
      assert.equal(second.reopened, 0);
      assert.equal(second.protectedLeft, 1);
    } finally {
      await db.delete(attemptsTable).where(eq(attemptsTable.id, OCT23_IN_SESSION_ATTEMPT_ID));
      if (createdAssignmentIds.length > 0) {
        await db.delete(attemptsTable).where(inArray(attemptsTable.assignmentId, createdAssignmentIds));
        await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, createdAssignmentIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
      }
      if (createdCourseIds.length > 0) {
        await db.delete(coursesTable).where(and(inArray(coursesTable.id, createdCourseIds)));
      }
    }
  },
);
