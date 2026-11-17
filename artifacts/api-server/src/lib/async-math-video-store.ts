import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  adminNotificationsTable,
  assignmentsTable,
  db,
  mathVideoCreditEntriesTable,
  mathVideoEnrollmentsTable,
  mathVideoRequestFilesTable,
  mathVideoRequestsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  checkSubmission,
  creditBalance,
  dueAtForSubmission,
  isOverdue,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  type DraftItem,
} from "./async-math-videos.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { xavierEmailSpellings, CANONICAL_XAVIER_EMAIL } from "./xavier-identity.ts";

type Query = typeof db;
type Tx = Parameters<Parameters<Query["transaction"]>[0]>[0];
export type MathVideoRequestRow = typeof mathVideoRequestsTable.$inferSelect;
export type MathVideoFileRow = typeof mathVideoRequestFilesTable.$inferSelect;
export type MathVideoEnrollmentRow = typeof mathVideoEnrollmentsTable.$inferSelect;

export const MATH_VIDEO_NOTIFICATION_KIND = "math_video_request";

export class MathVideoError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MathVideoError";
    this.status = status;
    this.code = code;
  }
}

export async function enrollmentFor(clientUserId: string, tx: Tx | Query = db) {
  const [row] = await tx
    .select()
    .from(mathVideoEnrollmentsTable)
    .where(eq(mathVideoEnrollmentsTable.clientUserId, clientUserId))
    .limit(1);
  return row ?? null;
}

export async function balanceFor(clientUserId: string, tx: Tx | Query = db): Promise<number> {
  const entries = await tx
    .select({ delta: mathVideoCreditEntriesTable.delta })
    .from(mathVideoCreditEntriesTable)
    .where(eq(mathVideoCreditEntriesTable.clientUserId, clientUserId));
  return creditBalance(entries);
}

export async function tutorProfileIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: tutorProfilesTable.id })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, userId));
  return rows.map((row) => row.id);
}

export async function defaultMathVideoTutorProfileId(): Promise<string | null> {
  const rows = await db
    .select({ id: tutorProfilesTable.id, email: tutorProfilesTable.email, active: tutorProfilesTable.active })
    .from(tutorProfilesTable)
    .where(inArray(tutorProfilesTable.email, xavierEmailSpellings(CANONICAL_XAVIER_EMAIL)));
  return rows.find((row) => row.active)?.id ?? rows[0]?.id ?? null;
}

export async function loadRequest(requestId: string): Promise<MathVideoRequestRow | null> {
  const [row] = await db
    .select()
    .from(mathVideoRequestsTable)
    .where(eq(mathVideoRequestsTable.id, requestId))
    .limit(1);
  return row ?? null;
}

export async function filesForRequests(requestIds: string[]): Promise<MathVideoFileRow[]> {
  if (requestIds.length === 0) return [];
  return db
    .select()
    .from(mathVideoRequestFilesTable)
    .where(inArray(mathVideoRequestFilesTable.requestId, requestIds))
    .orderBy(mathVideoRequestFilesTable.itemIndex, mathVideoRequestFilesTable.createdAt);
}

export async function draftFor(clientUserId: string): Promise<MathVideoRequestRow | null> {
  const [row] = await db
    .select()
    .from(mathVideoRequestsTable)
    .where(and(eq(mathVideoRequestsTable.clientUserId, clientUserId), eq(mathVideoRequestsTable.status, "draft")))
    .orderBy(desc(mathVideoRequestsTable.createdAt))
    .limit(1);
  return row ?? null;
}

