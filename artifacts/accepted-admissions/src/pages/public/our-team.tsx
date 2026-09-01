import { useEffect, useState } from "react";
import { ArrowRight, Linkedin, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PublicSiteShell, publicApiPath } from "@/components/public-site-shell";

type Tutor = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  photoAltText: string | null;
  biography: string | null;
  subjects: string[];
  linkedinUrl: string | null;
};

type TeamContent = {
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: { intro?: string };
};

const liveTeamOrder = [
  "Rosanna Kataja",
  "Xavier Morales",
  "Eunice Chon",
  "Sophia Lamas",
  "Aurelia Finch",
  "Nika Raiffe",
  "Kya Brooks",
  "Michael Pecorara",
  "Kyle Englander",
  "Daniel Salgado-Alvarez",
  "Sama Noori",
];

function orderTeam(tutors: Tutor[]) {
  return [...tutors].sort((a, b) => {
    const aIndex = liveTeamOrder.indexOf(a.name);
    const bIndex = liveTeamOrder.indexOf(b.name);
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function profileImageAlt(tutor: Tutor) {
  return (
    tutor.photoAltText ||
    `${tutor.name}, ${tutor.title || "Accepted Admissions tutor"}`
  );
}

export default function OurTeam() {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [content, setContent] = useState<TeamContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTutors = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch(publicApiPath("/api/public/tutors")).then((response) => {
        if (!response.ok) throw new Error("Unable to load approved tutors");
        return response.json() as Promise<Tutor[]>;
      }),
      fetch(publicApiPath("/api/public/content/our-team")).then((response) => {
        if (!response.ok) throw new Error("Unable to load team page content");
        return response.json() as Promise<TeamContent>;
      }),
    ])
      .then(([tutorResult, contentResult]) => {
        setTutors(Array.isArray(tutorResult) ? orderTeam(tutorResult) : []);
        setContent(contentResult);
      })
      .catch(() => {
        setTutors([]);
        setContent(null);
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTutors();
  }, []);

  return (
    <PublicSiteShell
      eyebrow="Our team"
      title={content?.seoTitle || "Meet Our Team | Accepted Admissions"}
      description={
        content?.seoDescription ||
        "Meet the approved public profiles behind Accepted Admissions and choose the expert best fit for you."
      }
    >
      <main className="container mx-auto px-6 py-20 md:py-24">
        <header className="mx-auto max-w-3xl text-center">
           <p className="font-metadata text-accent">
            Our team
          </p>
           <h1 className="font-display mt-5 text-5xl tracking-tight md:text-7xl">
            {content?.title || "Meet Our Team"}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {content?.body.intro || "Choose the expert best fit for you."}
          </p>
          <div
            className="mx-auto mt-7 h-px w-8 bg-foreground/70"
            aria-hidden="true"
          />
        </header>

        {loading && (
          <div
             className="mx-auto mt-16 max-w-2xl rounded-lg border bg-card p-6 text-sm text-muted-foreground"
            role="status"
            data-testid="status-team-loading"
          >
            Loading approved team profiles…
          </div>
        )}

        {error && (
          <div
             className="mx-auto mt-16 max-w-2xl rounded-lg border border-destructive/20 bg-card p-6 text-sm text-muted-foreground"
            role="alert"
            data-testid="status-team-error"
          >
            <p>Approved team profiles are temporarily unavailable.</p>
            <Button
              data-testid="button-team-retry"
              type="button"
              variant="outline"
               className="mt-4 rounded-md"
              onClick={loadTutors}
            >
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && tutors.length === 0 && (
          <div
             className="mx-auto mt-16 max-w-2xl rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground"
            data-testid="status-team-empty"
          >
            <p>No approved team profiles are published right now.</p>
            <p className="mx-auto mt-2 max-w-lg">
              If you would like to discuss SAT tutoring or broader guidance, you
              can still share your goals privately.
            </p>
             <Button asChild variant="outline" className="mt-5 rounded-md">
              <Link
                href="/client-request"
                data-testid="link-team-empty-guidance"
              >
                Request guidance
              </Link>
            </Button>
          </div>
        )}

        {!loading && !error && tutors.length > 0 && (
          <section
             className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Approved team profiles"
          >
            {tutors.map((tutor) => (
              <article
                key={tutor.id}
                 className="group relative isolate min-h-[31rem] overflow-hidden bg-muted"
                data-testid={`card-team-${tutor.id}`}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
                  {tutor.photoUrl ? (
                    <img
                      src={tutor.photoUrl}
                      alt={profileImageAlt(tutor)}
                      width="640"
                      height="860"
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.classList.add("hidden");
                        event.currentTarget.nextElementSibling?.classList.remove(
                          "hidden",
                        );
                      }}
                    />
                  ) : null}
                  <span
                    className={tutor.photoUrl ? "hidden" : "flex"}
                    data-testid={`team-placeholder-${tutor.id}`}
                  >
                    <UserRound className="h-16 w-16" aria-hidden="true" />
                  </span>
                </div>

                 <div
                   className="absolute inset-x-0 bottom-0 h-48 bg-foreground/90"
                  aria-hidden="true"
                />

                {tutor.linkedinUrl && (
                  <a
                    href={tutor.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${tutor.name} on LinkedIn`}
                    className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center bg-[#0a66c2] text-white transition hover:bg-[#004182] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a66c2]"
                  >
                    <Linkedin className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}

                <div className="absolute inset-x-0 bottom-0 z-10 p-5 text-white sm:p-6">
                  {tutor.title && (
                     <p className="font-metadata text-white/85">
                      {tutor.title}
                    </p>
                  )}
                   <h2 className="font-display mt-3 text-3xl leading-tight">
                    {tutor.name || "Accepted Admissions tutor"}
                  </h2>
                  {tutor.biography && (
                    <p className="mt-3 text-sm leading-relaxed text-white/85">
                      {tutor.biography}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        <div className="mx-auto mt-14 max-w-2xl text-center">
          <p className="text-sm font-semibold">Not sure which path fits?</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tell us what you are working toward. We will review your request
            before discussing a possible next step.
          </p>
             <Button asChild className="mt-5 rounded-md">
            <Link href="/client-request" data-testid="link-team-guidance">
              Get guidance <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </PublicSiteShell>
  );
}
