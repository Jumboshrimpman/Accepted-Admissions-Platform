import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  getGetDashboardQueryKey,
  useCreatePaymentCheckout,
  useGetCurrentUser,
  useGetDashboard,
} from "@workspace/api-client-react";
import { CheckCircle2, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingCard } from "@/pages/portal/booking-card";
import { PORTAL_SAT_HREF } from "@/lib/portal-sat";
import {
  type PaymentCreditBanner,
  paymentCreditBannerCopy,
  paymentCreditBannerState,
} from "@/lib/portal-sat-payment";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationHours: number;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiPath(path: string): string {
  return `${basePath}${path}`;
}

const CREDIT_POLL_MS = 2_000;
const CREDIT_POLL_TIMEOUT_MS = 16_000;

export default function PortalSat() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const dashboard = useGetDashboard();
  const checkout = useCreatePaymentCheckout();
  const { data: currentUser } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState(false);
  const [checkoutProductId, setCheckoutProductId] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [showPaymentCanceled, setShowPaymentCanceled] = useState(false);
  const [baselineHours, setBaselineHours] = useState<number | null>(null);
  const [ledgerHours, setLedgerHours] = useState<number | null>(null);
  const [creditPollTimedOut, setCreditPollTimedOut] = useState(false);

  useEffect(() => {
    const query = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const payment = params.get("payment");
    if (payment === "success") {
      setAwaitingWebhook(true);
      setCreditPollTimedOut(false);
    }
    if (payment === "canceled") setShowPaymentCanceled(true);
    if (!payment) return;
    params.delete("payment");
    const nextQuery = params.toString();
    setLocation(nextQuery ? `${PORTAL_SAT_HREF}?${nextQuery}` : PORTAL_SAT_HREF, { replace: true });
  }, [location, setLocation]);

  useEffect(() => {
    fetch(apiPath("/api/public/products"))
      .then((response) => {
        if (!response.ok) throw new Error("products");
        return response.json() as Promise<unknown>;
      })
      .then((nextProducts) => {
        if (!Array.isArray(nextProducts)) throw new Error("products");
        setProducts(
          nextProducts.filter((product): product is Product => {
            if (!product || typeof product !== "object") return false;
            const candidate = product as Record<string, unknown>;
            return (
              typeof candidate.id === "string" &&
              typeof candidate.slug === "string" &&
              typeof candidate.name === "string" &&
              typeof candidate.description === "string" &&
              typeof candidate.durationHours === "number" &&
              typeof candidate.totalPriceCents === "number"
            );
          }),
        );
      })
      .catch(() => setProductError(true))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (!awaitingWebhook || dashboard.isLoading || !dashboard.data || baselineHours !== null) return;
    setBaselineHours(dashboard.data.credits.remainingHours);
  }, [awaitingWebhook, baselineHours, dashboard.data, dashboard.isLoading]);

  useEffect(() => {
    if (!awaitingWebhook || baselineHours === null || creditPollTimedOut) return;
    let cancelled = false;
    let timer = 0;
    const started = Date.now();
    const tick = () => {
      fetch(apiPath("/api/credits"))
        .then((response) => {
          if (!response.ok) throw new Error("credits");
          return response.json() as Promise<{ remainingHours?: number }>;
        })
        .then((data) => {
          if (cancelled || typeof data.remainingHours !== "number") return;
          setLedgerHours(data.remainingHours);
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          if (data.remainingHours > baselineHours) return;
          if (Date.now() - started >= CREDIT_POLL_TIMEOUT_MS) {
            setCreditPollTimedOut(true);
            return;
          }
          timer = window.setTimeout(tick, CREDIT_POLL_MS);
        })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() - started >= CREDIT_POLL_TIMEOUT_MS) {
            setCreditPollTimedOut(true);
            return;
          }
          timer = window.setTimeout(tick, CREDIT_POLL_MS);
        });
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [awaitingWebhook, baselineHours, creditPollTimedOut, queryClient]);

  if (dashboard.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const selfServe = dashboard.data?.credits.selfServeSatBooking ?? false;
  const remainingHours = ledgerHours ?? dashboard.data?.credits.remainingHours ?? 0;
  const canCheckout = currentUser?.role === "student" && selfServe;
  const paymentBannerState: PaymentCreditBanner | null =
    awaitingWebhook && baselineHours !== null
      ? paymentCreditBannerState({
          remainingHours,
          baselineHours,
          timedOut: creditPollTimedOut,
        })
      : awaitingWebhook
        ? "confirming"
        : null;
  const paymentBanner = paymentBannerState
    ? paymentCreditBannerCopy(paymentBannerState, remainingHours)
    : null;
  const upcomingSat = (dashboard.data?.upcomingSessions ?? []).filter((session) => {
    const subject = session.subject?.toLowerCase() ?? "";
    return subject.startsWith("sat") || /sat/i.test(session.title);
  });

  const startCheckout = (productId: string) => {
    setCheckoutMessage("");
    if (!canCheckout) {
      setCheckoutMessage("Student checkout is available only on provisioned self-serve accounts.");
      return;
    }
    setCheckoutProductId(productId);
    checkout.mutate(
      { data: { productId } },
      {
        onSuccess: (session) => window.location.assign(session.url),
        onError: (error) => {
          setCheckoutMessage(
            (error as { data?: { error?: string } } | null)?.data?.error ??
              "Secure Checkout is temporarily unavailable.",
          );
          setCheckoutProductId("");
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16" data-testid="portal-sat-page">
      <div>
        <p className="mb-2 text-sm font-medium text-primary">Client portal</p>
        <h1 className="text-3xl font-bold tracking-tight">SAT book and pay</h1>
        <p className="mt-1 text-muted-foreground">
          Purchase prepaid hours and book Xavier or Eunice without leaving the portal. Credits appear only after a verified Stripe payment. Open times come from the tutor’s Google Calendar.
        </p>
      </div>

      {paymentBanner ? (
        <div
          role="status"
          data-testid="portal-sat-payment-success"
          data-credit-state={paymentBannerState}
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            paymentBannerState === "granted"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <CheckCircle2
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              paymentBannerState === "granted" ? "text-emerald-600" : "text-amber-700"
            }`}
          />
          <div>
            <p className="font-semibold">{paymentBanner.title}</p>
            <p className="mt-1">{paymentBanner.body}</p>
          </div>
        </div>
      ) : null}
      {showPaymentCanceled ? (
        <p role="status" className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          Checkout was canceled. No charge was made. You can try again below.
        </p>
      ) : null}

      <Card data-testid="portal-sat-upcoming">
        <CardHeader>
          <CardTitle>Upcoming SAT sessions</CardTitle>
          <CardDescription>Booked SAT meetings that belong to this client stay in the portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingSat.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming SAT sessions are on this account yet.</p>
          ) : (
            upcomingSat.map((session) => (
              <div key={session.id} className="rounded-xl border p-3 text-sm" data-testid={`portal-sat-upcoming-${session.id}`}>
                <p className="font-medium">{session.title}</p>
                <p className="mt-1 text-muted-foreground">
                  {new Date(session.dateTime).toLocaleString()} · {session.timezone}
                  {session.tutor?.name ? ` · ${session.tutor.name}` : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!selfServe ? (
        <Card data-testid="portal-sat-off-platform">
          <CardContent className="p-5 text-sm text-muted-foreground">
            SAT billing for this account is handled off-platform. Join Meet from your curriculum dates. Public marketing stays on{" "}
            <Link href="/sat" className="font-medium text-primary hover:underline">/sat</Link>.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="portal-sat-purchase">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-primary" /> Purchase SAT hours
              </CardTitle>
              <CardDescription>
                Pay $130 for one hour or $1,300 for 10 hours. Then book below. Card details stay on Stripe Checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Remaining credits: <span className="font-semibold text-foreground">{remainingHours}</span>
              </p>
              {loadingProducts ? <Skeleton className="h-40 rounded-xl" /> : null}
              {productError ? (
                <p className="text-sm text-destructive">SAT offers are temporarily unavailable.</p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {products.map((product) => {
                  const credits = Math.round(product.durationHours);
                  const price = (product.totalPriceCents / 100).toLocaleString(undefined, {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  });
                  return (
                    <div key={product.id} className="rounded-xl border p-4" data-testid={`portal-sat-offer-${product.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{product.name}</p>
                        <Badge variant="secondary">{credits} credit{credits === 1 ? "" : "s"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
                      <p className="mt-3 font-display text-3xl">{price}</p>
                      <Button
                        className="mt-4 w-full"
                        data-testid={`button-portal-sat-checkout-${product.id}`}
                        disabled={checkout.isPending}
                        onClick={() => startCheckout(product.id)}
                      >
                        {checkout.isPending && checkoutProductId === product.id
                          ? "Opening secure Checkout…"
                          : "Continue to secure checkout"}
                      </Button>
                    </div>
                  );
                })}
              </div>
              {checkoutMessage ? (
                <p className="text-sm text-destructive" role="alert">{checkoutMessage}</p>
              ) : null}
            </CardContent>
          </Card>
          <BookingCard />
        </>
      )}
    </div>
  );
}
