import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  checkoutAudienceForSlug,
  clientMayBuyConsultingProduct,
  consultingSlugsForTutorKey,
  isCollegeConsultingSlug,
  NEEL_DHARNI_USER_ID,
} from "./college-consulting.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  ESSAY_FOLLOWUP_CREDIT_SLUG,
  ESSAY_FOLLOWUP_DURATION_MINUTES,
  ESSAY_PDF_MAX_BYTES,
  NIKA_ESSAY_ASYNC_SLUG,
  NIKA_ESSAY_FOLLOWUP_SLUG,
  canMarkEssayDone,
  canUploadEditedEssay,
  dueAtIsFarEnough,
  essayCheckoutHold,
  essayFileDecision,
  essayPurchaseCreditPlan,
  essayRefundHours,
  essayRequestView,
  followUpCallIsFarEnough,
  followUpDueAt,
  tutorIsNika,
  validateEssayPdf,
} from "./essay-editing.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { processStripeWebhook } from "./payment-service.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { backfillPaidUncreditedPayments, listPaidUncreditedPayments } from "./payment-fulfillment.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("essay due time and follow-up call allow exactly 24 hours", () => {
  const uploaded = new Date("2026-10-17T15:00:00.000Z");
  const exact = new Date(uploaded.getTime() + DAY);
  const early = new Date(exact.getTime() - 1);
  assert.equal(dueAtIsFarEnough(uploaded, exact), true);
  assert.equal(dueAtIsFarEnough(uploaded, early), false);
  assert.equal(followUpCallIsFarEnough(uploaded, exact), true);
  assert.equal(followUpCallIsFarEnough(uploaded, early), false);
  assert.equal(followUpDueAt(exact).toISOString(), exact.toISOString());
  const asyncHold = essayCheckoutHold({
    kind: "async",
    uploadedAt: uploaded,
    dueAt: exact,
    callStart: null,
  });
  assert.equal(asyncHold.ok, true);
  if (asyncHold.ok) assert.equal(asyncHold.hold.hold, false);
  const follow = essayCheckoutHold({
    kind: "followup",
    uploadedAt: uploaded,
    dueAt: null,
    callStart: exact,
  });
  assert.equal(follow.ok, true);
  if (follow.ok && follow.hold.hold) {
    assert.equal(follow.hold.durationMinutes, ESSAY_FOLLOWUP_DURATION_MINUTES);
    assert.equal(follow.hold.durationMinutes, 60);
    assert.equal(follow.hold.meetingHours, 1);
    assert.equal(follow.hold.dueAt.toISOString(), exact.toISOString());
  } else {
    assert.fail("follow-up hold missing");
  }
  const tooSoon = essayCheckoutHold({
    kind: "followup",
    uploadedAt: uploaded,
    dueAt: null,
    callStart: early,
  });
  assert.equal(tooSoon.ok, false);
});

test("essay PDFs must be a real PDF within 10 MB", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n");
  assert.equal(validateEssayPdf(pdf, "essay.PDF").ok, true);
  assert.equal(validateEssayPdf(Buffer.alloc(0), "essay.pdf").ok, false);
  assert.equal(validateEssayPdf(Buffer.from("not a pdf"), "essay.pdf").ok, false);
  assert.equal(validateEssayPdf(pdf, "essay.docx").ok, false);
  const oversized = Buffer.alloc(ESSAY_PDF_MAX_BYTES + 1);
  pdf.copy(oversized);
  const tooBig = validateEssayPdf(oversized, "essay.pdf");
  assert.equal(tooBig.ok, false);
  if (!tooBig.ok) assert.match(tooBig.error, /10 MB/);
});

