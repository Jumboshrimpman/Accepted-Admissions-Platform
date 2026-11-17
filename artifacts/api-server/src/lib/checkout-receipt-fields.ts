/**
 * Receipt and PaymentIntent metadata for new Checkout Sessions only.
 * Existing charges are never updated here.
 */
export function checkoutPaymentIntentReceiptFields(args: {
  paymentId: string;
  invoiceId: string;
  productId: string;
  clientUserId: string;
  receiptEmail?: string | null;
}): Record<string, string> {
  const fields: Record<string, string> = {
    "payment_intent_data[metadata][payment_id]": args.paymentId,
    "payment_intent_data[metadata][invoice_id]": args.invoiceId,
    "payment_intent_data[metadata][product_id]": args.productId,
    "payment_intent_data[metadata][client_user_id]": args.clientUserId,
  };
  const receiptEmail = args.receiptEmail?.trim();
  if (receiptEmail) fields["payment_intent_data[receipt_email]"] = receiptEmail;
  return fields;
}
