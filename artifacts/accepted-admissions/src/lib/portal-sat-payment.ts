export type PaymentCreditBanner = "confirming" | "granted" | "timeout";

export const PAYMENT_CONFIRMING_TITLE = "Payment received — waiting for Stripe to confirm";
export const PAYMENT_CONFIRMING_BODY =
  "Checkout finished, but credits appear only after a signed Stripe webhook confirms the charge. This page updates when the ledger changes.";
export const PAYMENT_GRANTED_TITLE = "Stripe confirmed your payment";
export const PAYMENT_TIMEOUT_TITLE = "Payment received — credits still processing";
export const PAYMENT_TIMEOUT_BODY =
  "Checkout finished, but this app has not granted credit yet. Credits appear only after the signed webhook confirms payment. Refresh in a moment, or book once the balance updates.";

export function paymentCreditBannerState(args: {
  remainingHours: number;
  baselineHours: number;
  timedOut: boolean;
}): PaymentCreditBanner {
  if (args.remainingHours > args.baselineHours) return "granted";
  if (args.timedOut) return "timeout";
  return "confirming";
}

export function paymentCreditBannerCopy(
  state: PaymentCreditBanner,
  remainingHours: number,
): { title: string; body: string } {
  if (state === "granted") {
    return {
      title: PAYMENT_GRANTED_TITLE,
      body: `The ledger now shows ${remainingHours} prepaid hour${remainingHours === 1 ? "" : "s"}. You can book below.`,
    };
  }
  if (state === "timeout") {
    return { title: PAYMENT_TIMEOUT_TITLE, body: PAYMENT_TIMEOUT_BODY };
  }
  return { title: PAYMENT_CONFIRMING_TITLE, body: PAYMENT_CONFIRMING_BODY };
}
