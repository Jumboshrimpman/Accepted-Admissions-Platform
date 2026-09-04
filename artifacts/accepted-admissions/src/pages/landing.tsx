import { Link } from "wouter";
import { Show } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Check, GraduationCap, MessageCircle, Users } from "lucide-react";
import { PublicSiteShell } from "@/components/public-site-shell";

export default function Landing() {
  return (
    <PublicSiteShell
      eyebrow="SAT tutoring + broader guidance"
      title="Accepted Admissions | Your next step, made clear"
      description="Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance."
    >
      <main className="flex-1">
        <section className="relative overflow-hidden border-b pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="container relative z-10 mx-auto grid gap-12 px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="font-metadata mb-6 inline-flex border-l-2 border-accent pl-3 text-accent">
                For students and families planning what comes next
              </p>
              <h1 className="font-display text-5xl leading-[0.98] tracking-tight md:text-7xl">
                A clear next step for your <span className="text-accent">college goals.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-xl leading-relaxed text-muted-foreground">
                Harvard students and recent graduates provide focused one-on-one SAT tutoring, with thoughtful guidance for families whose needs go beyond a single session.
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
              <Show when="signed-out">
                <Link href="/login" data-testid="link-home-sign-in" className="mt-5 inline-flex text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Already a client? Sign in to your portal
                </Link>
              </Show>
              <Show when="signed-in">
                <Link href="/portal" data-testid="link-home-portal" className="mt-5 inline-flex text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Already a client? Open your portal
                </Link>
              </Show>
            </div>
            <div className="rounded-xl border bg-card p-6 shadow-sm md:p-8">
              <p className="font-metadata text-accent">Start with the right path</p>
              <div className="mt-6 space-y-5">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><GraduationCap className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-semibold">Need SAT tutoring now?</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Purchase one hour or a ten-hour package at $130 per credit, then book open times with Xavier or Eunice. Meet the team to learn about our tutors.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><MessageCircle className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-semibold">Need a broader conversation?</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Admissions guidance, IELTS support, or another request starts with a private inquiry—not checkout.</p>
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
                <h3 className="mt-6 text-xl font-bold">SAT tutoring</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Explore the current one-session offer, review what happens after checkout, and meet the team to learn about our tutors.
                </p>
                <Link href="/sat" data-testid="link-home-service-sat" className="mt-6 inline-flex items-center font-semibold text-primary hover:underline">View SAT tutoring <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </article>
              <article className="rounded-xl border bg-background p-7">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-bold">Broader guidance</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  If you are exploring admissions planning, IELTS support, or a different need, share the context privately. We will review it before discussing fit.
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
              ].map(([number, heading, body]) => (
                <div key={number} className="rounded-lg border bg-card p-5">
                  <span className="font-metadata text-accent">{number}</span>
                  <h3 className="mt-4 font-semibold">{heading}</h3>
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
    </PublicSiteShell>
  );
}