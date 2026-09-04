import { useEffect, useState } from "react";
import { ArrowRight, Linkedin, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PublicSiteShell, fetchPublicJson } from "@/components/public-site-shell";

export type Tutor = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  photoAltText: string | null;
  biography: string | null;
  subjects: string[];
  linkedinUrl: string | null;
};

export type TeamContent = {
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: { intro?: string };
};

function normalizeTutor(value: unknown): Tutor | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || !candidate.name.trim()) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    title: typeof candidate.title === "string" ? candidate.title : "",
    photoUrl: typeof candidate.photoUrl === "string" && candidate.photoUrl ? candidate.photoUrl : null,
    photoAltText: typeof candidate.photoAltText === "string" && candidate.photoAltText ? candidate.photoAltText : null,
    biography: typeof candidate.biography === "string" && candidate.biography ? candidate.biography : null,
    subjects: Array.isArray(candidate.subjects)
      ? candidate.subjects.filter((subject): subject is string => typeof subject === "string")
      : [],
    linkedinUrl: typeof candidate.linkedinUrl === "string" && candidate.linkedinUrl ? candidate.linkedinUrl : null,
  };
}

function normalizeTeamContent(value: unknown): TeamContent {
  if (!value || typeof value !== "object") throw new Error("Team content response is malformed");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("Team content response is missing a title");
  }
  const body = candidate.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Team content response is missing a body");
  }
  const bodyRecord = body as Record<string, unknown>;
  return {
    title: candidate.title,
    seoTitle: typeof candidate.seoTitle === "string" ? candidate.seoTitle : null,
    seoDescription: typeof candidate.seoDescription === "string" ? candidate.seoDescription : null,
    body: {
      intro: typeof bodyRecord.intro === "string" ? bodyRecord.intro : undefined,
    },
  };
}

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

export function orderTeam(tutors: Tutor[]) {
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

function TeamPortrait({ tutor }: { tutor: Tutor }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(tutor.photoUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [tutor.photoUrl]);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-[#d8d4cc] text-foreground/50"
      data-testid={`team-portrait-${tutor.id}`}
    >
      {showImage && (
        <img
          src={tutor.photoUrl ?? undefined}
          alt={profileImageAlt(tutor)}
          width="640"
          height="960"
          className="h-full w-full object-cover object-top transition duration-700 ease-out group-hover:scale-[1.03]"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
      {!showImage && (
        <span
          className="flex flex-col items-center gap-3 px-6 text-center"
          role="img"
          aria-label={`${profileImageAlt(tutor)} — portrait unavailable`}
          data-testid={`team-placeholder-${tutor.id}`}
        >
          <UserRound className="h-16 w-16" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-[0.18em]">
            Portrait unavailable
          </span>
        </span>
      )}
    </div>
  );
}

export function OurTeamContent({
  tutors,
  content,
  loading,
  error,
  onRetry,
}: {
  tutors: Tutor[];
  content: TeamContent | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <main className="bg-[#f7f5f0]">
      <header className="mx-auto max-w-4xl px-6 pb-10 pt-16 text-center md:pb-14 md:pt-24">
        <h1 className="font-display text-[2.75rem] leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
          {content?.title || "Meet Our Team"}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-foreground/80 md:text-lg">
          {content?.body.intro || "Choose the expert best fit for you."}
        </p>
        <div
          className="mx-auto mt-8 h-px w-14 bg-foreground/55"
          aria-hidden="true"
        />
      </header>

      {loading && (
        <div
          className="mx-auto max-w-2xl px-6 pb-20"
          role="status"
          data-testid="status-team-loading"
        >
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Loading approved team profiles…
          </div>
        </div>
      )}

      {error && (
        <div
          className="mx-auto max-w-2xl px-6 pb-20"
          role="alert"
          data-testid="status-team-error"
        >
          <div className="rounded-lg border border-destructive/20 bg-card p-6 text-sm text-muted-foreground">
            <p>Approved team profiles are temporarily unavailable.</p>
            {onRetry && (
              <Button
                data-testid="button-team-retry"
                type="button"
                variant="outline"
                className="mt-4 rounded-md"
                onClick={onRetry}
              >
                Try again
              </Button>
            )}
          </div>
        </div>
      )}

      {!loading && !error && tutors.length === 0 && (
        <div
          className="mx-auto max-w-2xl px-6 pb-20"
          data-testid="status-team-empty"
        >
          <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
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
        </div>
      )}

      {!loading && !error && tutors.length > 0 && (
        <section
          className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Approved team profiles"
        >
          {tutors.map((tutor) => (
            <article
              key={tutor.id}
              className="group relative isolate aspect-[3/4] min-h-[28rem] overflow-hidden bg-[#d8d4cc] sm:min-h-0"
              data-testid={`card-team-${tutor.id}`}
            >
              <TeamPortrait tutor={tutor} />

              <div
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition duration-500 group-hover:from-black/90"
                aria-hidden="true"
              />

              {tutor.linkedinUrl && (
                <a
                  href={tutor.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View ${tutor.name} on LinkedIn`}
                  className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-sm bg-[#0a66c2] text-white shadow-sm transition hover:bg-[#004182] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a66c2]"
                >
                  <Linkedin className="h-4 w-4" aria-hidden="true" />
                </a>
              )}

              <div className="absolute inset-x-0 bottom-0 z-10 p-5 text-white sm:p-6">
                {tutor.title && (
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/90">
                    {tutor.title}
                  </p>
                )}
                <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-[1.65rem]">
                  {tutor.name || "Accepted Admissions tutor"}
                </h2>
                {tutor.biography && (
                  <p className="mt-3 max-h-[9.5rem] overflow-hidden text-sm leading-relaxed text-white/92 sm:text-[0.95rem]">
                    {tutor.biography}
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="mx-auto max-w-2xl px-6 py-16 text-center md:py-20">
        <p className="text-sm font-semibold text-foreground">Not sure which path fits?</p>
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
      fetchPublicJson<unknown>("/api/public/tutors"),
      fetchPublicJson<unknown>("/api/public/content/our-team"),
    ])
      .then(([tutorResult, contentResult]) => {
        if (!Array.isArray(tutorResult)) throw new Error("Tutor response is malformed");
        setTutors(orderTeam(tutorResult.map(normalizeTutor).filter((tutor): tutor is Tutor => tutor !== null)));
        setContent(normalizeTeamContent(contentResult));
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
      <OurTeamContent
        tutors={tutors}
        content={content}
        loading={loading}
        error={error}
        onRetry={loadTutors}
      />
    </PublicSiteShell>
  );
}
