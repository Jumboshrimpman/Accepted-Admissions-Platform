import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  adminNotificationsTable,
  creditLedgerTable,
  db,
  essayRequestsTable,
  paymentsTable,
  satProductsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  canMarkEssayDone,
  canUploadEditedEssay,
  essayFileDecision,
  essayKindForSlug,
  essayPurchaseCreditPlan,
  essayRequestIdFromMetadata,
  essayRequestView,
  tutorIsNika,
  type EssayActor,
  type EssayRequestView,
} from "./essay-editing.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { purchaseCreditFulfillmentKey } from "./payment-fulfillment-rules.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { isNeelDharniUser } from "./college-consulting.ts";

type Query = typeof db;
type Tx = Parameters<Parameters<Query["transaction"]>[0]>[0];

export async function nikaEssayTutor(tx: Tx | Query = db) {
  const rows = await tx
    .select({
      id: tutorProfilesTable.id,
      userId: tutorProfilesTable.userId,
      name: tutorProfilesTable.name,
      email: tutorProfilesTable.email,
      active: tutorProfilesTable.active,
    })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.active, true));
  return rows.find((row) => tutorIsNika(row)) ?? null;
}

export async function essayProductBySlug(tx: Tx | Query, slug: string) {
  const [row] = await tx
    .select()
    .from(satProductsTable)
    .where(and(eq(satProductsTable.slug, slug), eq(satProductsTable.active, true)))
    .limit(1);
  return row ?? null;
}

async function notifyEssayAdmins(
  tx: Tx,
  args: { title: string; message: string; sessionId?: string | null },
): Promise<void> {
  const administrators = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "administrator"));
  if (administrators.length === 0) return;
  await tx.insert(adminNotificationsTable).values(
    administrators.map((admin) => ({
      recipientUserId: admin.id,
      kind: "booking_confirmed" as const,
      guidanceRequestId: null,
      sessionId: args.sessionId ?? null,
      title: args.title,
      message: args.message,
      status: "unread" as const,
    })),
  );
}

export async function fulfillEssayPaymentInTx(
  tx: Tx,
  args: {
    payment: {
      id: string;
      clientUserId: string | null;
      productId?: string | null;
      auditMetadata?: unknown;
    };
    product: { id: string; slug: string; name: string };
  },
): Promise<{ hours: number; inserted: boolean }> {
  const plan = essayPurchaseCreditPlan(args.product.slug);
  if (!plan) throw new Error(`Payment ${args.payment.id} is not an essay product.`);
  if (!args.payment.clientUserId) {
    throw new Error(`Payment ${args.payment.id} cannot be fulfilled without a client user.`);
  }
  const requestId = essayRequestIdFromMetadata(args.payment.auditMetadata);
  if (!requestId) {
    throw new Error(`Payment ${args.payment.id} is missing its essay request.`);
  }
  const [request] = await tx
    .select()
    .from(essayRequestsTable)
    .where(eq(essayRequestsTable.id, requestId))
    .limit(1);
  if (!request || request.clientUserId !== args.payment.clientUserId) {
    throw new Error(`Payment ${args.payment.id} does not match its essay request.`);
  }
  if (request.paymentId && request.paymentId !== args.payment.id) {
    throw new Error(`Essay request ${request.id} is already tied to another payment.`);
  }
  const kind = essayKindForSlug(args.product.slug);
  if (!kind || request.kind !== kind) {
    throw new Error(`Essay request ${request.id} does not match the paid product.`);
  }

  let creditProductId = args.product.id;
  let hours = plan.meetingHours;
  let note = `${args.product.name} purchase`;
  if (plan.meetingHours > 0) {
    if (!plan.creditSlug) throw new Error("Essay follow-up is missing its hour product.");
    const hourProduct = await essayProductBySlug(tx, plan.creditSlug);
    if (!hourProduct) {
      throw new Error(`Essay follow-up cannot find ${plan.creditSlug}.`);
    }
    creditProductId = hourProduct.id;
    note = "Follow-up call hour included with essay editing";
  }

  const [inserted] = await tx
    .insert(creditLedgerTable)
    .values({
      clientUserId: args.payment.clientUserId,
      productId: creditProductId,
      entryType: "original",
      hours,
      referenceType: "payment",
      referenceId: args.payment.id,
      fulfillmentKey: purchaseCreditFulfillmentKey(args.payment.id),
      note,
    })
    .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey })
    .returning({ id: creditLedgerTable.id });

  const becameSubmitted = request.status === "pending_payment";
  if (becameSubmitted) {
    const [client] = await tx
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.id, request.clientUserId))
      .limit(1);
    const first = client?.displayName?.trim().split(/\s+/)[0] || "Student";
    await tx
      .update(essayRequestsTable)
      .set({
        status: "submitted",
        paymentId: args.payment.id,
        productId: args.product.id,
        updatedAt: new Date(),
      })
      .where(eq(essayRequestsTable.id, request.id));
    await notifyEssayAdmins(tx, {
      title: "Essay editing request submitted",
      message: `${first} submitted an essay for editing. Due ${request.dueAt.toISOString()}.`,
      sessionId: request.sessionId,
    });
  }
  return { hours, inserted: Boolean(inserted) };
}

