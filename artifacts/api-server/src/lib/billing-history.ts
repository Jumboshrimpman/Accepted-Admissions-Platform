import { and, eq, inArray } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  paymentsTable,
  satProductsTable,
  sessionsTable,
  tutorProfilesTable,
} from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import { bookedSessionIdFromMetadata, bookingIntentFromMetadata } from "./booking-checkout.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  COLLEGE_CONSULTING_LENGTH_PRODUCTS,
  collegeConsultingProductBySlug,
  consultingTutorDisplayName,
  isCollegeConsultingSlug,
  type CollegeConsultingTutorKey,
} from "./college-consulting.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { purchaseCreditFulfillmentKey } from "./payment-fulfillment-rules.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { satTutorKeyForSlug } from "./sat-tutor-pricing.ts";

/** Completed charges only. Pending and failed checkouts stay out of the history. */
export const BILLING_HISTORY_PAYMENT_STATUSES = [
  "paid",
  "partially_paid",
  "refunded",
  "partially_refunded",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storedId(value: string | null | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

const TUTOR_LABELS: Record<string, string> = {
  nika: "Nika",
  victoria: "Victoria",
  xavier: "Xavier",
  eunice: "Eunice",
};

export type BillingHistoryEntry = {
  id: string;
  purchasedAt: string;
  label: string;
  service: string;
  tutorName: string | null;
  hours: number | null;
  sessionTitle: string | null;
  sessionStart: string | null;
  amountCents: number | null;
  status: string;
};

export type BillingHistoryAccess =
  | { ok: true; clientId: string; readOnly: boolean }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Students and viewers see the signed-in subject. An administrator may pass
 * another client id only when that client is already allowed for preview.
 */
export function resolveBillingHistoryAccess(input: {
  role: string;
  subjectUserId: string;
  requestedClientId: string | null;
  adminClientFound: boolean;
}): BillingHistoryAccess {
  const requested = input.requestedClientId?.trim() || null;
  if (!requested || requested === input.subjectUserId) {
    return {
      ok: true,
      clientId: input.subjectUserId,
      readOnly: input.role === "viewer" || input.role === "administrator",
    };
  }
  if (input.role !== "administrator") {
    return {
      ok: false,
      status: 403,
      error: "You can only view your own billing history.",
    };
  }
  if (!input.adminClientFound) {
    return { ok: false, status: 404, error: "Client not found" };
  }
  return { ok: true, clientId: requested, readOnly: true };
}

type HistoryPayment = {
  id: string;
  amountCents: number;
  refundedAmountCents: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  productName: string | null;
  productSlug: string | null;
  durationHours: number | null;
  tutorProfileId: string | null;
  auditMetadata: unknown;
};

type HistoryTutor = { id: string; name: string };
type HistorySession = {
  id: string;
  title: string;
  dateTime: Date;
  clientUserId: string | null;
};
type HistoryLedger = {
  id: string;
  entryType: string;
  hours: number;
  productId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  fulfillmentKey: string | null;
  createdAt: Date;
};
type HistoryProduct = {
  id: string;
  slug: string;
  name: string;
  durationHours: number;
};

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function asHours(value: unknown): number | null {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return roundHours(hours);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function consultingTutorKeyForSlug(slug: string | null | undefined): CollegeConsultingTutorKey | null {
  if (!slug) return null;
  const hour = collegeConsultingProductBySlug(slug);
  if (hour) return hour.tutorKey;
  return COLLEGE_CONSULTING_LENGTH_PRODUCTS.find((product) => product.slug === slug)?.tutorKey ?? null;
}

function tutorLabel(slug: string | null, tutor: HistoryTutor | undefined): string | null {
  const consultingKey = consultingTutorKeyForSlug(slug);
  if (consultingKey) return consultingTutorDisplayName(consultingKey);
  const satKey = slug ? satTutorKeyForSlug(slug) : null;
  if (satKey && TUTOR_LABELS[satKey]) return TUTOR_LABELS[satKey];
  const name = tutor?.name.trim() ?? "";
  if (!name) return null;
  return name.split(/\s+/)[0] || name;
}

function serviceLabel(slug: string | null): string {
  if (isCollegeConsultingSlug(slug)) return "College Consulting";
  if (slug?.startsWith("sat-") || (slug ? satTutorKeyForSlug(slug) : null)) return "SAT";
  return "Purchase";
}

function publicPaymentStatus(
  status: string,
  amountCents: number,
  refundedAmountCents: number,
): string {
  if (status === "refunded" || (amountCents > 0 && refundedAmountCents >= amountCents)) {
    return "refunded";
  }
  if (status === "partially_refunded" || refundedAmountCents > 0) return "partially refunded";
  if (status === "partially_paid") return "partially paid";
  if (status === "paid") return "paid";
  return status;
}

function ledgerCoveredByPayment(entry: HistoryLedger, paymentIds: Set<string>): boolean {
  if (entry.referenceType === "payment" && entry.referenceId && paymentIds.has(entry.referenceId)) {
    return true;
  }
  if (!entry.fulfillmentKey) return false;
  for (const paymentId of paymentIds) {
    if (entry.fulfillmentKey === purchaseCreditFulfillmentKey(paymentId)) return true;
  }
  return false;
}

export function billingHistoryItems(input: {
  clientUserId: string;
  payments: HistoryPayment[];
  tutors: HistoryTutor[];
  sessions: HistorySession[];
  ledger: HistoryLedger[];
  products: HistoryProduct[];
}): BillingHistoryEntry[] {
  const tutors = new Map(input.tutors.map((tutor) => [tutor.id, tutor]));
  const sessions = new Map(
    input.sessions
      .filter((session) => session.clientUserId === input.clientUserId)
      .map((session) => [session.id, session]),
  );
  const products = new Map(input.products.map((product) => [product.id, product]));
  const visiblePayments = input.payments.filter((payment) =>
    (BILLING_HISTORY_PAYMENT_STATUSES as readonly string[]).includes(payment.status),
  );
  const paymentIds = new Set(visiblePayments.map((payment) => payment.id));
  const entries: BillingHistoryEntry[] = [];

  for (const payment of visiblePayments) {
    const intent = bookingIntentFromMetadata(payment.auditMetadata);
    const sessionId = bookedSessionIdFromMetadata(payment.auditMetadata);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    const tutor =
      (payment.tutorProfileId ? tutors.get(payment.tutorProfileId) : undefined) ??
      (intent ? tutors.get(intent.tutorProfileId) : undefined);
    const intentHours = intent ? asHours(intent.durationMinutes / 60) : null;
    const purchasedAt = iso(payment.paidAt ?? payment.createdAt) ?? new Date(0).toISOString();
    entries.push({
      id: payment.id,
      purchasedAt,
      label: payment.productName?.trim() || "Payment",
      service: serviceLabel(payment.productSlug),
      tutorName: tutorLabel(payment.productSlug, tutor),
      hours: intentHours ?? asHours(payment.durationHours),
      sessionTitle: session?.title ?? null,
      sessionStart: iso(session?.dateTime) ?? (intent ? iso(intent.startTime) : null),
      amountCents: Number.isFinite(Number(payment.amountCents)) ? Math.round(Number(payment.amountCents)) : null,
      status: publicPaymentStatus(
        payment.status,
        Number(payment.amountCents) || 0,
        Number(payment.refundedAmountCents) || 0,
      ),
    });
  }

  for (const entry of input.ledger) {
    if (entry.entryType !== "original" && entry.entryType !== "adjustment_credit") continue;
    if (ledgerCoveredByPayment(entry, paymentIds)) continue;
    const hours = asHours(entry.hours);
    if (hours === null) continue;
    const product = entry.productId ? products.get(entry.productId) : undefined;
    entries.push({
      id: `ledger:${entry.id}`,
      purchasedAt: iso(entry.createdAt) ?? new Date(0).toISOString(),
      label: product?.name?.trim() || "Prepaid hours",
      service: serviceLabel(product?.slug ?? null),
      tutorName: tutorLabel(product?.slug ?? null, undefined),
      hours,
      sessionTitle: null,
      sessionStart: null,
      amountCents: null,
      status: "credited",
    });
  }

  return entries.sort((left, right) => right.purchasedAt.localeCompare(left.purchasedAt));
}

export async function loadBillingHistory(clientUserId: string): Promise<BillingHistoryEntry[]> {
  const [paymentRows, ledgerRows] = await Promise.all([
    db
      .select({
        id: paymentsTable.id,
        amountCents: paymentsTable.amountCents,
        refundedAmountCents: paymentsTable.refundedAmountCents,
        status: paymentsTable.status,
        paidAt: paymentsTable.paidAt,
        createdAt: paymentsTable.createdAt,
        productName: satProductsTable.name,
        productSlug: satProductsTable.slug,
        durationHours: satProductsTable.durationHours,
        tutorProfileId: paymentsTable.tutorProfileId,
        auditMetadata: paymentsTable.auditMetadata,
      })
      .from(paymentsTable)
      .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
      .where(eq(paymentsTable.clientUserId, clientUserId)),
    db
      .select({
        id: creditLedgerTable.id,
        entryType: creditLedgerTable.entryType,
        hours: creditLedgerTable.hours,
        productId: creditLedgerTable.productId,
        referenceType: creditLedgerTable.referenceType,
        referenceId: creditLedgerTable.referenceId,
        fulfillmentKey: creditLedgerTable.fulfillmentKey,
        createdAt: creditLedgerTable.createdAt,
      })
      .from(creditLedgerTable)
      .where(eq(creditLedgerTable.clientUserId, clientUserId)),
  ]);

  const tutorIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const payment of paymentRows) {
    const tutorId = storedId(payment.tutorProfileId);
    if (tutorId) tutorIds.add(tutorId);
    const intent = bookingIntentFromMetadata(payment.auditMetadata);
    const intentTutorId = storedId(intent?.tutorProfileId);
    if (intentTutorId) tutorIds.add(intentTutorId);
    const sessionId = storedId(bookedSessionIdFromMetadata(payment.auditMetadata));
    if (sessionId) sessionIds.add(sessionId);
  }
  const productIds = [
    ...new Set(
      ledgerRows
        .map((entry) => entry.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [tutors, sessions, products] = await Promise.all([
    tutorIds.size === 0
      ? Promise.resolve([])
      : db
          .select({ id: tutorProfilesTable.id, name: tutorProfilesTable.name })
          .from(tutorProfilesTable)
          .where(inArray(tutorProfilesTable.id, [...tutorIds])),
    sessionIds.size === 0
      ? Promise.resolve([])
      : db
          .select({
            id: sessionsTable.id,
            title: sessionsTable.title,
            dateTime: sessionsTable.dateTime,
            clientUserId: sessionsTable.clientUserId,
          })
          .from(sessionsTable)
          .where(
            and(
              inArray(sessionsTable.id, [...sessionIds]),
              eq(sessionsTable.clientUserId, clientUserId),
            ),
          ),
    productIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: satProductsTable.id,
            slug: satProductsTable.slug,
            name: satProductsTable.name,
            durationHours: satProductsTable.durationHours,
          })
          .from(satProductsTable)
          .where(inArray(satProductsTable.id, productIds)),
  ]);

  return billingHistoryItems({
    clientUserId,
    payments: paymentRows,
    tutors,
    sessions,
    ledger: ledgerRows,
    products,
  });
}
