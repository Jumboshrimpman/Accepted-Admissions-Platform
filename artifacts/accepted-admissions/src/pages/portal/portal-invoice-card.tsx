import type { Dashboard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PortalOpenInvoice = NonNullable<Dashboard["openInvoice"]>;

export function formatInvoiceDueOn(dueOn: string): string {
  const [year, month, day] = dueOn.split("-").map(Number);
  if (!year || !month || !day) return dueOn;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatInvoiceTotal(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function PortalInvoiceCard({ invoice }: { invoice: PortalOpenInvoice }) {
  return (
    <Card data-testid="portal-invoice-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{invoice.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1 text-sm text-muted-foreground">
          {invoice.coverage.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold">{formatInvoiceTotal(invoice.totalCents)}</p>
            <p className="text-sm text-muted-foreground">
              Due {formatInvoiceDueOn(invoice.dueOn)}
            </p>
          </div>
          <Button asChild className="rounded-full">
            <a
              href={invoice.payUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="portal-invoice-pay"
            >
              Pay
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
