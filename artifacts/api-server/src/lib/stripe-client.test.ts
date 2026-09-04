import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { formData, stripeRequest, verifyStripeSignature, webhookEventFromPayload } from "./stripe-client.ts";

const stripeTestMode = process.env.STRIPE_TEST_MODE === "1";
const providerTestOptions = { skip: !stripeTestMode };
const testAmountCents = 10_000;
const testDurationHours = 4;
let databaseModule: any;

type ProviderFixture = {
  customerId: string;
  productId: string;
  priceId: string;
};

type DatabaseFixture = {
  userId: string;
  productId: string;
  invoiceId: string;
  paymentId: string;
  eventIds: string[];
};

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    assert.fail(`Stripe fixture is missing ${key}`);
  }
  return value;
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function recordNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    assert.fail(`Stripe fixture is missing ${key}`);
  }
  return value;
}

async function loadPaymentTestModules(): Promise<any> {
  if (!databaseModule) {
    const [paymentService, database] = await Promise.all([
      // @ts-expect-error Node's strip-types test runner requires the source extension.
      import("./payment-service.ts"),
      import("@workspace/db"),
    ]);
    databaseModule = { ...paymentService, ...database };
  }
  return databaseModule;
}

async function createProviderFixture(): Promise<ProviderFixture> {
  // Balance is a Stripe resource that reliably includes livemode. Do not
  // create any resources until the connected Stripe account proves it is test
  // mode, even if a caller accidentally sets STRIPE_TEST_MODE in a live env.
  const balance = await stripeRequest<Record<string, unknown>>("/v1/balance");
  assert.equal(
    balance.livemode,
    false,
    "Refusing to run Stripe regression fixtures against live mode",
  );

  const suffix = randomUUID();
  const product = await stripeRequest<Record<string, unknown>>("/v1/products", {
    method: "POST",
    body: formData({
      name: `Accepted Admissions regression ${suffix}`,
      description: "Automated test-mode regression fixture",
      "metadata[test_suite]": "accepted-admissions-payment-regression",
      "metadata[test_run]": suffix,
    }),
  });
  const productId = requiredString(product, "id");
  const price = await stripeRequest<Record<string, unknown>>("/v1/prices", {
    method: "POST",
    body: formData({
      product: productId,
      unit_amount: testAmountCents,
      currency: "usd",
      "metadata[test_suite]": "accepted-admissions-payment-regression",
      "metadata[test_run]": suffix,
    }),
  });
  const priceId = requiredString(price, "id");
  const customer = await stripeRequest<Record<string, unknown>>("/v1/customers", {
    method: "POST",
    body: formData({
      email: `regression-${suffix}@example.invalid`,
      description: "Automated test-mode regression fixture",
      "metadata[test_suite]": "accepted-admissions-payment-regression",
      "metadata[test_run]": suffix,
    }),
  });
  const customerId = requiredString(customer, "id");

  for (const resource of [product, price, customer]) {
    assert.equal(
      resource.livemode,
      false,
      "Stripe regression fixture resource was not created in test mode",
    );
  }
  return { customerId, productId, priceId };
}

async function createDatabaseFixture(
  database: any,
  provider: ProviderFixture,
): Promise<DatabaseFixture> {
  const userId = randomUUID();
  const productId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const suffix = randomUUID();

  await database.db.insert(database.usersTable).values({
    id: userId,
    clerkUserId: `stripe-regression-${suffix}`,
    email: `stripe-regression-${suffix}@example.invalid`,
    displayName: "Stripe regression fixture",
    stripeCustomerId: provider.customerId,
  });
  await database.db.insert(database.satProductsTable).values({
    id: productId,
    slug: `stripe-regression-${suffix}`,
    name: "Regression SAT package",
    description: "Automated payment regression fixture",
    durationHours: testDurationHours,
    totalPriceCents: testAmountCents,
    effectiveHourlyRateCents: testAmountCents / testDurationHours,
    stripeProductId: provider.productId,
    stripePriceId: provider.priceId,
  });
  await database.db.insert(database.invoicesTable).values({
    id: invoiceId,
    clientUserId: userId,
    description: "Regression SAT package",
    subtotalCents: testAmountCents,
    totalCents: testAmountCents,
  });
  await database.db.insert(database.paymentsTable).values({
    id: paymentId,
    clientUserId: userId,
    invoiceId,
    productId,
    amountCents: testAmountCents,
  });
  return { userId, productId, invoiceId, paymentId, eventIds: [] };
}

