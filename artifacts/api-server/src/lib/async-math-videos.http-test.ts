import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  adminNotificationsTable,
  assignmentsTable,
  db,
  mathVideoCreditEntriesTable,
  mathVideoEnrollmentsTable,
  mathVideoRequestFilesTable,
  mathVideoRequestsTable,
  sessionArtifactsTable,
  tutorProfilesTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import { createDashboardRoleFixture } from "./dashboard-fixtures";
import { setDriveClientForTests, type DriveClient } from "./google-drive-uploads";
import platformRouter from "../routes/platform";

function testAuthMiddleware(user: AppUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: { userId: user.clerkUserId, email: user.email, name: user.displayName },
        sessionId: `math-video-http-test:${user.id}`,
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    async json(path: string, method = "GET", body?: unknown) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: (text ? JSON.parse(text) : null) as Record<string, any> };
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": contentType },
        body: bytes,
      });
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

/** In-memory Drive. Records what was streamed so the test can prove bytes reached Drive. */
function fakeDrive() {
  const files = new Map<string, { name: string; parentId: string; mimeType: string; bytes: Uint8Array }>();
  const folders: { id: string; name: string; parentId: string }[] = [];
  const trashed: string[] = [];
  let next = 0;
  const client: DriveClient = {
    async ensureRootFolder() {
      return "ROOT";
    },
    async createFolder(name, parentId) {
      const id = `FOLDER${++next}`;
      folders.push({ id, name, parentId });
      return { id, webViewLink: `https://drive.google.com/drive/folders/${id}` };
    },
    async uploadStream(input) {
      const bytes = new Uint8Array(await new Response(input.body).arrayBuffer());
      assert.equal(bytes.byteLength, input.bytes);
      const id = `FILE${++next}`;
      files.set(id, { name: input.name, parentId: input.parentId, mimeType: input.mimeType, bytes });
      return { id, webViewLink: `https://drive.google.com/file/d/${id}/view` };
    },
    async download(fileId) {
      const file = files.get(fileId);
      if (!file) return new Response("missing", { status: 404 });
      return new Response(file.bytes, { headers: { "content-length": String(file.bytes.byteLength) } });
    },
    async trash(fileId) {
      trashed.push(fileId);
    },
  };
  return { client, files, folders, trashed };
}

const envKeys = [
  "ACCEPTED_ADMIN_CLERK_USER_IDS",
  "ACCEPTED_TUTOR_CLERK_USER_IDS",
  "ACCEPTED_STUDENT_CLERK_USER_IDS",
  "ACCEPTED_VIEWER_CLERK_USER_IDS",
  "ASYNC_MATH_VIDEOS_ENABLED",
] as const;

