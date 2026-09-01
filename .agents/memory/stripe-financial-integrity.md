---
name: Stripe financial integrity
description: Non-obvious invariants for safe SAT payment fulfillment, refunds, and hosted invoices.
---

Grant credits only after a Stripe event proves funds are paid; a completed Checkout session can still be unpaid for asynchronous methods. Enforce fulfillment uniqueness in the database rather than with a read-before-insert check.

**Why:** Different success events can arrive concurrently, and event-level idempotency alone does not stop both events from fulfilling the same purchase.

**How to apply:** Lock and reread the payment row before state or cumulative-refund calculations, make transitions monotonic, and use a unique nullable fulfillment key for every credit/debit side effect.

Create hosted invoices as isolated drafts with pending customer items excluded, then attach each item to that exact invoice before finalizing.

**Why:** Customer-level pending invoice items can otherwise be swept into a concurrent or retried invoice and charge the wrong amount.

**How to apply:** Keep invoice creation, item attachment, finalization, and compensating cleanup as one provider workflow; void Stripe before showing a local invoice as canceled.

Stripe's current invoice-item endpoint accepts a catalog price through `pricing[price]`; the legacy top-level `price` parameter is rejected.

**Why:** The connected Stripe test-mode API has moved the invoice-item request shape while preserving price-based invoice lines.

**How to apply:** Verify provider request parameters against a test-mode fixture before changing hosted invoice creation, and keep the test-mode invoice-isolation case running.

Treat provider idempotency keys as a short-term retry guard, not a permanent exact-once ledger. Reconcile the provider by stable business identity before retrying a financial side effect.

**Why:** Stripe may accept a financial operation before the local database transaction commits, while provider idempotency keys can later expire; a delayed retry must recover the accepted operation instead of duplicating it.

**How to apply:** Give each transfer or cumulative reversal target a durable business identity that both local records and the provider can query after ambiguous failures.

Persist immutable provider payment and refund outcomes even when the related Connect transfer or reversal fails; surface payout failure separately and make it explicitly retryable.

**Why:** A card charge or refund has already happened at Stripe and cannot be rolled back just because the related destination transfer cannot settle immediately.

**How to apply:** Commit payment, invoice, credit, and audit state; mark the transfer or reversal failed with a safe operator message; retry through an administrator-only reconciliation action.