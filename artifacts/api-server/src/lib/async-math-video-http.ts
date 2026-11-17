import { Readable } from "node:stream";
import { db, usersTable, type AppUser } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, Router } from "express";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  asyncMathVideosFlagEnabled,
  deliveryDecision,
  MATH_VIDEO_MAX_QUESTIONS,
  MATH_VIDEO_MIN_QUESTIONS,
  MATH_VIDEO_RECOMMENDED_CREDITS,
  MATH_VIDEO_TURNAROUND_HOURS,
  MATH_VIDEO_TUTOR_NOTE_MAX,
  normalizeItems,
  parseGrantAmount,
  parseYouTubeUrl,
  requestFolderName,
  studentMayView,
  uploadFileDecision,
} from "./async-math-videos.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  adminCancelRequest,
  assignmentForStudent,
  balanceFor,
  cancelDraft,
  countFiles,
  defaultMathVideoTutorProfileId,
  deleteFileRow,
  enrollmentFor,
  enrollmentsForAdmin,
  ensureRequestFolder,
  grantCredits,
  loadFile,
  loadRequest,
  markDelivered,
  MathVideoError,
  openDraft,
  queueRequests,
  quizOptionsForStudent,
  recordFile,
  requestViews,
  saveDelivery,
  saveDraftItems,
  studentRequests,
  submitDraft,
  tutorHasEnrollments,
  tutorProfileIdsForUser,
  upsertEnrollment,
  type MathVideoRequestRow,
} from "./async-math-video-store.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { DriveRequestError, driveClient } from "./google-drive-uploads.ts";

type Authed = Request & { appUser?: AppUser; temporaryTutorAlias?: string };

/**
 * Mounted after requireAppUser. While ASYNC_MATH_VIDEOS_ENABLED is off, the
 * list endpoint answers { enabled: false } and every other route is a 404, so
 * nothing about the feature is visible to anyone.
 */
export function mountAsyncMathVideoRoutes(router: Router): void {
  const wrap =
    (handler: (req: Authed, res: Response) => Promise<void>) =>
    (req: Request, res: Response): void => {
      if (req.path !== "/math-videos" && !asyncMathVideosFlagEnabled()) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      handler(req as Authed, res).catch((error: unknown) => sendError(req as Authed, res, error));
    };
  router.get("/math-videos", wrap(overview));
  router.post("/math-videos/requests", wrap(startDraft));
  router.put("/math-videos/requests/:id/items", wrap(updateItems));
  router.post("/math-videos/requests/:id/files", wrap(uploadFile));
  router.get("/math-videos/requests/:id/files/:fileId", wrap(streamFile));
  router.delete("/math-videos/requests/:id/files/:fileId", wrap(removeFile));
  router.post("/math-videos/requests/:id/submit", wrap(submit));
  router.delete("/math-videos/requests/:id", wrap(discardDraft));
  router.get("/math-videos/requests/:id/quiz-options", wrap(quizOptions));
  router.put("/math-videos/requests/:id/delivery", wrap(updateDelivery));
  router.post("/math-videos/requests/:id/deliver", wrap(deliver));
  router.post("/math-videos/requests/:id/cancel", wrap(cancelByAdmin));
  router.put("/math-videos/enrollments", wrap(setEnrollment));
  router.post("/math-videos/credits", wrap(grant));
}

function sendError(req: Authed, res: Response, error: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof MathVideoError) {
    res.status(error.status).json({ code: error.code, error: error.message });
    return;
  }
  if (error instanceof DriveRequestError) {
    req.log?.warn({ err: error }, "math video drive request failed");
    const status = error.status === 413 || error.status === 400 ? error.status : 502;
    res.status(status).json({ code: "DRIVE_ERROR", error: "The photo could not be saved to Google Drive. Try again." });
    return;
  }
  req.log?.error({ err: error }, "math video request failed");
  res.status(500).json({ error: "Something went wrong. Try again." });
}