export async function linkEssayRequestToSession(
  paymentId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(essayRequestsTable)
    .set({ sessionId, updatedAt: new Date() })
    .where(eq(essayRequestsTable.paymentId, paymentId));
}

export async function openFollowUpForBooking(clientUserId: string, tutorProfileId: string) {
  const [row] = await db
    .select({ id: essayRequestsTable.id, dueAt: essayRequestsTable.dueAt })
    .from(essayRequestsTable)
    .where(
      and(
        eq(essayRequestsTable.clientUserId, clientUserId),
        eq(essayRequestsTable.tutorProfileId, tutorProfileId),
        eq(essayRequestsTable.kind, "followup"),
        eq(essayRequestsTable.status, "submitted"),
        isNull(essayRequestsTable.sessionId),
      ),
    )
    .orderBy(asc(essayRequestsTable.dueAt))
    .limit(1);
  return row ?? null;
}

export async function attachFollowUpSession(
  tx: Tx,
  requestId: string,
  sessionId: string,
  callStart: Date,
): Promise<void> {
  await tx
    .update(essayRequestsTable)
    .set({ sessionId, callStart, updatedAt: new Date() })
    .where(and(eq(essayRequestsTable.id, requestId), isNull(essayRequestsTable.sessionId)));
}

type EssayListRow = {
  id: string;
  kind: string;
  status: string;
  dueAt: Date;
  callStart: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  originalFilename: string;
  editedFilename: string | null;
  sessionId: string | null;
  clientUserId: string;
  clientDisplayName: string;
  clientEmail: string;
  tutorUserId: string | null;
  tutorEmail: string;
  tutorName: string;
};

async function essayRows(): Promise<EssayListRow[]> {
  return db
    .select({
      id: essayRequestsTable.id,
      kind: essayRequestsTable.kind,
      status: essayRequestsTable.status,
      dueAt: essayRequestsTable.dueAt,
      callStart: essayRequestsTable.callStart,
      createdAt: essayRequestsTable.createdAt,
      completedAt: essayRequestsTable.completedAt,
      originalFilename: essayRequestsTable.originalFilename,
      editedFilename: essayRequestsTable.editedFilename,
      sessionId: essayRequestsTable.sessionId,
      clientUserId: essayRequestsTable.clientUserId,
      clientDisplayName: usersTable.displayName,
      clientEmail: usersTable.email,
      tutorUserId: tutorProfilesTable.userId,
      tutorEmail: tutorProfilesTable.email,
      tutorName: tutorProfilesTable.name,
    })
    .from(essayRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, essayRequestsTable.clientUserId))
    .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, essayRequestsTable.tutorProfileId))
    .orderBy(desc(essayRequestsTable.createdAt));
}

