import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import { CANONICAL_APP_ORIGIN } from "./public-origin.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { PRODUCTION_STRIPE_WEBHOOK_PATH, PRODUCTION_STRIPE_WEBHOOK_URL, RETIRED_REPLIT_STRIPE_WEBHOOK_HOST, isRetiredReplitStripeWebhookUrl } from "./stripe-webhook-url.ts";

test("production Stripe webhook URL is the public app origin, not Replit", () => {
  assert.equal(CANONICAL_APP_ORIGIN, "https://app.acceptedadmissions.org");
  assert.equal(PRODUCTION_STRIPE_WEBHOOK_PATH, "/api/stripe/webhook");
  assert.equal(
    PRODUCTION_STRIPE_WEBHOOK_URL,
    "https://app.acceptedadmissions.org/api/stripe/webhook",
  );
  assert.equal(isRetiredReplitStripeWebhookUrl(PRODUCTION_STRIPE_WEBHOOK_URL), false);
  assert.equal(
    isRetiredReplitStripeWebhookUrl(
      `https://${RETIRED_REPLIT_STRIPE_WEBHOOK_HOST}/api/stripe/webhook`,
    ),
    true,
  );
  assert.equal(
    isRetiredReplitStripeWebhookUrl("https://accepted-admissions-platform.replit.app/api/stripe/webhook"),
    true,
  );
});
