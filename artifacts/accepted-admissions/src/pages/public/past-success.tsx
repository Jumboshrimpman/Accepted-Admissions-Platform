import { ArrowRight, Quote } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PublicSiteShell } from "@/components/public-site-shell";

export default function PastSuccess() {
  return (
    <PublicSiteShell eyebrow="Stories, carefully verified">
      <main className="container mx-auto px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Past success</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Progress worth telling, only when it’s approved.</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">This page is ready for the approved testimonials, school outcomes, and explanatory copy from the existing Accepted Admissions site. We will never fill it with invented scores, names, quotations, or acceptances.</p>
        </div>
        <section className="mt-14 grid gap-6 md:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-3xl bg-gradient-brand p-8 text-white shadow-xl shadow-primary/15">
            <Quote className="h-9 w-9 text-white/70" />
            <p className="mt-12 text-2xl font-semibold leading-snug">Approved stories will live here as an editable, carefully attributed collection.</p>
            <p className="mt-5 text-sm leading-relaxed text-white/75">Student privacy and attribution choices come first. Anonymous content will remain anonymous.</p>
          </div>
          <div className="rounded-3xl border bg-card p-8">
            <p className="text-sm font-semibold">Content awaiting administrator review</p>
            <div className="mt-6 space-y-4">
              {["Approved testimonial copy", "School-success content", "Logos and image alt text", "Attribution and anonymity settings"].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm"><span className="h-2 w-2 rounded-full bg-accent" />{item}</div>)}
            </div>
            <Link href="/client-request"><Button className="mt-7 rounded-full">Start a private conversation <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}