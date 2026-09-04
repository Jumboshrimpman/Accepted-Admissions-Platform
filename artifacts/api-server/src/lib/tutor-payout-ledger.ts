import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  paymentsTable,
  sessionsTable,
  tutorCompensationRatesTable,
  tutorPayoutObligationsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";

export type PayoutSession = typeof sessionsTable.$inferSelect;
export type TutorPayoutObligation = typeof tutorPayoutObligationsTable.$inferSelect;

export type PayoutDb = typeof db;
export type PayoutTx = Parameters<Parameters<PayoutDb["transaction"]>[0]>[0];
export type PayoutExecutor = PayoutDb | PayoutTx;

export class TutorPayoutLedgerError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TutorPayoutLedgerError";
    this.status = status;
    this.code = code;
  }
}

export function amountOwedCents(tutorRateCents: number, durationMinutes: number): number {
  return Math.round(tutorRateCents * (durationMinutes / 60));
}

async function resolveTutorProfileId(
  executor: PayoutExecutor,
  tutorUserId: string,
): Promise<string | null> {
  const [profile] = await executor
    .select({ id: tutorProfilesTable.id })
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.userId, tutorUserId))
    .limit(1);
  return profile?.id ?? null;
}

async function activeHourlyRateCents(
  executor: PayoutExecutor,
  tutorProfileId: string,
  at: Date,
): Promise<number | null> {
  const [rate] = await executor
    .select({ hourlyRateCents: tutorCompensationRatesTable.hourlyRateCents })
    .from(tutorCompensationRatesTable)
    .where(
      and(
        eq(tutorCompensationRatesTable.tutorProfileId, tutorProfileId),
        sql`${tutorCompensationRatesTable.effectiveFrom} <= ${at}`,
        or(
          isNull(tutorCompensationRatesTable.endedAt),
          sql`${tutorCompensationRatesTable.endedAt} > ${at}`,
        ),
      ),
    )
    .orderBy(desc(tutorCompensationRatesTable.effectiveFrom))
    .limit(1);
  return rate?.hourlyRateCents ?? null;
}

async function resolvePurchaseReference(
  executor: PayoutExecutor,
  session: PayoutSession,
): Promise<{ paymentId: string | null; purchaseReference: string | null }> {
  if (!session.clientUserId) {
    return { paymentId: null, purchaseReference: null };
  }

  const [debit] = await executor
    .select({
      referenceType: creditLedgerTable.referenceType,
      referenceId: creditLedgerTable.referenceId,
    })
    .from(creditLedgerTable)
    .where(
      and(
        eq(creditLedgerTable.sessionId, session.id),
        eq(creditLedgerTable.entryType, "debit"),
      ),
    )
    .orderBy(desc(creditLedgerTable.createdAt))
    .limit(1);

  const [original] = await executor
    .select({
      referenceType: creditLedgerTable.referenceType,
      referenceId: creditLedgerTable.referenceId,
      productId: creditLedgerTable.productId,
    })
    .from(creditLedgerTable)
    .where(
      and(
        eq(creditLedgerTable.clientUserId, session.clientUserId),
        eq(creditLedgerTable.entryType, "original"),
      ),
    )
    .orderBy(desc(creditLedgerTable.createdAt))
    .limit(1);

  const paymentCandidateId =
    (debit?.referenceType === "payment" && debit.referenceId) ||
    (original?.referenceType === "payment" && original.referenceId) ||
    null;

  if (paymentCandidateId) {
    const [payment] = await executor
      .select({
        id: paymentsTable.id,
        providerPaymentIntentId: paymentsTable.providerPaymentIntentId,
        providerCheckoutSessionId: paymentsTable.providerCheckoutSessionId,
        providerChargeId: paymentsTable.providerChargeId,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentCandidateId))
      .limit(1);
    if (payment) {
      const purchaseReference =
        payment.providerPaymentIntentId ||
        payment.providerCheckoutSessionId ||
        payment.providerChargeId ||
        payment.id;
      return { paymentId: payment.id, purchaseReference };
    }
  }

  if (original?.referenceType === "invoice" && original.referenceId) {
    const [payment] = await executor
      .select({
        id: paymentsTable.id,
        providerPaymentIntentId: paymentsTable.providerPaymentIntentId,
        providerCheckoutSessionId: paymentsTable.providerCheckoutSessionId,
        providerChargeId: paymentsTable.providerChargeId,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.invoiceId, original.referenceId))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1);
    if (payment) {
      const purchaseReference =
        payment.providerPaymentIntentId ||
        payment.providerCheckoutSessionId ||
        payment.providerChargeId ||
        `invoice:${original.referenceId}`;
      return { paymentId: payment.id, purchaseReference };
    }
    return {
      paymentId: null,
      purchaseReference: `invoice:${original.referenceId}`,
    };
  }

  return { paymentId: null, purchaseReference: null };
}

