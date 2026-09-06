import { useEffect, useState } from "react";
import { ArrowRight, Quote } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PublicSiteShell, fetchPublicJson, resolvePublicMediaUrl } from "@/components/public-site-shell";

export type SchoolLogo = {
  name: string;
  src: string;
  alt: string;
};

export type SuccessContent = {
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

function normalizeSuccessContent(value: unknown): SuccessContent {
  if (!value || typeof value !== "object") throw new Error("Success content response is malformed");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("Success content response is missing a title");
  }
  const rawBody = candidate.body;
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new Error("Success content response is missing a body");
  }
  const body = rawBody as Record<string, unknown>;
  const rawTestimonial = body.testimonial;
  let testimonial: SuccessContent["body"]["testimonial"];
  if (rawTestimonial && typeof rawTestimonial === "object" && !Array.isArray(rawTestimonial)) {
    const item = rawTestimonial as Record<string, unknown>;
    const normalizedTestimonial: NonNullable<SuccessContent["body"]["testimonial"]> = {};
    if (typeof item.quote === "string") normalizedTestimonial.quote = item.quote;
    if (typeof item.attribution === "string") normalizedTestimonial.attribution = item.attribution;
    if (item.attributionMode === "named" || item.attributionMode === "anonymous") {
      normalizedTestimonial.attributionMode = item.attributionMode;
    }
    testimonial = normalizedTestimonial;
  }
  const schoolLogos = Array.isArray(body.schoolLogos)
    ? body.schoolLogos.flatMap((logo): SchoolLogo[] => {
        if (!logo || typeof logo !== "object" || Array.isArray(logo)) return [];
        const item = logo as Record<string, unknown>;
        if (typeof item.name !== "string" || !item.name.trim() || typeof item.src !== "string" || !item.src.trim()) return [];
        return [{
          name: item.name,
          src: item.src,
          alt: typeof item.alt === "string" && item.alt.trim() ? item.alt : `${item.name} logo`,
        }];
      })
    : [];
  return {
    title: candidate.title,
    seoTitle: typeof candidate.seoTitle === "string" ? candidate.seoTitle : null,
    seoDescription: typeof candidate.seoDescription === "string" ? candidate.seoDescription : null,
    body: {
      intro: typeof body.intro === "string" ? body.intro : undefined,
      testimonial,
      schoolLogos,
    },
  };
}

export function PastSuccessContent({
  content,
  loading,
  error,
  onRetry,
}: {
  content: SuccessContent | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const testimonial = content?.body.testimonial;
  const logos = content?.body.schoolLogos ?? [];
  const attribution =
    testimonial?.attributionMode === "anonymous"
      ? "Anonymous student"
      : testimonial?.attributionMode === "named"
        ? testimonial.attribution
        : undefined;

  return (
    <main className="container mx-auto px-6 py-20 md:py-28">
      <div className="max-w-3xl">
        <p className="font-metadata text-accent">Student stories</p>
        <h1 className="font-display mt-4 text-5xl tracking-tight md:text-6xl">{content?.title || "Approved perspectives, shared carefully."}</h1>
        {content?.body.intro && <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{content.body.intro}</p>}
        {!content?.body.intro && !loading && !error && <p className="mt-6 text-lg leading-relaxed text-muted-foreground">This page shares approved student perspectives and destination details when they are available. Published examples are not promises of a particular outcome.</p>}
        {loading && <p className="mt-6 text-sm text-muted-foreground" role="status" data-testid="status-stories-loading">Loading approved stories…</p>}
        {error && (
          <div className="mt-6 rounded-2xl border border-destructive/20 bg-card p-5 text-sm text-muted-foreground" role="alert" data-testid="status-stories-error">
            <p>Approved student stories are temporarily unavailable.</p>
            {onRetry && <Button data-testid="button-stories-retry" type="button" variant="outline" className="mt-4 rounded-md" onClick={onRetry}>Try again</Button>}
          </div>
        )}
      </div>
      {!loading && !error && (
        <section className="mt-14 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
         {testimonial?.quote ? <figure className="rounded-xl bg-primary p-8 text-primary-foreground shadow-sm" data-testid="story-testimonial">
           <Quote className="h-9 w-9 text-accent" aria-hidden="true" />
            <p className="font-metadata mt-8 text-primary-foreground/70">Approved student perspective</p>
            <blockquote className="font-display mt-4 text-3xl leading-tight">“{testimonial.quote}”</blockquote>
           {attribution && <figcaption className="mt-6 text-sm font-medium text-primary-foreground/80">— {attribution}</figcaption>}
         </figure> : <div className="rounded-lg border border-dashed bg-card p-8 text-sm text-muted-foreground" data-testid="status-stories-no-testimonial">No approved student perspective is available at this time.</div>}
         <div className="rounded-xl border bg-card p-8">
            <p className="font-metadata text-accent">Published destination details</p>
           <p className="mt-2 text-sm leading-relaxed text-muted-foreground">These names and images come from the approved page content and are shared as examples, not guarantees.</p>
          {logos.length > 0 ? <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {logos.map((logo) => (
               <div key={logo.name} className="flex min-h-28 items-center justify-center rounded-lg bg-muted/50 p-4">
                <img src={resolvePublicMediaUrl(logo.src)} alt={logo.alt || `${logo.name} logo`} width="120" height="96" className="max-h-20 max-w-full object-contain mix-blend-multiply" loading="lazy" onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                }} />
                <span hidden className="text-center text-sm font-medium text-muted-foreground">{logo.name}</span>
              </div>
            ))}
          </div> : <p className="mt-6 text-sm text-muted-foreground">Approved destination details will appear here when available.</p>}
            <Button asChild className="mt-7 rounded-md"><Link href="/client-request" data-testid="link-stories-guidance">Request guidance <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>
      )}
    </main>
  );
}

export default function PastSuccess() {
  const [content, setContent] = useState<SuccessContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadContent = () => {
    setLoading(true);
    setError(false);
    fetchPublicJson<unknown>("/api/public/content/past-success")
      .then((result) => setContent(normalizeSuccessContent(result)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadContent();
  }, []);

  return (
    <PublicSiteShell
      eyebrow="Approved public content"
      title={content?.seoTitle || "Student stories | Accepted Admissions"}
      description={content?.seoDescription || "Read approved student perspectives and view destination details only when they are published by Accepted Admissions."}
    >
      <PastSuccessContent content={content} loading={loading} error={error} onRetry={loadContent} />
    </PublicSiteShell>
  );
}