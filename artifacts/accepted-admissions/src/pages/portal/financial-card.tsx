import { format, parseISO } from "date-fns";
import { ExternalLink, ReceiptText, WalletCards } from "lucide-react";
import { getGetFinancialsQueryKey, useGetFinancials, type AdminClientPreviewOffer, type FinancialSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function FinancialCard({
  previewData,
  previewOffer,
  adminPreview = false,
}: {
  previewData?: FinancialSummary;
  previewOffer?: AdminClientPreviewOffer;
  adminPreview?: boolean;
}) {
  const query = useGetFinancials({
    query: {
      enabled: !previewData,
      queryKey: getGetFinancialsQueryKey(),
      staleTime: 10_000,
      refetchInterval: 30_000,
    },
  });

  if (!previewData && query.isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  const data = previewData ?? query.data;
  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Financial records are temporarily unavailable.
        </CardContent>
      </Card>
    );
  }

  const { invoices, payments, credits, remainingHours, purchasedHours, usedHours } = data;
  const readOnly = adminPreview || data.readOnly;
  const hasVerifiedPayment = payments.some(
    (payment) => payment.verifiedAt || payment.status === "paid" || payment.status === "partially_paid",
  );
  return (
    <Card className="border-primary/15 shadow-lg shadow-primary/5">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
               <WalletCards className="h-5 w-5 text-primary" />
                {adminPreview ? "SAT session payment and receipts" : "Your SAT session payment"}
            </CardTitle>
            <CardDescription className="mt-2">
              Stripe payment pages handle card details. This portal shows only verified account records.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {remainingHours} hour{remainingHours === 1 ? "" : "s"} remaining
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" data-testid="credit-balance-summary">
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchased</p>
            <p className="mt-1 text-lg font-semibold">{purchasedHours ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Used</p>
            <p className="mt-1 text-lg font-semibold">{usedHours ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="mt-1 text-lg font-semibold">{remainingHours}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {adminPreview && previewOffer && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">One-time offer</p>
                <p className="mt-1 font-semibold">{previewOffer.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{previewOffer.description}</p>
              </div>
              <p className="text-lg font-semibold">${(previewOffer.priceCents / 100).toFixed(2)}</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Checkout is unavailable in the administrator preview. A verified purchase provides one prepaid 60-minute session.
            </p>
            <Button disabled variant="outline" className="mt-4 rounded-full">Checkout disabled in preview</Button>
          </div>
        )}
        {!readOnly && !adminPreview && (
          <Button asChild className="rounded-full">
             <a href="/sat">Purchase SAT session credits</a>
          </Button>
        )}
        {adminPreview && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">{hasVerifiedPayment ? "Payment verified" : "No verified purchase yet"}</p>
            <p className="mt-1 text-amber-800">
              {hasVerifiedPayment
                ? "This account has a payment record and its current prepaid balance is shown below."
                : "The student has not completed a verified purchase, so booking remains unavailable."}
            </p>
          </div>
        )}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent payments
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.slice(0, 5).map((payment) => (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div>
                    <p className="font-medium">{payment.productName ?? "SAT tutoring payment"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(payment.createdAt), "MMM d, yyyy")} · {payment.method.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(payment.amountCents)}</p>
                      <Badge variant="outline" className="capitalize">{statusLabel(payment.status)}{payment.verifiedAt ? " · verified" : ""}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <ReceiptText className="h-4 w-4" /> Invoices
          </h3>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div>
                    <p className="font-medium">{invoice.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.dueAt ? `Due ${format(parseISO(invoice.dueAt), "MMM d, yyyy")}` : "No due date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{money(invoice.totalCents)}</p>
                      <Badge variant="outline" className="capitalize">{statusLabel(invoice.status)}</Badge>
                    </div>
                    {invoice.hostedInvoiceUrl && (
                      <Button asChild size="icon" variant="ghost" aria-label="Open hosted invoice">
                        <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {invoice.receiptUrl && (
                      <Button asChild size="icon" variant="ghost" aria-label="Open verified receipt">
                        <a href={invoice.receiptUrl} target="_blank" rel="noreferrer">
                          <ReceiptText className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Credit history
          </h3>
          {credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credit ledger entries yet.</p>
          ) : (
            <div className="space-y-2">
              {credits.slice(0, 8).map((credit) => {
                const debit = credit.entryType.includes("debit") || credit.entryType === "refund";
                return (
                  <div key={credit.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                    <div>
                      <p className="font-medium capitalize">{credit.referenceType ?? credit.entryType}</p>
                      <p className="text-xs text-muted-foreground">{credit.note ?? "Account credit activity"}</p>
                    </div>
                    <span className={debit ? "font-semibold text-destructive" : "font-semibold text-emerald-700"}>
                      {debit ? "-" : "+"}{credit.hours} hr
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}