export async function openDraft(clientUserId: string, tutorProfileId: string): Promise<MathVideoRequestRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`math_video_draft:${clientUserId}`}))`);
    const [existing] = await tx
      .select()
      .from(mathVideoRequestsTable)
      .where(and(eq(mathVideoRequestsTable.clientUserId, clientUserId), eq(mathVideoRequestsTable.status, "draft")))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(mathVideoRequestsTable)
      .values({ clientUserId, tutorProfileId, status: "draft", items: [{ text: "" }, { text: "" }, { text: "" }] })
      .returning();
    return created!;
  });
}

export async function saveDraftItems(requestId: string, items: DraftItem[]): Promise<void> {
  await db
    .update(mathVideoRequestsTable)
    .set({ items, updatedAt: new Date() })
    .where(and(eq(mathVideoRequestsTable.id, requestId), eq(mathVideoRequestsTable.status, "draft")));
}

/**
 * Locks the draft row while the per-request Drive folder is created, so two
 * parallel first uploads share one folder.
 */
export async function ensureRequestFolder(
  requestId: string,
  create: (request: MathVideoRequestRow, clientName: string) => Promise<string>,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mathVideoRequestsTable)
      .where(eq(mathVideoRequestsTable.id, requestId))
      .for("update")
      .limit(1);
    if (!row) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
    if (row.driveFolderId) return row.driveFolderId;
    const [client] = await tx
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, row.clientUserId))
      .limit(1);
    const folderId = await create(row, client?.displayName ?? "Student");
    await tx
      .update(mathVideoRequestsTable)
      .set({ driveFolderId: folderId, updatedAt: new Date() })
      .where(eq(mathVideoRequestsTable.id, requestId));
    return folderId;
  });
}

export async function countFiles(requestId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mathVideoRequestFilesTable)
    .where(eq(mathVideoRequestFilesTable.requestId, requestId));
  return Number(row?.count ?? 0);
}

export async function recordFile(values: typeof mathVideoRequestFilesTable.$inferInsert): Promise<MathVideoFileRow> {
  const [row] = await db.insert(mathVideoRequestFilesTable).values(values).returning();
  return row!;
}

export async function loadFile(requestId: string, fileId: string): Promise<MathVideoFileRow | null> {
  const [row] = await db
    .select()
    .from(mathVideoRequestFilesTable)
    .where(and(eq(mathVideoRequestFilesTable.id, fileId), eq(mathVideoRequestFilesTable.requestId, requestId)))
    .limit(1);
  return row ?? null;
}

export async function deleteFileRow(fileId: string): Promise<void> {
  await db.delete(mathVideoRequestFilesTable).where(eq(mathVideoRequestFilesTable.id, fileId));
}

async function notifyAdmins(tx: Tx, title: string, message: string): Promise<void> {
  const administrators = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return;
  await tx.insert(adminNotificationsTable).values(
    administrators.map((admin) => ({
      recipientUserId: admin.id,
      kind: MATH_VIDEO_NOTIFICATION_KIND,
      guidanceRequestId: null,
      sessionId: null,
      title,
      message,
      status: "unread" as const,
    })),
  );
}

function easternWhen(date: Date): string {
  return `${date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}

/**
 * Charges one credit per question and moves the draft to submitted, all in one
 * transaction under a per-student lock. A retried submit cannot double-charge:
 * the draft is no longer a draft, and the (request, debit) index is unique.
 */
