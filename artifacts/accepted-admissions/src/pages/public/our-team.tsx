import { useEffect, useState } from "react";
import { Linkedin, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        setTutors(Array.isArray(tutorResult) ? tutorResult : []);
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
      eyebrow="People behind the plan"
      title={content?.seoTitle || "Our team | Accepted Admissions"}
      description={content?.seoDescription || "Meet the tutors behind Accepted Admissions and learn how their experience shapes thoughtful student support."}
    >
      <main className="container mx-auto px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Our team</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">{content?.title || "Thoughtful support, close at hand."}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{content?.body.intro || "Choose the expert best fit for you. Every profile shown here has been reviewed for public display."}</p>
        </div>
        {loading && <div className="mt-14 rounded-2xl border bg-card p-6 text-sm text-muted-foreground" role="status">Loading our team…</div>}
        {error && (
          <div className="mt-14 rounded-2xl border border-destructive/20 bg-card p-6 text-sm text-muted-foreground" role="alert">
            <p>Our team profiles are temporarily unavailable.</p>
            <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={loadTutors}>Try again</Button>
          </div>
        )}
        {!loading && !error && tutors.length === 0 && (
          <div className="mt-14 rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Our approved team profiles will appear here soon. Start a conversation to learn how we can help.
          </div>
        )}
        {!loading && !error && tutors.length > 0 && <div className="mt-14 grid gap-6 md:grid-cols-2">
          {tutors.map((tutor) => (
            <Card key={tutor.id} className="overflow-hidden rounded-3xl">
              <CardContent className="flex flex-col gap-6 p-7 sm:flex-row">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
                  {tutor.photoUrl ? (
                    <img
                      src={tutor.photoUrl}
                      alt={tutor.photoAltText || `${tutor.name}, ${tutor.title}`}
                      width="112"
                      height="112"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                        event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                      }}
                    />
                  ) : null}
                  <span hidden={Boolean(tutor.photoUrl)}>
                    <UserRound className="h-9 w-9" aria-hidden="true" />
                  </span>
                </div>
                <div>
                  {tutor.title && <p className="text-sm font-medium text-accent">{tutor.title}</p>}
                  <h2 className="mt-1 text-2xl font-bold">{tutor.name || "Accepted Admissions tutor"}</h2>
                  {tutor.biography && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tutor.biography}</p>}
                  {tutor.subjects?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{tutor.subjects.map((subject) => <span key={subject} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{subject}</span>)}</div>}
                  {tutor.linkedinUrl && <a href={tutor.linkedinUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Linkedin className="h-4 w-4" /> LinkedIn</a>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>}
        <div className="mt-12 rounded-3xl border bg-card/60 p-8 text-center">
          <p className="text-sm font-semibold">Find the right support</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Tell us what you are working toward, and we’ll help you choose the best next step.</p>
          <Button asChild variant="outline" className="mt-5 rounded-full"><Link href="/client-request">Ask about working together</Link></Button>
        </div>
      </main>
    </PublicSiteShell>
  );
}