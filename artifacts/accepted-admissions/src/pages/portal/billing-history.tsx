import { useGetBillingHistory, type BillingHistoryPayment } from "@workspace/api-client-react";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatBillingTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day}, ${time} ET`;
}

function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} hour${rounded === 1 ? "" : "s"}`;
}

export function BillingHistoryDisclosure({ payments }: { payments: BillingHistoryPayment[] }) {
  const count = payments.length;
  return (
    <details className="rounded-2xl border bg-card" data-testid="billing-history">
      <summary className="cursor-pointer px-5 py-4 text-lg font-semibold">
        Billing history ({count} {count === 1 ? "payment" : "payments"})
      </summary>
      <div className="space-y-3 border-t px-5 py-4">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="billing-history-empty">
            No payments or purchases are on file.
          </p>
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-xl border p-4"
                data-testid={`billing-history-${payment.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{formatBillingTimestamp(payment.purchasedAt)}</p>
                    <p className="mt-1 font-medium">{payment.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        payment.service,
                        payment.tutorName,
                        payment.hours != null ? hoursLabel(payment.hours) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {payment.sessionTitle || payment.sessionStart ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Session
                        {payment.sessionTitle ? `: ${payment.sessionTitle}` : ""}
                        {payment.sessionStart ? ` · ${formatBillingTimestamp(payment.sessionStart)}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    {payment.amountCents != null ? (
                      <p className="font-semibold">{money(payment.amountCents)}</p>
                    ) : null}
                    <p className="text-sm capitalize text-muted-foreground">{payment.status}</p>
                    {payment.documentUrl ? (
                      <a
                        href={payment.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm font-medium text-primary underline"
                        data-testid={`billing-history-document-${payment.id}`}
                      >
                        View receipt
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function BillingHistorySection({ clientId }: { clientId?: string }) {
  const query = useGetBillingHistory(clientId ? { clientId } : undefined, {
    query: { staleTime: 10_000 },
  });
  if (query.isLoading || !query.data) return null;
  return <BillingHistoryDisclosure payments={query.data.payments} />;
}