function param(req: Request, key: string): string {
  const value = (req.params as Record<string, string | undefined>)[key];
  return typeof value === "string" ? value : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUser(req: Authed): AppUser {
  if (!req.appUser) throw new MathVideoError(401, "AUTH", "Authentication required");
  return req.appUser;
}

function requireRole(user: AppUser, roles: AppUser["role"][]): void {
  if (!roles.includes(user.role)) throw new MathVideoError(403, "FORBIDDEN", "Insufficient permission");
}

/** Admin "view as tutor" alias sessions stay read-only here. */
function denyAliasWrite(req: Authed): void {
  if (req.temporaryTutorAlias) throw new MathVideoError(403, "VIEW_ONLY", "This view is read-only.");
}

async function loadForStudent(req: Authed): Promise<MathVideoRequestRow> {
  const user = requireUser(req);
  requireRole(user, ["student"]);
  denyAliasWrite(req);
  const id = param(req, "id");
  const request = UUID.test(id) ? await loadRequest(id) : null;
  if (!request || request.clientUserId !== user.id) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
  const enrollment = await enrollmentFor(user.id);
  if (!studentMayView(true, enrollment)) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
  return request;
}

async function loadForStaff(req: Authed): Promise<{ user: AppUser; request: MathVideoRequestRow }> {
  const user = requireUser(req);
  requireRole(user, ["tutor", "administrator"]);
  const id = param(req, "id");
  const request = UUID.test(id) ? await loadRequest(id) : null;
  if (!request || request.status === "draft") throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
  if (user.role === "tutor") {
    const profiles = await tutorProfileIdsForUser(user.id);
    if (!profiles.includes(request.tutorProfileId)) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
  }
  return { user, request };
}

/** Student owner, the assigned tutor, or an administrator. */
async function mayReadRequest(user: AppUser, request: MathVideoRequestRow): Promise<boolean> {
  if (user.role === "administrator") return true;
  if (user.role === "student") {
    if (request.clientUserId !== user.id) return false;
    return studentMayView(true, await enrollmentFor(user.id));
  }
  if (user.role === "tutor") {
    if (request.status === "draft") return false;
    return (await tutorProfileIdsForUser(user.id)).includes(request.tutorProfileId);
  }
  return false;
}

// ------------------------------------------------------------------ list

async function overview(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  const flag = asyncMathVideosFlagEnabled();
  if (!flag) {
    res.json({ enabled: false });
    return;
  }
  const now = new Date();
  const rules = {
    minQuestions: MATH_VIDEO_MIN_QUESTIONS,
    maxQuestions: MATH_VIDEO_MAX_QUESTIONS,
    recommendedCredits: MATH_VIDEO_RECOMMENDED_CREDITS,
    turnaroundHours: MATH_VIDEO_TURNAROUND_HOURS,
  };
  const uploadsConfigured = driveClient() !== null;
  if (user.role === "student") {
    const enrollment = await enrollmentFor(user.id);
    if (!studentMayView(flag, enrollment) || req.temporaryTutorAlias) {
      res.json({ enabled: false });
      return;
    }
    const rows = await studentRequests(user.id);
    const views = await requestViews(rows, "student", now);
    res.json({
      enabled: true,
      audience: "student",
      rules,
      uploadsConfigured,
      credits: await balanceFor(user.id),
      draft: views.find((view) => view.status === "draft") ?? null,
      requests: views.filter((view) => view.status !== "draft"),
    });
    return;
  }
  if (user.role === "tutor") {
    const profiles = await tutorProfileIdsForUser(user.id);
    const rows = await queueRequests(profiles);
    if (rows.length === 0 && !(await tutorHasEnrollments(profiles))) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, audience: "tutor", rules, requests: await requestViews(rows, "tutor", now) });
    return;
  }
  if (user.role === "administrator") {
    const rows = await queueRequests(null);
    res.json({
      enabled: true,
      audience: "admin",
      rules,
      uploadsConfigured,
      enrollments: await enrollmentsForAdmin(),
      requests: await requestViews(rows, "admin", now),
    });
    return;
  }
  res.json({ enabled: false });
}