test("async SAT Math video requests: flag, enrollment, credits, Drive uploads, 48h queue, delivery, refunds", async () => {
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const fixture = await createDashboardRoleFixture();
  process.env.ACCEPTED_ADMIN_CLERK_USER_IDS = fixture.administrator.clerkUserId;
  process.env.ACCEPTED_TUTOR_CLERK_USER_IDS = [fixture.satTutor.clerkUserId, fixture.englishTutor.clerkUserId].join(",");
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [fixture.student.clerkUserId, fixture.otherStudent.clerkUserId].join(",");
  process.env.ACCEPTED_VIEWER_CLERK_USER_IDS = fixture.viewer.clerkUserId;
  delete process.env.ASYNC_MATH_VIDEOS_ENABLED;

  const [satProfile] = await db
    .select({ id: tutorProfilesTable.id })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, fixture.satTutor.id));
  const [quiz] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      assignedStudentUserId: fixture.student.id,
      assignedTutorUserId: fixture.satTutor.id,
      deliveryPhase: "after_session",
      title: "Follow-up: systems of equations",
      subject: "SAT",
      instructions: "Practice after the video.",
      status: "draft",
      timeLimitMinutes: 20,
    })
    .returning();
  const [otherQuiz] = await db
    .insert(assignmentsTable)
    .values({
      courseId: fixture.courseId,
      assignedStudentUserId: fixture.otherStudent.id,
      deliveryPhase: "after_session",
      title: "Someone else's quiz",
      subject: "SAT",
      instructions: "x",
      status: "published",
      timeLimitMinutes: 20,
    })
    .returning();

  const student = await startServer(fixture.student);
  const otherStudent = await startServer(fixture.otherStudent);
  const admin = await startServer(fixture.administrator);
  const tutor = await startServer(fixture.satTutor);
  const otherTutor = await startServer(fixture.englishTutor);
  const viewer = await startServer(fixture.viewer);
  const drive = fakeDrive();
  try {
    // ---- Flag off: nothing is visible and every action 404s.
    assert.deepEqual((await student.json("/api/math-videos")).body, { enabled: false });
    assert.deepEqual((await admin.json("/api/math-videos")).body, { enabled: false });
    assert.equal((await student.json("/api/math-videos/requests", "POST")).status, 404);
    assert.equal(
      (await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: 15 })).status,
      404,
    );

    process.env.ASYNC_MATH_VIDEOS_ENABLED = "1";

    // ---- Flag on but the student is not enrolled.
    assert.deepEqual((await student.json("/api/math-videos")).body, { enabled: false });
    assert.equal((await student.json("/api/math-videos/requests", "POST")).status, 404);
    assert.deepEqual((await tutor.json("/api/math-videos")).body, { enabled: false });
    assert.deepEqual((await viewer.json("/api/math-videos")).body, { enabled: false });

    // ---- Admin-only setup. Enrolling defaults to hidden.
    assert.equal((await student.json("/api/math-videos/enrollments", "PUT", { clientUserId: fixture.student.id, enabled: true })).status, 403);
    assert.equal((await tutor.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: 15 })).status, 403);
    const enrolled = await admin.json("/api/math-videos/enrollments", "PUT", {
      email: fixture.student.email,
      tutorProfileId: satProfile!.id,
    });
    assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
    assert.equal(enrolled.body.enabled, false);
    assert.equal(enrolled.body.offerEndsAt, "2026-12-06T05:00:00.000Z");
    assert.deepEqual((await student.json("/api/math-videos")).body, { enabled: false }, "hidden until enabled");

    const granted = await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: 15, note: "Paid" });
    assert.equal(granted.status, 200);
    assert.equal(granted.body.credits, 15);
    assert.equal((await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: 0 })).status, 400);
    assert.equal((await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: -16 })).status, 400);

    // Pretend the offer is still open regardless of today's date.
    await admin.json("/api/math-videos/enrollments", "PUT", {
      clientUserId: fixture.student.id,
      enabled: true,
      offerEndsAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    });

    let overview = await student.json("/api/math-videos");
    assert.equal(overview.body.enabled, true);
    assert.equal(overview.body.credits, 15);
    assert.equal(overview.body.offer.open, true);
    assert.equal(overview.body.rules.minQuestions, 3);
    assert.equal(overview.body.rules.maxQuestions, 10);
    assert.equal(overview.body.uploadsConfigured, false);
    assert.equal(overview.body.draft, null);
    assert.deepEqual((await otherStudent.json("/api/math-videos")).body, { enabled: false });

    // ---- Draft. Opening twice returns the same draft.
    const draft = await student.json("/api/math-videos/requests", "POST");
    assert.equal(draft.status, 201);
    assert.equal(draft.body.items.length, 3);
    const again = await student.json("/api/math-videos/requests", "POST");
    assert.equal(again.body.id, draft.body.id);
    const requestId = draft.body.id as string;

    // Drive unset: upload fails gracefully with a clear message.
    setDriveClientForTests(null);
    const noDrive = await student.upload(`/api/math-videos/requests/${requestId}/files?item=0&filename=a.jpg`, new Uint8Array([1, 2, 3]), "image/jpeg");
    assert.equal(noDrive.status, 503);
    assert.equal(noDrive.body.code, "UPLOADS_NOT_CONFIGURED");

    setDriveClientForTests(drive.client);
    overview = await student.json("/api/math-videos");
    assert.equal(overview.body.uploadsConfigured, true);

    const bad = await student.upload(`/api/math-videos/requests/${requestId}/files?item=0&filename=x.svg`, new Uint8Array([1]), "image/svg+xml");
    assert.equal(bad.status, 415);
    assert.equal((await otherStudent.upload(`/api/math-videos/requests/${requestId}/files?item=0&filename=a.jpg`, new Uint8Array([1]), "image/jpeg")).status, 404);

    const photo = new Uint8Array(Array.from({ length: 4096 }, (_, index) => index % 251));
    const up1 = await student.upload(`/api/math-videos/requests/${requestId}/files?item=0&filename=IMG_1.jpg`, photo, "image/jpeg");
    assert.equal(up1.status, 201, JSON.stringify(up1.body));
    const up2 = await student.upload(`/api/math-videos/requests/${requestId}/files?item=1&filename=page.pdf`, new Uint8Array([37, 80, 68, 70]), "application/pdf");
    assert.equal(up2.status, 201);
    const up3 = await student.upload(`/api/math-videos/requests/${requestId}/files?item=1&filename=extra.png`, new Uint8Array([9, 9]), "image/png");
    assert.equal(up3.status, 201);
    assert.equal(drive.folders.length, 1, "one Drive subfolder per request");
    assert.equal(drive.folders[0]!.parentId, "ROOT");
    assert.equal(drive.files.size, 3);
    assert.deepEqual([...drive.files.values()][0]!.bytes, photo, "bytes streamed to Drive intact");
    const [stored] = await db.select().from(mathVideoRequestFilesTable).where(eq(mathVideoRequestFilesTable.id, up1.body.id));
    assert.match(stored!.driveFileId, /^FILE/);
    assert.equal(stored!.bytes, 4096);

    // Remove a photo: row goes, Drive file is trashed.
    const removed = await fetch(`${student.baseUrl}/api/math-videos/requests/${requestId}/files/${up3.body.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    assert.equal(drive.trashed.length, 1);

    // Student can see their own photo through the proxy.
    const own = await fetch(`${student.baseUrl}${up1.body.contentUrl}`);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(new Uint8Array(await own.arrayBuffer()), photo);
    // Tutors cannot see drafts.
    assert.equal((await fetch(`${tutor.baseUrl}${up1.body.contentUrl}`)).status, 404);

    // ---- Submit rules.
    const tooFew = await student.json(`/api/math-videos/requests/${requestId}/submit`, "POST", {
      items: [{ text: "" }, { text: "" }],
    });
    assert.equal(tooFew.status, 400);
    const blank = await student.json(`/api/math-videos/requests/${requestId}/submit`, "POST", {
      items: [{ text: "" }, { text: "" }, { text: "" }],
    });
    assert.equal(blank.status, 400);
    assert.match(blank.body.error, /Question 3/);

    const submitted = await student.json(`/api/math-videos/requests/${requestId}/submit`, "POST", {
      items: [{ text: "Practice test 4, Q18" }, { text: "" }, { text: "Why does completing the square work?" }],
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.credits, 12);
    assert.equal(submitted.body.request.status, "submitted");
    const dueMs = Date.parse(submitted.body.request.dueAt) - Date.parse(submitted.body.request.submittedAt);
    assert.equal(dueMs, 48 * 3600_000);
    assert.equal(submitted.body.request.video, null);

    const retry = await student.json(`/api/math-videos/requests/${requestId}/submit`, "POST", {
      items: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
    assert.equal(retry.status, 409, "no double charge");
    const debits = await db
      .select()
      .from(mathVideoCreditEntriesTable)
      .where(and(eq(mathVideoCreditEntriesTable.requestId, requestId), eq(mathVideoCreditEntriesTable.kind, "debit")));
    assert.equal(debits.length, 1);
    assert.equal(debits[0]!.delta, -3);

    const notes = await db
      .select()
      .from(adminNotificationsTable)
      .where(and(eq(adminNotificationsTable.recipientUserId, fixture.administrator.id), eq(adminNotificationsTable.kind, "math_video_request")));
    assert.equal(notes.length, 1);
    assert.match(notes[0]!.message, /submitted 3 SAT Math questions/);

    // ---- Tutor queue: only the assigned tutor sees it.
    const queue = await tutor.json("/api/math-videos");
    assert.equal(queue.body.enabled, true);
    assert.equal(queue.body.requests.length, 1);
    assert.equal(queue.body.requests[0].clientName, fixture.student.displayName);
    assert.equal(queue.body.requests[0].overdue, false);
    assert.equal(queue.body.requests[0].clientEmail, undefined, "tutors do not get the student email");
    assert.equal(queue.body.requests[0].items[0].files[0].driveWebViewLink, undefined);
    assert.equal((await fetch(`${tutor.baseUrl}${up1.body.contentUrl}`)).status, 200);
    assert.deepEqual((await otherTutor.json("/api/math-videos")).body, { enabled: false });
    assert.equal((await fetch(`${otherTutor.baseUrl}${up1.body.contentUrl}`)).status, 404);
    assert.equal((await otherTutor.json(`/api/math-videos/requests/${requestId}/deliver`, "POST")).status, 404);

    const adminView = await admin.json("/api/math-videos");
    assert.equal(adminView.body.enrollments.length >= 1, true);
    const adminRow = adminView.body.requests.find((row: { id: string }) => row.id === requestId);
    assert.match(adminRow.driveFolderUrl, /drive\.google\.com\/drive\/folders\/FOLDER/);
    assert.match(adminRow.items[0].files[0].driveWebViewLink, /drive\.google\.com\/file/);

    // ---- Delivery.
    assert.equal((await tutor.json(`/api/math-videos/requests/${requestId}/deliver`, "POST")).status, 400);
    assert.equal(
      (await tutor.json(`/api/math-videos/requests/${requestId}/delivery`, "PUT", { youtubeUrl: "https://vimeo.com/123" })).status,
      400,
    );
    assert.equal(
      (await tutor.json(`/api/math-videos/requests/${requestId}/delivery`, "PUT", { followUpAssignmentId: otherQuiz!.id })).status,
      400,
      "quiz must belong to this student",
    );
    const options = await tutor.json(`/api/math-videos/requests/${requestId}/quiz-options`);
    assert.deepEqual(options.body.quizzes.map((row: { id: string }) => row.id), [quiz!.id]);
    const saved = await tutor.json(`/api/math-videos/requests/${requestId}/delivery`, "PUT", {
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?si=xyz",
      followUpAssignmentId: quiz!.id,
      tutorNote: "Watch Q2 twice.",
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.video.videoId, "dQw4w9WgXcQ");
    assert.equal(saved.body.video.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    // Student sees nothing of the delivery until it is marked delivered.
    let mine = (await student.json("/api/math-videos")).body.requests[0];
    assert.equal(mine.video, null);
    assert.equal(mine.followUpQuiz, null);

    const unpublished = await tutor.json(`/api/math-videos/requests/${requestId}/deliver`, "POST");
    assert.equal(unpublished.status, 400);
    assert.match(unpublished.body.error, /Publish/);
    await db.update(assignmentsTable).set({ status: "published" }).where(eq(assignmentsTable.id, quiz!.id));
    const delivered = await tutor.json(`/api/math-videos/requests/${requestId}/deliver`, "POST");
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    assert.equal(delivered.body.status, "delivered");

    mine = (await student.json("/api/math-videos")).body.requests[0];
    assert.equal(mine.status, "delivered");
    assert.equal(mine.video.embedUrl.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), true);
    assert.equal(mine.followUpQuiz.href, `/portal/assignments/${quiz!.id}`);
    assert.equal(mine.tutorNote, "Watch Q2 twice.");
    assert.equal((await admin.json(`/api/math-videos/requests/${requestId}/cancel`, "POST")).status, 409);

    // ---- A second request cancelled by admin is refunded exactly once.
    const second = await student.json("/api/math-videos/requests", "POST");
    const secondId = second.body.id as string;
    assert.notEqual(secondId, requestId);
    await student.json(`/api/math-videos/requests/${secondId}/items`, "PUT", {
      items: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }],
    });
    const sentSecond = await student.json(`/api/math-videos/requests/${secondId}/submit`, "POST");
    assert.equal(sentSecond.status, 200, JSON.stringify(sentSecond.body));
    assert.equal(sentSecond.body.credits, 8);
    assert.equal((await tutor.json(`/api/math-videos/requests/${secondId}/cancel`, "POST")).status, 403);
    const cancelled = await admin.json(`/api/math-videos/requests/${secondId}/cancel`, "POST");
    assert.equal(cancelled.body.credits, 12);
    const cancelledAgain = await admin.json(`/api/math-videos/requests/${secondId}/cancel`, "POST");
    assert.equal(cancelledAgain.body.credits, 12, "refund only once");

    // ---- Not enough credits.
    await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: -10 });
    const third = await student.json("/api/math-videos/requests", "POST");
    const short = await student.json(`/api/math-videos/requests/${third.body.id}/submit`, "POST", {
      items: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
    assert.equal(short.status, 402);
    assert.match(short.body.error, /needs 3 question credits and you have 2/);

    // ---- Offer closed: no new drafts or submissions, history stays visible.
    await db
      .update(mathVideoEnrollmentsTable)
      .set({ offerEndsAt: new Date(Date.now() - 1000) })
      .where(eq(mathVideoEnrollmentsTable.clientUserId, fixture.student.id));
    await admin.json("/api/math-videos/credits", "POST", { clientUserId: fixture.student.id, credits: 5 });
    const late = await student.json(`/api/math-videos/requests/${third.body.id}/submit`, "POST", {
      items: [{ text: "a" }, { text: "b" }, { text: "c" }],
    });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, "OFFER_CLOSED");
    overview = await student.json("/api/math-videos");
    assert.equal(overview.body.offer.open, false);
    assert.equal(overview.body.requests.some((row: { id: string }) => row.id === requestId), true);

    // ---- Hiding the student hides everything again.
    await admin.json("/api/math-videos/enrollments", "PUT", { clientUserId: fixture.student.id, enabled: false });
    assert.deepEqual((await student.json("/api/math-videos")).body, { enabled: false });
    assert.equal((await fetch(`${student.baseUrl}${up1.body.contentUrl}`)).status, 404);
  } finally {
    setDriveClientForTests(undefined);
    await Promise.all([student, otherStudent, admin, tutor, otherTutor, viewer].map((server) => server.close()));
    const requestRows = await db
      .select({ id: mathVideoRequestsTable.id })
      .from(mathVideoRequestsTable)
      .where(eq(mathVideoRequestsTable.clientUserId, fixture.student.id));
    const ids = requestRows.map((row) => row.id);
    await db.delete(mathVideoCreditEntriesTable).where(inArray(mathVideoCreditEntriesTable.clientUserId, [fixture.student.id]));
    if (ids.length) await db.delete(mathVideoRequestFilesTable).where(inArray(mathVideoRequestFilesTable.requestId, ids));
    await db.delete(mathVideoRequestsTable).where(eq(mathVideoRequestsTable.clientUserId, fixture.student.id));
    await db.delete(mathVideoEnrollmentsTable).where(eq(mathVideoEnrollmentsTable.clientUserId, fixture.student.id));
    await db.delete(adminNotificationsTable).where(eq(adminNotificationsTable.recipientUserId, fixture.administrator.id));
    await db.delete(assignmentsTable).where(inArray(assignmentsTable.id, [quiz!.id, otherQuiz!.id]));
    // Startup jobs may write session artifacts for fixture users.
    await db.delete(sessionArtifactsTable).where(
      inArray(sessionArtifactsTable.createdBy, [
        fixture.administrator.id,
        fixture.satTutor.id,
        fixture.englishTutor.id,
        fixture.student.id,
        fixture.otherStudent.id,
        fixture.viewer.id,
      ]),
    );
    await fixture.cleanup();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
