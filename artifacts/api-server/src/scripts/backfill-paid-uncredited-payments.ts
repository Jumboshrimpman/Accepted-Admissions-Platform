/**
 * Idempotent recovery for SAT purchases that Stripe marked paid but the
 * credit ledger never received `product.durationHours`.
 *
 * Default is a dry run. Pass `--apply` to insert missing `payment:{id}`
 * ledger rows. Re-running is safe (fulfillment_key unique).
 *
 * Usage (requires DATABASE_URL):
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts
 *   node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts --apply
 *   node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts --apply --payment-id <uuid>
 */
// @ts-expect-error Native Node test execution requires the source extension.
import { backfillPaidUncreditedPayments } from "../lib/payment-fulfillment.ts";

const apply = process.argv.includes("--apply");
const paymentIdFlag = process.argv.findIndex((arg) => arg === "--payment-id");
const paymentId =
  paymentIdFlag >= 0 && process.argv[paymentIdFlag + 1] && !process.argv[paymentIdFlag + 1]!.startsWith("-")
    ? process.argv[paymentIdFlag + 1]
    : undefined;

const result = await backfillPaidUncreditedPayments({
  paymentId,
  dryRun: !apply,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      productionWebhookUrl: "https://app.acceptedadmissions.org/api/stripe/webhook",
      doNotUse: "https://accepted-admissions-platform.replit.app/api/stripe/webhook",
      ...result,
    },
    null,
    2,
  ),
);

if (!apply) {
  console.error("Dry run only. Re-run with --apply to grant missing credits.");
}
