export function tutorShareForRefund(
  tutorShareCents: number,
  paymentAmountCents: number,
  refundedAmountCents: number,
): number {
  if (paymentAmountCents <= 0) return 0;
  return Math.min(
    tutorShareCents,
    Math.round((tutorShareCents * Math.max(0, refundedAmountCents)) / paymentAmountCents),
  );
}