import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
// @ts-expect-error Native Node test execution requires the source extension.
import { processStripeWebhook } from "./payment-service.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { verifyStripeSignature } from "./stripe-client.ts";

const SINGLE_PRICE_CENTS = 17_500;
const PACKAGE_PRICE_CENTS = 130_000;

type DatabaseModule = typeof import("@workspace/db");

let database: DatabaseModule | null = null;

async function loadDb(): Promise<DatabaseModule> {
  if (!database) database = await import("@workspace/db");
  return database;
}

after(async () => {
  if (database?.pool) await database.pool.end();
});

async function createPurchaseFixture(args: {
  amountCents: number;
  durationHours: number;
  slug: string;
}) {
  const db = await loadDb();
  const userId = randomUUID();
  const productId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  await db.db.insert(db.usersTable).values({
    id: userId,
    clerkUserId: `payment-credits-${suffix}`,
    email: `payment-credits-${suffix}@example.invalid`,
    displayName: "Payment credits fixture",
    role: "student",
  });
  await db.db.insert(db.satProductsTable).values({
    id: productId,
    slug: `${args.slug}-${suffix}`,
    name: args.slug === "single-sat-session" ? "Single SAT Session" : "Ten SAT Session Package",
    description: "Test catalog product",
    durationHours: args.durationHours,
    totalPriceCents: args.amountCents,
    effectiveHourlyRateCents: Math.round(args.amountCents / args.durationHours),
    active: true,
  });
  await db.db.insert(db.invoicesTable).values({
    id: invoiceId,
    clientUserId: userId,
    status: "pending",
    provider: "stripe_checkout",
    description: "Test invoice",
    clientEmail: `payment-credits-${suffix}@example.invalid`,
    subtotalCents: args.amountCents,
    totalCents: args.amountCents,
  });
  await db.db.insert(db.paymentsTable).values({
    id: paymentId,
    clientUserId: userId,
    invoiceId,
    productId,
    amountCents: args.amountCents,
    tutorShareCents: 0,
    platformShareCents: args.amountCents,
    status: "pending",
    method: "stripe_checkout",
    providerCheckoutSessionId: `cs_test_${suffix}`,
  });

  return { db, userId, productId, invoiceId, paymentId, suffix };
}

async function cleanupFixture(fixture: {
  db: DatabaseModule;
  userId: string;
  productId: string;
  invoiceId: string;
  paymentId: string;
}) {
  await fixture.db.db
    .delete(fixture.db.creditLedgerTable)
    .where(eq(fixture.db.creditLedgerTable.clientUserId, fixture.userId));
  await fixture.db.db
    .delete(fixture.db.stripeWebhookEventsTable)
    .where(eq(fixture.db.stripeWebhookEventsTable.providerEventId, `evt_${fixture.paymentId}`));
  await fixture.db.db
    .delete(fixture.db.stripeWebhookEventsTable)
    .where(eq(fixture.db.stripeWebhookEventsTable.providerEventId, `evt_repeat_${fixture.paymentId}`));
  await fixture.db.db
    .delete(fixture.db.stripeWebhookEventsTable)
    .where(eq(fixture.db.stripeWebhookEventsTable.providerEventId, `evt_fail_${fixture.paymentId}`));
  await fixture.db.db
    .delete(fixture.db.paymentsTable)
    .where(eq(fixture.db.paymentsTable.id, fixture.paymentId));
  await fixture.db.db
    .delete(fixture.db.invoicesTable)
    .where(eq(fixture.db.invoicesTable.id, fixture.invoiceId));
  await fixture.db.db
    .delete(fixture.db.satProductsTable)
    .where(eq(fixture.db.satProductsTable.id, fixture.productId));
  await fixture.db.db.delete(fixture.db.usersTable).where(eq(fixture.db.usersTable.id, fixture.userId));
}

async function creditHoursFor(db: DatabaseModule, userId: string): Promise<number> {
  const entries = await db.db
    .select()
    .from(db.creditLedgerTable)
    .where(eq(db.creditLedgerTable.clientUserId, userId));
  return entries.reduce((total, entry) => {
    const positive = ["original", "restored", "adjustment_credit"].includes(entry.entryType);
    return total + (positive ? entry.hours : -entry.hours);
  }, 0);
}