// ------------------------------------------------------------------ student

async function startDraft(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  requireRole(user, ["student"]);
  denyAliasWrite(req);
  const enrollment = await enrollmentFor(user.id);
  if (!studentMayView(true, enrollment)) throw new MathVideoError(404, "NOT_FOUND", "Not found");
  const draft = await openDraft(user.id, enrollment!.tutorProfileId);
  const [view] = await requestViews([draft], "student", new Date());
  res.status(201).json(view);
}

async function updateItems(req: Authed, res: Response): Promise<void> {
  const request = await loadForStudent(req);
  if (request.status !== "draft") throw new MathVideoError(409, "NOT_DRAFT", "This request was already submitted.");
  const parsed = normalizeItems((req.body as { items?: unknown } | undefined)?.items);
  if (!parsed.ok) throw new MathVideoError(400, "ITEMS", parsed.error);
  await saveDraftItems(request.id, parsed.items);
  const [view] = await requestViews([{ ...request, items: parsed.items }], "student", new Date());
  res.json(view);
}

/**
 * Streams one photo/PDF straight from the request into Google Drive. The body
 * is never buffered whole or written to disk. Send one file per request with
 * its own Content-Type and Content-Length; the browser uploads several in
 * parallel.
 */
async function uploadFile(req: Authed, res: Response): Promise<void> {
  const request = await loadForStudent(req);
  if (request.status !== "draft") throw new MathVideoError(409, "NOT_DRAFT", "This request was already submitted.");
  const client = driveClient();
  if (!client) {
    throw new MathVideoError(
      503,
      "UPLOADS_NOT_CONFIGURED",
      "Photo uploads are not set up yet. Describe the question in the text box for now.",
    );
  }
  const decision = uploadFileDecision({
    contentType: req.header("content-type"),
    contentLength: req.header("content-length"),
    filename: typeof req.query.filename === "string" ? req.query.filename : "",
    itemIndex: Number(req.query.item),
    existingFiles: await countFiles(request.id),
  });
  if (!decision.ok) {
    req.resume();
    throw new MathVideoError(decision.status, "UPLOAD_REJECTED", decision.error);
  }
  const folderId = await ensureRequestFolder(request.id, async (row, clientName) => {
    const root = await client.ensureRootFolder();
    const folder = await client.createFolder(
      requestFolderName({ createdAt: row.createdAt, clientName, requestId: row.id }),
      root,
      { aaMathVideoRequestId: row.id },
    );
    return folder.id;
  });
  const uploaded = await client.uploadStream({
    name: `Q${Number(req.query.item) + 1} - ${decision.filename}`,
    parentId: folderId,
    mimeType: decision.mimeType,
    bytes: decision.bytes,
    body: Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>,
    appProperties: { aaMathVideoRequestId: request.id },
  });
  const file = await recordFile({
    requestId: request.id,
    itemIndex: Number(req.query.item),
    driveFileId: uploaded.id,
    driveWebViewLink: uploaded.webViewLink,
    filename: decision.filename,
    mimeType: decision.mimeType,
    bytes: decision.bytes,
    uploadedByUserId: request.clientUserId,
  });
  res.status(201).json({
    id: file.id,
    itemIndex: file.itemIndex,
    filename: file.filename,
    mimeType: file.mimeType,
    bytes: file.bytes,
    contentUrl: `/api/math-videos/requests/${request.id}/files/${file.id}`,
  });
}

