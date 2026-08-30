import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminFinancialsQueryKey,
  getGetAdminOverviewQueryKey,
  useCreateCreditAdjustment,
  useCreateHostedInvoice,
  useCreateOfflinePayment,
  useGetAdminFinancials,
  useUpdateInvoice,
} from "@workspace/api-client-react";
import { ExternalLink, Loader2, ReceiptText, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function errorText(error: unknown): string {
  return (error as { data?: { error?: string } } | null)?.data?.error ?? "The financial action failed.";
}

export function AdminFinancialsPanel() {
  const queryClient = useQueryClient();
  const financials = useGetAdminFinancials({
    query: { queryKey: getGetAdminFinancialsQueryKey(), staleTime: 10_000 },
  });
  const hostedInvoice = useCreateHostedInvoice();
  const offlinePayment = useCreateOfflinePayment();
  const adjustment = useCreateCreditAdjustment();
  const updateInvoice = useUpdateInvoice();
  const [clientUserId, setClientUserId] = useState("");
  const [productId, setProductId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminFinancialsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
  };
  const complete = (text: string) => {
    setMessage(text);
    refresh();
  };
  const fail = (error: unknown) => setMessage(errorText(error));
  const busy =
    hostedInvoice.isPending ||
    offlinePayment.isPending ||
    adjustment.isPending ||
    updateInvoice.isPending;

  if (financials.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!financials.data) return null;
  const data = financials.data;
  const selectedClient = clientUserId || data.clients[0]?.id || "";
  const selectedProduct = productId || data.products[0]?.id || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" /> Financial operations</CardTitle>
        <CardDescription>Create hosted invoices, record verified offline payments, and audit credit adjustments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">
            Client
            <select value={selectedClient} onChange={(event) => setClientUserId(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3">
              {data.clients.map((client) => <option key={client.id} value={client.id}>{client.displayName} · {client.email}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            SAT product
            <select value={selectedProduct} onChange={(event) => setProductId(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3">
              {data.products.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.totalPriceCents)}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || !selectedClient || !selectedProduct}
            onClick={() => hostedInvoice.mutate(
              { data: { clientUserId: selectedClient, productId: selectedProduct, daysUntilDue: 7 } },
              { onSuccess: () => complete("Hosted invoice created and sent."), onError: fail },
            )}
          >
            {hostedInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create hosted invoice
          </Button>
          <Button
            variant="outline"
            disabled={busy || !selectedClient || !selectedProduct}
            onClick={() => offlinePayment.mutate(
              { data: { clientUserId: selectedClient, productId: selectedProduct, note: note || undefined } },
              { onSuccess: () => complete("Offline payment recorded and credits fulfilled."), onError: fail },
            )}
          >
            Record offline payment
          </Button>
        </div>
        <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-[140px_1fr_auto] md:items-end">
          <label className="text-sm font-medium">Hours (+ / −)<Input className="mt-2" type="number" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
          <label className="text-sm font-medium">Required audit note<Input className="mt-2" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <Button
            variant="secondary"
            disabled={busy || !selectedClient || !Number(hours) || note.trim().length < 3}
            onClick={() => adjustment.mutate(
              { data: { clientUserId: selectedClient, hours: Number(hours), note: note.trim() } },
              { onSuccess: () => { setHours(""); setNote(""); complete("Credit adjustment recorded."); }, onError: fail },
            )}
          >
            Save adjustment
          </Button>
        </div>
        {message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}
        <div className="overflow-x-auto">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><ReceiptText className="h-4 w-4" /> Invoices & payment status</h3>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Client</th><th className="p-3">Description</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {data.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b">
                  <td className="p-3">{invoice.clientName ?? "Unknown client"}</td>
                  <td className="p-3">{invoice.description}</td>
                  <td className="p-3 font-medium">{money(invoice.totalCents)}</td>
                  <td className="p-3"><Badge variant="outline" className="capitalize">{invoice.status.replaceAll("_", " ")}</Badge></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {invoice.hostedInvoiceUrl && <Button asChild size="icon" variant="ghost"><a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" aria-label="Open hosted invoice"><ExternalLink className="h-4 w-4" /></a></Button>}
                      {["pending", "sent"].includes(invoice.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateInvoice.mutate({ invoiceId: invoice.id, data: { status: "canceled" } }, { onSuccess: () => complete("Invoice canceled."), onError: fail })}>Cancel</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.invoices.length === 0 && <p className="py-5 text-sm text-muted-foreground">No invoices recorded.</p>}
        </div>
      </CardContent>
    </Card>
  );
}