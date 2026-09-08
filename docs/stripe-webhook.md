# Stripe webhook (production)

Live SAT Checkout credits are granted only after a signed Stripe webhook reaches this API.

## Required production endpoint

Set the Stripe Dashboard webhook URL to exactly:

`https://app.acceptedadmissions.org/api/stripe/webhook`

That public origin is rewritten by Vercel to the Railway API (`/api/:path*` in `vercel.json`). Do **not** point Stripe at Replit.

| Use | URL |
| --- | --- |
| Production (required) | `https://app.acceptedadmissions.org/api/stripe/webhook` |
| Retired / broken | `https://accepted-admissions-platform.replit.app/api/stripe/webhook` |

The Replit host previously recorded 100% delivery errors. A paid Checkout (`test` / `test-sat-hour`) then stayed uncredited until the event was resent to the public app URL.

Also set `STRIPE_WEBHOOK_SECRET` on Railway (the signing secret for this endpoint). Do not invent or commit secrets.

Code asserts the same URL in `PRODUCTION_STRIPE_WEBHOOK_URL` (`artifacts/api-server/src/lib/stripe-webhook-url.ts`). The Express route is mounted from `PRODUCTION_STRIPE_WEBHOOK_PATH`.

## Fulfillment rules

On `checkout.session.completed` with `payment_status=paid` (or `payment_intent.succeeded` / `invoice.paid` / `charge.succeeded`):

1. Match the payment.
2. If the payment has a catalog product (or method `stripe_checkout`), grant **`product.durationHours`** on `credit_ledger` with fulfillment key `payment:{paymentId}`.
3. Only then mark the payment paid in the same database transaction.

Never mark a catalog purchase paid when the product row is missing. That fails the webhook (HTTP 500) so Stripe retries after ops restore the product. Signature failures stay HTTP 400.

Hours come from `sat_products.durationHours`, not from the charge amount. The $1 `test` / `test-sat-hour` SKU still grants 1 hour.

## If a webhook is missed again

Idempotent backfill for **paid-but-uncredited** rows (status `paid`, `partially_paid`, or `partially_refunded` with a product and no `payment:{id}` ledger row):

```bash
cd artifacts/api-server
node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts
node --experimental-strip-types src/scripts/backfill-paid-uncredited-payments.ts --apply
```

Administrators can also inspect recent mismatches on `/admin/financials` and run `POST /api/admin/payments/backfill-credits`. Re-running is safe.

Do not use this path to invent Clerk invites or change in-portal Checkout. Checkout still only creates a pending payment + hosted session; credit still waits for a signed paid event or this explicit backfill.
