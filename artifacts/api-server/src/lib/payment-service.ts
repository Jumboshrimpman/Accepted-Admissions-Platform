import { and, eq, or, sql } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  invoicesTable,
  paymentsTable,
  satProductsTable,
  stripeWebhookEventsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import { formData, stripeRequest, type StripeRequestError } from "./stripe-client.ts";

type StripeRecord = Record<string, unknown>;

function recordString(record: StripeRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value ? value : undefined;
}

function nestedRecord(record: StripeRecord, key: string): StripeRecord {
  const value = record[key];
  return value && typeof value === "object" ? (value as StripeRecord) : {};
}

function recordNumber(record: StripeRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadata(record: StripeRecord): StripeRecord {
  return nestedRecord(record, "metadata");
}

function metadataString(record: StripeRecord, key: string): string | undefined {
  return recordString(metadata(record), key);
}

function positiveMoney(value: number): number {
  return Math.max(0, Math.round(value));
}

export async function ensureStripeCustomer(user: AppUser): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripeRequest<StripeRecord>("/v1/customers", {
    method: "POST",
    idempotencyKey: `accepted-admissions-customer-${user.id}`,
    body: formData({
      email: user.email,
      name: user.displayName,
      "metadata[app_user_id]": user.id,
    }),
  });
  const customerId = recordString(customer, "id");
  if (!customerId) throw new Error("Stripe did not return a customer id");
  await db
    .update(usersTable)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  return customerId;
}

export async function ensureStripePrice(product: typeof satProductsTable.$inferSelect): Promise<string> {
  if (product.stripePriceId) return product.stripePriceId;
  const stripeProduct = await stripeRequest<StripeRecord>("/v1/products", {
    method: "POST",
    idempotencyKey: `accepted-admissions-product-${product.id}`,
    body: formData({
      name: product.name,
      description: product.description,
      "metadata[app_product_id]": product.id,
      "metadata[slug]": product.slug,
    }),
  });
  const stripeProductId = recordString(stripeProduct, "id");
  if (!stripeProductId) throw new Error("Stripe did not return a product id");
  const stripePrice = await stripeRequest<StripeRecord>("/v1/prices", {
    method: "POST",
    idempotencyKey: `accepted-admissions-price-${product.id}`,
    body: formData({
      product: stripeProductId,
      unit_amount: product.totalPriceCents,
      currency: "usd",
      "metadata[app_product_id]": product.id,
    }),
  });
  const stripePriceId = recordString(stripePrice, "id");
  if (!stripePriceId) throw new Error("Stripe did not return a price id");
  await db
    .update(satProductsTable)
    .set({ stripeProductId, stripePriceId, updatedAt: new Date() })
    .where(eq(satProductsTable.id, product.id));
  return stripePriceId;
}