export async function submitDraft(args: {
  requestId: string;
  clientUserId: string;
  items: DraftItem[];
  now: Date;
}): Promise<MathVideoRequestRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`math_video_credits:${args.clientUserId}`}))`);
    const [request] = await tx
      .select()
      .from(mathVideoRequestsTable)
      .where(eq(mathVideoRequestsTable.id, args.requestId))
      .for("update")
      .limit(1);
    if (!request || request.clientUserId !== args.clientUserId) {
      throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
    }
    if (request.status !== "draft") {
      throw new MathVideoError(409, "ALREADY_SUBMITTED", "This request was already submitted.");
    }
    const files = await tx
      .select({ itemIndex: mathVideoRequestFilesTable.itemIndex })
      .from(mathVideoRequestFilesTable)
      .where(eq(mathVideoRequestFilesTable.requestId, request.id));
    const balance = await balanceFor(args.clientUserId, tx);
    const check = checkSubmission({
      items: args.items,
      fileItemIndexes: files.map((file) => file.itemIndex),
      balance,
    });
    if (!check.ok) throw new MathVideoError(check.status, check.code, check.error);
    const dueAt = dueAtForSubmission(args.now);
    const [updated] = await tx
      .update(mathVideoRequestsTable)
      .set({
        status: "submitted",
        items: args.items,
        questionCount: check.questionCount,
        submittedAt: args.now,
        dueAt,
        updatedAt: args.now,
      })
      .where(and(eq(mathVideoRequestsTable.id, request.id), eq(mathVideoRequestsTable.status, "draft")))
      .returning();
    await tx.insert(mathVideoCreditEntriesTable).values({
      clientUserId: args.clientUserId,
      delta: -check.questionCount,
      kind: "debit",
      requestId: request.id,
      note: `${check.questionCount} questions submitted for a video explanation`,
      createdByUserId: args.clientUserId,
    });
    const [client] = await tx
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, args.clientUserId))
      .limit(1);
    const [tutor] = await tx
      .select({ name: tutorProfilesTable.name })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, request.tutorProfileId))
      .limit(1);
    const first = client?.displayName?.trim().split(/\s+/)[0] || "A student";
    await notifyAdmins(
      tx,
      "SAT Math video request submitted",
      `${first} submitted ${check.questionCount} SAT Math questions for ${tutor?.name ?? "the tutor"}. Video and quiz due ${easternWhen(dueAt)}.`,
    );
    return updated!;
  });
}

export async function cancelDraft(requestId: string, clientUserId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(mathVideoRequestsTable)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(mathVideoRequestsTable.id, requestId),
        eq(mathVideoRequestsTable.clientUserId, clientUserId),
        eq(mathVideoRequestsTable.status, "draft"),
      ),
    )
    .returning({ id: mathVideoRequestsTable.id });
  return rows.length > 0;
}

/** Admin cancel. A submitted request gets its credits back exactly once. */
export async function adminCancelRequest(requestId: string, adminUserId: string, now: Date): Promise<MathVideoRequestRow> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(mathVideoRequestsTable)
      .where(eq(mathVideoRequestsTable.id, requestId))
      .for("update")
      .limit(1);
    if (!request) throw new MathVideoError(404, "NOT_FOUND", "Video request not found.");
    if (request.status === "delivered") {
      throw new MathVideoError(409, "DELIVERED", "Delivered requests cannot be cancelled.");
    }
    if (request.status === "cancelled") return request;
    const [updated] = await tx
      .update(mathVideoRequestsTable)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(mathVideoRequestsTable.id, requestId))
      .returning();
    if (request.status === "submitted" && request.questionCount > 0) {
      await tx
        .insert(mathVideoCreditEntriesTable)
        .values({
          clientUserId: request.clientUserId,
          delta: request.questionCount,
          kind: "refund",
          requestId: request.id,
          note: "Video request cancelled by an administrator",
          createdByUserId: adminUserId,
        })
        .onConflictDoNothing();
    }
    return updated!;
  });
}

export async function saveDelivery(
  requestId: string,
  patch: Partial<Pick<MathVideoRequestRow, "youtubeVideoId" | "youtubeUrl" | "followUpAssignmentId" | "tutorNote">>,
): Promise<MathVideoRequestRow | null> {
  const [row] = await db
    .update(mathVideoRequestsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(mathVideoRequestsTable.id, requestId), inArray(mathVideoRequestsTable.status, ["submitted", "delivered"])))
    .returning();
  return row ?? null;
}

export async function markDelivered(requestId: string, now: Date): Promise<MathVideoRequestRow | null> {
  const [row] = await db
    .update(mathVideoRequestsTable)
    .set({ status: "delivered", deliveredAt: now, updatedAt: now })
    .where(and(eq(mathVideoRequestsTable.id, requestId), eq(mathVideoRequestsTable.status, "submitted")))
    .returning();
  return row ?? null;
}

export async function assignmentForStudent(assignmentId: string, clientUserId: string) {
  const [row] = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      assignedStudentUserId: assignmentsTable.assignedStudentUserId,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);
  if (!row || row.assignedStudentUserId !== clientUserId) return null;
  return row;
}

export async function quizOptionsForStudent(clientUserId: string) {
  return db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      subject: assignmentsTable.subject,
      status: assignmentsTable.status,
      createdAt: assignmentsTable.createdAt,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.assignedStudentUserId, clientUserId),
        inArray(assignmentsTable.status, ["draft", "published"]),
      ),
    )
    .orderBy(desc(assignmentsTable.createdAt))
    .limit(50);
}

export async function grantCredits(args: {
  clientUserId: string;
  credits: number;
  note: string | null;
  adminUserId: string;
}): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`math_video_credits:${args.clientUserId}`}))`);
    const balance = await balanceFor(args.clientUserId, tx);
    if (balance + args.credits < 0) {
      throw new MathVideoError(400, "NEGATIVE_BALANCE", `That would leave ${balance + args.credits} credits.`);
    }
    await tx.insert(mathVideoCreditEntriesTable).values({
      clientUserId: args.clientUserId,
      delta: args.credits,
      kind: args.credits > 0 ? "grant" : "adjustment",
      requestId: null,
      note: args.note,
      createdByUserId: args.adminUserId,
    });
    return balance + args.credits;
  });
}

