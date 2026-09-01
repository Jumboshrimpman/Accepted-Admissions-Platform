import { useEffect, useState } from "react";
import { ArrowRight, Quote } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PublicSiteShell, publicApiPath } from "@/components/public-site-shell";

type SchoolLogo = {
  name: string;
  src: string;
  alt: string;
};

type SuccessContent = {
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: {
    intro?: string;
    testimonial?: {
      quote?: string;
      attribution?: string;
      attributionMode?: "named" | "anonymous";
    };
    schoolLogos?: SchoolLogo[];
  };
};

export default function PastSuccess() {
  const [content, setContent] = useState<SuccessContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadContent = () => {
    setLoading(true);
    setError(false);
    fetch(publicApiPath("/api/public/content/past-success"))
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load approved success content");
        return response.json() as Promise<SuccessContent>;
      })
      .then((result) => setContent(result))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadContent();
  }, []);

  const testimonial = content?.body.testimonial;
  const logos = content?.body.schoolLogos ?? [];
  const attribution =
    testimonial?.attributionMode === "anonymous"
      ? "Anonymous student"
      : testimonial?.attributionMode === "named"
        ? testimonial.attribution
        : undefined;

  return (
    <PublicSiteShell
      eyebrow="Stories, carefully verified"
      title={content?.seoTitle || "Past student success | Accepted Admissions"}
      description={content?.seoDescription || "Read approved student stories and explore a sample of schools Accepted Admissions students have been accepted to."}
    >
      <main className="container mx-auto px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Past success</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">{content?.title || "Past student success."}</h1>
          {content?.body.intro && <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{content.body.intro}</p>}
          {loading && <p className="mt-6 text-sm text-muted-foreground" role="status">Loading approved stories…</p>}
          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/20 bg-card p-5 text-sm text-muted-foreground" role="alert">
              <p>Success stories are temporarily unavailable.</p>
              <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={loadContent}>Try again</Button>
            </div>
          )}
        </div>
        {!loading && !error && (
          <section className="mt-14 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
          {testimonial?.quote ? <figure className="rounded-3xl bg-gradient-brand p-8 text-white shadow-xl shadow-primary/15">
            <Quote className="h-9 w-9 text-white/70" aria-hidden="true" />
            <blockquote className="mt-10 text-xl font-semibold leading-relaxed">“{testimonial.quote}”</blockquote>
            {attribution && <figcaption className="mt-6 text-sm font-medium text-white/80">— {attribution}</figcaption>}
          </figure> : <div className="rounded-3xl border border-dashed bg-card p-8 text-sm text-muted-foreground">No approved testimonial is available at this time.</div>}
          <div className="rounded-3xl border bg-card p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">A sample of student destinations</p>
            {logos.length > 0 ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {logos.map((logo) => (
                <div key={logo.name} className="flex min-h-28 items-center justify-center rounded-2xl bg-muted/50 p-4">
                  <img src={logo.src} alt={logo.alt || `${logo.name} logo`} width="120" height="96" className="max-h-20 max-w-full object-contain mix-blend-multiply" loading="lazy" onError={(event) => {
                    event.currentTarget.style.display = "none";
                    event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                  }} />
                  <span hidden className="text-center text-sm font-medium text-muted-foreground">{logo.name}</span>
                </div>
              ))}
            </div> : <p className="mt-6 text-sm text-muted-foreground">Approved destination details will appear here when available.</p>}
            <Link href="/client-request"><Button className="mt-7 rounded-full">Start a private conversation <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          </div>
        </section>
        )}
      </main>
    </PublicSiteShell>
  );
}