export async function listEssayRequestsForActor(actor: EssayActor): Promise<{
  enabled: boolean;
  requests: EssayRequestView[];
}> {
  if (actor.role === "tutor") {
    const tutor = await nikaEssayTutor();
    if (!tutor?.userId || tutor.userId !== actor.userId) {
      return { enabled: false, requests: [] };
    }
  } else if (actor.role !== "administrator" && actor.role !== "student") {
    return { enabled: false, requests: [] };
  }
  const rows = await essayRows();
  const requests = rows
    .filter((row) => tutorIsNika({ name: row.tutorName, email: row.tutorEmail }))
    .map((row) => essayRequestView({ actor, ...row }))
    .filter((row): row is EssayRequestView => Boolean(row));
  if (actor.role === "student" && !isNeelDharniUser(actor.userId)) {
    return { enabled: requests.length > 0, requests };
  }
  return { enabled: true, requests };
}

export async function readEssayFile(args: {
  actor: EssayActor;
  requestId: string;
  which: "original" | "edited";
}): Promise<
  | { decision: "allow"; filename: string; bytes: Buffer }
  | { decision: "deny" | "missing" }
> {
  const [row] = await db
    .select({
      clientUserId: essayRequestsTable.clientUserId,
      status: essayRequestsTable.status,
      tutorUserId: tutorProfilesTable.userId,
      tutorEmail: tutorProfilesTable.email,
      tutorName: tutorProfilesTable.name,
      originalFilename: essayRequestsTable.originalFilename,
      originalPdf: essayRequestsTable.originalPdf,
      editedFilename: essayRequestsTable.editedFilename,
      editedPdf: essayRequestsTable.editedPdf,
    })
    .from(essayRequestsTable)
    .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, essayRequestsTable.tutorProfileId))
    .where(eq(essayRequestsTable.id, args.requestId))
    .limit(1);
  if (!row || !tutorIsNika({ name: row.tutorName, email: row.tutorEmail })) {
    return { decision: "deny" };
  }
  const decision = essayFileDecision({
    actor: args.actor,
    clientUserId: row.clientUserId,
    tutorUserId: row.tutorUserId,
    status: row.status,
    which: args.which,
    hasEditedFile: Boolean(row.editedPdf && row.editedPdf.length > 0),
  });
  if (decision !== "allow") return { decision };
  if (args.which === "edited") {
    if (!row.editedPdf) return { decision: "missing" };
    return {
      decision: "allow",
      filename: row.editedFilename || "essay-edited.pdf",
      bytes: row.editedPdf,
    };
  }
  return { decision: "allow", filename: row.originalFilename, bytes: row.originalPdf };
}

export async function saveEditedEssay(args: {
  actor: EssayActor;
  requestId: string;
  filename: string;
  bytes: Buffer;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [row] = await db
    .select({
      id: essayRequestsTable.id,
      status: essayRequestsTable.status,
      tutorUserId: tutorProfilesTable.userId,
      tutorEmail: tutorProfilesTable.email,
      tutorName: tutorProfilesTable.name,
    })
    .from(essayRequestsTable)
    .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, essayRequestsTable.tutorProfileId))
    .where(eq(essayRequestsTable.id, args.requestId))
    .limit(1);
  if (!row || !tutorIsNika({ name: row.tutorName, email: row.tutorEmail })) {
    return { ok: false, status: 404, error: "Essay request not found." };
  }
  if (
    !canUploadEditedEssay({
      actor: args.actor,
      tutorUserId: row.tutorUserId,
      status: row.status,
    })
  ) {
    return { ok: false, status: 403, error: "This essay cannot be updated." };
  }
  await db
    .update(essayRequestsTable)
    .set({
      editedFilename: args.filename,
      editedPdf: args.bytes,
      editedBytes: args.bytes.length,
      updatedAt: new Date(),
    })
    .where(eq(essayRequestsTable.id, row.id));
  return { ok: true };
}