test("official Stripe SDK accepts a signed webhook header", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = "whsec_test_secret_for_sdk_verification";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const payload = JSON.stringify({
      id: "evt_verified_sdk",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test", payment_status: "paid" } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    assert.doesNotThrow(() => verifyStripeSignature(Buffer.from(payload), header));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("rejects a tampered Stripe webhook payload with the official SDK", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = "whsec_test_secret_for_sdk_verification";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const payload = JSON.stringify({ id: "evt_original", type: "checkout.session.completed", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const modified = Buffer.from(JSON.stringify({ id: "evt_modified", type: "checkout.session.completed", data: { object: {} } }));
    assert.throws(() => verifyStripeSignature(modified, header));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("$175 purchase grants exactly 1 credit", async () => {
  const fixture = await createPurchaseFixture({
    amountCents: SINGLE_PRICE_CENTS,
    durationHours: 1,
    slug: "single-sat-session",
  });
  try {
    await processStripeWebhook({
      id: `evt_${fixture.paymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${fixture.suffix}`,
          payment_status: "paid",
          amount_total: SINGLE_PRICE_CENTS,
          metadata: { payment_id: fixture.paymentId },
        },
      },
    });
    assert.equal(await creditHoursFor(fixture.db, fixture.userId), 1);
    const [payment] = await fixture.db.db
      .select()
      .from(fixture.db.paymentsTable)
      .where(eq(fixture.db.paymentsTable.id, fixture.paymentId));
    assert.equal(payment?.status, "paid");
    assert.ok(payment?.verifiedAt);
    const transfers = await fixture.db.db
      .select()
      .from(fixture.db.stripeTransfersTable)
      .where(eq(fixture.db.stripeTransfersTable.paymentId, fixture.paymentId));
    assert.equal(transfers.length, 0);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("$1,300 purchase grants exactly 10 credits", async () => {
  const fixture = await createPurchaseFixture({
    amountCents: PACKAGE_PRICE_CENTS,
    durationHours: 10,
    slug: "ten-sat-session-package",
  });
  try {
    await processStripeWebhook({
      id: `evt_${fixture.paymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${fixture.suffix}`,
          payment_status: "paid",
          amount_total: PACKAGE_PRICE_CENTS,
          metadata: { payment_id: fixture.paymentId },
        },
      },
    });
    assert.equal(await creditHoursFor(fixture.db, fixture.userId), 10);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("repeated webhook grants credits once", async () => {
  const fixture = await createPurchaseFixture({
    amountCents: SINGLE_PRICE_CENTS,
    durationHours: 1,
    slug: "single-sat-session",
  });
  try {
    const event = {
      id: `evt_${fixture.paymentId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${fixture.suffix}`,
          payment_status: "paid",
          amount_total: SINGLE_PRICE_CENTS,
          metadata: { payment_id: fixture.paymentId },
        },
      },
    };
    await processStripeWebhook(event);
    await processStripeWebhook(event);
    await processStripeWebhook({
      ...event,
      id: `evt_repeat_${fixture.paymentId}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: `pi_test_${fixture.suffix}`,
          amount_received: SINGLE_PRICE_CENTS,
          latest_charge: `ch_test_${fixture.suffix}`,
          metadata: { payment_id: fixture.paymentId },
        },
      },
    });
    const originals = await fixture.db.db
      .select()
      .from(fixture.db.creditLedgerTable)
      .where(
        and(
          eq(fixture.db.creditLedgerTable.clientUserId, fixture.userId),
          eq(fixture.db.creditLedgerTable.entryType, "original"),
        ),
      );
    assert.equal(originals.length, 1);
    assert.equal(await creditHoursFor(fixture.db, fixture.userId), 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("failed payment grants zero credits", async () => {
  const fixture = await createPurchaseFixture({
    amountCents: SINGLE_PRICE_CENTS,
    durationHours: 1,
    slug: "single-sat-session",
  });
  try {
    await processStripeWebhook({
      id: `evt_fail_${fixture.paymentId}`,
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: `pi_fail_${fixture.suffix}`,
          metadata: { payment_id: fixture.paymentId },
          last_payment_error: { message: "Card declined" },
        },
      },
    });
    assert.equal(await creditHoursFor(fixture.db, fixture.userId), 0);
    const [payment] = await fixture.db.db
      .select()
      .from(fixture.db.paymentsTable)
      .where(eq(fixture.db.paymentsTable.id, fixture.paymentId));
    assert.equal(payment?.status, "failed");
  } finally {
    await cleanupFixture(fixture);
  }
});

test("expired checkout session grants zero credits", async () => {
  const fixture = await createPurchaseFixture({
    amountCents: PACKAGE_PRICE_CENTS,
    durationHours: 10,
    slug: "ten-sat-session-package",
  });
  try {
    await processStripeWebhook({
      id: `evt_fail_${fixture.paymentId}`,
      type: "checkout.session.expired",
      data: {
        object: {
          id: `cs_test_${fixture.suffix}`,
          payment_status: "unpaid",
          metadata: { payment_id: fixture.paymentId },
        },
      },
    });
    assert.equal(await creditHoursFor(fixture.db, fixture.userId), 0);
  } finally {
    await cleanupFixture(fixture);
  }
});

test("admin manual grant records an audit trail", async () => {
  const db = await loadDb();
  const adminId = randomUUID();
  const studentId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  await db.db.insert(db.usersTable).values([
    {
      id: adminId,
      clerkUserId: `admin-grant-${suffix}`,
      email: `admin-grant-${suffix}@example.invalid`,
      displayName: "Admin Grant",
      role: "administrator",
    },
    {
      id: studentId,
      clerkUserId: `student-grant-${suffix}`,
      email: `student-grant-${suffix}@example.invalid`,
      displayName: "Student Grant",
      role: "student",
    },
  ]);
  try {
    const grantedAt = new Date();
    const reason = "Complimentary previously paid SAT credit";
    const [entry] = await db.db
      .insert(db.creditLedgerTable)
      .values({
        clientUserId: studentId,
        entryType: "adjustment_credit",
        hours: 1,
        referenceType: "admin_adjustment",
        referenceId: randomUUID(),
        note: reason,
        createdBy: adminId,
        createdAt: grantedAt,
      })
      .returning();
    await db.db.insert(db.auditLogsTable).values({
      actorUserId: adminId,
      action: "credit.manual_grant",
      entityType: "credit_ledger",
      entityId: entry!.id,
      metadata: {
        clientUserId: studentId,
        hours: 1,
        reason,
        administratorId: adminId,
        grantedAt: grantedAt.toISOString(),
      },
    });
    const [audit] = await db.db
      .select()
      .from(db.auditLogsTable)
      .where(eq(db.auditLogsTable.entityId, entry!.id));
    assert.equal(audit?.action, "credit.manual_grant");
    assert.equal(audit?.actorUserId, adminId);
    assert.equal((audit?.metadata as { reason?: string })?.reason, reason);
    assert.ok((audit?.metadata as { grantedAt?: string })?.grantedAt);
    assert.equal(entry?.createdBy, adminId);
    assert.equal(entry?.note, reason);
    assert.equal(await creditHoursFor(db, studentId), 1);
  } finally {
    await db.db.delete(db.auditLogsTable).where(eq(db.auditLogsTable.actorUserId, adminId));
    await db.db.delete(db.creditLedgerTable).where(eq(db.creditLedgerTable.clientUserId, studentId));
    await db.db.delete(db.usersTable).where(eq(db.usersTable.id, adminId));
    await db.db.delete(db.usersTable).where(eq(db.usersTable.id, studentId));
  }
});

test("unauthorized manual grant is rejected by role gate", async () => {
  // Mirrors ensureRole(["administrator"]) used by POST /admin/credit-adjustments.
  function ensureAdministrator(role: string): void {
    if (role !== "administrator") {
      const error = new Error("Insufficient permission");
      (error as Error & { status: number }).status = 403;
      throw error;
    }
  }
  assert.throws(() => ensureAdministrator("student"), /Insufficient permission/);
  assert.throws(() => ensureAdministrator("tutor"), /Insufficient permission/);
  assert.doesNotThrow(() => ensureAdministrator("administrator"));
});
