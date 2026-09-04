import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  getGetCurrentUserQueryKey,
  useCreatePaymentCheckout,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { ArrowRight, CalendarClock, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicSiteShell, fetchPublicJson } from "@/components/public-site-shell";

type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  durationHours: number;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
};

export default function SatOfferings() {
  const { isSignedIn } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checkoutProductId, setCheckoutProductId] = useState("");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const checkout = useCreatePaymentCheckout();
  const {
    data: currentUser,
    isLoading: currentUserLoading,
    error: currentUserError,
  } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      enabled: Boolean(isSignedIn),
      retry: false,
    },
  });
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const accountReady = Boolean(isSignedIn) && !currentUserLoading;
  const canCheckout = accountReady && currentUser?.role === "student";

  const accessMessage = (() => {
    if (!isSignedIn || canCheckout || currentUserLoading) return null;
    if (currentUser?.role === "administrator") {
      return {
        text: "Administrators cannot purchase the student offer. Open the administrator workspace or request guidance.",
        href: "/admin",
        label: "Open administrator workspace",
      };
    }
    if (currentUser?.role === "tutor") {
      return {
        text: "Tutors cannot purchase the student offer. Open the tutor workspace or request guidance.",
        href: "/tutor",
        label: "Open tutor workspace",
      };
    }
    if (currentUser?.role === "viewer") {
      return {
        text: "This offer is reserved for provisioned student accounts. Review your client workspace or request guidance.",
        href: "/portal",
        label: "Open client workspace",
      };
    }
    return {
      text: currentUserError
        ? "This account could not be verified for student checkout right now. Request guidance and we’ll help with the next step."
        : "This offer is available only to provisioned student accounts. Request guidance and we’ll help with the next step.",
      href: "/client-request",
      label: "Request guidance",
    };
  })();

  useEffect(() => {
    const storedProductId = window.sessionStorage.getItem("accepted:pending-product");
    if (storedProductId) setPendingProductId(storedProductId);
    fetchPublicJson<unknown>("/api/public/products")
      .then((nextProducts) => {
        if (!Array.isArray(nextProducts)) throw new Error("Products response is malformed");
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
              typeof candidate.totalPriceCents === "number" &&
              typeof candidate.effectiveHourlyRateCents === "number"
            );
          }),
        );
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isSignedIn || !pendingProductId || loading || !products.length || currentUserLoading) return;
    if (!currentUser || currentUser.role !== "student") {
      setPendingProductId(null);
      window.sessionStorage.removeItem("accepted:pending-product");
      return;
    }
    if (!products.some((product) => product.id === pendingProductId)) {
      setPendingProductId(null);
      window.sessionStorage.removeItem("accepted:pending-product");
      return;
    }
    setPendingProductId(null);
    window.sessionStorage.removeItem("accepted:pending-product");
    startCheckout(pendingProductId);
  }, [isSignedIn, pendingProductId, loading, products, currentUserLoading, currentUser]);

  const startCheckout = (productId: string) => {
    setCheckoutMessage("");
    if (!isSignedIn) {
      window.sessionStorage.setItem("accepted:pending-product", productId);
      const returnTo = `${basePath}/sat`;
      window.location.assign(`${basePath}/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!canCheckout) {
      setCheckoutMessage(accessMessage?.text ?? "Student checkout is unavailable for this account.");
      return;
    }
    setCheckoutProductId(productId);
    checkout.mutate(
      { data: { productId } },
      {
        onSuccess: (session) => window.location.assign(session.url),
        onError: (checkoutError) => {
          const status = (checkoutError as { status?: number } | null)?.status;
          const message =
            status === 403
              ? "Student checkout is available only to provisioned student accounts. Please request guidance if you need help."
              : (checkoutError as { data?: { error?: string } } | null)?.data?.error ??
                "Secure Checkout is temporarily unavailable.";
          setCheckoutMessage(message);
          setCheckoutProductId("");
        },
      },
    );
  };

  return (
    <PublicSiteShell
      eyebrow="One session, available online"
      title="SAT tutoring | Accepted Admissions"
      description="Explore prepaid SAT session credits, see approved prices, and continue to secure checkout."
    >
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="container relative mx-auto grid gap-12 px-6 py-20 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-28">
            <div>
              <Badge className="font-metadata mb-6 rounded-sm bg-accent/10 px-3 py-1 text-accent hover:bg-accent/10">
                Current online offers
              </Badge>
               <h1 className="font-display max-w-3xl text-5xl tracking-tight md:text-7xl">
                 Prepaid <span className="text-accent">SAT session credits.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Purchase a single session or a ten-session package. Funds settle with Accepted Admissions; credits unlock after a verified Stripe payment.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 w-full rounded-md bg-primary px-7 text-primary-foreground sm:w-auto">
                  <a href="#session-offer" data-testid="link-sat-offer">
                    View session offers <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-md px-7">
                  <Link href="/client-request" data-testid="link-sat-guidance">
                    Request broader guidance
                  </Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Looking for a different service? Use the request form instead of assuming these offers are the right fit.</p>
            </div>
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardHeader>
                 <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
                 <CardTitle className="font-display text-3xl">From offer to scheduled session</CardTitle>
                <CardDescription>What to expect before and after secure checkout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 {[
                   ["1. Review the offers", "Confirm session credits and the current approved prices below."],
                   ["2. Sign in and pay", "Signed-out visitors are sent to sign in and returned here to continue secure checkout."],
                   ["3. Schedule after payment", "Once payment is verified, choose an available time in the client portal."],
                ].map(([title, description], index) => (
                    <div key={title} className="flex gap-4 rounded-lg border bg-background p-4" data-testid={`step-sat-${index + 1}`}>
                     <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                    <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
                  </div>
                ))}
                 <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>Scheduling is a post-purchase portal step. Availability is checked again when a time is booked.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

         <section id="session-offer" className="container mx-auto scroll-mt-28 px-6 py-20">
          <div className="mb-10 max-w-2xl">
               <p className="font-metadata text-accent">The current offers</p>
                <h2 className="font-display mt-3 text-4xl tracking-tight md:text-5xl">SAT session credit packages.</h2>
               <p className="mt-3 text-muted-foreground">Choose a single prepaid credit or a ten-session package. Prices come from the active catalog. Visit <Link href="/our-team" className="font-semibold text-primary hover:underline">Meet the team</Link> to learn about our tutors.</p>
          </div>
          {loading ? (
             <div className="max-w-2xl" data-testid="status-sat-loading"><Skeleton className="h-72 rounded-lg" /></div>
          ) : error ? (
             <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground" role="alert" data-testid="status-sat-error">SAT offers are temporarily unavailable. Please use the guidance request form and we’ll help you directly.</div>
          ) : products.length === 0 ? (
             <div className="rounded-lg border border-dashed p-10 text-center" data-testid="status-sat-empty">
               <h3 className="text-lg font-semibold">Online session credits are not available right now</h3>
               <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">This page does not promise availability. Tell us what you are working toward and we’ll help you find the right next step.</p>
               <Button asChild variant="outline" className="mt-5 rounded-md"><Link href="/client-request" data-testid="link-sat-empty-guidance">Request guidance</Link></Button>
            </div>
          ) : (
             <div className="grid gap-6 md:grid-cols-2">
               {products.map((product) => {
                 const durationMinutes = Math.round(product.durationHours * 60);
                 const credits = Math.round(product.durationHours);
                 const price = (product.totalPriceCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
                 return (
                   <Card key={product.id} className="relative overflow-hidden rounded-xl border-accent/40 shadow-sm" data-testid={`card-sat-offer-${product.id}`}>
                     <Badge className="font-metadata absolute right-5 top-5 rounded-sm bg-accent text-accent-foreground">{credits} credit{credits === 1 ? "" : "s"}</Badge>
                  <CardHeader className="pb-4">
                       <p className="text-sm font-medium text-muted-foreground">Accepted Admissions · SAT tutoring</p>
                    <CardTitle className="mt-2 text-2xl">{product.name}</CardTitle>
                    <CardDescription className="min-h-10 leading-relaxed">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <div className="mb-5" data-testid={`price-sat-offer-${product.id}`}>
                        <span className="font-display text-5xl">{price}</span>
                        <span className="ml-2 text-sm text-muted-foreground">one-time</span>
                         <p className="mt-1 text-sm font-medium text-accent">{credits} prepaid {durationMinutes}-minute session credit{credits === 1 ? "" : "s"}</p>
                    </div>
                     <Button
                        data-testid={`button-sat-checkout-${product.id}`}
                        variant="default"
                         className="w-full rounded-md"
                       onClick={() => startCheckout(product.id)}
                        disabled={checkout.isPending || (Boolean(isSignedIn) && (currentUserLoading || !canCheckout))}
                     >
                       {checkout.isPending && checkoutProductId === product.id
                         ? "Opening secure Checkout…"
                          : !isSignedIn
                            ? "Sign in to purchase this session"
                            : currentUserLoading
                              ? "Checking account access…"
                              : canCheckout
                            ? "Continue to secure checkout"
                             : "Student checkout unavailable"}
                     </Button>
                      {!isSignedIn && <p className="mt-3 text-center text-xs text-muted-foreground">You’ll return to this offer after signing in.</p>}
                      {accessMessage && (
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                          {accessMessage.text}{" "}
                          <Link href={accessMessage.href} className="font-semibold text-primary hover:underline">
                            {accessMessage.label}
                          </Link>
                        </p>
                      )}
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
           {checkoutMessage && (
             <p className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" role="alert" data-testid="status-sat-checkout-error">
               {checkoutMessage}
             </p>
           )}
       </section>

        <section className="border-y bg-card">
          <div className="container mx-auto grid gap-8 px-6 py-16 md:grid-cols-3">
            {[
              [ShieldCheck, "Private by design", "Student, tutor, payment, and calendar information stays behind the right account boundary."],
              [CheckCircle2, "Clear progress", "The portal keeps assignments, sessions, credits, and next steps together."],
              [CalendarClock, "Human scheduling", "Availability is checked again at booking time so a slot cannot quietly be double-booked."],
            ].map(([Icon, title, body]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return <div key={title as string} className="flex gap-4"><FeatureIcon className="mt-1 h-5 w-5 shrink-0 text-accent" /><div><h3 className="font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body as string}</p></div></div>;
            })}
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}