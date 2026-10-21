import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { billingHistoryItems, resolveBillingHistoryAccess } from "./billing-history.ts";

const neelId = "6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19";
const otherId = "11111111-1111-4111-8111-111111111111";

test("a paid Nika checkout on Oct 20 is one history row and drops card data", () => {
  const rows = billingHistoryItems({
    clientUserId: neelId,
    payments: [
      {
        id: "pay-nika",
        amountCents: 10000,
        refundedAmountCents: 0,
        status: "paid",
        paidAt: new Date("2026-10-20T16:00:00.000Z"),
        createdAt: new Date("2026-10-20T16:00:00.000Z"),
        productName: "College Consulting hour with Nika",
        productSlug: "college-consulting-nika-hour",
        durationHours: 1,
        tutorProfileId: "tutor-nika",
        auditMetadata: {
          customerEmail: "hidden-client@example.invalid",
          providerChargeId: "ch_billing_secret",
          card: { last4: "4242", number: "4242424242424242" },
          offer: "college-consulting-nika-hour",
          bookingIntent: {
            tutorProfileId: "tutor-nika",
            startTime: "2026-10-20T16:00:00.000Z",
            durationMinutes: 60,
          },
          bookedSessionId: "session-nika",
        },
      },
      {
        id: "pay-pending",
        amountCents: 10000,
        refundedAmountCents: 0,
        status: "pending",
        paidAt: null,
        createdAt: new Date("2026-10-20T15:00:00.000Z"),
        productName: "Pending checkout",
        productSlug: "college-consulting-nika-hour",
        durationHours: 1,
        tutorProfileId: null,
        auditMetadata: {},
      },
    ],
    tutors: [{ id: "tutor-nika", name: "Nika Raiffe" }],
    sessions: [
      {
        id: "session-nika",
        title: "Neel’s College Consulting Session with Nika",
        dateTime: new Date("2026-10-20T16:00:00.000Z"),
        clientUserId: neelId,
      },
      {
        id: "session-other",
        title: "Another client's session",
        dateTime: new Date("2026-10-20T16:00:00.000Z"),
        clientUserId: otherId,
      },
    ],
    ledger: [
      {
        id: "ledger-nika",
        entryType: "original",
        hours: 1,
        productId: "product-nika",
        referenceType: "payment",
        referenceId: "pay-nika",
        fulfillmentKey: "payment:pay-nika",
        createdAt: new Date("2026-10-20T16:00:00.000Z"),
      },
    ],
    products: [
      {
        id: "product-nika",
        slug: "college-consulting-nika-hour",
        name: "College Consulting hour with Nika",
        durationHours: 1,
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "pay-nika");
  assert.equal(rows[0]?.label, "College Consulting hour with Nika");
  assert.equal(rows[0]?.service, "College Consulting");
  assert.equal(rows[0]?.tutorName, "Nika");
  assert.equal(rows[0]?.hours, 1);
  assert.equal(rows[0]?.amountCents, 10000);
  assert.equal(rows[0]?.status, "paid");
  assert.equal(rows[0]?.purchasedAt, "2026-10-20T16:00:00.000Z");
  assert.equal(rows[0]?.sessionTitle, "Neel’s College Consulting Session with Nika");
  assert.equal(rows[0]?.sessionStart, "2026-10-20T16:00:00.000Z");
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes("hidden-client@example.invalid"), false);
  assert.equal(serialized.includes("ch_billing_secret"), false);
  assert.equal(serialized.includes("4242424242424242"), false);
  assert.equal(serialized.includes("Another client's session"), false);
  assert.equal(serialized.includes("Pending checkout"), false);
});

test("a full refund is labeled refunded and an unmatched purchase stays", () => {
  const rows = billingHistoryItems({
    clientUserId: neelId,
    payments: [
      {
        id: "pay-refunded",
        amountCents: 13000,
        refundedAmountCents: 13000,
        status: "refunded",
        paidAt: new Date("2026-10-18T17:39:47.000Z"),
        createdAt: new Date("2026-10-18T17:39:47.000Z"),
        productName: "College Consulting hour with Victoria",
        productSlug: "college-consulting-victoria-hour",
        durationHours: 1,
        tutorProfileId: null,
        auditMetadata: {},
      },
    ],
    tutors: [],
    sessions: [],
    ledger: [
      {
        id: "ledger-xavier",
        entryType: "original",
        hours: 1,
        productId: "product-xavier",
        referenceType: "payment",
        referenceId: "missing-payment",
        fulfillmentKey: "payment:missing-payment",
        createdAt: new Date("2026-10-21T14:45:59.000Z"),
      },
    ],
    products: [
      {
        id: "product-xavier",
        slug: "college-consulting-xavier-hour",
        name: "College Consulting hour with Xavier Morales",
        durationHours: 1,
      },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.status, "credited");
  assert.equal(rows[0]?.amountCents, null);
  assert.equal(rows[0]?.tutorName, "Xavier");
  assert.equal(rows[1]?.status, "refunded");
  assert.equal(rows[1]?.tutorName, "Victoria");
});

test("no stored payments or purchases is an empty list", () => {
  assert.deepEqual(
    billingHistoryItems({
      clientUserId: neelId,
      payments: [],
      tutors: [],
      sessions: [],
      ledger: [],
      products: [],
    }),
    [],
  );
});

test("billing history stays on the caller unless an admin previews that client", () => {
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "student",
      subjectUserId: neelId,
      requestedClientId: otherId,
      adminClientFound: false,
    }),
    { ok: false, status: 403, error: "You can only view your own billing history." },
  );
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "tutor",
      subjectUserId: "tutor-user",
      requestedClientId: neelId,
      adminClientFound: true,
    }),
    { ok: false, status: 403, error: "You can only view your own billing history." },
  );
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "viewer",
      subjectUserId: neelId,
      requestedClientId: null,
      adminClientFound: false,
    }),
    { ok: true, clientId: neelId, readOnly: true },
  );
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "administrator",
      subjectUserId: "admin-user",
      requestedClientId: neelId,
      adminClientFound: false,
    }),
    { ok: false, status: 404, error: "Client not found" },
  );
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "administrator",
      subjectUserId: "admin-user",
      requestedClientId: neelId,
      adminClientFound: true,
    }),
    { ok: true, clientId: neelId, readOnly: true },
  );
  assert.deepEqual(
    resolveBillingHistoryAccess({
      role: "student",
      subjectUserId: neelId,
      requestedClientId: null,
      adminClientFound: false,
    }),
    { ok: true, clientId: neelId, readOnly: false },
  );
});
