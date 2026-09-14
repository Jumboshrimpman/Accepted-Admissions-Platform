# Stripe webhook (production)

Live SAT Checkout credits are granted after a signed Stripe webhook reaches this API. Students can also refresh a pending Checkout from the SAT portal (`POST /api/payments/reconcile-checkout`), and administrators can reconcile from `/admin/financials`. Both paths are idempotent and use the same `payment:{id}` fulfillment key as the webhook.

## Required production endpoint

Set the Stripe Dashboard webhook URL to exactly:

`https://app.acceptedadmissions.org/api/stripe/webhook`

That public origin is rewritten by Vercel to the Railway API (`/api/:path*` in `vercel.json`). Do **not** point Stripe at Replit.

| Use | URL |
| --- | --- |
| Production (required) | `https://app.acceptedadmissions.org/api/stripe/webhook` |
| Retired / broken | `https://accepted-admissions-platform.replit.app/api/stripe/webhook` |

The Replit host previously recorded 100% delivery errors. A paid Checkout then stayed uncredited until the event was resent to the public app URL.

Also set `STRIPE_WEBHOOK_SECRET` on Railway (the signing secret for **this** endpoint). If Stripe Dashboard shows 4xx deliveries, the secret does not match the endpoint that actually receives the POST. Do not invent or commit secrets.

Code asserts the same URL in `PRODUCTION_STRIPE_WEBHOOK_URL` (`artifacts/api-server/src/lib/stripe-webhook-url.ts`). The Express route is mounted from `PRODUCTION_STRIPE_WEBHOOK_PATH`.

## Fulfillment rules

On `checkout.session.completed` with `payment_status=paid`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `invoice.paid`, or `charge.succeeded`:

1. Match the payment (`metadata.payment_id`, `client_reference_id`, Checkout session id, or PaymentIntent id).
2. If the payment has a catalog product (or method `stripe_checkout`), grant **`product.durationHours`** on `credit_ledger` with fulfillment key `payment:{paymentId}`.
3. Only then mark the payment paid in the same database transaction.

Never mark a catalog purchase paid when the product row is missing. That fails the webhook (HTTP 500) so Stripe retries after ops restore the product. Signature failures stay HTTP 400.

Hours come from `sat_products.durationHours`, not from the charge amount. The retired $1 `test-sat-hour` SKU is no longer sold.

A $130 / 1-hour purchase that is immediately booked will show **remaining 0**. That is a reserved hour, not an unpaid account. Remaining hours are the wrong signal for “payment verified.”

After an eligible cancellation the restore ledger row returns the hour to **remaining**. Used is net of restores, so Purchased / Used / Remaining add up (1 / 0 / 1 after cancel-restore, not 1 / 1 / 1). There is then no upcoming session to reschedule; the client books a new time with remaining credit.

## If a webhook is missed again

1. Student: SAT book-and-pay page → **Refresh payment status** (retrieves the Checkout Session from Stripe and fulfills if `payment_status=paid`).
2. Admin: `/admin/financials` → **Grant missing credits / reconcile Checkout** (`POST /api/admin/payments/backfill-credits`).
3. CLI idempotent backfill for **paid-but-uncredited** rows:

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts
node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts --apply
```

Re-running is safe. Do not invent Clerk invites or one-off manual credits when Stripe already has a paid Checkout Session.

Do not use this path to change in-portal Checkout. Checkout still only creates a pending payment + hosted session; credit still waits for a signed paid event or this explicit reconcile/backfill.
