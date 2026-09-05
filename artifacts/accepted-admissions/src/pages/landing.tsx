import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Check, GraduationCap, MessageCircle, Users } from "lucide-react";
import { WhenSignedIn, WhenSignedOut } from "@/components/portal-auth";
import { PublicSiteShell, fetchPublicJson } from "@/components/public-site-shell";
import {
  DEFAULT_HOME_CONTENT,
  accentHeading,
  normalizeHomeContent,
  type HomeContent,
} from "@/lib/public-site-content";

export function LandingContent({ content }: { content: HomeContent }) {
  const heading = accentHeading(content.body.heroTitle || content.title);
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden border-b pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="container relative z-10 mx-auto grid gap-12 px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="font-metadata mb-6 inline-flex border-l-2 border-accent pl-3 text-accent">
              {content.body.heroEyebrow}
            </p>
            <h1 className="font-display text-5xl leading-[0.98] tracking-tight md:text-7xl">
              {heading.before}
              {heading.accent ? <span className="text-accent">{heading.accent}</span> : null}
              {heading.after}
            </h1>
            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-muted-foreground">
              {content.body.heroLead}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 w-full rounded-md bg-primary px-7 text-base text-primary-foreground shadow-sm sm:w-auto">
                <Link href="/sat" data-testid="link-home-sat">
                  Explore the SAT session <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 w-full rounded-md border-primary/30 px-7 text-base sm:w-auto">
                <Link href="/client-request" data-testid="link-home-guidance">
                  Request broader guidance
                </Link>
              </Button>
            </div>
            <WhenSignedOut>
              <div className="mt-6">
                <Button asChild variant="secondary" className="h-12 rounded-md px-6">
                  <Link href="/login" data-testid="link-home-sign-in">
                    Sign in to your portal
                  </Link>
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Students, tutors, and administrators use the same sign-in.
                </p>
              </div>
            </WhenSignedOut>
            <WhenSignedIn>
              <div className="mt-6">
                <Button asChild variant="secondary" className="h-12 rounded-md px-6">
                  <Link href="/portal" data-testid="link-home-portal">
                    Open your portal
                  </Link>
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Continue to your student, tutor, or admin dashboard.
                </p>
              </div>
            </WhenSignedIn>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm md:p-8">
            <p className="font-metadata text-accent">Start with the right path</p>
            <div className="mt-6 space-y-5">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-semibold">{content.body.satPathTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{content.body.satPathBlurb}</p>
                  <Link href="/our-team" className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">
                    Meet the team to learn about our tutors
                  </Link>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><MessageCircle className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-semibold">{content.body.guidancePathTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{content.body.guidancePathBlurb}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-card py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl">
            <p className="font-metadata text-accent">Two ways to begin</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight md:text-5xl">Choose what matches your question today.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">The online offer is intentionally simple. Everything else begins with context, so we can confirm the right next step before making a promise.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <article className="rounded-xl border bg-background p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold">{content.body.satServiceTitle}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {content.body.satServiceBlurb}
              </p>
              <Link href="/sat" data-testid="link-home-service-sat" className="mt-6 inline-flex items-center font-semibold text-primary hover:underline">View SAT tutoring <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </article>
            <article className="rounded-xl border bg-background p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-bold">{content.body.guidanceServiceTitle}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {content.body.guidanceServiceBlurb}
              </p>
              <Link href="/client-request" data-testid="link-home-service-guidance" className="mt-6 inline-flex items-center font-semibold text-primary hover:underline">Request guidance <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </article>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <p className="font-metadata text-accent">What happens next</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight md:text-5xl">A straightforward beginning.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">No broad promises, no unclear handoff. Start with the path that fits and the site will explain the next action.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              ["01", "Choose a path", "Explore the SAT offer or tell us what broader support you are considering."],
              ["02", "Take the next action", "Sign in to purchase the session, or submit a private request for review."],
              ["03", "Continue with context", "After purchase, scheduling continues in the portal. Requests receive a personal follow-up."],
            ].map(([number, headingLabel, body]) => (
              <div key={number} className="rounded-lg border bg-card p-5">
                <span className="font-metadata text-accent">{number}</span>
                <h3 className="mt-4 font-semibold">{headingLabel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="container mx-auto grid gap-8 px-6 py-16 md:grid-cols-2">
          <div>
            <p className="font-metadata text-accent">Explore with confidence</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight">See the people and published stories behind the work.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">Public profiles and stories appear only when they have been approved for display. If a record is not published, we will not fill the gap with a claim.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/our-team" data-testid="link-home-team" className="rounded-lg border bg-background p-5 transition-colors hover:border-accent">
              <Users className="h-5 w-5 text-accent" />
              <h3 className="mt-4 font-semibold">Meet the team</h3>
              <p className="mt-2 text-sm text-muted-foreground">Review approved public profiles.</p>
            </Link>
            <Link href="/past-success" data-testid="link-home-stories" className="rounded-lg border bg-background p-5 transition-colors hover:border-accent">
              <Check className="h-5 w-5 text-accent" />
              <h3 className="mt-4 font-semibold">Student stories</h3>
              <p className="mt-2 text-sm text-muted-foreground">Read approved perspectives when available.</p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Landing() {
  const [content, setContent] = useState<HomeContent>(DEFAULT_HOME_CONTENT);

  useEffect(() => {
    fetchPublicJson<unknown>("/api/public/content/home")
      .then((result) => setContent(normalizeHomeContent(result)))
      .catch(() => setContent(DEFAULT_HOME_CONTENT));
  }, []);

  return (
    <PublicSiteShell
      eyebrow="SAT tutoring + broader guidance"
      title={content.seoTitle || "Accepted Admissions | Your next step, made clear"}
      description={content.seoDescription || DEFAULT_HOME_CONTENT.seoDescription || ""}
    >
      <LandingContent content={content} />
    </PublicSiteShell>
  );
}
