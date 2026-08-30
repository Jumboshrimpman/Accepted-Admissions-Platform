import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { verifyStripeSignature, webhookEventFromPayload } from "./stripe-client.ts";

test("accepts a current Stripe HMAC signature and parses its event", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  try {
    const payload = Buffer.from(JSON.stringify({
      id: "evt_verified",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } },
    }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${payload.toString("utf8")}`)
      .digest("hex");
    assert.doesNotThrow(() =>
      verifyStripeSignature(payload, `t=${timestamp},v1=${digest}`),
    );
    assert.equal(webhookEventFromPayload(payload).id, "evt_verified");
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});

test("rejects a modified Stripe webhook payload", () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  try {
    const original = Buffer.from('{"id":"evt_original"}');
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", "whsec_test")
      .update(`${timestamp}.${original.toString("utf8")}`)
      .digest("hex");
    const modified = Buffer.from('{"id":"evt_modified"}');
    assert.throws(
      () => verifyStripeSignature(modified, `t=${timestamp},v1=${digest}`),
      /Invalid Stripe signature/,
    );
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});