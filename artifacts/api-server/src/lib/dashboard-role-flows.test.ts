import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  assignmentsTable,
  db,
  sessionsTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { dashboardSessionShape, dashboardSessionsForUser } from "./dashboard-data.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { createDashboardRoleFixture } from "./dashboard-fixtures.ts";

test("role fixtures keep dashboard sessions, assignments, and meeting data scoped", async () => {
  const fixture = await createDashboardRoleFixture();
  try {
    const [studentSessions, viewerSessions, satTutorSessions, englishTutorSessions] =
      await Promise.all([
        dashboardSessionsForUser(fixture.student),
        dashboardSessionsForUser(fixture.viewer),
        dashboardSessionsForUser(fixture.satTutor),
        dashboardSessionsForUser(fixture.englishTutor),
      ]);

    assert.deepEqual(
      studentSessions.map((session) => session.id),
      [fixture.sessionIds.studentSat, fixture.sessionIds.studentEnglish],
    );
    assert.deepEqual(
      viewerSessions.map((session) => session.id),
      [fixture.sessionIds.studentSat, fixture.sessionIds.studentEnglish],
      "a viewer follows the linked student's session scope",
    );
    assert.deepEqual(
      satTutorSessions.map((session) => session.id),
      [fixture.sessionIds.studentSat],
      "a tutor cannot see another tutor's or an unassigned session",
    );
    assert.deepEqual(
      englishTutorSessions.map((session) => session.id),
      [fixture.sessionIds.studentEnglish],
    );

    const [satSession] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, fixture.sessionIds.studentSat));
    const studentSessionResponse = dashboardSessionShape(
      satSession!,
      { id: fixture.satTutor.id, name: fixture.satTutor.displayName, specialty: "SAT", avatarUrl: null },
      "https://meet.google.com/private-sat-room",
    );
    assert.equal(studentSessionResponse.meetingUrl, "https://meet.google.com/private-sat-room");
    assert.equal("providerEventId" in studentSessionResponse, false);
    assert.deepEqual(Object.keys(studentSessionResponse).sort(), [
      "courseId",
      "dateTime",
      "hasHomework",
      "hasReport",
      "id",
      "meetingUrl",
      "status",
      "subject",
      "timezone",
      "title",
      "tutor",
    ]);
    assert.equal(
      JSON.stringify(studentSessionResponse).includes(`private-event:`),
      false,
      "provider calendar identifiers must not enter dashboard responses",
    );

    const visibleAssignments = await db
      .select({
        id: assignmentsTable.id,
        status: assignmentsTable.status,
      })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.courseId, fixture.courseId));
    assert.deepEqual(
      visibleAssignments.map((assignment) => ({
        id: assignment.id,
        status: assignment.status,
      })),
      [
        {
          id: fixture.assignmentIds.published,
          status: "published",
        },
        { id: fixture.assignmentIds.draft, status: "draft" },
      ],
    );
    assert.deepEqual(
      visibleAssignments
        .filter((assignment) => assignment.status === "published")
        .map((assignment) => assignment.id),
      [fixture.assignmentIds.published],
      "viewers cannot receive draft assignments through the student data scope",
    );
    assert.deepEqual(
      visibleAssignments.filter((assignment) => assignment.status === "draft").map((assignment) => assignment.id),
      [fixture.assignmentIds.draft],
      "draft status remains distinct from the published student surface",
    );
  } finally {
    await fixture.cleanup();
  }
});