export async function upsertEnrollment(args: {
  clientUserId: string;
  tutorProfileId: string;
  enabled: boolean;
  adminUserId: string;
}): Promise<MathVideoEnrollmentRow> {
  const now = new Date();
  const [row] = await db
    .insert(mathVideoEnrollmentsTable)
    .values({
      clientUserId: args.clientUserId,
      tutorProfileId: args.tutorProfileId,
      enabled: args.enabled,
      createdByUserId: args.adminUserId,
    })
    .onConflictDoUpdate({
      target: mathVideoEnrollmentsTable.clientUserId,
      set: {
        tutorProfileId: args.tutorProfileId,
        enabled: args.enabled,
        updatedAt: now,
      },
    })
    .returning();
  return row!;
}

// ------------------------------------------------------------------ views

export type Audience = "student" | "tutor" | "admin";

export function fileContentPath(requestId: string, fileId: string): string {
  return `/api/math-videos/requests/${requestId}/files/${fileId}`;
}

export async function requestViews(
  rows: MathVideoRequestRow[],
  audience: Audience,
  now: Date,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const files = await filesForRequests(ids);
  const clientIds = [...new Set(rows.map((row) => row.clientUserId))];
  const tutorIds = [...new Set(rows.map((row) => row.tutorProfileId))];
  const assignmentIds = [...new Set(rows.map((row) => row.followUpAssignmentId).filter((id): id is string => Boolean(id)))];
  const [clients, tutors, assignments] = await Promise.all([
    db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, clientIds)),
    db.select({ id: tutorProfilesTable.id, name: tutorProfilesTable.name }).from(tutorProfilesTable).where(inArray(tutorProfilesTable.id, tutorIds)),
    assignmentIds.length
      ? db
          .select({ id: assignmentsTable.id, title: assignmentsTable.title, status: assignmentsTable.status })
          .from(assignmentsTable)
          .where(inArray(assignmentsTable.id, assignmentIds))
      : Promise.resolve([] as { id: string; title: string; status: string }[]),
  ]);
  const clientById = new Map(clients.map((row) => [row.id, row]));
  const tutorById = new Map(tutors.map((row) => [row.id, row]));
  const assignmentById = new Map(assignments.map((row) => [row.id, row]));
  return rows.map((row) => {
    const client = clientById.get(row.clientUserId);
    const assignment = row.followUpAssignmentId ? assignmentById.get(row.followUpAssignmentId) : undefined;
    const showDelivery = audience !== "student" || row.status === "delivered";
    const rowFiles = files.filter((file) => file.requestId === row.id);
    return {
      id: row.id,
      status: row.status,
      items: (row.items ?? []).map((item, index) => ({
        index,
        text: item.text,
        files: rowFiles
          .filter((file) => file.itemIndex === index)
          .map((file) => ({
            id: file.id,
            filename: file.filename,
            mimeType: file.mimeType,
            bytes: file.bytes,
            contentUrl: fileContentPath(row.id, file.id),
            ...(audience === "admin" ? { driveWebViewLink: file.driveWebViewLink } : {}),
          })),
      })),
      orphanFiles: rowFiles
        .filter((file) => file.itemIndex >= (row.items ?? []).length)
        .map((file) => ({ id: file.id, filename: file.filename, itemIndex: file.itemIndex })),
      questionCount: row.questionCount,
      createdAt: row.createdAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue: isOverdue(row, now),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      tutorName: tutorById.get(row.tutorProfileId)?.name ?? "Your tutor",
      clientName: audience === "student" ? undefined : client?.displayName ?? "Student",
      clientEmail: audience === "admin" ? client?.email ?? null : undefined,
      driveFolderUrl:
        audience === "admin" && row.driveFolderId ? `https://drive.google.com/drive/folders/${row.driveFolderId}` : undefined,
      video:
        showDelivery && row.youtubeVideoId
          ? {
              videoId: row.youtubeVideoId,
              url: row.youtubeUrl ?? `https://www.youtube.com/watch?v=${row.youtubeVideoId}`,
              embedUrl: youtubeEmbedUrl(row.youtubeVideoId),
              thumbnailUrl: youtubeThumbnailUrl(row.youtubeVideoId),
            }
          : null,
      followUpQuiz:
        showDelivery && assignment && (audience !== "student" || assignment.status === "published")
          ? {
              assignmentId: assignment.id,
              title: assignment.title,
              status: assignment.status,
              href: audience === "student" ? `/portal/assignments/${assignment.id}` : null,
            }
          : null,
      tutorNote: showDelivery ? row.tutorNote : null,
    };
  });
}