export async function accrueObligationForCompletedSession(
  session: PayoutSession,
  executor: PayoutExecutor = db,
): Promise<TutorPayoutObligation | null> {
  if (session.bookingStatus === "cancelled") return null;
  if (session.status !== "completed") return null;
  if (!session.clientUserId || !session.tutorUserId) return null;

  const [existing] = await executor
    .select()
    .from(tutorPayoutObligationsTable)
    .where(eq(tutorPayoutObligationsTable.sessionId, session.id))
    .limit(1);
  if (existing) return existing;

  const tutorProfileId = await resolveTutorProfileId(executor, session.tutorUserId);
  if (!tutorProfileId) return null;

  const completedAt = new Date();
  const rateCents = await activeHourlyRateCents(
    executor,
    tutorProfileId,
    session.dateTime ?? completedAt,
  );
  if (rateCents == null || rateCents <= 0) {
    throw new TutorPayoutLedgerError(
      409,
      "RATE_MISSING",
      "An active tutor compensation rate is required before accruing a payout obligation.",
    );
  }

  const purchase = await resolvePurchaseReference(executor, session);
  const owed = amountOwedCents(rateCents, session.durationMinutes);

  const [created] = await executor
    .insert(tutorPayoutObligationsTable)
    .values({
      sessionId: session.id,
      studentUserId: session.clientUserId,
      tutorUserId: session.tutorUserId,
      tutorProfileId,
      sessionDateTime: session.dateTime,
      durationMinutes: session.durationMinutes,
      paymentId: purchase.paymentId,
      purchaseReference: purchase.purchaseReference,
      tutorRateCents: rateCents,
      amountOwedCents: owed,
      status: "due",
      completedAt,
    })
    .onConflictDoNothing({ target: tutorPayoutObligationsTable.sessionId })
    .returning();

  if (created) return created;

  const [reread] = await executor
    .select()
    .from(tutorPayoutObligationsTable)
    .where(eq(tutorPayoutObligationsTable.sessionId, session.id))
    .limit(1);
  return reread ?? null;
}

export async function markObligationPaid(
  obligationId: string,
  admin: AppUser,
  options: { paymentReference?: string | null; notes?: string | null } = {},
  executor: PayoutExecutor = db,
): Promise<TutorPayoutObligation> {
  if (admin.role !== "administrator") {
    throw new TutorPayoutLedgerError(
      403,
      "ADMIN_ONLY",
      "Only administrators can mark tutor payout obligations paid.",
    );
  }

  const [existing] = await executor
    .select()
    .from(tutorPayoutObligationsTable)
    .where(eq(tutorPayoutObligationsTable.id, obligationId))
    .limit(1);
  if (!existing) {
    throw new TutorPayoutLedgerError(404, "NOT_FOUND", "Payout obligation not found.");
  }
  if (existing.status === "paid") return existing;
  if (existing.status !== "due" && existing.status !== "pending") {
    throw new TutorPayoutLedgerError(
      409,
      "INVALID_STATUS",
      "Only pending or due obligations can be marked paid.",
    );
  }

  const now = new Date();
  const [updated] = await executor
    .update(tutorPayoutObligationsTable)
    .set({
      status: "paid",
      paidAt: now,
      paidByUserId: admin.id,
      paymentReference:
        options.paymentReference === undefined
          ? existing.paymentReference
          : options.paymentReference?.trim() || null,
      notes: options.notes === undefined ? existing.notes : options.notes?.trim() || null,
      updatedAt: now,
    })
    .where(eq(tutorPayoutObligationsTable.id, obligationId))
    .returning();
  if (!updated) {
    throw new TutorPayoutLedgerError(404, "NOT_FOUND", "Payout obligation not found.");
  }
  return updated;
}

