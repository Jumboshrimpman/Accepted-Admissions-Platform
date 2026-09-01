import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useCreatePaymentCheckout } from "@workspace/api-client-react";
import { ArrowRight, CalendarClock, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicSiteShell, publicApiPath } from "@/components/public-site-shell";

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
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    const storedProductId = window.sessionStorage.getItem("accepted:pending-product");
    if (storedProductId) setPendingProductId(storedProductId);
    fetch(publicApiPath("/api/public/products"))
      .then((response) => {
        if (!response.ok) throw new Error("Products unavailable");
        return response.json() as Promise<Product[]>;
      })
      .then((nextProducts) => {
        setProducts(Array.isArray(nextProducts) ? nextProducts : []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isSignedIn || !pendingProductId || loading || !products.length) return;
    if (!products.some((product) => product.id === pendingProductId)) {
      setPendingProductId(null);
      window.sessionStorage.removeItem("accepted:pending-product");
      return;
    }
    setPendingProductId(null);
    window.sessionStorage.removeItem("accepted:pending-product");
    startCheckout(pendingProductId);
  }, [isSignedIn, pendingProductId, loading, products]);

  const startCheckout = (productId: string) => {
    setCheckoutMessage("");
    if (!isSignedIn) {
      window.sessionStorage.setItem("accepted:pending-product", productId);
      const returnTo = `${basePath}/sat`;
      window.location.assign(`${basePath}/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    setCheckoutProductId(productId);
    checkout.mutate(
      { data: { productId } },
      {
        onSuccess: (session) => window.location.assign(session.url),
        onError: (checkoutError) => {
          const message =
            (checkoutError as { data?: { error?: string } } | null)?.data?.error ??
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
      description="Explore the current 60-minute SAT tutoring offer, see the approved price, and continue to secure checkout."
    >
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute -right-24 -top-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
          <div className="container relative mx-auto grid gap-12 px-6 py-20 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-28">
            <div>
              <Badge className="mb-6 rounded-full bg-accent/10 px-3 py-1 text-accent hover:bg-accent/10">
                Current online offer
              </Badge>
              <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-7xl">
                 One focused hour of <span className="text-gradient-brand">SAT tutoring.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Review the single session currently available to purchase online. The current approved price is shown in the offer below.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 w-full rounded-full bg-gradient-brand px-7 text-white sm:w-auto">
                  <a href="#session-offer" data-testid="link-sat-offer">
                    View the session offer <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-full px-7">
                  <Link href="/client-request" data-testid="link-sat-guidance">
                    Request broader guidance
                  </Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Looking for a different service? Use the request form instead of assuming this offer is the right fit.</p>
            </div>
            <Card className="border-primary/10 bg-card/80 shadow-2xl shadow-primary/10">
              <CardHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
                <CardTitle className="text-2xl">From offer to scheduled session</CardTitle>
                <CardDescription>What to expect before and after secure checkout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 {[
                   ["1. Review the offer", "Confirm the session length and current approved price below."],
                   ["2. Sign in and pay", "Signed-out visitors are sent to sign in and returned here to continue secure checkout."],
                   ["3. Schedule after payment", "Once payment is verified, choose an available time in the client portal."],
                ].map(([title, description], index) => (
                   <div key={title} className="flex gap-4 rounded-2xl border bg-background/70 p-4" data-testid={`step-sat-${index + 1}`}>
                     <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                    <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
                  </div>
                ))}
                <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>Scheduling is a post-purchase portal step. Availability is checked again when a time is booked.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

         <section id="session-offer" className="container mx-auto scroll-mt-28 px-6 py-20">
          <div className="mb-10 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">The current offer</p>
               <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">The current SAT tutoring offer.</h2>
               <p className="mt-3 text-muted-foreground">There is one online SAT offer here: a single 60-minute session. The price below comes from the active offer record. Visit <Link href="/our-team" className="font-semibold text-primary hover:underline">Meet the team</Link> to learn about our tutors.</p>
          </div>
          {loading ? (
             <div className="max-w-2xl" data-testid="status-sat-loading"><Skeleton className="h-72 rounded-3xl" /></div>
          ) : error ? (
             <div className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground" role="alert" data-testid="status-sat-error">The current SAT offer is temporarily unavailable. Please use the guidance request form and we’ll help you directly.</div>
          ) : products.length === 0 ? (
             <div className="rounded-3xl border border-dashed p-10 text-center" data-testid="status-sat-empty">
               <h3 className="text-lg font-semibold">The online session is not available right now</h3>
               <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">This page does not list a different package or promise availability. Tell us what you are working toward and we’ll help you find the right next step.</p>
               <Button asChild variant="outline" className="mt-5 rounded-full"><Link href="/client-request" data-testid="link-sat-empty-guidance">Request guidance</Link></Button>
            </div>
          ) : (
             <div className="max-w-2xl">
               {products.slice(0, 1).map((product) => {
                 const durationMinutes = Math.round(product.durationHours * 60);
                 const price = (product.totalPriceCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
                 return (
                  <Card key={product.id} className="relative overflow-hidden rounded-3xl border-accent/40 shadow-lg shadow-accent/10" data-testid={`card-sat-offer-${product.id}`}>
                    <Badge className="absolute right-5 top-5 rounded-full bg-accent text-white">{durationMinutes} minutes</Badge>
                  <CardHeader className="pb-4">
                       <p className="text-sm font-medium text-muted-foreground">Accepted Admissions · SAT tutoring</p>
                    <CardTitle className="mt-2 text-2xl">{product.name}</CardTitle>
                    <CardDescription className="min-h-10 leading-relaxed">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <div className="mb-5" data-testid={`price-sat-offer-${product.id}`}>
                       <span className="text-4xl font-bold">{price}</span>
                        <span className="ml-2 text-sm text-muted-foreground">for one session</span>
                         <p className="mt-1 text-sm font-medium text-accent">One prepaid {durationMinutes}-minute SAT tutoring session</p>
                    </div>
                     <Button
                        data-testid={`button-sat-checkout-${product.id}`}
                        variant="default"
                       className="w-full rounded-full"
                       onClick={() => startCheckout(product.id)}
                       disabled={checkout.isPending}
                     >
                       {checkout.isPending && checkoutProductId === product.id
                         ? "Opening secure Checkout…"
                         : isSignedIn
                            ? "Continue to secure checkout"
                            : "Sign in to purchase this session"}
                     </Button>
                      {!isSignedIn && <p className="mt-3 text-center text-xs text-muted-foreground">You’ll return to this offer after signing in.</p>}
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