import { useEffect, useState } from "react";
import { usePortalAuth } from "@/components/portal-auth";
import { getGetCurrentUserQueryKey, getGetDashboardQueryKey, useGetCurrentUser, useGetDashboard } from "@workspace/api-client-react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicSiteShell, fetchPublicJson } from "@/components/public-site-shell";
import {
  DEFAULT_SAT_CONTENT,
  normalizeSatContent,
  type SatContent,
} from "@/lib/public-site-content";
import { showsSelfServeSatCommerce } from "@/lib/portal-sat";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function satPricingSignInHref(returnTo = `${basePath}/portal/sat`): string {
  return `${basePath}/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function SatMarketingContent({ content }: { content: SatContent }) {
  return (
    <main>
      <section className="border-b bg-background">
        <div className="container mx-auto max-w-3xl px-6 py-16">
          <p className="font-metadata text-accent">SAT tutoring</p>
          <h1 className="font-display mt-4 text-5xl tracking-tight">{content.title}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{content.body.heroLead}</p>
        </div>
      </section>
    </main>
  );
}

export default function SatOfferings() {
  const { isSignedIn } = usePortalAuth();
  const [content, setContent] = useState<SatContent>(DEFAULT_SAT_CONTENT);
  const {
    data: currentUser,
    isLoading: currentUserLoading,
  } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      enabled: Boolean(isSignedIn),
      retry: false,
    },
  });
  const signedInStudent = Boolean(isSignedIn) && currentUser?.role === "student";
  const dashboard = useGetDashboard({
    query: {
      queryKey: getGetDashboardQueryKey(),
      enabled: signedInStudent,
      retry: false,
    },
  });
  const canBookPay = signedInStudent && showsSelfServeSatCommerce(dashboard.data?.credits);
  const accountPending =
    Boolean(isSignedIn) && (currentUserLoading || (signedInStudent && dashboard.isLoading && !dashboard.data));
  const pricingHref = canBookPay ? "/portal/sat" : signedInStudent ? "/portal" : satPricingSignInHref();
  const pricingLabel = canBookPay
    ? "Open SAT book and pay"
    : accountPending
      ? "Checking account access…"
      : signedInStudent
        ? "Open your curriculum"
        : "Sign in to view SAT pricing";

  useEffect(() => {
    fetchPublicJson<unknown>("/api/public/content/sat")
      .then((result) => setContent(normalizeSatContent(result)))
      .catch(() => setContent(DEFAULT_SAT_CONTENT));
  }, []);

  return (
    <PublicSiteShell
      eyebrow="SAT tutoring"
      title={content.seoTitle || "SAT tutoring | Accepted Admissions"}
      description={content.seoDescription || DEFAULT_SAT_CONTENT.seoDescription || ""}
    >
      <main>
        <section className="relative overflow-hidden border-b">
          <div className="container relative mx-auto grid gap-12 px-6 py-20 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-28">
            <div>
              <Badge className="font-metadata mb-6 rounded-sm bg-accent/10 px-3 py-1 text-accent hover:bg-accent/10">
                SAT tutoring
              </Badge>
              <h1 className="font-display max-w-3xl text-5xl tracking-tight md:text-7xl">
                Focused <span className="text-accent">SAT tutoring.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                {content.body.heroLead}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 w-full rounded-md bg-primary px-7 text-primary-foreground sm:w-auto">
                  <Link href={pricingHref} data-testid="link-sat-pricing-signin">
                    {pricingLabel} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-md px-7">
                  <Link href="/client-request" data-testid="link-sat-guidance">
                    Request broader guidance
                  </Link>
                </Button>
              </div>
              {canBookPay ? (
                <p className="mt-4 text-sm">
                  <Link href="/portal/sat" className="font-semibold text-primary hover:underline" data-testid="link-sat-stay-in-portal">
                    Book and pay inside your client portal
                  </Link>
                  {" "}— SAT prices and checkout stay behind sign-in.
                </p>
              ) : null}
              <p className="mt-4 text-sm text-muted-foreground">
                Looking for a different service? Campus tours, college advising, and other requests use the{" "}
                <Link href="/client-request" className="font-semibold text-primary hover:underline">
                  guidance form
                </Link>
                {" "}instead of SAT checkout. Financial aid for SAT tutoring is considered case by case — mention it in that request.
              </p>
            </div>
            <Card className="rounded-xl border bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="font-display text-3xl">How SAT tutoring continues</CardTitle>
                <CardDescription>Pricing and payment stay in the signed-in client portal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ["1. Learn about SAT tutoring", "This public page explains the path. It does not list prices or start checkout."],
                  ["2. Sign in to view pricing", "Signed-out visitors are sent to sign in before any SAT prices or payment options appear."],
                  ["3. Pay and schedule in the portal", "Self-serve clients purchase prepaid credits and book available times after a verified Stripe payment."],
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

        <section className="container mx-auto scroll-mt-28 px-6 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="font-metadata text-accent">Inside the portal</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight md:text-5xl">SAT pricing available to clients only</h2>
          </div>
          <Card className="max-w-2xl" data-testid="card-sat-signin-required">
            <CardHeader>
              <CardTitle>Sign in to view SAT tutoring prices</CardTitle>
              <CardDescription>
                Prepaid session credits and Stripe checkout are available only after you sign in to your client portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="rounded-md" data-testid="button-sat-signin-for-pricing">
                <Link href={pricingHref}>{pricingLabel}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </PublicSiteShell>
  );
}
