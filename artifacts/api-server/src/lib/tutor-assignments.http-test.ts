import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  tutorAssignmentsTable,
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
        sessionId: `tutor-assignments-http-test:${user.id}`,
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

async function getJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: (await response.json()) as Record<string, any>,
  };
}

test("admin can assign and unassign a tutor–student link from People APIs", async () => {
  const suffix = randomUUID();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const createdUsers: AppUser[] = [];
  let adminServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let tutorServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let courseId = "";

  const createUser = async (
    email: string,
    displayName: string,
    role: AppUser["role"],
  ) => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `tutor-assign-http:${email}`,
        email,
        displayName,
        role,
      })
      .returning();
    createdUsers.push(user!);
    return user!;
  };

  try {
    const administrator = await createUser(
      `admin-${suffix}@example.invalid`,
      "Assign Admin",
      "administrator",
    );
    const tutor = await createUser(
      `tutor-${suffix}@example.invalid`,
      "Assign Tutor",
      "tutor",
    );
    const student = await createUser(
      `student-${suffix}@example.invalid`,
      "Assign Student",
      "student",
    );
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `People assign ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    courseId = course!.id;
    await db.insert(tutorProfilesTable).values({
      userId: tutor.id,
      email: tutor.email,
      name: tutor.displayName,
      title: "SAT Tutor",
      subjects: ["SAT"],
      active: true,
      bookingEligible: true,
    });
    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;

    adminServer = await startServer(administrator);
    const created = await postJson(
      adminServer.baseUrl,
      "/api/admin/tutor-assignments",
      {
        tutorUserId: tutor.id,
        studentUserId: student.id,
        courseId,
        subject: "SAT",
      },
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.body.tutorUserId, tutor.id);
    assert.equal(created.body.studentUserId, student.id);
    assert.equal(created.body.subject, "SAT");
    assert.equal(created.body.courseTitle, course!.title);
    assert.ok(created.body.id);

    const duplicate = await postJson(
      adminServer.baseUrl,
      "/api/admin/tutor-assignments",
      {
        tutorUserId: tutor.id,
        studentUserId: student.id,
        courseId,
        subject: "SAT",
      },
    );
    assert.equal(duplicate.response.status, 409);

    const curriculum = await getJson(
      adminServer.baseUrl,
      `/api/admin/curriculum?courseId=${courseId}`,
    );
    assert.equal(curriculum.response.status, 200);
    const client = curriculum.body.clients.find(
      (item: { id: string }) => item.id === student.id,
    );
    const listedTutor = curriculum.body.tutors.find(
      (item: { id: string }) => item.id === tutor.id,
    );
    assert.deepEqual(
      client.assignedTutors.map((link: { id: string; subject: string; assignmentId: string }) => ({
        id: link.id,
        subject: link.subject,
        assignmentId: link.assignmentId,
      })),
      [{ id: tutor.id, subject: "SAT", assignmentId: created.body.id }],
    );
    assert.deepEqual(
      listedTutor.assignedStudents.map(
        (link: { id: string; subject: string; assignmentId: string }) => ({
          id: link.id,
          subject: link.subject,
          assignmentId: link.assignmentId,
        }),
      ),
      [{ id: student.id, subject: "SAT", assignmentId: created.body.id }],
    );

    const removed = await fetch(
      `${adminServer.baseUrl}/api/admin/tutor-assignments/${created.body.id}`,
      { method: "DELETE" },
    );
    assert.equal(removed.status, 204);

    const afterDelete = await getJson(
      adminServer.baseUrl,
      `/api/admin/curriculum?courseId=${courseId}`,
    );
    const clientAfter = afterDelete.body.clients.find(
      (item: { id: string }) => item.id === student.id,
    );
    assert.deepEqual(clientAfter.assignedTutors, []);

    tutorServer = await startServer(tutor);
    const forbidden = await postJson(
      tutorServer.baseUrl,
      "/api/admin/tutor-assignments",
      {
        tutorUserId: tutor.id,
        studentUserId: student.id,
        courseId,
        subject: "SAT",
      },
    );
    assert.equal(forbidden.response.status, 403);
  } finally {
    await adminServer?.close();
    await tutorServer?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    const userIds = createdUsers.map((user) => user.id);
    if (courseId) {
      await db
        .delete(tutorAssignmentsTable)
        .where(eq(tutorAssignmentsTable.courseId, courseId));
      await db
        .delete(courseMembershipsTable)
        .where(eq(courseMembershipsTable.courseId, courseId));
    }
    if (userIds.length > 0) {
      await db
        .delete(tutorProfilesTable)
        .where(inArray(tutorProfilesTable.userId, userIds));
    }
    if (courseId) {
      await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
    }
    if (userIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    }
  }
});
