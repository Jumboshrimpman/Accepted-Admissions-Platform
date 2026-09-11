import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, ReceiptText, WalletCards } from "lucide-react";
import { Link } from "wouter";
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
  previewOffers,
  adminPreview = false,
  offPlatformBilling = false,
}: {
  previewData?: FinancialSummary;
  previewOffer?: AdminClientPreviewOffer;
  previewOffers?: AdminClientPreviewOffer[];
  adminPreview?: boolean;
  offPlatformBilling?: boolean;
}) {
  const [expanded, setExpanded] = useState(!offPlatformBilling);
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
  if (offPlatformBilling && !expanded) {
    return (
      <Card className="border-primary/15 shadow-lg shadow-primary/5" data-testid="financial-card-collapsed">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-primary" />
                {adminPreview ? "SAT session payment and receipts" : "Your SAT session payment"}
              </CardTitle>
              <CardDescription className="mt-2">
                Session billing is handled off-platform. Stripe receipts stay collapsed unless you need them.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setExpanded(true)}
              data-testid="financial-card-show-more"
            >
              Show payment details
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    );
  }
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              {remainingHours} hour{remainingHours === 1 ? "" : "s"} remaining
            </Badge>
            {offPlatformBilling ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setExpanded(false)}
                data-testid="financial-card-hide"
              >
                Hide payment details
              </Button>
            ) : null}
          </div>
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
        {adminPreview && (previewOffers?.length || previewOffer) && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SAT purchase offers
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(previewOffers?.length ? previewOffers : previewOffer ? [previewOffer] : []).map((offer) => {
                const credits = Math.round(offer.durationHours ?? (offer.priceCents >= 130_000 ? 10 : 1));
                return (
                  <div
                    key={offer.slug ?? offer.name}
                    className="rounded-xl border bg-background/80 p-3"
                    data-testid={`preview-sat-offer-${offer.slug ?? offer.name}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{offer.name}</p>
                      <p className="text-lg font-semibold">${(offer.priceCents / 100).toFixed(2)}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{offer.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {credits} prepaid hour{credits === 1 ? "" : "s"}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Checkout is unavailable in the administrator preview. A verified purchase provides prepaid session credits that students book on Xavier or Eunice’s calendar.
            </p>
            <Button disabled variant="outline" className="mt-4 rounded-full">Checkout disabled in preview</Button>
          </div>
        )}
        {!readOnly && !adminPreview && (
          <Button asChild className="rounded-full">
            <Link href="/portal/sat">Purchase SAT session credits</Link>
          </Button>
        )}
        {adminPreview && hasVerifiedPayment && (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Payment verified</p>
            <p className="mt-1 text-amber-800">
              This account has a payment record and its current prepaid balance is shown below.
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