test("essay files are limited to the client, Nika, and administrators", () => {
  const client = "client-1";
  const nika = "tutor-nika";
  const otherTutor = "tutor-other";
  const base = {
    clientUserId: client,
    tutorUserId: nika,
    status: "submitted",
    hasEditedFile: true,
  };
  assert.equal(
    essayFileDecision({ actor: { userId: client, role: "student" }, ...base, which: "original" }),
    "allow",
  );
  assert.equal(
    essayFileDecision({ actor: { userId: client, role: "student" }, ...base, which: "edited" }),
    "deny",
  );
  assert.equal(
    essayFileDecision({
      actor: { userId: client, role: "student" },
      ...base,
      status: "done",
      which: "edited",
    }),
    "allow",
  );
  assert.equal(
    essayFileDecision({ actor: { userId: "other", role: "student" }, ...base, which: "original" }),
    "deny",
  );
  assert.equal(
    essayFileDecision({ actor: { userId: nika, role: "tutor" }, ...base, which: "original" }),
    "allow",
  );
  assert.equal(
    essayFileDecision({
      actor: { userId: nika, role: "tutor" },
      ...base,
      status: "pending_payment",
      which: "original",
    }),
    "deny",
  );
  assert.equal(
    essayFileDecision({ actor: { userId: otherTutor, role: "tutor" }, ...base, which: "original" }),
    "deny",
  );
  assert.equal(
    essayFileDecision({ actor: { userId: "admin", role: "administrator" }, ...base, which: "edited" }),
    "allow",
  );
  assert.equal(
    essayFileDecision({
      actor: { userId: "admin", role: "administrator" },
      ...base,
      hasEditedFile: false,
      which: "edited",
    }),
    "missing",
  );
  assert.equal(canUploadEditedEssay({ actor: { userId: nika, role: "tutor" }, tutorUserId: nika, status: "submitted" }), true);
  assert.equal(canUploadEditedEssay({ actor: { userId: otherTutor, role: "tutor" }, tutorUserId: nika, status: "submitted" }), false);
  assert.equal(
    canMarkEssayDone({
      actor: { userId: nika, role: "tutor" },
      tutorUserId: nika,
      status: "submitted",
      hasEditedFile: false,
    }),
    false,
  );
  const view = essayRequestView({
    actor: { userId: nika, role: "tutor" },
    id: "req",
    kind: "async",
    status: "submitted",
    dueAt: new Date("2026-10-20T15:00:00.000Z"),
    callStart: null,
    createdAt: new Date("2026-10-17T15:00:00.000Z"),
    completedAt: null,
    originalFilename: "essay.pdf",
    editedFilename: null,
    sessionId: null,
    clientUserId: client,
    clientDisplayName: "Neel Dharni",
    clientEmail: "ndharni300@gmail.com",
    tutorUserId: nika,
  });
  assert.equal(view?.clientFirstName, "Neel");
  assert.equal(view?.clientEmail, undefined);
  assert.equal(view?.clientName, undefined);
});

test("essay products stay scoped to Nika and off the meeting-hour pool", () => {
  assert.equal(tutorIsNika({ email: "nika.raiffe@gmail.com", name: "Nika Raiffe" }), true);
  assert.equal(tutorIsNika({ email: "someone@example.com", name: "Nika Raiffe" }), false);
  assert.equal(tutorIsNika({ email: "", name: "Nika Raiffe" }), true);
  assert.equal(tutorIsNika({ email: "victoria@example.com", name: "Victoria" }), false);
  const nikaHours = consultingSlugsForTutorKey("nika");
  assert.equal(nikaHours.includes(NIKA_ESSAY_ASYNC_SLUG), false);
  assert.equal(nikaHours.includes(NIKA_ESSAY_FOLLOWUP_SLUG), false);
  assert.equal(nikaHours.includes(ESSAY_FOLLOWUP_CREDIT_SLUG), true);
  assert.equal(isCollegeConsultingSlug(NIKA_ESSAY_ASYNC_SLUG), true);
  assert.equal(isCollegeConsultingSlug(NIKA_ESSAY_FOLLOWUP_SLUG), true);
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, NIKA_ESSAY_ASYNC_SLUG), "consulting");
  assert.equal(checkoutAudienceForSlug(NEEL_DHARNI_USER_ID, NIKA_ESSAY_FOLLOWUP_SLUG), "consulting");
  assert.equal(checkoutAudienceForSlug("someone-else", NIKA_ESSAY_FOLLOWUP_SLUG), "forbidden");
  assert.equal(clientMayBuyConsultingProduct(NEEL_DHARNI_USER_ID, NIKA_ESSAY_ASYNC_SLUG), true);
  assert.equal(clientMayBuyConsultingProduct("someone-else", NIKA_ESSAY_ASYNC_SLUG), false);
  assert.deepEqual(essayPurchaseCreditPlan(NIKA_ESSAY_ASYNC_SLUG), {
    meetingHours: 0,
    creditSlug: null,
  });
  assert.deepEqual(essayPurchaseCreditPlan(NIKA_ESSAY_FOLLOWUP_SLUG), {
    meetingHours: 1,
    creditSlug: ESSAY_FOLLOWUP_CREDIT_SLUG,
  });
  assert.equal(essayPurchaseCreditPlan("college-consulting-nika-120"), null);
  assert.deepEqual(
    essayRefundHours({ slug: NIKA_ESSAY_ASYNC_SLUG, deltaCents: 10_000, amountCents: 10_000 }),
    { hours: 0, creditSlug: null },
  );
  assert.deepEqual(
    essayRefundHours({ slug: NIKA_ESSAY_FOLLOWUP_SLUG, deltaCents: 20_000, amountCents: 20_000 }),
    { hours: 1, creditSlug: ESSAY_FOLLOWUP_CREDIT_SLUG },
  );
});