export async function markEssayDone(args: {
  actor: EssayActor;
  requestId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: essayRequestsTable.id,
        status: essayRequestsTable.status,
        dueAt: essayRequestsTable.dueAt,
        sessionId: essayRequestsTable.sessionId,
        editedPdf: essayRequestsTable.editedPdf,
        clientUserId: essayRequestsTable.clientUserId,
        tutorUserId: tutorProfilesTable.userId,
        tutorEmail: tutorProfilesTable.email,
        tutorName: tutorProfilesTable.name,
        clientName: usersTable.displayName,
      })
      .from(essayRequestsTable)
      .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, essayRequestsTable.tutorProfileId))
      .innerJoin(usersTable, eq(usersTable.id, essayRequestsTable.clientUserId))
      .where(eq(essayRequestsTable.id, args.requestId))
      .limit(1);
    if (!row || !tutorIsNika({ name: row.tutorName, email: row.tutorEmail })) {
      return { ok: false as const, status: 404, error: "Essay request not found." };
    }
    if (
      !canMarkEssayDone({
        actor: args.actor,
        tutorUserId: row.tutorUserId,
        status: row.status,
        hasEditedFile: Boolean(row.editedPdf && row.editedPdf.length > 0),
      })
    ) {
      return {
        ok: false as const,
        status: 409,
        error: "Upload the edited PDF before marking this essay done.",
      };
    }
    await tx
      .update(essayRequestsTable)
      .set({
        status: "done",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(essayRequestsTable.id, row.id), eq(essayRequestsTable.status, "submitted")));
    const first = row.clientName.trim().split(/\s+/)[0] || "Student";
    await notifyEssayAdmins(tx, {
      title: "Essay editing marked done",
      message: `${first}'s essay is marked done. Due ${row.dueAt.toISOString()}.`,
      sessionId: row.sessionId,
    });
    return { ok: true as const };
  });
}

export async function createEssayRequest(args: {
  clientUserId: string;
  tutorProfileId: string;
  productId: string | null;
  kind: "async" | "followup";
  dueAt: Date;
  callStart: Date | null;
  filename: string;
  bytes: Buffer;
}) {
  const [row] = await db
    .insert(essayRequestsTable)
    .values({
      clientUserId: args.clientUserId,
      tutorProfileId: args.tutorProfileId,
      productId: args.productId,
      kind: args.kind,
      status: "pending_payment",
      dueAt: args.dueAt,
      callStart: args.callStart,
      originalFilename: args.filename,
      originalPdf: args.bytes,
      originalBytes: args.bytes.length,
    })
    .returning({
      id: essayRequestsTable.id,
      kind: essayRequestsTable.kind,
      status: essayRequestsTable.status,
      dueAt: essayRequestsTable.dueAt,
      callStart: essayRequestsTable.callStart,
      createdAt: essayRequestsTable.createdAt,
    });
  return row!;
}

export async function loadOwnedEssayRequest(requestId: string, clientUserId: string) {
  const [row] = await db
    .select({
      request: essayRequestsTable,
      paymentStatus: paymentsTable.status,
      tutorEmail: tutorProfilesTable.email,
      tutorName: tutorProfilesTable.name,
      tutorUserId: tutorProfilesTable.userId,
    })
    .from(essayRequestsTable)
    .innerJoin(tutorProfilesTable, eq(tutorProfilesTable.id, essayRequestsTable.tutorProfileId))
    .leftJoin(paymentsTable, eq(paymentsTable.id, essayRequestsTable.paymentId))
    .where(
      and(eq(essayRequestsTable.id, requestId), eq(essayRequestsTable.clientUserId, clientUserId)),
    )
    .limit(1);
  if (!row || !tutorIsNika({ name: row.tutorName, email: row.tutorEmail })) return null;
  return row;
}

export function essaySlugForKind(kind: string): string | null {
  if (kind === "async") return "college-consulting-nika-essay-async";
  if (kind === "followup") return "college-consulting-nika-essay-followup";
  return null;
}
