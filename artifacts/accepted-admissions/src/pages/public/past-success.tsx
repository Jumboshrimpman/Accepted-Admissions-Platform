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

  useEffect(() => {
    fetch(publicApiPath("/api/public/content/past-success"))
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load approved success content");
        return response.json() as Promise<SuccessContent>;
      })
      .then((result) => {
        setContent(result);
        document.title = result.seoTitle || "Past Student Success | Accepted Admissions";
        if (result.seoDescription) {
          let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
          if (!meta) {
            meta = document.createElement("meta");
            meta.name = "description";
            document.head.append(meta);
          }
          meta.content = result.seoDescription;
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const testimonial = content?.body.testimonial;
  const logos = content?.body.schoolLogos ?? [];

  return (
    <PublicSiteShell eyebrow="Stories, carefully verified">
      <main className="container mx-auto px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Past success</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Past student success.</h1>
          {content?.body.intro && <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{content.body.intro}</p>}
          {loading && <p className="mt-6 text-sm text-muted-foreground">Loading approved stories…</p>}
          {error && <p className="mt-6 rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Success stories are temporarily unavailable. Please try again soon.</p>}
        </div>
        {!loading && !error && testimonial?.quote && (
          <section className="mt-14 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
          <figure className="rounded-3xl bg-gradient-brand p-8 text-white shadow-xl shadow-primary/15">
            <Quote className="h-9 w-9 text-white/70" />
            <blockquote className="mt-10 text-xl font-semibold leading-relaxed">“{testimonial.quote}”</blockquote>
            {testimonial.attribution && <figcaption className="mt-6 text-sm font-medium text-white/80">— {testimonial.attribution}</figcaption>}
          </figure>
          <div className="rounded-3xl border bg-card p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">A sample of student destinations</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {logos.map((logo) => (
                <div key={logo.name} className="flex min-h-28 items-center justify-center rounded-2xl bg-muted/50 p-4">
                  <img
                    src={logo.src.replace("2c8654_dfa69976a1274e4f9de87500d1409fc~mv2.jpg", "2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg")}
                    alt={logo.alt}
                    className="max-h-20 max-w-full object-contain mix-blend-multiply"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
            <Link href="/client-request"><Button className="mt-7 rounded-full">Start a private conversation <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          </div>
        </section>
        )}
      </main>
    </PublicSiteShell>
  );
}