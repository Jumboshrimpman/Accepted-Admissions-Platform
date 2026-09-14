export const PAID_STATUSES_NEEDING_PURCHASE_CREDIT = [
  "paid",
  "partially_paid",
  "partially_refunded",
] as const;

export const STRIPE_PAID_SUCCESS_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
  "invoice.paid",
  "charge.succeeded",
] as const;

export function isStripePaidSuccessEvent(type: string): boolean {
  return (STRIPE_PAID_SUCCESS_EVENT_TYPES as readonly string[]).includes(type);
}

export function stripeCheckoutObjectIsPaid(
  eventType: string,
  paymentStatus: string | undefined,
): boolean {
  if (eventType === "checkout.session.completed") {
    return paymentStatus === "paid";
  }
  if (eventType === "checkout.session.async_payment_succeeded") {
    return paymentStatus === undefined || paymentStatus === "paid";
  }
  return true;
}

export type PaidStatusNeedingPurchaseCredit =
  (typeof PAID_STATUSES_NEEDING_PURCHASE_CREDIT)[number];

export function purchaseCreditFulfillmentKey(paymentId: string): string {
  return `payment:${paymentId}`;
}

export function purchaseCreditHours(product: { durationHours: unknown }): number {
  const hours = Number(product.durationHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(
      "SAT product is missing a positive durationHours value; credits were not granted.",
    );
  }
  return hours;
}

export function missingProductFulfillmentError(
  paymentId: string,
  productId: string | null | undefined,
): Error {
  return new Error(
    `Payment ${paymentId} cannot be marked paid: SAT product ${productId ?? "is missing"} was not found. Credits were not granted.`,
  );
}

export function paymentRequiresCatalogProduct(payment: {
  productId?: string | null;
  method?: string | null;
}): boolean {
  return Boolean(payment.productId) || payment.method === "stripe_checkout";
}
