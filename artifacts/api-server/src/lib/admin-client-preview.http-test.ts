import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  courseMembershipsTable,
  coursesTable,
  db,
  loginActivityTable,
  tutorAssignmentsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
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
        sessionId: `admin-client-preview-http-test:${user.id}`,
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

test("client preview books the assigned SAT tutor and lists the active catalog", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for administrator client preview HTTP coverage");
    return;
  }

  const suffix = randomUUID();
  const previousAdminIds = process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
  const createdUsers: AppUser[] = [];
  let courseId = "";
  let administratorServer: Awaited<ReturnType<typeof startServer>> | undefined;

  const createUser = async (
    email: string,
    displayName: string,
    role: AppUser["role"],
  ) => {
    const [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: `preview-http:${email}`,
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
      `preview-admin-${suffix}@example.invalid`,
      "Preview Admin",
      "administrator",
    );
    const michelle = await createUser(
      `michelle-${suffix}@example.invalid`,
      "Michelle Makarem",
      "student",
    );
    const eunice = await createUser(
      `eunice-unassigned-${suffix}@example.invalid`,
      "Eunice Chon",
      "tutor",
    );
    const xavier = await createUser(
      `xavier-assigned-${suffix}@example.invalid`,
      "Xavier Morales",
      "tutor",
    );
    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Preview SAT ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    courseId = course!.id;
    await db.insert(courseMembershipsTable).values([
      { courseId, userId: michelle.id, membershipRole: "student", subject: "SAT" },
      { courseId, userId: xavier.id, membershipRole: "tutor", subject: "SAT" },
      { courseId, userId: eunice.id, membershipRole: "tutor", subject: "SAT" },
    ]);
    await db.insert(tutorProfilesTable).values([
      {
        userId: eunice.id,
        email: eunice.email,
        name: "Eunice Chon",
        title: "SAT Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
        calendarStatus: "disconnected",
      },
      {
        userId: xavier.id,
        email: xavier.email,
        name: "Xavier Morales",
        title: "SAT Tutor",
        subjects: ["SAT"],
        active: true,
        bookingEligible: true,
        calendarStatus: "connected",
      },
    ]);
    await db.insert(tutorAssignmentsTable).values({
      courseId,
      tutorUserId: xavier.id,
      studentUserId: michelle.id,
      subject: "SAT",
    });

    process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = administrator.clerkUserId;
    administratorServer = await startServer(administrator);
    const preview = await fetch(
      `${administratorServer.baseUrl}/api/admin/clients/${michelle.id}/dashboard`,
    );
    assert.equal(preview.status, 200);
    const body = (await preview.json()) as {
      previewBooking: {
        calendarStatus: string;
        availability: { tutor: { name: string }; providerStatus: string } | null;
      };
      previewOffer: { name: string; priceCents: number };
      previewOffers: Array<{ slug?: string; name: string; priceCents: number }>;
    };

    assert.ok(body.previewBooking.availability);
    assert.equal(body.previewBooking.availability.tutor.name, "Xavier Morales");
    assert.notEqual(body.previewBooking.availability.tutor.name, "Eunice Chon");
    assert.equal(
      ["connected", "disconnected", "unavailable"].includes(
        body.previewBooking.calendarStatus,
      ),
      true,
    );
    assert.equal(
      body.previewOffers.some(
        (offer) =>
          offer.slug === "single-sat-session" || offer.name === "Single SAT Session",
      ),
      true,
    );
    assert.equal(
      body.previewOffers.some(
        (offer) =>
          offer.slug === "ten-sat-session-package" ||
          offer.name === "Ten SAT Session Package",
      ),
      true,
    );
    assert.equal(body.previewOffer.name, "Single SAT Session");
    assert.equal(body.previewOffer.priceCents, 13_000);
    assert.equal(
      body.previewOffers.some((offer) => offer.priceCents === 130_000),
      true,
    );
  } finally {
    await administratorServer?.close();
    if (previousAdminIds === undefined) {
      delete process.env.ACCEPTED_ADMIN_CLERK_USER_IDS;
    } else {
      process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = previousAdminIds;
    }
    const userIds = createdUsers.map((user) => user.id);
    if (userIds.length > 0) {
      await db
        .delete(loginActivityTable)
        .where(inArray(loginActivityTable.userId, userIds));
      await db
        .delete(tutorAssignmentsTable)
        .where(
          or(
            eq(tutorAssignmentsTable.courseId, courseId),
            inArray(tutorAssignmentsTable.studentUserId, userIds),
            inArray(tutorAssignmentsTable.tutorUserId, userIds),
          ),
        );
      await db
        .delete(courseMembershipsTable)
        .where(
          or(
            eq(courseMembershipsTable.courseId, courseId),
            inArray(courseMembershipsTable.userId, userIds),
          ),
        );
      if (courseId) {
        await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
      }
      await db
        .delete(tutorProfilesTable)
        .where(inArray(tutorProfilesTable.userId, userIds));
      await db.delete(usersTable).where(inArray(usersTable.id, userIds));
    }
  }
});
