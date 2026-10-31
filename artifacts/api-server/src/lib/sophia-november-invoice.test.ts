import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isSophiaNovemberInvoice,
  presentSophiaNovemberInvoice,
  SOPHIA_NOVEMBER_2026_COVERAGE,
  SOPHIA_NOVEMBER_2026_INVOICE_KEY,
  SOPHIA_NOVEMBER_2026_PAY_URL,
  SOPHIA_NOVEMBER_2026_TOTAL_CENTS,
} from "./sophia-november-invoice.ts";

const sophia = { id: SOPHIA_SLEIMAN_SAT_USER_ID, role: "student" };

const RETIRED_STRIPE_PAY_URL = "https://buy.stripe.com/dRmeVd35Q0Goajg4GH5gc00";
const PREVIOUS_WISE_PAY_URL = "https://wise.com/pay/r/rS6_TjwRk0ff8ho";

test("Sophia's unpaid November invoice exposes the Wise pay link", () => {
  assert.equal(SOPHIA_NOVEMBER_2026_PAY_URL, "https://wise.com/pay/r/6_JAy6RP712BnEM");
  const view = presentSophiaNovemberInvoice({
    requester: sophia,
    clientUserId: sophia.id,
    stored: null,
  });
  assert.equal(view.kind, "unpaid");
  if (view.kind !== "unpaid") return;
  assert.equal(view.invoice.payUrl, SOPHIA_NOVEMBER_2026_PAY_URL);
  assert.equal(view.invoice.totalCents, SOPHIA_NOVEMBER_2026_TOTAL_CENTS);
  assert.equal(view.invoice.dueOn, "2026-11-01");
  assert.equal(view.invoice.status, "sent");
  assert.deepEqual(view.invoice.coverage, [...SOPHIA_NOVEMBER_2026_COVERAGE]);
  assert.match(view.invoice.coverage[0]!, /Xavier/);
  assert.match(view.invoice.coverage[1]!, /Eunice/);
});

test("a recorded payment removes the pay action and keeps a receipt link", () => {
  const view = presentSophiaNovemberInvoice({
    requester: sophia,
    clientUserId: sophia.id,
    stored: {
      id: "inv-paid",
      status: "paid",
      totalCents: 228000,
      dueAt: new Date("2026-11-01T15:00:00.000Z"),
      paidAt: new Date("2026-11-01T16:00:00.000Z"),
      hostedInvoiceUrl: SOPHIA_NOVEMBER_2026_PAY_URL,
      receiptUrl: "https://pay.stripe.com/receipts/sophia-november",
      description: "November 2026 SAT",
    },
  });
  assert.equal(view.kind, "paid");
  if (view.kind !== "paid") return;
  assert.equal(view.history.status, "paid");
  assert.equal(view.history.documentUrl, "https://pay.stripe.com/receipts/sophia-november");
  assert.equal(JSON.stringify(view.history).includes(SOPHIA_NOVEMBER_2026_PAY_URL), false);
});

test("a description-matched row with the old Stripe URL still pays through Wise", () => {
  const view = presentSophiaNovemberInvoice({
    requester: sophia,
    clientUserId: sophia.id,
    stored: {
      id: "inv-stale-stripe",
      status: "sent",
      totalCents: 228000,
      dueAt: new Date("2026-11-01T15:00:00.000Z"),
      hostedInvoiceUrl: RETIRED_STRIPE_PAY_URL,
      receiptUrl: null,
      description: SOPHIA_NOVEMBER_2026_INVOICE_KEY,
    },
  });
  assert.equal(
    isSophiaNovemberInvoice({
      hostedInvoiceUrl: RETIRED_STRIPE_PAY_URL,
      description: SOPHIA_NOVEMBER_2026_INVOICE_KEY,
    }),
    true,
  );
  assert.equal(view.kind, "unpaid");
  if (view.kind !== "unpaid") return;
  assert.equal(view.invoice.payUrl, SOPHIA_NOVEMBER_2026_PAY_URL);
  assert.equal(view.invoice.payUrl.includes(RETIRED_STRIPE_PAY_URL), false);
});

test("the Wise URL identifies the invoice, and the description key still does", () => {
  assert.equal(
    isSophiaNovemberInvoice({ hostedInvoiceUrl: SOPHIA_NOVEMBER_2026_PAY_URL, description: null }),
    true,
  );
  assert.equal(
    isSophiaNovemberInvoice({
      hostedInvoiceUrl: RETIRED_STRIPE_PAY_URL,
      description: `November SAT ${SOPHIA_NOVEMBER_2026_INVOICE_KEY}`,
    }),
    true,
  );
  assert.equal(
    isSophiaNovemberInvoice({
      hostedInvoiceUrl: RETIRED_STRIPE_PAY_URL,
      description: "November 2026 SAT",
    }),
    false,
  );
});

test("another student, a tutor, a viewer, and an admin never receive the invoice", () => {
  const stored = {
    id: "inv",
    status: "sent",
    totalCents: 228000,
    dueAt: null,
    hostedInvoiceUrl: SOPHIA_NOVEMBER_2026_PAY_URL,
    receiptUrl: null,
    description: null,
  };
  for (const requester of [
    { id: "other-student", role: "student" },
    { id: sophia.id, role: "tutor" },
    { id: sophia.id, role: "viewer" },
    { id: sophia.id, role: "administrator" },
    { id: "admin", role: "administrator" },
  ]) {
    assert.equal(
      presentSophiaNovemberInvoice({
        requester,
        clientUserId: requester.role === "student" ? requester.id : sophia.id,
        stored,
      }).kind,
      "hidden",
    );
  }
});

test("a row that still carries the previous Wise link pays through the new one", () => {
  const view = presentSophiaNovemberInvoice({
    requester: sophia,
    clientUserId: sophia.id,
    stored: {
      id: "inv-previous-wise",
      status: "sent",
      totalCents: 228000,
      dueAt: new Date("2026-11-01T15:00:00.000Z"),
      hostedInvoiceUrl: PREVIOUS_WISE_PAY_URL,
      receiptUrl: null,
      description: SOPHIA_NOVEMBER_2026_INVOICE_KEY,
    },
  });
  assert.equal(
    isSophiaNovemberInvoice({ hostedInvoiceUrl: PREVIOUS_WISE_PAY_URL, description: null }),
    true,
  );
  assert.equal(view.kind, "unpaid");
  if (view.kind !== "unpaid") return;
  assert.equal(view.invoice.payUrl, "https://wise.com/pay/r/6_JAy6RP712BnEM");
});

test("a paid row never links a pay URL as its receipt, even an older one", () => {
  const view = presentSophiaNovemberInvoice({
    requester: sophia,
    clientUserId: sophia.id,
    stored: {
      id: "inv-paid-previous-wise",
      status: "paid",
      totalCents: 228000,
      dueAt: new Date("2026-11-01T15:00:00.000Z"),
      paidAt: new Date("2026-11-01T16:00:00.000Z"),
      hostedInvoiceUrl: PREVIOUS_WISE_PAY_URL,
      receiptUrl: PREVIOUS_WISE_PAY_URL,
      description: SOPHIA_NOVEMBER_2026_INVOICE_KEY,
    },
  });
  assert.equal(view.kind, "paid");
  if (view.kind !== "paid") return;
  assert.equal(view.history.documentUrl, null);
});