async function cleanupDatabaseFixtures(
  database: any,
  fixtures: DatabaseFixture[],
): Promise<void> {
  const userIds = fixtures.map((fixture) => fixture.userId);
  const paymentIds = fixtures.map((fixture) => fixture.paymentId);
  const invoiceIds = fixtures.map((fixture) => fixture.invoiceId);
  const productIds = fixtures.map((fixture) => fixture.productId);
  const eventIds = fixtures.flatMap((fixture) => fixture.eventIds);

  if (userIds.length > 0) {
    await database.db
      .delete(database.creditLedgerTable)
      .where(eq(database.creditLedgerTable.clientUserId, userIds[0]));
    if (userIds.length > 1) {
      await database.db
        .delete(database.creditLedgerTable)
        .where(inArray(database.creditLedgerTable.clientUserId, userIds));
    }
  }
  if (eventIds.length > 0) {
    await database.db
      .delete(database.stripeWebhookEventsTable)
      .where(inArray(database.stripeWebhookEventsTable.providerEventId, eventIds));
  }
  if (paymentIds.length > 0) {
    await database.db
      .delete(database.paymentsTable)
      .where(inArray(database.paymentsTable.id, paymentIds));
  }
  if (invoiceIds.length > 0) {
    await database.db
      .delete(database.invoicesTable)
      .where(inArray(database.invoicesTable.id, invoiceIds));
  }
  if (productIds.length > 0) {
    await database.db
      .delete(database.satProductsTable)
      .where(inArray(database.satProductsTable.id, productIds));
  }
  if (userIds.length > 0) {
    await database.db
      .delete(database.usersTable)
      .where(inArray(database.usersTable.id, userIds));
  }
}

async function createCheckoutFixture(
  database: any,
  provider: ProviderFixture,
  fixture: DatabaseFixture,
): Promise<Record<string, unknown>> {
  const user = {
    id: fixture.userId,
    email: `stripe-regression-${fixture.userId}@example.invalid`,
    displayName: "Stripe regression fixture",
    stripeCustomerId: provider.customerId,
  };
  const product = {
    id: fixture.productId,
    name: "Regression SAT package",
    description: "Automated payment regression fixture",
    durationHours: testDurationHours,
    totalPriceCents: testAmountCents,
    effectiveHourlyRateCents: testAmountCents / testDurationHours,
    stripeProductId: provider.productId,
    stripePriceId: provider.priceId,
  };
  return database.createCheckoutSession({
    user,
    product,
    invoiceId: fixture.invoiceId,
    paymentId: fixture.paymentId,
    successUrl: "https://example.invalid/stripe-regression/success",
    cancelUrl: "https://example.invalid/stripe-regression/cancel",
  });
}

async function createPaymentIntent(
  provider: ProviderFixture,
  paymentId: string,
): Promise<Record<string, unknown>> {
  return stripeRequest<Record<string, unknown>>("/v1/payment_intents", {
    method: "POST",
    body: formData({
      amount: testAmountCents,
      currency: "usd",
      customer: provider.customerId,
      "payment_method_types[0]": "card",
      "metadata[payment_id]": paymentId,
      "metadata[test_suite]": "accepted-admissions-payment-regression",
    }),
  });
}

async function confirmPaymentIntent(
  paymentIntentId: string,
  paymentMethod: string,
): Promise<Record<string, unknown>> {
  return stripeRequest<Record<string, unknown>>(
    `/v1/payment_intents/${paymentIntentId}/confirm`,
    {
      method: "POST",
      body: formData({ payment_method: paymentMethod }),
    },
  );
}

async function processFixtureEvent(
  database: any,
  fixture: DatabaseFixture,
  type: string,
  object: Record<string, unknown>,
  eventId = `evt_aa_regression_${randomUUID()}`,
): Promise<void> {
  fixture.eventIds.push(eventId);
  await database.processStripeWebhook({ id: eventId, type, data: { object } });
}

