import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAdminProduct,
  getGetAdminFinancialsQueryKey,
  getGetAdminOverviewQueryKey,
  useCreateCreditAdjustment,
  useCreateHostedInvoice,
  useCreateOfflinePayment,
  useGetAdminFinancials,
  useUpdateAdminProduct,
  useUpdateInvoice,
} from "@workspace/api-client-react";
import { Check, Edit3, ExternalLink, Loader2, ReceiptText, WalletCards } from "lucide-react";
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
  const createProduct = useCreateAdminProduct();
  const updateProduct = useUpdateAdminProduct();
  const [clientUserId, setClientUserId] = useState("");
  const [productId, setProductId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<"stripe_invoice" | "manual">("stripe_invoice");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [invoiceQuantity, setInvoiceQuantity] = useState("1");
  const [invoiceUnitPrice, setInvoiceUnitPrice] = useState("");
  const [invoiceTax, setInvoiceTax] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [invoiceDays, setInvoiceDays] = useState("7");
  const [invoiceDueAt, setInvoiceDueAt] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [issuerName, setIssuerName] = useState("Accepted Admissions");
  const [issuerEmail, setIssuerEmail] = useState("");
  const [issuerAddress, setIssuerAddress] = useState("");
  const [invoiceClientName, setInvoiceClientName] = useState("");
  const [invoiceClientEmail, setInvoiceClientEmail] = useState("");
  const [editingInvoiceId, setEditingInvoiceId] = useState("");
  const [productDraft, setProductDraft] = useState({
    slug: "",
    name: "",
    description: "",
    durationHours: "",
    totalPrice: "",
  });
  const [editingProductId, setEditingProductId] = useState("");

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
    updateInvoice.isPending ||
    createProduct.isPending ||
    updateProduct.isPending;

  if (financials.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!financials.data) return null;
  const data = financials.data;
  const selectedClient = clientUserId || data.clients[0]?.id || "";
  const selectedProduct = productId || data.products[0]?.id || "";
  const selectedProductRecord = data.products.find((product) => product.id === selectedProduct);
  const invoicePriceCents = Math.round(
    Number(invoiceUnitPrice || (selectedProductRecord?.totalPriceCents ?? 0) / 100) * 100,
  );
  const productPayload = {
    slug: productDraft.slug.trim(),
    name: productDraft.name.trim(),
    description: productDraft.description.trim(),
    durationHours: Number(productDraft.durationHours),
    totalPriceCents: Math.round(Number(productDraft.totalPrice) * 100),
  };
  const invoiceDetails = {
    description: invoiceDescription || selectedProductRecord?.name || "SAT tutoring",
    lineItems: [{
      description: invoiceDescription || selectedProductRecord?.name || "SAT tutoring",
      quantity: Number(invoiceQuantity),
      unitPriceCents: invoicePriceCents,
      productId: selectedProduct,
    }],
    taxCents: Math.round(Number(invoiceTax || 0) * 100),
    discountCents: Math.round(Number(invoiceDiscount || 0) * 100),
    issuerName,
    issuerEmail: issuerEmail || undefined,
    issuerAddress,
    clientName: invoiceClientName || undefined,
    clientEmail: invoiceClientEmail || undefined,
    paymentInstructions,
    dueAt: invoiceDueAt ? new Date(`${invoiceDueAt}T23:59:59`).toISOString() : undefined,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-primary" /> Financial operations</CardTitle>
        <CardDescription>Manage SAT pricing, create transparent invoices, reconcile verified payments, and audit credits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-7">
        <section className="space-y-3 rounded-2xl border p-4">
          <div>
            <h3 className="font-semibold">Authoritative SAT catalog</h3>
            <p className="text-sm text-muted-foreground">Public checkout sells Single SAT Session ($130 / 1 credit) and Ten SAT Session Package ($1,300 / 10 credits at $130/hour). Credits book any open hour on Xavier or Eunice’s calendar after a verified Stripe webhook.</p>
          </div>
          <div className="hidden grid gap-3 md:grid-cols-5">
            <Input placeholder="Slug, e.g. sat-5-hour-package" value={productDraft.slug} onChange={(event) => setProductDraft({ ...productDraft, slug: event.target.value })} />
            <Input placeholder="Product name" value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} />
            <Input placeholder="Description" value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} />
            <Input type="number" min="0.25" step="0.25" placeholder="Hours" value={productDraft.durationHours} onChange={(event) => setProductDraft({ ...productDraft, durationHours: event.target.value })} />
            <Input type="number" min="0.01" step="0.01" placeholder="Price ($)" value={productDraft.totalPrice} onChange={(event) => setProductDraft({ ...productDraft, totalPrice: event.target.value })} />
          </div>
          <div className="hidden flex-wrap gap-2">
            <Button
              disabled={busy || !productPayload.slug || !productPayload.name || !productPayload.description || !productPayload.durationHours || !productPayload.totalPriceCents}
              onClick={() => {
                if (editingProductId) {
                  updateProduct.mutate({ productId: editingProductId, data: productPayload }, {
                    onSuccess: () => { setEditingProductId(""); setProductDraft({ slug: "", name: "", description: "", durationHours: "", totalPrice: "" }); complete("Product updated."); },
                    onError: fail,
                  });
                } else {
                  createProduct.mutate({ data: productPayload }, {
                    onSuccess: () => { setProductDraft({ slug: "", name: "", description: "", durationHours: "", totalPrice: "" }); complete("Product added to the catalog."); },
                    onError: fail,
                  });
                }
              }}
            >
              {editingProductId ? "Save product" : "Add product"}
            </Button>
            {editingProductId && <Button variant="ghost" onClick={() => { setEditingProductId(""); setProductDraft({ slug: "", name: "", description: "", durationHours: "", totalPrice: "" }); }}>Cancel edit</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-2">Product</th><th className="p-2">Hours</th><th className="p-2">Price</th><th className="p-2">Status</th><th className="hidden p-2">Action</th></tr></thead>
              <tbody>{data.products.map((product) => (
                <tr key={product.id} className="border-b">
                  <td className="p-2"><p className="font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{product.slug}</p></td>
                  <td className="p-2">{product.durationHours}</td>
                  <td className="p-2">{money(product.totalPriceCents)} <span className="text-xs text-muted-foreground">({money(product.effectiveHourlyRateCents)}/hr)</span></td>
                  <td className="p-2"><Badge variant={product.active ? "secondary" : "outline"}>{product.active ? "Active" : "Inactive"}</Badge></td>
                  <td className="hidden p-2"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditingProductId(product.id); setProductDraft({ slug: product.slug, name: product.name, description: product.description, durationHours: String(product.durationHours), totalPrice: (product.totalPriceCents / 100).toFixed(2) }); }}><Edit3 className="mr-1 h-3 w-3" /> Edit</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => updateProduct.mutate({ productId: product.id, data: { active: !product.active } }, { onSuccess: () => complete(product.active ? "Product deactivated." : "Product reactivated."), onError: fail })}>{product.active ? "Deactivate" : "Activate"}</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border bg-muted/10 p-4">
          <div><h3 className="font-semibold">Create an invoice</h3><p className="text-sm text-muted-foreground">Invoice edits never mark a payment as verified. Use reconciliation after funds are confirmed.</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">Client<select value={selectedClient} onChange={(event) => setClientUserId(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.displayName} · {client.email}</option>)}</select></label>
            <label className="text-sm font-medium">Product reference<select value={selectedProduct} onChange={(event) => setProductId(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3">{data.products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.totalPriceCents)}</option>)}</select></label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Line item description" value={invoiceDescription} onChange={(event) => setInvoiceDescription(event.target.value)} />
            <Input type="number" min="0.01" step="0.01" placeholder="Quantity" value={invoiceQuantity} onChange={(event) => setInvoiceQuantity(event.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Unit price ($)" value={invoiceUnitPrice || (selectedProductRecord ? (selectedProductRecord.totalPriceCents / 100).toFixed(2) : "")} onChange={(event) => setInvoiceUnitPrice(event.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Tax ($)" value={invoiceTax} onChange={(event) => setInvoiceTax(event.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input type="number" min="0" step="0.01" placeholder="Discount ($)" value={invoiceDiscount} onChange={(event) => setInvoiceDiscount(event.target.value)} />
            <Input type="number" min="1" max="90" placeholder="Due in days" value={invoiceDays} onChange={(event) => setInvoiceDays(event.target.value)} />
            <Input type="date" aria-label="Invoice due date" value={invoiceDueAt} onChange={(event) => setInvoiceDueAt(event.target.value)} />
            <label className="text-sm font-medium">Provider<select value={provider} onChange={(event) => setProvider(event.target.value as "stripe_invoice" | "manual")} className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option value="stripe_invoice">Stripe hosted</option><option value="manual">Manual / offline</option></select></label>
            <Input placeholder="Payment instructions" value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Client name on invoice" value={invoiceClientName} onChange={(event) => setInvoiceClientName(event.target.value)} />
            <Input placeholder="Client email on invoice" value={invoiceClientEmail} onChange={(event) => setInvoiceClientEmail(event.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Issuer name" value={issuerName} onChange={(event) => setIssuerName(event.target.value)} />
            <Input placeholder="Issuer email" value={issuerEmail} onChange={(event) => setIssuerEmail(event.target.value)} />
            <Input placeholder="Issuer address" value={issuerAddress} onChange={(event) => setIssuerAddress(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || !selectedClient || !selectedProduct || !invoicePriceCents || !Number(invoiceQuantity)} onClick={() => {
              if (editingInvoiceId) {
                updateInvoice.mutate({ invoiceId: editingInvoiceId, data: invoiceDetails }, { onSuccess: () => { setEditingInvoiceId(""); complete("Invoice details updated."); }, onError: fail });
              } else {
                hostedInvoice.mutate({ data: { clientUserId: selectedClient, productId: selectedProduct, provider, daysUntilDue: Math.max(1, Math.min(90, Number(invoiceDays) || 7)), ...invoiceDetails } }, { onSuccess: () => complete(provider === "manual" ? "Manual invoice created; reconcile it only after payment is verified." : "Hosted invoice created and sent."), onError: fail });
              }
            }}>{hostedInvoice.isPending || updateInvoice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingInvoiceId ? "Save invoice" : `Create ${provider === "manual" ? "manual" : "hosted"} invoice`}</Button>
            {editingInvoiceId && <Button variant="ghost" onClick={() => setEditingInvoiceId("")}>Cancel edit</Button>}
            <Button variant="outline" disabled={busy || !selectedClient || !selectedProduct} onClick={() => offlinePayment.mutate({ data: { clientUserId: selectedClient, productId: selectedProduct, amountCents: invoicePriceCents || undefined, note: note || undefined } }, { onSuccess: () => complete("Verified offline payment recorded and credits fulfilled."), onError: fail })}>{offlinePayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record verified payment</Button>
          </div>
        </section>
        <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-[140px_1fr_auto] md:items-end">
          <label className="text-sm font-medium">Hours (+ / −)<Input className="mt-2" type="number" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
          <label className="text-sm font-medium">Required auditable reason<Input className="mt-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Complimentary or previously paid credit reason" /></label>
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
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Client</th><th className="p-3">Description</th><th className="p-3">Amount</th><th className="p-3">Provider</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {data.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b">
                  <td className="p-3">{invoice.clientName ?? "Unknown client"}</td>
                  <td className="p-3">{invoice.description}</td>
                  <td className="p-3 font-medium">{money(invoice.totalCents)}</td>
                  <td className="p-3 capitalize">{invoice.provider.replaceAll("_", " ")}</td>
                  <td className="p-3"><Badge variant="outline" className="capitalize">{invoice.status.replaceAll("_", " ")}</Badge></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {invoice.hostedInvoiceUrl && <Button asChild size="icon" variant="ghost"><a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" aria-label="Open hosted invoice"><ExternalLink className="h-4 w-4" /></a></Button>}
                      {invoice.receiptUrl && <Button asChild size="icon" variant="ghost"><a href={invoice.receiptUrl} target="_blank" rel="noreferrer" aria-label="Open verified receipt"><Check className="h-4 w-4" /></a></Button>}
                      {!["paid", "refunded", "partially_refunded"].includes(invoice.status) && !(invoice.provider === "stripe_invoice" && invoice.providerInvoiceId) && <Button size="sm" variant="ghost" onClick={() => { setEditingInvoiceId(invoice.id); setClientUserId(invoice.clientUserId ?? ""); setProductId(invoice.lineItems?.find((item) => item.productId)?.productId ?? ""); setInvoiceDescription(invoice.description); setInvoiceQuantity(String(invoice.lineItems?.[0]?.quantity ?? 1)); setInvoiceUnitPrice(((invoice.lineItems?.[0]?.unitPriceCents ?? invoice.totalCents) / 100).toFixed(2)); setInvoiceTax(((invoice.taxCents ?? 0) / 100).toFixed(2)); setInvoiceDiscount((invoice.discountCents / 100).toFixed(2)); setInvoiceDueAt(invoice.dueAt ? invoice.dueAt.slice(0, 10) : ""); setInvoiceClientName(invoice.clientName ?? ""); setInvoiceClientEmail(invoice.clientEmail ?? ""); setIssuerName(invoice.issuerName ?? "Accepted Admissions"); setIssuerEmail(invoice.issuerEmail ?? ""); setIssuerAddress(invoice.issuerAddress ?? ""); setPaymentInstructions(invoice.paymentInstructions ?? ""); }}><Edit3 className="mr-1 h-3 w-3" /> Edit</Button>}
                      {invoice.status === "pending" && invoice.provider === "manual" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => { const product = invoice.lineItems?.find((item) => item.productId)?.productId; if (product) offlinePayment.mutate({ data: { clientUserId: invoice.clientUserId ?? "", invoiceId: invoice.id, productId: product, amountCents: invoice.totalCents } }, { onSuccess: () => complete("Invoice payment verified and credits fulfilled."), onError: fail }); }}>Reconcile</Button>}
                      {["pending", "sent"].includes(invoice.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateInvoice.mutate({ invoiceId: invoice.id, data: { status: "canceled" } }, { onSuccess: () => complete("Invoice canceled."), onError: fail })}>Cancel</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.invoices.length === 0 && <p className="py-5 text-sm text-muted-foreground">No invoices recorded.</p>}
        </div>
        <div className="overflow-x-auto">
          <h3 className="mb-3 font-semibold">Credit ledger history</h3>
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Client</th><th className="p-3">Source</th><th className="p-3">Hours</th><th className="p-3">Note</th><th className="p-3">Recorded</th></tr></thead>
            <tbody>{data.credits.map((entry) => <tr key={entry.id} className="border-b"><td className="p-3">{entry.clientName ?? "Unknown client"}</td><td className="p-3 capitalize">{entry.referenceType ?? entry.entryType}</td><td className={entry.entryType.includes("debit") || entry.entryType === "refund" ? "p-3 text-destructive" : "p-3 text-emerald-700"}>{entry.entryType.includes("debit") || entry.entryType === "refund" ? "-" : "+"}{entry.hours}</td><td className="p-3">{entry.note ?? "—"}</td><td className="p-3 text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString()}</td></tr>)}</tbody>
          </table>
          {data.credits.length === 0 && <p className="py-5 text-sm text-muted-foreground">No credit ledger entries.</p>}
        </div>
      </CardContent>
    </Card>
  );
}