export async function studentRequests(clientUserId: string) {
  return db
    .select()
    .from(mathVideoRequestsTable)
    .where(and(eq(mathVideoRequestsTable.clientUserId, clientUserId), ne(mathVideoRequestsTable.status, "cancelled")))
    .orderBy(desc(mathVideoRequestsTable.createdAt));
}

export async function queueRequests(tutorProfileIds: string[] | null) {
  const base = db.select().from(mathVideoRequestsTable);
  const statusFilter = inArray(mathVideoRequestsTable.status, ["submitted", "delivered", "cancelled"]);
  const rows = await (tutorProfileIds === null
    ? base.where(statusFilter)
    : tutorProfileIds.length === 0
      ? Promise.resolve([] as MathVideoRequestRow[])
      : base.where(and(statusFilter, inArray(mathVideoRequestsTable.tutorProfileId, tutorProfileIds))));
  const rank = (status: string) => (status === "submitted" ? 0 : status === "delivered" ? 1 : 2);
  return rows.sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    if (a.status === "submitted") return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function enrollmentsForAdmin() {
  const rows = await db
    .select({
      clientUserId: mathVideoEnrollmentsTable.clientUserId,
      tutorProfileId: mathVideoEnrollmentsTable.tutorProfileId,
      enabled: mathVideoEnrollmentsTable.enabled,
      clientName: usersTable.displayName,
      clientEmail: usersTable.email,
      tutorName: tutorProfilesTable.name,
    })
    .from(mathVideoEnrollmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, mathVideoEnrollmentsTable.clientUserId))
    .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, mathVideoEnrollmentsTable.tutorProfileId));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      credits: await balanceFor(row.clientUserId),
    })),
  );
}

export async function tutorHasEnrollments(tutorProfileIds: string[]): Promise<boolean> {
  if (tutorProfileIds.length === 0) return false;
  const [row] = await db
    .select({ id: mathVideoEnrollmentsTable.clientUserId })
    .from(mathVideoEnrollmentsTable)
    .where(
      and(
        inArray(mathVideoEnrollmentsTable.tutorProfileId, tutorProfileIds),
        eq(mathVideoEnrollmentsTable.enabled, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}
