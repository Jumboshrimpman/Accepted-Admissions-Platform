import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  availabilityRulesTable,
  courseMembershipsTable,
  db,
  loginActivityTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
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
        sessionId: `tutor-preview-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: AppUser) {
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

async function dateHoursFor(tutorProfileId: string) {
  const [rule] = await db
    .select({
      dateHours: availabilityRulesTable.dateHours,
      updatedAt: availabilityRulesTable.updatedAt,
    })
    .from(availabilityRulesTable)
    .where(eq(availabilityRulesTable.tutorProfileId, tutorProfileId))
    .limit(1);
  return rule ?? null;
}

test("administrator tutor preview is read-only and hidden from other roles", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for administrator tutor preview HTTP coverage");
    return;
  }

  const suffix = randomUUID();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const createdUserIds: string[] = [];
  let tutorProfileId = "";
  let administratorServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let studentServer: Awaited<ReturnType<typeof startServer>> | undefined;
  const originalHours = {
    "2031-01-15": [{ start: "10:00", end: "11:00" }],
  };
  const replacementHours = {
    "2031-01-15": [{ start: "12:00", end: "13:00" }],
  };

  const createUser = async (
    email: string,
    displayName: string,
    role: AppUser["role"],
  ) => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `tutor-preview-http:${email}`,
        email,
        displayName,
        role,
      })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  };

  try {
    const administrator = await createUser(
      `tutor-preview-admin-${suffix}@example.invalid`,
      "Preview Admin",
      "administrator",
    );
    const student = await createUser(
      `tutor-preview-student-${suffix}@example.invalid`,
      "Preview Student",
      "student",
    );
    const tutor = await createUser(
      `tutor-preview-tutor-${suffix}@example.invalid`,
      "Preview Tutor",
      "tutor",
    );
    const [profile] = await db
      .insert(tutorProfilesTable)
      .values({
        userId: tutor.id,
        email: tutor.email,
        name: "Preview Tutor",
        title: "Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: false,
        publicApproved: false,
      })
      .returning();
    tutorProfileId = profile!.id;
    await db.insert(availabilityRulesTable).values({
      tutorProfileId,
      timezone: "America/New_York",
      dateHours: originalHours,
    });

    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;
    process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = student.clerkUserId;
    administratorServer = await startServer(administrator);
    studentServer = await startServer(student);

    const denied = await fetch(
      `${studentServer.baseUrl}/api/admin/tutors/${tutorProfileId}/preview`,
    );
    assert.equal(denied.status, 403);
    const deniedBody = (await denied.json()) as { error?: string };
    assert.equal(deniedBody.error, "Insufficient permission");

    const before = await dateHoursFor(tutorProfileId);
    assert.ok(before);

    const previewWrite = await fetch(
      `${administratorServer.baseUrl}/api/admin/tutors/${tutorProfileId}/preview`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dateHours: replacementHours }),
      },
    );
    assert.equal(previewWrite.status, 403);
    const previewWriteBody = (await previewWrite.json()) as { error?: string };
    assert.equal(previewWriteBody.error, "Tutor preview is read-only.");

    const markedWrite = await fetch(
      `${administratorServer.baseUrl}/api/admin/tutors/${tutorProfileId}/date-hours?preview=1`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-tutor-preview": "1",
        },
        body: JSON.stringify({ dateHours: replacementHours }),
      },
    );
    assert.equal(markedWrite.status, 403);

    const calendarConnect = await fetch(
      `${administratorServer.baseUrl}/api/calendar/connect?preview=1&redirect=1`,
    );
    assert.equal(calendarConnect.status, 403);

    const disconnect = await fetch(
      `${administratorServer.baseUrl}/api/calendar/connections/${tutorProfileId}`,
      { method: "DELETE", headers: { "x-tutor-preview": "1" } },
    );
    assert.equal(disconnect.status, 403);

    const clearFlags = await fetch(
      `${administratorServer.baseUrl}/api/review-queue/${randomUUID()}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-tutor-preview": "1",
        },
        body: JSON.stringify({ status: "reviewed", tutorNote: "Reviewed and approved." }),
      },
    );
    assert.equal(clearFlags.status, 403);

    const afterRejects = await dateHoursFor(tutorProfileId);
    assert.deepEqual(afterRejects?.dateHours, originalHours);
    assert.equal(afterRejects?.updatedAt?.toISOString(), before.updatedAt?.toISOString());

    const preview = await fetch(
      `${administratorServer.baseUrl}/api/admin/tutors/${tutorProfileId}/preview`,
    );
    assert.equal(preview.status, 200);
    const body = (await preview.json()) as {
      readOnly: boolean;
      tutorProfileId: string;
      dateHours: unknown;
      dateHoursUnavailable: boolean;
      dashboard: { user: { id: string; role: string } };
      calendar: { status: string };
    };
    assert.equal(body.readOnly, true);
    assert.equal(body.tutorProfileId, tutorProfileId);
    assert.equal(body.dashboard.user.id, tutor.id);
    assert.equal(body.dashboard.user.role, "tutor");
    assert.notEqual(body.dashboard.user.id, administrator.id);
    assert.equal(body.dateHours, null);
    assert.equal(body.dateHoursUnavailable, false);
    assert.equal(body.calendar.status, "disconnected");

    const unchangedByRead = await dateHoursFor(tutorProfileId);
    assert.deepEqual(unchangedByRead?.dateHours, originalHours);
    assert.equal(unchangedByRead?.updatedAt?.toISOString(), before.updatedAt?.toISOString());

    const allowedWrite = await fetch(
      `${administratorServer.baseUrl}/api/admin/tutors/${tutorProfileId}/date-hours`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dateHours: replacementHours }),
      },
    );
    assert.equal(allowedWrite.status, 200);
    const changed = await dateHoursFor(tutorProfileId);
    assert.deepEqual(changed?.dateHours, replacementHours);
  } finally {
    await administratorServer?.close();
    await studentServer?.close();
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
    if (tutorProfileId) {
      await db
        .delete(availabilityRulesTable)
        .where(eq(availabilityRulesTable.tutorProfileId, tutorProfileId));
      await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, tutorProfileId));
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(loginActivityTable)
        .where(inArray(loginActivityTable.userId, createdUserIds));
      await db
        .delete(auditLogsTable)
        .where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db
        .delete(courseMembershipsTable)
        .where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
  }
});