async function streamFile(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  const id = param(req, "id");
  const fileId = param(req, "fileId");
  const request = UUID.test(id) ? await loadRequest(id) : null;
  if (!request || !(await mayReadRequest(user, request))) throw new MathVideoError(404, "NOT_FOUND", "File not found.");
  const file = UUID.test(fileId) ? await loadFile(request.id, fileId) : null;
  if (!file) throw new MathVideoError(404, "NOT_FOUND", "File not found.");
  const client = driveClient();
  if (!client) throw new MathVideoError(503, "UPLOADS_NOT_CONFIGURED", "Google Drive is not connected.");
  const upstream = await client.download(file.driveFileId);
  res.setHeader("content-type", file.mimeType);
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("content-disposition", `inline; filename="${file.filename.replace(/["\r\n]/g, "")}"`);
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("content-length", length);
  if (!upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body as unknown as import("node:stream/web").ReadableStream).pipe(res);
}

async function removeFile(req: Authed, res: Response): Promise<void> {
  const request = await loadForStudent(req);
  if (request.status !== "draft") throw new MathVideoError(409, "NOT_DRAFT", "Submitted photos cannot be removed.");
  const fileId = param(req, "fileId");
  const file = UUID.test(fileId) ? await loadFile(request.id, fileId) : null;
  if (!file) throw new MathVideoError(404, "NOT_FOUND", "File not found.");
  await deleteFileRow(file.id);
  const client = driveClient();
  if (client) {
    await client.trash(file.driveFileId).catch((error: unknown) => {
      req.log?.warn({ err: error }, "math video drive trash failed; row already removed");
    });
  }
  res.status(204).end();
}

async function submit(req: Authed, res: Response): Promise<void> {
  const request = await loadForStudent(req);
  const parsed = normalizeItems((req.body as { items?: unknown } | undefined)?.items ?? request.items);
  if (!parsed.ok) throw new MathVideoError(400, "ITEMS", parsed.error);
  const updated = await submitDraft({
    requestId: request.id,
    clientUserId: request.clientUserId,
    items: parsed.items,
    now: new Date(),
  });
  const [view] = await requestViews([updated], "student", new Date());
  res.json({ request: view, credits: await balanceFor(request.clientUserId) });
}

async function discardDraft(req: Authed, res: Response): Promise<void> {
  const request = await loadForStudent(req);
  if (!(await cancelDraft(request.id, request.clientUserId, new Date()))) {
    throw new MathVideoError(409, "NOT_DRAFT", "Only an unsent request can be discarded.");
  }
  res.status(204).end();
}

// ------------------------------------------------------------------ tutor/admin

async function quizOptions(req: Authed, res: Response): Promise<void> {
  const { request } = await loadForStaff(req);
  const rows = await quizOptionsForStudent(request.clientUserId);
  res.json({
    quizzes: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  });
}

async function updateDelivery(req: Authed, res: Response): Promise<void> {
  const { request } = await loadForStaff(req);
  denyAliasWrite(req);
  if (request.status !== "submitted" && request.status !== "delivered") {
    throw new MathVideoError(409, "NOT_OPEN", "This request is not open.");
  }
  const body = (req.body ?? {}) as { youtubeUrl?: unknown; followUpAssignmentId?: unknown; tutorNote?: unknown };
  const patch: Parameters<typeof saveDelivery>[1] = {};
  if (body.youtubeUrl !== undefined) {
    if (body.youtubeUrl === null || body.youtubeUrl === "") {
      if (request.status === "delivered") throw new MathVideoError(400, "VIDEO_REQUIRED", "A delivered request needs its video.");
      patch.youtubeVideoId = null;
      patch.youtubeUrl = null;
    } else {
      const parsed = parseYouTubeUrl(String(body.youtubeUrl));
      if (!parsed.ok) throw new MathVideoError(400, "YOUTUBE", parsed.error);
      patch.youtubeVideoId = parsed.videoId;
      patch.youtubeUrl = parsed.url;
    }
  }
  if (body.followUpAssignmentId !== undefined) {
    if (body.followUpAssignmentId === null || body.followUpAssignmentId === "") {
      patch.followUpAssignmentId = null;
    } else {
      const assignmentId = String(body.followUpAssignmentId);
      const assignment = UUID.test(assignmentId) ? await assignmentForStudent(assignmentId, request.clientUserId) : null;
      if (!assignment) throw new MathVideoError(400, "QUIZ", "Choose a quiz assigned to this student.");
      patch.followUpAssignmentId = assignment.id;
    }
  }
  if (body.tutorNote !== undefined) {
    const note = typeof body.tutorNote === "string" ? body.tutorNote.trim() : "";
    if (note.length > MATH_VIDEO_TUTOR_NOTE_MAX) throw new MathVideoError(400, "NOTE", "Keep the note shorter.");
    patch.tutorNote = note || null;
  }
  const updated = await saveDelivery(request.id, patch);
  if (!updated) throw new MathVideoError(409, "NOT_OPEN", "This request is not open.");
  const [view] = await requestViews([updated], req.appUser!.role === "administrator" ? "admin" : "tutor", new Date());
  res.json(view);
}