async function getPaymentState(database: any, fixture: DatabaseFixture): Promise<any> {
  const [payment] = await database.db
    .select()
    .from(database.paymentsTable)
    .where(eq(database.paymentsTable.id, fixture.paymentId))
    .limit(1);
  const credits = await database.db
    .select()
    .from(database.creditLedgerTable)
    .where(eq(database.creditLedgerTable.clientUserId, fixture.userId));
  return { payment, credits };
}

after(async () => {
  if (databaseModule?.pool) await databaseModule.pool.end();
});

test("accepts a current Stripe HMAC signature and parses its event", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = "whsec_test_secret_for_sdk_verification";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const payload = JSON.stringify({
      id: "evt_verified",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    assert.doesNotThrow(() => verifyStripeSignature(Buffer.from(payload), header));
    assert.equal(webhookEventFromPayload(Buffer.from(payload)).id, "evt_verified");
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("rejects a modified Stripe webhook payload", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = "whsec_test_secret_for_sdk_verification";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const original = JSON.stringify({ id: "evt_original", type: "checkout.session.completed", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: original, secret });
    const modified = Buffer.from(JSON.stringify({ id: "evt_modified", type: "checkout.session.completed", data: { object: {} } }));
    assert.throws(() => verifyStripeSignature(modified, header));
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test(
  "test-mode checkout completion does not fulfill unpaid sessions and handles success or failure",
  providerTestOptions,
  async () => {
    const database = await loadPaymentTestModules();
    const provider = await createProviderFixture();
    const fixtures: DatabaseFixture[] = [];
    try {
      const successful = await createDatabaseFixture(database, provider);
      const failed = await createDatabaseFixture(database, provider);
      fixtures.push(successful, failed);

      const successfulSession = await createCheckoutFixture(database, provider, successful);
      await processFixtureEvent(database, successful, "checkout.session.completed", {
        ...successfulSession,
        payment_status: "unpaid",
        amount_total: testAmountCents,
        metadata: { payment_id: successful.paymentId },
      });
      let state = await getPaymentState(database, successful);
      assert.equal(state.payment.status, "pending");
      assert.equal(state.credits.length, 0);

      const successfulIntent = await createPaymentIntent(provider, successful.paymentId);
      const confirmedIntent = await confirmPaymentIntent(
        requiredString(successfulIntent, "id"),
        "pm_card_visa",
      );
      await processFixtureEvent(database, successful, "payment_intent.succeeded", {
        ...confirmedIntent,
        amount_received: testAmountCents,
        metadata: { payment_id: successful.paymentId },
      });
      state = await getPaymentState(database, successful);
      assert.equal(state.payment.status, "paid");
      assert.equal(state.credits.filter((credit: any) => credit.entryType === "original").length, 1);

      const failedSession = await createCheckoutFixture(database, provider, failed);
      await processFixtureEvent(database, failed, "checkout.session.completed", {
        ...failedSession,
        payment_status: "unpaid",
        amount_total: testAmountCents,
        metadata: { payment_id: failed.paymentId },
      });
      const failedIntent = await createPaymentIntent(provider, failed.paymentId);
      const failedIntentId = requiredString(failedIntent, "id");
      await assert.rejects(
        () => confirmPaymentIntent(failedIntentId, "pm_card_chargeDeclined"),
        "A declined test card should not confirm",
      );
      await processFixtureEvent(database, failed, "payment_intent.payment_failed", {
        ...failedIntent,
        last_payment_error: { message: "Your card was declined." },
        metadata: { payment_id: failed.paymentId },
      });
      state = await getPaymentState(database, failed);
      assert.equal(state.payment.status, "failed");
      assert.equal(state.credits.length, 0);
    } finally {
      await cleanupDatabaseFixtures(database, fixtures);
    }
  },
);

test(
  "test-mode Checkout and PaymentIntent success events concurrently create one credit",
  providerTestOptions,
  async () => {
    const database = await loadPaymentTestModules();
    const provider = await createProviderFixture();
    const fixtures: DatabaseFixture[] = [];
    try {
      const fixture = await createDatabaseFixture(database, provider);
      fixtures.push(fixture);
      const session = await createCheckoutFixture(database, provider, fixture);
      const intent = await createPaymentIntent(provider, fixture.paymentId);
      const confirmedIntent = await confirmPaymentIntent(
        requiredString(intent, "id"),
        "pm_card_visa",
      );

      await Promise.all([
        processFixtureEvent(database, fixture, "checkout.session.completed", {
          ...session,
          payment_status: "paid",
          amount_total: testAmountCents,
          payment_intent: requiredString(intent, "id"),
          metadata: { payment_id: fixture.paymentId },
        }),
        processFixtureEvent(database, fixture, "payment_intent.succeeded", {
          ...confirmedIntent,
          amount_received: testAmountCents,
          metadata: { payment_id: fixture.paymentId },
        }),
      ]);

      const state = await getPaymentState(database, fixture);
      const originalCredits = state.credits.filter((credit: any) => credit.entryType === "original");
      assert.equal(state.payment.status, "paid");
      assert.equal(originalCredits.length, 1);
      assert.equal(originalCredits[0].fulfillmentKey, `payment:${fixture.paymentId}`);
    } finally {
      await cleanupDatabaseFixtures(database, fixtures);
    }
  },
);

test(
  "test-mode partial and full refunds are cumulative, duplicate-safe, and order-safe",
  providerTestOptions,
  async () => {
    const database = await loadPaymentTestModules();
    const provider = await createProviderFixture();
    const fixtures: DatabaseFixture[] = [];
    try {
      const cumulative = await createDatabaseFixture(database, provider);
      const outOfOrder = await createDatabaseFixture(database, provider);
      fixtures.push(cumulative, outOfOrder);

      async function payFixture(fixture: DatabaseFixture): Promise<string> {
        const intent = await createPaymentIntent(provider, fixture.paymentId);
        const confirmed = await confirmPaymentIntent(
          requiredString(intent, "id"),
          "pm_card_visa",
        );
        await processFixtureEvent(database, fixture, "payment_intent.succeeded", {
          ...confirmed,
          amount_received: testAmountCents,
          metadata: { payment_id: fixture.paymentId },
        });
        const charges = await stripeRequest<Record<string, unknown>>(
          `/v1/charges?payment_intent=${encodeURIComponent(requiredString(intent, "id"))}`,
        );
        const chargeData = charges.data;
        assert.ok(Array.isArray(chargeData) && chargeData.length > 0);
        return requiredString(chargeData[0] as Record<string, unknown>, "id");
      }

      const cumulativeChargeId = await payFixture(cumulative);
      const partialRefund = await stripeRequest<Record<string, unknown>>("/v1/refunds", {
        method: "POST",
        body: formData({
          payment_intent: requiredString(
            await stripeRequest<Record<string, unknown>>(
              `/v1/charges/${cumulativeChargeId}`,
            ),
            "payment_intent",
          ),
          amount: 2_500,
        }),
      });
      assert.equal(requiredString(partialRefund, "id").startsWith("re_"), true);
      const partialCharge = await stripeRequest<Record<string, unknown>>(
        `/v1/charges/${cumulativeChargeId}`,
      );
      await stripeRequest<Record<string, unknown>>("/v1/refunds", {
        method: "POST",
        body: formData({
          payment_intent: requiredString(partialCharge, "payment_intent"),
          amount: 7_500,
        }),
      });
      const fullCharge = await stripeRequest<Record<string, unknown>>(
        `/v1/charges/${cumulativeChargeId}`,
      );

      await processFixtureEvent(database, cumulative, "charge.refunded", {
        ...partialCharge,
        amount_refunded: 2_500,
        metadata: { payment_id: cumulative.paymentId },
      });
      await processFixtureEvent(database, cumulative, "charge.refunded", {
        ...partialCharge,
        amount_refunded: 2_500,
        metadata: { payment_id: cumulative.paymentId },
      });
      await processFixtureEvent(database, cumulative, "charge.refunded", {
        ...fullCharge,
        amount_refunded: 10_000,
        metadata: { payment_id: cumulative.paymentId },
      });
      await processFixtureEvent(database, cumulative, "charge.refunded", {
        ...fullCharge,
        amount_refunded: 10_000,
        metadata: { payment_id: cumulative.paymentId },
      });
      const cumulativeState = await getPaymentState(database, cumulative);
      const cumulativeRefunds = cumulativeState.credits
        .filter((credit: any) => credit.entryType === "refund")
        .sort((a: any, b: any) => a.hours - b.hours);
      assert.equal(cumulativeState.payment.status, "refunded");
      assert.equal(cumulativeState.payment.refundedAmountCents, testAmountCents);
      assert.deepEqual(
        cumulativeRefunds.map((credit: any) => credit.hours),
        [1, 3],
      );

      const outOfOrderChargeId = await payFixture(outOfOrder);
      const outOfOrderCharge = await stripeRequest<Record<string, unknown>>(
        `/v1/charges/${outOfOrderChargeId}`,
      );
      await stripeRequest<Record<string, unknown>>("/v1/refunds", {
        method: "POST",
        body: formData({
          payment_intent: requiredString(outOfOrderCharge, "payment_intent"),
          amount: testAmountCents,
        }),
      });
      const outOfOrderFullCharge = await stripeRequest<Record<string, unknown>>(
        `/v1/charges/${outOfOrderChargeId}`,
      );
      await processFixtureEvent(database, outOfOrder, "charge.refunded", {
        ...outOfOrderFullCharge,
        amount_refunded: testAmountCents,
        metadata: { payment_id: outOfOrder.paymentId },
      });
      await processFixtureEvent(database, outOfOrder, "charge.refunded", {
        ...outOfOrderFullCharge,
        amount_refunded: 2_500,
        metadata: { payment_id: outOfOrder.paymentId },
      });
      const outOfOrderState = await getPaymentState(database, outOfOrder);
      const outOfOrderRefunds = outOfOrderState.credits.filter(
        (credit: any) => credit.entryType === "refund",
      );
      assert.equal(outOfOrderRefunds.length, 1);
      assert.equal(outOfOrderRefunds[0].hours, testDurationHours);
    } finally {
      await cleanupDatabaseFixtures(database, fixtures);
    }
  },
);

test(
  "test-mode concurrent hosted invoices keep each invoice item isolated",
  providerTestOptions,
  async () => {
    const database = await loadPaymentTestModules();
    const provider = await createProviderFixture();
    const fixtures: DatabaseFixture[] = [];
    try {
      const fixture = await createDatabaseFixture(database, provider);
      fixtures.push(fixture);
      const invoiceIds = [randomUUID(), randomUUID()];
      const paymentIds = [randomUUID(), randomUUID()];
      const [first, second] = await Promise.all(
        invoiceIds.map((invoiceId, index) =>
          database.createHostedInvoice({
            user: {
              id: fixture.userId,
              email: `stripe-regression-${fixture.userId}@example.invalid`,
              displayName: "Stripe regression fixture",
              stripeCustomerId: provider.customerId,
            },
            product: {
              id: fixture.productId,
              name: "Regression SAT package",
              description: "Automated payment regression fixture",
              durationHours: testDurationHours,
              totalPriceCents: testAmountCents,
              effectiveHourlyRateCents: testAmountCents / testDurationHours,
              stripeProductId: provider.productId,
              stripePriceId: provider.priceId,
            },
            invoiceId,
            paymentId: paymentIds[index],
            daysUntilDue: 7,
          }),
        ),
      );

      async function assertOneLine(invoiceId: string, result: any): Promise<void> {
        assert.equal(result.id.startsWith("in_"), true);
        const invoice = await stripeRequest<Record<string, unknown>>(
          `/v1/invoices/${result.id}`,
        );
        const lines = nestedRecord(invoice, "lines").data;
        assert.ok(Array.isArray(lines));
        assert.equal(lines.length, 1, `Invoice ${invoiceId} should have one item`);
        assert.equal(
          recordNumber(lines[0] as Record<string, unknown>, "amount"),
          testAmountCents,
        );
      }

      await Promise.all([
        assertOneLine(invoiceIds[0], first),
        assertOneLine(invoiceIds[1], second),
      ]);
      assert.notEqual(first.id, second.id);
    } finally {
      await cleanupDatabaseFixtures(database, fixtures);
    }
  },
);