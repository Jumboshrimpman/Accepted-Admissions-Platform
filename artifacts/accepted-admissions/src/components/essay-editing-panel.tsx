import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ASYNC_SLUG = "college-consulting-nika-essay-async";
const FOLLOWUP_SLUG = "college-consulting-nika-essay-followup";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiPath(path: string): string {
  return `${basePath}${path}`;
}

type EssayProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  totalPriceCents: number;
};

type EssayRequest = {
  id: string;
  kind: string;
  status: string;
  dueAt: string;
  callStart: string | null;
  originalFilename: string;
  editedFilename: string | null;
  hasEditedFile: boolean;
  clientFirstName: string;
  clientName?: string;
  clientEmail?: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  submitted: "With Nika",
  done: "Done",
  cancelled: "Cancelled",
};

function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function minimumDueLocal(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Something went wrong. Try again.";
}

export function isEssayProductSlug(slug: string): boolean {
  return slug === ASYNC_SLUG || slug === FOLLOWUP_SLUG;
}

export function EssayEditingOffer({ products }: { products: EssayProduct[] }) {
  const asyncProduct = products.find((product) => product.slug === ASYNC_SLUG);
  const followupProduct = products.find((product) => product.slug === FOLLOWUP_SLUG);
  const [dueAt, setDueAt] = useState("");
  const [followDueAt, setFollowDueAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [followFile, setFollowFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const buy = async (kind: "async" | "followup") => {
    setMessage("");
    const chosen = kind === "async" ? file : followFile;
    const due = kind === "async" ? dueAt : followDueAt;
    if (!chosen) {
      setMessage("Upload one PDF.");
      return;
    }
    if (!due) {
      setMessage("Choose a due time at least 24 hours from now.");
      return;
    }
    setBusy(kind);
    try {
      const params = new URLSearchParams({
        kind,
        filename: chosen.name,
        dueAt: new Date(due).toISOString(),
      });
      const uploaded = await fetch(apiPath(`/api/essay-requests?${params.toString()}`), {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: chosen,
      });
      if (!uploaded.ok) {
        setMessage(await readError(uploaded));
        return;
      }
      const created = (await uploaded.json()) as { id: string };
      const checkout = await fetch(apiPath("/api/payments/checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essayRequestId: created.id }),
      });
      if (!checkout.ok) {
        setMessage(await readError(checkout));
        return;
      }
      const session = (await checkout.json()) as { url?: string };
      if (!session.url) {
        setMessage("Secure Checkout is temporarily unavailable.");
        return;
      }
      window.location.assign(session.url);
    } catch {
      setMessage("Secure Checkout is temporarily unavailable.");
    } finally {
      setBusy("");
    }
  };

  if (!asyncProduct && !followupProduct) return null;

  return (
    <Card data-testid="portal-essay-editing">
      <CardHeader>
        <CardTitle>Essay editing with Nika</CardTitle>
        <CardDescription>
          Upload one PDF and choose a due time at least 24 hours later. The follow-up option includes a one-hour call with Nika. Book that call from College Consulting at least 24 hours after the due time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {asyncProduct ? (
          <div className="rounded-xl border p-4" data-testid="portal-essay-async">
            <p className="font-semibold">{asyncProduct.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">{asyncProduct.description}</p>
            <p className="mt-3 font-display text-3xl">{money(asyncProduct.totalPriceCents)}</p>
            <label className="mt-4 block text-sm font-medium" htmlFor="essay-async-file">
              Essay PDF
            </label>
            <input
              id="essay-async-file"
              className="mt-1 block w-full text-sm"
              type="file"
              accept="application/pdf,.pdf"
              data-testid="input-essay-async-file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <label className="mt-3 block text-sm font-medium" htmlFor="essay-async-due">
              Due
            </label>
            <input
              id="essay-async-due"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              type="datetime-local"
              min={minimumDueLocal()}
              value={dueAt}
              data-testid="input-essay-async-due"
              onChange={(event) => setDueAt(event.target.value)}
            />
            <Button
              className="mt-4 w-full"
              disabled={busy !== ""}
              data-testid="button-essay-async-checkout"
              onClick={() => void buy("async")}
            >
              {busy === "async" ? "Opening secure Checkout…" : "Continue to secure checkout"}
            </Button>
          </div>
        ) : null}
        {followupProduct ? (
          <div className="rounded-xl border p-4" data-testid="portal-essay-followup">
            <p className="font-semibold">{followupProduct.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">{followupProduct.description}</p>
            <p className="mt-3 font-display text-3xl">{money(followupProduct.totalPriceCents)}</p>
            <label className="mt-4 block text-sm font-medium" htmlFor="essay-followup-file">
              Essay PDF
            </label>
            <input
              id="essay-followup-file"
              className="mt-1 block w-full text-sm"
              type="file"
              accept="application/pdf,.pdf"
              data-testid="input-essay-followup-file"
              onChange={(event) => setFollowFile(event.target.files?.[0] ?? null)}
            />
            <label className="mt-3 block text-sm font-medium" htmlFor="essay-followup-due">
              Due
            </label>
            <input
              id="essay-followup-due"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              type="datetime-local"
              min={minimumDueLocal()}
              value={followDueAt}
              data-testid="input-essay-followup-due"
              onChange={(event) => setFollowDueAt(event.target.value)}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              After checkout, book the included hour with Nika at least 24 hours after this due time.
            </p>
            <Button
              className="mt-4 w-full"
              disabled={busy !== ""}
              data-testid="button-essay-followup-checkout"
              onClick={() => void buy("followup")}
            >
              {busy === "followup" ? "Opening secure Checkout…" : "Continue to secure checkout"}
            </Button>
          </div>
        ) : null}
        {message ? (
          <p className="text-sm text-destructive md:col-span-2" role="alert">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EssayRequestsPanel({ mode }: { mode: "client" | "tutor" | "admin" }) {
  const [requests, setRequests] = useState<EssayRequest[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => {
    fetch(apiPath("/api/essay-requests"))
      .then(async (response) => {
        if (!response.ok) return { enabled: false, requests: [] };
        return (await response.json()) as { enabled: boolean; requests: EssayRequest[] };
      })
      .then((body) => {
        setEnabled(body.enabled);
        setRequests(body.requests);
      })
      .catch(() => {
        setEnabled(false);
        setRequests([]);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const uploadEdited = async (requestId: string, file: File | null) => {
    if (!file) return;
    setMessage("");
    const params = new URLSearchParams({ filename: file.name });
    const response = await fetch(apiPath(`/api/essay-requests/${requestId}/edited?${params.toString()}`), {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    load();
  };

  const markDone = async (requestId: string) => {
    setMessage("");
    const response = await fetch(apiPath(`/api/essay-requests/${requestId}/done`), { method: "POST" });
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }
    load();
  };

  if (!enabled || requests === null) return null;

  const title = mode === "tutor" ? "Essay requests" : mode === "admin" ? "Essay requests" : "Your essay requests";

  return (
    <Card data-testid={`essay-requests-${mode}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {mode === "tutor"
            ? "Download the essay, upload the edited PDF, and mark it done."
            : mode === "admin"
              ? "Essay files, due times, and status."
              : "Status updates stay in the portal. The edited PDF is ready to download when Nika marks it done."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No essay requests yet.</p>
        ) : (
          requests.map((request) => (
            <div key={request.id} className="rounded-xl border p-4 text-sm" data-testid={`essay-request-${request.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {mode === "admin" ? request.clientName || request.clientFirstName : request.clientFirstName}
                  </p>
                  {mode === "admin" && request.clientEmail ? (
                    <p className="text-muted-foreground">{request.clientEmail}</p>
                  ) : null}
                  <p className="mt-1 text-muted-foreground">
                    {request.kind === "followup" ? "Editing plus follow-up call" : "Async editing"} · Due {when(request.dueAt)}
                    {request.callStart ? ` · Call ${when(request.callStart)}` : ""}
                    {request.kind === "followup" && !request.callStart && request.status === "submitted"
                      ? " · Book the call at least 24 hours after the due time."
                      : ""}
                  </p>
                  <p className="mt-1">{STATUS_LABEL[request.status] ?? request.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                    href={apiPath(`/api/essay-requests/${request.id}/file?which=original`)}
                  >
                    Download PDF
                  </a>
                  {request.hasEditedFile && (mode !== "client" || request.status === "done") ? (
                    <a
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                      href={apiPath(`/api/essay-requests/${request.id}/file?which=edited`)}
                    >
                      Download edited PDF
                    </a>
                  ) : null}
                </div>
              </div>
              {mode !== "client" && request.status === "submitted" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="text-sm"
                    type="file"
                    accept="application/pdf,.pdf"
                    aria-label="Edited PDF"
                    data-testid={`input-edited-pdf-${request.id}`}
                    onChange={(event) => void uploadEdited(request.id, event.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!request.hasEditedFile}
                    data-testid={`button-essay-done-${request.id}`}
                    onClick={() => void markDone(request.id)}
                  >
                    Mark done
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
        {message ? (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