async function deliver(req: Authed, res: Response): Promise<void> {
  const { request, user } = await loadForStaff(req);
  denyAliasWrite(req);
  const decision = deliveryDecision(request);
  if (!decision.ok) throw new MathVideoError(decision.status, "DELIVERY", decision.error);
  const updated = await markDelivered(request.id, new Date());
  if (!updated) throw new MathVideoError(409, "DELIVERY", "This request is already delivered.");
  const [view] = await requestViews([updated], user.role === "administrator" ? "admin" : "tutor", new Date());
  res.json(view);
}

async function cancelByAdmin(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  requireRole(user, ["administrator"]);
  const id = param(req, "id");
  if (!UUID.test(id)) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
  const updated = await adminCancelRequest(id, user.id, new Date());
  res.json({ id: updated.id, status: updated.status, credits: await balanceFor(updated.clientUserId) });
}

async function resolveStudent(body: { clientUserId?: unknown; email?: unknown }): Promise<AppUser> {
  const clientUserId = typeof body.clientUserId === "string" ? body.clientUserId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  let row: AppUser | undefined;
  if (clientUserId && UUID.test(clientUserId)) {
    [row] = await db.select().from(usersTable).where(eq(usersTable.id, clientUserId)).limit(1);
  } else if (email) {
    [row] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  }
  if (!row || row.role !== "student") throw new MathVideoError(404, "STUDENT", "No student account matches.");
  return row;
}

async function setEnrollment(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  requireRole(user, ["administrator"]);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const student = await resolveStudent(body);
  const existing = await enrollmentFor(student.id);
  const requestedTutor =
    typeof body.tutorProfileId === "string" && UUID.test(body.tutorProfileId) ? body.tutorProfileId : null;
  const tutorProfileId: string | null =
    requestedTutor ?? existing?.tutorProfileId ?? (await defaultMathVideoTutorProfileId());
  if (!tutorProfileId) throw new MathVideoError(400, "TUTOR", "Choose the tutor who records the videos.");
  const row = await upsertEnrollment({
    clientUserId: student.id,
    tutorProfileId,
    enabled: body.enabled === true,
    adminUserId: user.id,
  });
  res.json({
    clientUserId: row.clientUserId,
    tutorProfileId: row.tutorProfileId,
    enabled: row.enabled,
  });
}

async function grant(req: Authed, res: Response): Promise<void> {
  const user = requireUser(req);
  requireRole(user, ["administrator"]);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const student = await resolveStudent(body);
  const amount = parseGrantAmount(body.credits);
  if (!amount.ok) throw new MathVideoError(400, "CREDITS", amount.error);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const balance = await grantCredits({ clientUserId: student.id, credits: amount.credits, note, adminUserId: user.id });
  res.json({ clientUserId: student.id, credits: balance });
}

