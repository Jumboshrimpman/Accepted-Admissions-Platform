import { useEffect, useMemo, useState } from "react";
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

  const featuredProductId = useMemo(() => {
    return (
      products.find((product) => product.slug === "sat-5-hour-package")?.id ??
      products.find((product) => product.durationHours === 5)?.id ??
      null
    );
  }, [products]);

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
      eyebrow="Fall 2026 · SAT and IELTS program"
      title="SAT tutoring | Accepted Admissions"
      description="Focused SAT tutoring with flexible session products and a clear credit-based scheduling flow."
    >
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute -right-24 -top-40 h-[520px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
          <div className="container relative mx-auto grid gap-12 px-6 py-20 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-28">
            <div>
              <Badge className="mb-6 rounded-full bg-accent/10 px-3 py-1 text-accent hover:bg-accent/10">
                Focused SAT support
              </Badge>
              <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-7xl">
                A sharper plan for your <span className="text-gradient-brand">next score.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Targeted tutoring, reusable practice, and a clear hour-based scheduling flow for students who want every session to count.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/client-request">
                  <Button size="lg" className="h-13 rounded-full bg-gradient-brand px-7 text-white">
                    Request a fit conversation <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="h-13 rounded-full px-7">Client portal sign in</Button>
                </Link>
              </div>
            </div>
            <Card className="border-primary/10 bg-card/80 shadow-2xl shadow-primary/10">
              <CardHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></div>
                <CardTitle className="text-2xl">How hours work</CardTitle>
                <CardDescription>Simple, transparent, and designed around the student.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ["Choose an offering", "Buy a single hour or a package that matches your plan."],
                  ["Reserve your time", "Use eligible hours to request a time with an available tutor."],
                  ["Keep building", "Your balance and session history stay visible in the portal."],
                ].map(([title, description], index) => (
                  <div key={title} className="flex gap-4 rounded-2xl border bg-background/70 p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                    <div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></div>
                  </div>
                ))}
                <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>Calendar availability will appear once a tutor connects an approved calendar provider.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container mx-auto px-6 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">SAT offerings</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Choose the pace that fits.</h2>
            <p className="mt-3 text-muted-foreground">Every option shows its total price and effective hourly rate before checkout.</p>
          </div>
          {loading ? (
            <div className="grid gap-5 md:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-64 rounded-3xl" />)}</div>
          ) : error ? (
            <div className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Offerings are temporarily unavailable. Please use the client request form and we’ll help you directly.</div>
          ) : products.length === 0 ? (
            <div className="rounded-3xl border border-dashed p-10 text-center">
              <h3 className="text-lg font-semibold">No offerings are available right now</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Tell us what you are working toward and we’ll help you find the right next step.</p>
              <Link href="/client-request"><Button variant="outline" className="mt-5 rounded-full">Start a conversation</Button></Link>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-3">
              {products.map((product) => {
                const isFeatured = product.id === featuredProductId;
                return (
                <Card key={product.id} className={`relative overflow-hidden rounded-3xl ${isFeatured ? "border-accent/40 shadow-lg shadow-accent/10" : ""}`}>
                  {isFeatured && <Badge className="absolute right-5 top-5 rounded-full bg-accent text-white">Most flexible</Badge>}
                  <CardHeader className="pb-4">
                    <p className="text-sm font-medium text-muted-foreground">{product.durationHours === 1 ? "Start here" : "Package"}</p>
                    <CardTitle className="mt-2 text-2xl">{product.name}</CardTitle>
                    <CardDescription className="min-h-10 leading-relaxed">{product.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-5">
                      <span className="text-4xl font-bold">${(product.totalPriceCents / 100).toLocaleString()}</span>
                      <span className="ml-2 text-sm text-muted-foreground">total</span>
                      <p className="mt-1 text-sm font-medium text-accent">${(product.effectiveHourlyRateCents / 100).toLocaleString()}/hour effective rate</p>
                    </div>
                     <Button
                        variant={isFeatured ? "default" : "outline"}
                       className="w-full rounded-full"
                       onClick={() => startCheckout(product.id)}
                       disabled={checkout.isPending}
                     >
                       {checkout.isPending && checkoutProductId === product.id
                         ? "Opening secure Checkout…"
                         : isSignedIn
                           ? "Buy securely"
                           : "Sign in to purchase"}
                     </Button>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
           {checkoutMessage && (
             <p className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
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