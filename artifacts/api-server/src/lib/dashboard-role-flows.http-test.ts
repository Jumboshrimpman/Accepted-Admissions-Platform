import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  adminNotificationsTable,
  auditLogsTable,
  clientRequestsTable,
  db,
  loginActivityTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createDashboardRoleFixture } from "./dashboard-fixtures";
import platformRouter from "../routes/platform";

function testAuthMiddleware(user: AppUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: {
          userId: user.clerkUserId,
          email: user.email,
          name: user.displayName,
        },
        sessionId: `dashboard-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startDashboardHttpServer(user: AppUser) {
  const app = express();
  app.use(express.json());
  app.use(testAuthMiddleware(user));
  app.use("/api", platformRouter);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function getJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

async function patchJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

test("HTTP client dashboard preview is administrator-only, student-scoped, and privacy-safe", async () => {
  const fixture = await createDashboardRoleFixture();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let administratorServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  let studentServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS =
    fixture.administrator.clerkUserId;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;
  try {
    administratorServer = await startDashboardHttpServer(
      fixture.administrator,
    );
    studentServer = await startDashboardHttpServer(fixture.student);
    const previewPath = `/api/admin/clients/${fixture.student.id}/dashboard`;

    const forbidden = await getJson(studentServer.baseUrl, previewPath);
    assert.equal(forbidden.response.status, 403);
    assert.deepEqual(forbidden.body, { error: "Insufficient permission" });

    const malformed = await getJson(
      administratorServer.baseUrl,
      "/api/admin/clients/malformed-client-id/dashboard",
    );
    assert.equal(malformed.response.status, 400);
    assert.deepEqual(malformed.body, { error: "Invalid client ID" });

    for (const clientId of [randomUUID(), fixture.satTutor.id]) {
      const notFound = await getJson(
        administratorServer.baseUrl,
        `/api/admin/clients/${encodeURIComponent(clientId)}/dashboard`,
      );
      assert.equal(notFound.response.status, 404);
      assert.deepEqual(notFound.body, { error: "Client not found" });
    }

    const preview = await getJson(
      administratorServer.baseUrl,
      previewPath,
    );
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.adminPreview, true);
    assert.equal(preview.body.user.id, fixture.student.id);
    assert.equal(preview.body.user.displayName, fixture.student.displayName);
    assert.equal(preview.body.user.role, "student");
    assert.deepEqual(preview.body.previewOffer, {
      name: "One SAT session with Xavier",
      description: "A one-time, 60-minute SAT tutoring session with Xavier Morales.",
      priceCents: 15000,
      durationMinutes: 60,
    });
    assert.equal(preview.body.previewFinancials.readOnly, true);
    assert.equal(Array.isArray(preview.body.previewFinancials.payments), true);
    assert.equal(Array.isArray(preview.body.previewFinancials.invoices), true);
    assert.equal(Array.isArray(preview.body.previewFinancials.credits), true);
    assert.equal(Array.isArray(preview.body.previewBooking.sessions), true);
    assert.equal(
      ["connected", "disconnected", "unavailable"].includes(
        preview.body.previewBooking.calendarStatus,
      ),
      true,
    );
    if (preview.body.previewBooking.availability) {
      assert.deepEqual(
        Object.keys(preview.body.previewBooking.availability).sort(),
        ["providerStatus", "slots", "tutor"],
      );
      assert.deepEqual(
        Object.keys(preview.body.previewBooking.availability.tutor).sort(),
        ["id", "name", "timezone", "title"],
      );
    }
    assert.deepEqual(
      preview.body.upcomingSessions.map(
        (session: { id: string }) => session.id,
      ),
      [fixture.sessionIds.studentSat, fixture.sessionIds.studentEnglish],
    );

    const serializedPreview = JSON.stringify(preview.body);
    assert.equal(serializedPreview.includes(fixture.otherStudent.id), false);
    assert.equal(
      serializedPreview.includes(fixture.otherStudent.displayName),
      false,
    );
    assert.equal(
      serializedPreview.includes(fixture.sessionIds.otherStudentSat),
      false,
    );
    assert.equal(serializedPreview.includes("private-event:"), false);
    assert.equal(serializedPreview.includes("private-sat-room"), false);
    assert.equal(serializedPreview.includes("providerEventId"), false);
    assert.equal(serializedPreview.includes("tutorShareCents"), false);
    assert.equal(serializedPreview.includes("platformShareCents"), false);
    assert.equal(serializedPreview.includes("transfer"), false);

    const curriculum = await getJson(
      administratorServer.baseUrl,
      `/api/admin/curriculum?courseId=${fixture.courseId}`,
    );
    assert.equal(curriculum.response.status, 200);
    const student = curriculum.body.clients.find(
      (client: { id: string }) => client.id === fixture.student.id,
    );
    assert.deepEqual(
      student.assignedTutors
        .map((tutor: { id: string; name: string; subject: string }) => ({
          id: tutor.id,
          name: tutor.name,
          subject: tutor.subject,
        }))
        .sort((left: { subject: string }, right: { subject: string }) =>
          left.subject.localeCompare(right.subject),
        ),
      [
        {
          id: fixture.englishTutor.id,
          name: fixture.englishTutor.displayName,
          subject: "IELTS",
        },
        {
          id: fixture.satTutor.id,
          name: fixture.satTutor.displayName,
          subject: "SAT",
        },
      ],
    );
    const satTutor = curriculum.body.tutors.find(
      (tutor: { id: string }) => tutor.id === fixture.satTutor.id,
    );
    const courseTitle = curriculum.body.programs.find(
      (course: { id: string }) => course.id === fixture.courseId,
    ).title;
    assert.deepEqual(satTutor.assignedStudents, [
      {
        id: fixture.student.id,
        name: fixture.student.displayName,
        courseId: fixture.courseId,
        courseTitle,
        subject: "SAT",
      },
    ]);
  } finally {
    await studentServer?.close();
    await administratorServer?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    if (previousStudentIds === undefined) {
      delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    }
    await fixture.cleanup();
  }
});

test("HTTP admin overview returns private guidance requests only to administrators", async () => {
  const fixture = await createDashboardRoleFixture();
  const [secondaryAdministrator] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `secondary-guidance-administrator:${randomUUID()}`,
      email: `secondary-guidance-administrator-${randomUUID()}@example.invalid`,
      displayName: "Secondary Administrator",
      role: "administrator",
    })
    .returning();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  let administratorServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  let studentServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  let secondaryAdministratorServer:
    | Awaited<ReturnType<typeof startDashboardHttpServer>>
    | undefined;
  const createdRequestIds: string[] = [];
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = [
    fixture.administrator.clerkUserId,
    secondaryAdministrator!.clerkUserId,
  ].join(",");
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = fixture.student.clerkUserId;
  try {
    const requests = await db
      .insert(clientRequestsTable)
      .values([
        {
          guardianName: "Earlier Guardian",
          studentName: "Earlier Student",
          email: "earlier-guidance@example.invalid",
          phone: "+1555010101",
          gradeOrGraduationYear: "11th grade",
          currentSchool: "Earlier Academy",
          serviceRequested: "SAT tutoring",
          currentSatTotal: null,
          currentReadingWriting: "650",
          currentMath: "680",
          targetSatScore: "1450",
          plannedTestDate: null,
          goals: "Build a complete study plan.",
          schedulingAvailability: "Weekday evenings.",
          referralSource: "School counselor",
          consentToContact: true,
          privacyAcknowledged: true,
          sourcePage: "/client-request",
          status: "new",
          assignedStaffUserId: null,
          followUpNotes: null,
          conversionStatus: "unqualified",
          createdAt: new Date("2098-09-01T12:00:00.000Z"),
        },
        {
          guardianName: "Latest Guardian",
          studentName: "Latest Student",
          email: "latest-guidance@example.invalid",
          phone: "+1555010102",
          gradeOrGraduationYear: "12th grade",
          currentSchool: "Latest Academy",
          serviceRequested: "Admissions guidance",
          currentSatTotal: "1380",
          currentReadingWriting: null,
          currentMath: null,
          targetSatScore: null,
          plannedTestDate: "2099-10-01",
          goals: "Review the application timeline.",
          schedulingAvailability: "Saturday mornings.",
          referralSource: "Friend",
          consentToContact: true,
          privacyAcknowledged: true,
          sourcePage: "/client-request",
          status: "new",
          assignedStaffUserId: null,
          followUpNotes: null,
          conversionStatus: "unqualified",
          createdAt: new Date("2099-09-01T12:00:00.000Z"),
        },
      ])
      .returning({ id: clientRequestsTable.id });
    createdRequestIds.push(...requests.map((request) => request.id));

    administratorServer = await startDashboardHttpServer(
      fixture.administrator,
    );
    secondaryAdministratorServer = await startDashboardHttpServer(
      secondaryAdministrator!,
    );
    studentServer = await startDashboardHttpServer(fixture.student);

    const forbidden = await getJson(
      studentServer.baseUrl,
      "/api/admin/overview",
    );
    assert.equal(forbidden.response.status, 403);
    assert.deepEqual(forbidden.body, { error: "Insufficient permission" });

    const overview = await getJson(
      administratorServer.baseUrl,
      "/api/admin/overview",
    );
    assert.equal(overview.response.status, 200);
    const returnedRequests = overview.body.guidanceRequests.filter(
      (request: { id: string }) => createdRequestIds.includes(request.id),
    );
    assert.deepEqual(
      returnedRequests.map((request: { id: string }) => request.id),
      [createdRequestIds[1], createdRequestIds[0]],
    );
    assert.deepEqual(returnedRequests[0], {
      id: createdRequestIds[1],
      guardianName: "Latest Guardian",
      studentName: "Latest Student",
      email: "latest-guidance@example.invalid",
      phone: "+1555010102",
      gradeOrGraduationYear: "12th grade",
      currentSchool: "Latest Academy",
      serviceRequested: "Admissions guidance",
      currentSatTotal: "1380",
      currentReadingWriting: null,
      currentMath: null,
      targetSatScore: null,
      plannedTestDate: "2099-10-01",
      goals: "Review the application timeline.",
      schedulingAvailability: "Saturday mornings.",
      referralSource: "Friend",
      consentToContact: true,
      privacyAcknowledged: true,
      sourcePage: "/client-request",
      status: "new",
      assignedStaffUserId: null,
      followUpNotes: null,
      conversionStatus: "unqualified",
      createdAt: "2099-09-01T12:00:00.000Z",
    });

    const updatePath = `/api/admin/guidance-requests/${createdRequestIds[1]}`;
    const forbiddenUpdate = await patchJson(studentServer.baseUrl, updatePath, {
      status: "contacted",
    });
    assert.equal(forbiddenUpdate.response.status, 403);
    assert.deepEqual(forbiddenUpdate.body, { error: "Insufficient permission" });

    const invalidStatus = await patchJson(administratorServer.baseUrl, updatePath, {
      status: "invalid-status",
    });
    assert.equal(invalidStatus.response.status, 400);
    assert.deepEqual(invalidStatus.body, { error: "Invalid guidance request update." });

    const emptyUpdate = await patchJson(administratorServer.baseUrl, updatePath, {});
    assert.equal(emptyUpdate.response.status, 400);
    assert.deepEqual(emptyUpdate.body, { error: "Invalid guidance request update." });

    const invalidAssignee = await patchJson(administratorServer.baseUrl, updatePath, {
      assignedStaffUserId: fixture.student.id,
    });
    assert.equal(invalidAssignee.response.status, 400);
    assert.deepEqual(invalidAssignee.body, {
      error: "Assigned staff member must be an administrator.",
    });

    const updated = await patchJson(administratorServer.baseUrl, updatePath, {
      status: "contacted",
      assignedStaffUserId: fixture.administrator.id,
      followUpNotes: "Called guardian; follow up Friday.",
      conversionStatus: "qualified",
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.status, "contacted");
    assert.equal(updated.body.assignedStaffUserId, fixture.administrator.id);
    assert.equal(updated.body.followUpNotes, "Called guardian; follow up Friday.");
    assert.equal(updated.body.conversionStatus, "qualified");
    assert.deepEqual(updated.body.notificationDelivery, { status: "sent" });

    const firstNotifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.guidanceRequestId, createdRequestIds[1]));
    assert.equal(firstNotifications.length, 1);
    assert.equal(firstNotifications[0].recipientUserId, fixture.administrator.id);
    assert.equal(firstNotifications[0].status, "unread");
    assert.equal(firstNotifications[0].readAt, null);
    assert.equal(firstNotifications[0].dismissedAt, null);
    assert.equal(firstNotifications[0].title, "Guidance request assigned to you");
    assert.equal(
      firstNotifications[0].message,
      "Latest Student · Admissions guidance was assigned to you by Dashboard Administrator.",
    );
    assert.equal(firstNotifications[0].message.includes("Called guardian"), false);
    assert.equal(firstNotifications[0].message.includes("Review the application timeline"), false);

    const reassigned = await patchJson(administratorServer.baseUrl, updatePath, {
      assignedStaffUserId: secondaryAdministrator!.id,
      followUpNotes: "This private note must not be included.",
    });
    assert.equal(reassigned.response.status, 200);
    assert.equal(reassigned.body.assignedStaffUserId, secondaryAdministrator!.id);
    assert.deepEqual(reassigned.body.notificationDelivery, { status: "sent" });

    const reassignmentNotifications = await db
      .select()
      .from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.guidanceRequestId, createdRequestIds[1]));
    assert.equal(reassignmentNotifications.length, 2);
    const latestNotification = reassignmentNotifications.find(
      (notification) => notification.recipientUserId === secondaryAdministrator!.id,
    );
    assert.ok(latestNotification);
    assert.equal(latestNotification.message.includes("This private note"), false);

    const firstNotification = reassignmentNotifications.find(
      (notification) => notification.recipientUserId === fixture.administrator.id,
    );
    assert.ok(firstNotification);
    const crossRecipientUpdate = await patchJson(
      administratorServer.baseUrl,
      `/api/admin/notifications/${latestNotification.id}`,
      { status: "read" },
    );
    assert.equal(crossRecipientUpdate.response.status, 404);
    assert.deepEqual(crossRecipientUpdate.body, { error: "Notification not found" });

    const readNotification = await patchJson(
      secondaryAdministratorServer.baseUrl,
      `/api/admin/notifications/${latestNotification.id}`,
      { status: "read" },
    );
    assert.equal(readNotification.response.status, 200);
    assert.equal(readNotification.body.status, "read");
    assert.equal(typeof readNotification.body.readAt, "string");
    assert.equal(readNotification.body.dismissedAt, null);

    const otherCrossRecipientUpdate = await patchJson(
      secondaryAdministratorServer.baseUrl,
      `/api/admin/notifications/${firstNotification.id}`,
      { status: "dismissed" },
    );
    assert.equal(otherCrossRecipientUpdate.response.status, 404);
    assert.deepEqual(otherCrossRecipientUpdate.body, {
      error: "Notification not found",
    });

    const dismissedNotification = await patchJson(
      administratorServer.baseUrl,
      `/api/admin/notifications/${firstNotification.id}`,
      { status: "dismissed" },
    );
    assert.equal(dismissedNotification.response.status, 200);
    assert.equal(dismissedNotification.body.status, "dismissed");
    assert.equal(typeof dismissedNotification.body.readAt, "string");
    assert.equal(typeof dismissedNotification.body.dismissedAt, "string");

    const overviewAfterUpdates = await getJson(
      administratorServer.baseUrl,
      "/api/admin/overview",
    );
    assert.equal(overviewAfterUpdates.response.status, 200);
    const returnedNotification = overviewAfterUpdates.body.notifications.find(
      (notification: { id: string }) => notification.id === firstNotification.id,
    );
    assert.equal(returnedNotification.status, "dismissed");

    const unassigned = await patchJson(administratorServer.baseUrl, updatePath, {
      assignedStaffUserId: null,
    });
    assert.equal(unassigned.response.status, 200);
    assert.equal(unassigned.body.assignedStaffUserId, null);
    assert.equal(unassigned.body.notificationDelivery, undefined);
    const notificationsAfterUnassignment = await db
      .select()
      .from(adminNotificationsTable)
      .where(eq(adminNotificationsTable.guidanceRequestId, createdRequestIds[1]));
    assert.equal(notificationsAfterUnassignment.length, 2);

    const [persisted] = await db
      .select({
        status: clientRequestsTable.status,
        assignedStaffUserId: clientRequestsTable.assignedStaffUserId,
        followUpNotes: clientRequestsTable.followUpNotes,
        conversionStatus: clientRequestsTable.conversionStatus,
      })
      .from(clientRequestsTable)
      .where(eq(clientRequestsTable.id, createdRequestIds[1]))
      .limit(1);
    assert.deepEqual(persisted, {
      status: "contacted",
      assignedStaffUserId: null,
      followUpNotes: "This private note must not be included.",
      conversionStatus: "qualified",
    });
  } finally {
    await studentServer?.close();
    await secondaryAdministratorServer?.close();
    await administratorServer?.close();
    for (const requestId of createdRequestIds) {
      await db
        .delete(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityType, "client_request"),
            eq(auditLogsTable.entityId, requestId),
          ),
        );
      await db
        .delete(adminNotificationsTable)
        .where(eq(adminNotificationsTable.guidanceRequestId, requestId));
      await db
        .delete(clientRequestsTable)
        .where(eq(clientRequestsTable.id, requestId));
    }
    await db
      .delete(loginActivityTable)
      .where(eq(loginActivityTable.userId, secondaryAdministrator!.id));
    await db
      .delete(usersTable)
      .where(eq(usersTable.id, secondaryAdministrator!.id));
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    if (previousStudentIds === undefined) {
      delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    }
    await fixture.cleanup();
  }
});