export async function reverseObligation(
  obligationId: string,
  admin: AppUser,
  notes?: string | null,
  executor: PayoutExecutor = db,
): Promise<TutorPayoutObligation> {
  if (admin.role !== "administrator") {
    throw new TutorPayoutLedgerError(
      403,
      "ADMIN_ONLY",
      "Only administrators can reverse tutor payout obligations.",
    );
  }

  const [existing] = await executor
    .select()
    .from(tutorPayoutObligationsTable)
    .where(eq(tutorPayoutObligationsTable.id, obligationId))
    .limit(1);
  if (!existing) {
    throw new TutorPayoutLedgerError(404, "NOT_FOUND", "Payout obligation not found.");
  }
  if (existing.status === "reversed") return existing;

  const now = new Date();
  const [updated] = await executor
    .update(tutorPayoutObligationsTable)
    .set({
      status: "reversed",
      notes:
        notes === undefined
          ? existing.notes
          : [existing.notes, notes?.trim()].filter(Boolean).join("\n") || null,
      updatedAt: now,
    })
    .where(eq(tutorPayoutObligationsTable.id, obligationId))
    .returning();
  if (!updated) {
    throw new TutorPayoutLedgerError(404, "NOT_FOUND", "Payout obligation not found.");
  }
  return updated;
}

export type TutorPayoutObligationView = {
  id: string;
  sessionId: string;
  studentUserId: string;
  studentName: string | null;
  tutorUserId: string;
  tutorName: string | null;
  tutorProfileId: string;
  sessionDateTime: Date;
  durationMinutes: number;
  paymentId: string | null;
  purchaseReference: string | null;
  tutorRateCents: number;
  amountOwedCents: number;
  status: "pending" | "due" | "paid" | "reversed";
  completedAt: Date;
  paidAt: Date | null;
  paidByUserId: string | null;
  paidByName: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: Date;
};

export async function listTutorPayoutObligations(
  options: { tutorUserId?: string } = {},
  executor: PayoutExecutor = db,
): Promise<TutorPayoutObligationView[]> {
  const rows = await executor
    .select()
    .from(tutorPayoutObligationsTable)
    .where(
      options.tutorUserId
        ? eq(tutorPayoutObligationsTable.tutorUserId, options.tutorUserId)
        : undefined,
    )
    .orderBy(desc(tutorPayoutObligationsTable.completedAt));

  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.studentUserId, row.tutorUserId, row.paidByUserId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
  ];
  const people = await executor
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const names = new Map(people.map((person) => [person.id, person.displayName]));

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    studentUserId: row.studentUserId,
    studentName: names.get(row.studentUserId) ?? null,
    tutorUserId: row.tutorUserId,
    tutorName: names.get(row.tutorUserId) ?? null,
    tutorProfileId: row.tutorProfileId,
    sessionDateTime: row.sessionDateTime,
    durationMinutes: row.durationMinutes,
    paymentId: row.paymentId,
    purchaseReference: row.purchaseReference,
    tutorRateCents: row.tutorRateCents,
    amountOwedCents: row.amountOwedCents,
    status: row.status,
    completedAt: row.completedAt,
    paidAt: row.paidAt,
    paidByUserId: row.paidByUserId,
    paidByName: row.paidByUserId ? names.get(row.paidByUserId) ?? null : null,
    paymentReference: row.paymentReference,
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}