test("webhook booking uses the essay fulfillment path and the 60-minute hold", () => {
  const payment = readFileSync(new URL("./payment-service.ts", import.meta.url), "utf8");
  const platform = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const http = readFileSync(new URL("./essay-request-http.ts", import.meta.url), "utf8");
  assert.match(payment, /fulfillEssayPaymentInTx/);
  assert.match(payment, /bookHeldCheckoutIfActive\(paidPaymentId\)/);
  assert.match(platform, /linkEssayRequestToSession\(paymentId, sessionId\)/);
  assert.match(platform, /handleEssayCheckoutRequest/);
  assert.match(http, /claimBookingSlotHold/);
  assert.match(http, /durationMinutes: bookingIntent\.durationMinutes/);
  assert.match(http, /creditsGrantedOnPaidWebhook: hold\.hold\.meetingHours/);
});

type DatabaseModule = typeof import("@workspace/db");
let database: DatabaseModule | null = null;

async function loadDb(): Promise<DatabaseModule> {
  if (!database) database = await import("@workspace/db");
  return database;
}

test("paid essay webhook submits the request and does not grant meeting hours on the essay product", async () => {
  const db = await loadDb();
  const suffix = randomUUID().slice(0, 8);
  const userId = randomUUID();
  const tutorUserId = randomUUID();
  const tutorProfileId = randomUUID();
  const asyncPaymentId = randomUUID();
  const followPaymentId = randomUUID();
  const asyncInvoiceId = randomUUID();
  const followInvoiceId = randomUUID();
  const asyncRequestId = randomUUID();
  const followRequestId = randomUUID();
  const pdf = Buffer.from("%PDF-1.4\nfixture\n");
  const callStart = new Date(Date.now() + 48 * HOUR);

  await db.db.insert(db.usersTable).values([
    {
      id: userId,
      clerkUserId: `essay-client-${suffix}`,
      email: `essay-client-${suffix}@example.invalid`,
      displayName: `Essay${suffix} Client`,
      role: "student",
    },
    {
      id: tutorUserId,
      clerkUserId: `essay-tutor-${suffix}`,
      email: `essay-tutor-${suffix}@example.invalid`,
      displayName: "Essay Fixture Tutor",
      role: "tutor",
    },
  ]);
  await db.db.insert(db.tutorProfilesTable).values({
    id: tutorProfileId,
    userId: tutorUserId,
    email: `essay-fixture-${suffix}@example.invalid`,
    name: "Essay Fixture",
    active: true,
    bookingEligible: false,
  });
  await db.db
    .insert(db.satProductsTable)
    .values([
      {
        slug: NIKA_ESSAY_ASYNC_SLUG,
        name: "Essay editing, 1 hr (async)",
        description: "Async essay editing",
        durationHours: 1,
        totalPriceCents: 10_000,
        effectiveHourlyRateCents: 10_000,
        active: true,
      },
      {
        slug: NIKA_ESSAY_FOLLOWUP_SLUG,
        name: "Essay editing + 1 hr follow-up call, 2 hrs",
        description: "Essay editing plus a follow-up call",
        durationHours: 2,
        totalPriceCents: 20_000,
        effectiveHourlyRateCents: 10_000,
        active: true,
      },
      {
        slug: ESSAY_FOLLOWUP_CREDIT_SLUG,
        name: "College Consulting hour with Nika",
        description: "One prepaid hour",
        durationHours: 1,
        totalPriceCents: 10_000,
        effectiveHourlyRateCents: 10_000,
        active: true,
      },
    ])
    .onConflictDoNothing({ target: db.satProductsTable.slug });
  const products = await db.db
    .select()
    .from(db.satProductsTable)
    .where(eq(db.satProductsTable.active, true));
  const asyncProduct = products.find((product) => product.slug === NIKA_ESSAY_ASYNC_SLUG);
  const followProduct = products.find((product) => product.slug === NIKA_ESSAY_FOLLOWUP_SLUG);
  const hourProduct = products.find((product) => product.slug === ESSAY_FOLLOWUP_CREDIT_SLUG);
  assert.ok(asyncProduct && followProduct && hourProduct);

  await db.db.insert(db.invoicesTable).values([
    {
      id: asyncInvoiceId,
      clientUserId: userId,
      status: "pending",
      provider: "stripe_checkout",
      description: "Async essay",
      subtotalCents: 10_000,
      totalCents: 10_000,
    },
    {
      id: followInvoiceId,
      clientUserId: userId,
      status: "pending",
      provider: "stripe_checkout",
      description: "Essay follow-up",
      subtotalCents: 20_000,
      totalCents: 20_000,
    },
  ]);
  await db.db.insert(db.paymentsTable).values([
    {
      id: asyncPaymentId,
      clientUserId: userId,
      invoiceId: asyncInvoiceId,
      productId: asyncProduct.id,
      amountCents: 10_000,
      tutorShareCents: 0,
      platformShareCents: 10_000,
      status: "pending",
      method: "stripe_checkout",
      providerCheckoutSessionId: `cs_essay_async_${suffix}`,
      auditMetadata: { essayRequestId: asyncRequestId, offer: NIKA_ESSAY_ASYNC_SLUG },
    },
    {
      id: followPaymentId,
      clientUserId: userId,
      invoiceId: followInvoiceId,
      productId: followProduct.id,
      amountCents: 20_000,
      tutorShareCents: 0,
      platformShareCents: 20_000,
      status: "pending",
      method: "stripe_checkout",
      providerCheckoutSessionId: `cs_essay_follow_${suffix}`,
      auditMetadata: {
        essayRequestId: followRequestId,
        offer: NIKA_ESSAY_FOLLOWUP_SLUG,
        bookingIntent: {
          tutorProfileId,
          startTime: callStart.toISOString(),
          durationMinutes: 60,
        },
      },
    },
  ]);
  await db.db.insert(db.essayRequestsTable).values([
    {
      id: asyncRequestId,
      clientUserId: userId,
      tutorProfileId,
      productId: asyncProduct.id,
      paymentId: asyncPaymentId,
      kind: "async",
      status: "pending_payment",
      dueAt: callStart,
      originalFilename: "essay.pdf",
      originalPdf: pdf,
      originalBytes: pdf.length,
    },
    {
      id: followRequestId,
      clientUserId: userId,
      tutorProfileId,
      productId: followProduct.id,
      paymentId: followPaymentId,
      kind: "followup",
      status: "pending_payment",
      dueAt: callStart,
      callStart,
      originalFilename: "essay.pdf",
      originalPdf: pdf,
      originalBytes: pdf.length,
    },
  ]);
  await db.db.insert(db.bookingSlotHoldsTable).values({
    tutorProfileId,
    clientUserId: userId,
    paymentId: followPaymentId,
    startTime: callStart,
    durationMinutes: 60,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  try {
    await processStripeWebhook({
      id: `evt_${asyncPaymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_essay_async_${suffix}`,
          payment_status: "paid",
          amount_total: 10_000,
          metadata: { payment_id: asyncPaymentId },
        },
      },
    });
    await processStripeWebhook({
      id: `evt_${followPaymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_essay_follow_${suffix}`,
          payment_status: "paid",
          amount_total: 20_000,
          metadata: { payment_id: followPaymentId },
        },
      },
    });
    await processStripeWebhook({
      id: `evt_repeat_${followPaymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_essay_follow_${suffix}`,
          payment_status: "paid",
          amount_total: 20_000,
          metadata: { payment_id: followPaymentId },
        },
      },
    });

    const requests = await db.db
      .select()
      .from(db.essayRequestsTable)
      .where(eq(db.essayRequestsTable.clientUserId, userId));
    assert.equal(requests.length, 2);
    assert.ok(requests.every((row) => row.status === "submitted"));
    const entries = await db.db
      .select()
      .from(db.creditLedgerTable)
      .where(eq(db.creditLedgerTable.clientUserId, userId));
    const essayHours = entries
      .filter((entry) => entry.productId === asyncProduct.id || entry.productId === followProduct.id)
      .reduce((total, entry) => total + Number(entry.hours), 0);
    const followHours = entries
      .filter((entry) => entry.productId === hourProduct.id)
      .reduce((total, entry) => total + Number(entry.hours), 0);
    assert.equal(essayHours, 0);
    assert.equal(followHours, 1);
    assert.equal(entries.filter((entry) => entry.productId === hourProduct.id).length, 1);
    const [followPayment] = await db.db
      .select()
      .from(db.paymentsTable)
      .where(eq(db.paymentsTable.id, followPaymentId));
    const intent = (followPayment?.auditMetadata as { bookingIntent?: { durationMinutes?: number } })
      .bookingIntent;
    assert.equal(intent?.durationMinutes, 60);
    const [hold] = await db.db
      .select()
      .from(db.bookingSlotHoldsTable)
      .where(eq(db.bookingSlotHoldsTable.paymentId, followPaymentId));
    assert.equal(Number(hold?.durationMinutes), 60);
    assert.equal(hold?.releasedAt ?? null, null);
    const mismatches = await listPaidUncreditedPayments(200);
    assert.equal(mismatches.some((row) => row.paymentId === asyncPaymentId), false);
    assert.equal(mismatches.some((row) => row.paymentId === followPaymentId), false);
    const backfill = await backfillPaidUncreditedPayments({
      paymentId: followPaymentId,
      dryRun: true,
    });
    assert.equal(backfill.granted.length, 0);
    assert.equal(backfill.skipped[0]?.reason, "not_a_paid_uncredited_payment");
  } finally {
    await db.db
      .delete(db.adminNotificationsTable)
      .where(sql`message like ${"%" + suffix + "%"}`);
    await db.db.delete(db.essayRequestsTable).where(eq(db.essayRequestsTable.clientUserId, userId));
    await db.db.delete(db.bookingSlotHoldsTable).where(eq(db.bookingSlotHoldsTable.paymentId, followPaymentId));
    await db.db.delete(db.creditLedgerTable).where(eq(db.creditLedgerTable.clientUserId, userId));
    await db.db.delete(db.stripeWebhookEventsTable).where(eq(db.stripeWebhookEventsTable.providerEventId, `evt_${asyncPaymentId}`));
    await db.db.delete(db.stripeWebhookEventsTable).where(eq(db.stripeWebhookEventsTable.providerEventId, `evt_${followPaymentId}`));
    await db.db.delete(db.stripeWebhookEventsTable).where(eq(db.stripeWebhookEventsTable.providerEventId, `evt_repeat_${followPaymentId}`));
    await db.db.delete(db.paymentsTable).where(eq(db.paymentsTable.clientUserId, userId));
    await db.db.delete(db.invoicesTable).where(eq(db.invoicesTable.clientUserId, userId));
    await db.db.delete(db.tutorProfilesTable).where(eq(db.tutorProfilesTable.id, tutorProfileId));
    await db.db.delete(db.usersTable).where(eq(db.usersTable.id, userId));
    await db.db.delete(db.usersTable).where(eq(db.usersTable.id, tutorUserId));
  }
});
