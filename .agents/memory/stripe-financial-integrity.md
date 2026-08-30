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