export async function createCheckoutSession(args: {
  user: AppUser;
  product: typeof satProductsTable.$inferSelect;
  invoiceId: string;
  paymentId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string; paymentIntentId?: string }> {
  const [customerId, priceId] = await Promise.all([
    ensureStripeCustomer(args.user),
    ensureStripePrice(args.product),
  ]);
  const session = await stripeRequest<StripeRecord>("/v1/checkout/sessions", {
    method: "POST",
    idempotencyKey: `accepted-admissions-checkout-${args.paymentId}`,
    body: formData({
      mode: "payment",
      customer: customerId,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      "metadata[payment_id]": args.paymentId,
      "metadata[invoice_id]": args.invoiceId,
      "metadata[product_id]": args.product.id,
      "metadata[client_user_id]": args.user.id,
      "payment_intent_data[metadata][payment_id]": args.paymentId,
      "payment_intent_data[metadata][invoice_id]": args.invoiceId,
      "payment_intent_data[metadata][product_id]": args.product.id,
      "payment_intent_data[metadata][client_user_id]": args.user.id,
    }),
  });
  const id = recordString(session, "id");
  const url = recordString(session, "url");
  if (!id || !url) throw new Error("Stripe did not return a hosted Checkout URL");
  return {
    id,
    url,
    paymentIntentId: recordString(session, "payment_intent"),
  };
}

export async function createHostedInvoice(args: {
  user: AppUser;
  product: typeof satProductsTable.$inferSelect;
  invoiceId: string;
  paymentId: string;
  daysUntilDue: number;
}): Promise<{ id: string; hostedInvoiceUrl?: string; dueAt?: Date }> {
  const [customerId, priceId] = await Promise.all([
    ensureStripeCustomer(args.user),
    ensureStripePrice(args.product),
  ]);
  const invoice = await stripeRequest<StripeRecord>("/v1/invoices", {
    method: "POST",
    idempotencyKey: `accepted-admissions-invoice-${args.invoiceId}`,
    body: formData({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: args.daysUntilDue,
      auto_advance: false,
      pending_invoice_items_behavior: "exclude",
      "metadata[payment_id]": args.paymentId,
      "metadata[invoice_id]": args.invoiceId,
      "metadata[product_id]": args.product.id,
      "metadata[client_user_id]": args.user.id,
    }),
  });
  const id = recordString(invoice, "id");
  if (!id) throw new Error("Stripe did not return an invoice id");
  let invoiceItemId: string | undefined;
  try {
    const invoiceItem = await stripeRequest<StripeRecord>("/v1/invoiceitems", {
      method: "POST",
      idempotencyKey: `accepted-admissions-invoice-item-${args.paymentId}`,
      body: formData({
        customer: customerId,
        invoice: id,
        "pricing[price]": priceId,
        "metadata[payment_id]": args.paymentId,
        "metadata[invoice_id]": args.invoiceId,
      }),
    });
    invoiceItemId = recordString(invoiceItem, "id");
    if (!invoiceItemId) throw new Error("Stripe did not return an invoice item id");
    const finalized = await stripeRequest<StripeRecord>(`/v1/invoices/${id}/finalize`, {
      method: "POST",
      idempotencyKey: `accepted-admissions-invoice-finalize-${args.invoiceId}`,
    });
    const dueAtUnix = recordNumber(finalized, "due_date");
    return {
      id,
      hostedInvoiceUrl: recordString(finalized, "hosted_invoice_url"),
      dueAt: dueAtUnix ? new Date(dueAtUnix * 1000) : undefined,
    };
  } catch (error) {
    if (invoiceItemId) {
      await stripeRequest<StripeRecord>(`/v1/invoiceitems/${invoiceItemId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    await stripeRequest<StripeRecord>(`/v1/invoices/${id}`, {
      method: "DELETE",
    }).catch(async () => {
      await stripeRequest<StripeRecord>(`/v1/invoices/${id}/void`, {
        method: "POST",
      }).catch(() => undefined);
    });
    throw error;
  }
}

export async function voidHostedInvoice(providerInvoiceId: string, invoiceId: string): Promise<void> {
  await stripeRequest<StripeRecord>(`/v1/invoices/${providerInvoiceId}/void`, {
    method: "POST",
    idempotencyKey: `accepted-admissions-invoice-void-${invoiceId}`,
  });
}

function findObjectId(object: StripeRecord, key: string): string | undefined {
  const direct = recordString(object, key);
  if (direct) return direct;
  const nested = object[key];
  return nested && typeof nested === "object"
    ? recordString(nested as StripeRecord, "id")
    : undefined;
}

async function paymentForStripeObject(
  object: StripeRecord,
  eventType: string,
) {
  const objectId = recordString(object, "id");
  const paymentId = metadataString(object, "payment_id");
  const paymentIntentId =
    recordString(object, "payment_intent") ??
    findObjectId(object, "payment_intent");
  const providerInvoiceId = recordString(object, "invoice");
  if (paymentId) {
    const [row] = await db
      .select({ payment: paymentsTable, product: satProductsTable })
      .from(paymentsTable)
      .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);
    return row;
  }
  const [row] = await db
    .select({ payment: paymentsTable, product: satProductsTable })
    .from(paymentsTable)
    .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
    .leftJoin(invoicesTable, eq(invoicesTable.id, paymentsTable.invoiceId))
    .where(
      or(
        paymentIntentId
          ? eq(paymentsTable.providerPaymentIntentId, paymentIntentId)
          : sql`false`,
        objectId && eventType.startsWith("checkout.")
          ? eq(paymentsTable.providerCheckoutSessionId, objectId)
          : sql`false`,
        providerInvoiceId
          ? eq(invoicesTable.providerInvoiceId, providerInvoiceId)
          : sql`false`,
      ),
    )
    .limit(1);
  return row;
}

export async function processStripeWebhook(event: {
  id: string;
  type: string;
  data: { object: StripeRecord };
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(stripeWebhookEventsTable)
      .values({
        providerEventId: event.id,
        eventType: event.type,
        payload: event.data.object,
      })
      .onConflictDoNothing({ target: stripeWebhookEventsTable.providerEventId })
      .returning({ id: stripeWebhookEventsTable.id });
    if (!claimed) return;

    const object = event.data.object;
    const row = await paymentForStripeObject(object, event.type);
    if (!row) return;
    await tx.execute(sql`select id from payments where id = ${row.payment.id} for update`);
    const [payment] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, row.payment.id))
      .limit(1);
    if (!payment) return;
    const product = row.product;
    const invoiceId = payment.invoiceId;
    const now = new Date();
    const objectId = recordString(object, "id");
    const paymentIntentId =
      recordString(object, "payment_intent") ??
      findObjectId(object, "payment_intent");
    const receiptUrl = recordString(object, "receipt_url");

    if (
      event.type === "checkout.session.completed" ||
      event.type === "payment_intent.succeeded" ||
      event.type === "invoice.paid" ||
      event.type === "charge.succeeded"
    ) {
      if (
        event.type === "checkout.session.completed" &&
        recordString(object, "payment_status") !== "paid"
      ) {
        return;
      }
      const amount =
        recordNumber(object, "amount_total") ??
        recordNumber(object, "amount_paid") ??
        recordNumber(object, "amount_received");
      if (amount !== undefined && positiveMoney(amount) !== payment.amountCents) {
        throw new Error(`Stripe amount mismatch for payment ${payment.id}`);
      }
      const retainedRefundStatus = ["refunded", "partially_refunded"].includes(payment.status)
        ? payment.status
        : "paid";
      await tx
        .update(paymentsTable)
        .set({
          status: retainedRefundStatus,
          providerEventId: event.id,
          providerPaymentIntentId: paymentIntentId ?? payment.providerPaymentIntentId,
          providerCheckoutSessionId:
            event.type.startsWith("checkout.") ? objectId : payment.providerCheckoutSessionId,
          paidAt: payment.paidAt ?? now,
          verifiedAt: payment.verifiedAt ?? now,
          receiptUrl: receiptUrl ?? payment.receiptUrl,
          updatedAt: now,
          failureReason: null,
        })
        .where(eq(paymentsTable.id, payment.id));
      if (invoiceId) {
        await tx
          .update(invoicesTable)
          .set({
            status: retainedRefundStatus,
            paidAt: payment.paidAt ?? now,
            receiptUrl: receiptUrl ?? undefined,
            updatedAt: now,
          })
          .where(eq(invoicesTable.id, invoiceId));
      }
      if (product) {
        await tx
          .insert(creditLedgerTable)
          .values({
            clientUserId: payment.clientUserId!,
            productId: product.id,
            entryType: "original",
            hours: product.durationHours,
            referenceType: "payment",
            referenceId: payment.id,
            fulfillmentKey: `payment:${payment.id}`,
            note: `${product.name} purchase`,
          })
          .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey });
      }
      return;
    }

    if (
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "payment_intent.payment_failed" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.finalization_failed" ||
      event.type === "invoice.marked_uncollectible"
    ) {
      if (["paid", "refunded", "partially_refunded"].includes(payment.status)) return;
      const failure = nestedRecord(object, "last_payment_error");
      await tx
        .update(paymentsTable)
        .set({
          status: "failed",
          providerEventId: event.id,
          providerPaymentIntentId: paymentIntentId ?? payment.providerPaymentIntentId,
          providerCheckoutSessionId:
            event.type.startsWith("checkout.") ? objectId : payment.providerCheckoutSessionId,
          failureReason: recordString(failure, "message") ?? "Payment failed",
          updatedAt: now,
        })
        .where(eq(paymentsTable.id, payment.id));
      if (invoiceId) {
        await tx
          .update(invoicesTable)
          .set({ status: "failed" })
          .where(eq(invoicesTable.id, invoiceId));
      }
      return;
    }

    if (event.type === "checkout.session.expired" || event.type === "invoice.voided") {
      if (["paid", "refunded", "partially_refunded"].includes(payment.status)) return;
      await tx
        .update(paymentsTable)
        .set({
          status: "canceled",
          providerEventId: event.id,
          providerCheckoutSessionId: objectId ?? payment.providerCheckoutSessionId,
          updatedAt: now,
        })
        .where(eq(paymentsTable.id, payment.id));
      if (invoiceId) {
        await tx
          .update(invoicesTable)
          .set({ status: "canceled" })
          .where(eq(invoicesTable.id, invoiceId));
      }
      return;
    }

    if (event.type === "charge.refunded" && product && payment.clientUserId) {
      const refundedTotal = Math.min(
        payment.amountCents,
        positiveMoney(recordNumber(object, "amount_refunded") ?? 0),
      );
      const previousRefunded = Math.min(
        payment.amountCents,
        positiveMoney(payment.refundedAmountCents),
      );
      const delta = refundedTotal - previousRefunded;
      if (delta <= 0) return;
      await tx
        .update(paymentsTable)
        .set({
          status: refundedTotal >= payment.amountCents ? "refunded" : "partially_refunded",
          providerEventId: event.id,
          providerPaymentIntentId: paymentIntentId ?? payment.providerPaymentIntentId,
          refundedAmountCents: refundedTotal,
          updatedAt: now,
        })
        .where(eq(paymentsTable.id, payment.id));
      if (invoiceId) {
        await tx
          .update(invoicesTable)
          .set({
            status: refundedTotal >= payment.amountCents ? "refunded" : "partially_refunded",
          })
          .where(eq(invoicesTable.id, invoiceId));
      }
      if (delta > 0) {
        const referenceId = `${payment.id}:${refundedTotal}`;
        await tx
          .insert(creditLedgerTable)
          .values({
            clientUserId: payment.clientUserId,
            productId: product.id,
            entryType: "refund",
            hours: (product.durationHours * delta) / payment.amountCents,
            referenceType: "refund",
            referenceId,
            fulfillmentKey: `refund:${referenceId}`,
            note: "Credit removed after Stripe refund",
          })
          .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey });
      }
    }
  });
}

export function stripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as StripeRequestError).message);
  }
  return "Stripe is temporarily unavailable. Please try again.";
}