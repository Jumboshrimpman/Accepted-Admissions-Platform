import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, asc, eq } from "drizzle-orm";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  sessionsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const privacyModule = await import("./session-privacy.ts");
const { publicSessionShape, reconcileTaitoSessions, visibleSessionsForUser } =
  privacyModule;
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
const scheduleModule = await import("./session-schedule.ts");
const { SHARED_FALL_MEETING_URL, TAITO_FALL_2026_SESSIONS, taitoSessionDateTime } = scheduleModule;

test("reconciles existing Fall sessions in place and keeps access subject-scoped", async () => {
  const suffix = randomUUID();
  const sessionIds = TAITO_FALL_2026_SESSIONS.map(() => randomUUID());
  const createdUserIds: string[] = [];
  const [course] = await db
    .insert(coursesTable)
    .values({
      title: `Fall account-linking privacy fixture ${suffix}`,
      subject: "SAT & IELTS",
      term: "Fall 2026",
      status: "active",
    })
    .returning();
  const courseId = course!.id;
  const findOrCreateUser = async (
    email: string,
    displayName: string,
    role: "student" | "tutor",
    clerkUserId: string,
  ) => {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, displayName, role })
      .returning();
    createdUserIds.push(created!.id);
    return created!;
  };
  const student = await findOrCreateUser(
    "taito0525@gmail.com",
    "Taito Goto",
    "student",
    `fall-privacy-student:${suffix}`,
  );
  const eunice = await findOrCreateUser(
    "eunice_chon@berkeley.edu",
    "Eunice Chon",
    "tutor",
    `fall-privacy-eunice:${suffix}`,
  );
  const nika = await findOrCreateUser(
    "nika.raiffe@gmail.com",
    "Nika Raiffe",
    "tutor",
    `fall-privacy-nika:${suffix}`,
  );

  try {
    await db.insert(courseMembershipsTable).values([
      {
        courseId,
        userId: student!.id,
        membershipRole: "student",
        subject: "all",
      },
      {
        courseId,
        userId: eunice!.id,
        membershipRole: "tutor",
        subject: "SAT",
      },
      {
        courseId,
        userId: nika!.id,
        membershipRole: "tutor",
        subject: "IELTS",
      },
    ]);
    await db.insert(sessionsTable).values(
      TAITO_FALL_2026_SESSIONS.map((scheduled, index) => ({
        id: sessionIds[index]!,
        courseId,
        dateTime: taitoSessionDateTime(scheduled.dateKey),
        timezone: "Asia/Tokyo",
        subject: scheduled.subject,
        title: `PRIVATE imported event ${suffix}`,
        status: "published" as const,
        hasHomework: false,
      })),
    );

    await reconcileTaitoSessions(courseId);

    const reconciled = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.courseId, courseId))
      .orderBy(asc(sessionsTable.dateTime));
    assert.equal(reconciled.length, 12);
    assert.deepEqual(
      reconciled.map((session) => session.id),
      sessionIds,
      "reconciliation must update existing rows instead of replacing them",
    );
    assert.deepEqual(
      reconciled.map((session) => ({
        clientUserId: session.clientUserId,
        tutorUserId: session.tutorUserId,
        subject: session.subject,
      })),
      TAITO_FALL_2026_SESSIONS.map((scheduled) => ({
        clientUserId: student!.id,
        tutorUserId:
          scheduled.subject === "SAT" ? eunice!.id : nika!.id,
        subject: scheduled.subject,
      })),
    );
    const [reconciledCourse] = await db
      .select({ meetUrl: coursesTable.meetUrl })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId));
    assert.equal(reconciledCourse?.meetUrl, SHARED_FALL_MEETING_URL);

    const [taitoSessions, euniceSessions, nikaSessions] = await Promise.all([
      visibleSessionsForUser(student!, courseId),
      visibleSessionsForUser(eunice!, courseId),
      visibleSessionsForUser(nika!, courseId),
    ]);
    assert.equal(taitoSessions.length, 12);
    assert.equal(euniceSessions.length, 9);
    assert.equal(nikaSessions.length, 3);
    assert.ok(euniceSessions.every((session) => session.subject === "SAT"));
    assert.ok(nikaSessions.every((session) => session.subject === "IELTS"));

    const privateCalendarFields = {
      eventTitle: `Private event title ${suffix}`,
      attendees: [`private-attendee-${suffix}@example.com`],
      description: `Private event description ${suffix}`,
      location: `Private event location ${suffix}`,
    };
    const responseRows = [
      ...taitoSessions,
      ...euniceSessions,
      ...nikaSessions,
    ].map((session) => publicSessionShape({ ...session, ...privateCalendarFields }));
    for (const response of responseRows) {
      assert.deepEqual(Object.keys(response).sort(), [
        "courseId",
        "dateTime",
        "hasHomework",
        "hasReport",
        "id",
        "status",
        "subject",
        "timezone",
        "title",
      ]);
      const serialized = JSON.stringify(response);
      assert.equal(serialized.includes(privateCalendarFields.eventTitle), false);
      assert.equal(serialized.includes(privateCalendarFields.attendees[0]), false);
      assert.equal(serialized.includes(privateCalendarFields.description), false);
      assert.equal(serialized.includes(privateCalendarFields.location), false);
    }
  } finally {
    await db
      .delete(courseMembershipsTable)
      .where(eq(courseMembershipsTable.courseId, courseId));
    await db.delete(sessionsTable).where(eq(sessionsTable.courseId, courseId));
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
    for (const userId of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
  }
});