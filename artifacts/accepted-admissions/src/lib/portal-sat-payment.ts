export type PaymentCreditBanner = "confirming" | "granted" | "timeout";
export type BookingCreditWall = "none" | "available" | "unpaid" | "reserved" | "spent";

export const PAYMENT_CONFIRMING_TITLE = "Payment received — waiting for Stripe to confirm";
export const PAYMENT_CONFIRMING_BODY =
  "Checkout finished, but credits appear only after a signed Stripe webhook confirms the charge. This page updates when the ledger changes.";
export const PAYMENT_GRANTED_TITLE = "Stripe confirmed your payment";
export const PAYMENT_TIMEOUT_TITLE = "Payment received — credits still processing";
export const PAYMENT_TIMEOUT_BODY =
  "Checkout finished, but this app has not granted credit yet. Credits appear only after the signed webhook confirms payment, or after you refresh payment status. Refresh in a moment, or book once the balance updates.";

export function paymentCreditBannerState(args: {
  remainingHours: number;
  baselineHours: number;
  timedOut: boolean;
  purchasedHours?: number;
  baselinePurchasedHours?: number;
}): PaymentCreditBanner {
  if (args.remainingHours > args.baselineHours) return "granted";
  if (
    typeof args.purchasedHours === "number" &&
    typeof args.baselinePurchasedHours === "number" &&
    args.purchasedHours > args.baselinePurchasedHours
  ) {
    return "granted";
  }
  if (args.timedOut) return "timeout";
  return "confirming";
}

export function paymentCreditBannerCopy(
  state: PaymentCreditBanner,
  remainingHours: number,
  extras?: { usedHours?: number; hasLiveBookedSession?: boolean },
): { title: string; body: string } {
  if (state === "granted") {
    if (remainingHours > 0) {
      return {
        title: PAYMENT_GRANTED_TITLE,
        body: `The ledger now shows ${remainingHours} prepaid hour${remainingHours === 1 ? "" : "s"}. You can book below.`,
      };
    }
    if (extras?.hasLiveBookedSession || (extras?.usedHours ?? 0) > 0) {
      return {
        title: PAYMENT_GRANTED_TITLE,
        body: "Your prepaid hour is reserved on the booked session below. You can change that date and time there when the session is still upcoming.",
      };
    }
    return {
      title: PAYMENT_GRANTED_TITLE,
      body: "The ledger now shows 0 remaining hours. Buy another hour to book a new session.",
    };
  }
  if (state === "timeout") {
    return { title: PAYMENT_TIMEOUT_TITLE, body: PAYMENT_TIMEOUT_BODY };
  }
  return { title: PAYMENT_CONFIRMING_TITLE, body: PAYMENT_CONFIRMING_BODY };
}

export function bookingCreditWallState(args: {
  remainingHours: number | null;
  purchasedHours: number;
  hasLiveBookedSession: boolean;
  rescheduling: boolean;
}): BookingCreditWall {
  if (args.rescheduling) return "none";
  if (args.remainingHours === null) return "none";
  if (args.remainingHours > 0) return "available";
  if (args.hasLiveBookedSession) return "reserved";
  if (args.purchasedHours > 0) return "spent";
  return "unpaid";
}

export function prepaidHoursBadgeLabel(
  remainingHours: number | null,
  purchasedHours = 0,
  hasLiveBookedSession = false,
): string {
  if (remainingHours === null) return "Checking balance…";
  if (remainingHours > 0) {
    return `${remainingHours} prepaid hour${remainingHours === 1 ? "" : "s"}`;
  }
  if (hasLiveBookedSession && purchasedHours > 0) return "Hour reserved";
  return "0 prepaid hours";
}

export function remainingCreditsCaption(args: {
  remainingHours: number;
  purchasedHours: number;
  usedHours?: number;
  hasLiveBookedSession?: boolean;
}): string {
  if (args.remainingHours > 0) return `Remaining credits: ${args.remainingHours}`;
  if (args.hasLiveBookedSession) {
    return "Remaining credits: 0 — prepaid hour reserved on a booked session";
  }
  return `Remaining credits: ${args.remainingHours}`;
}
