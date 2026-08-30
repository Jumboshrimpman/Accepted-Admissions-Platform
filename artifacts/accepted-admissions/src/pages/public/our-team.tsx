import { useEffect, useState } from "react";
import { Linkedin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicSiteShell, publicApiPath } from "@/components/public-site-shell";

type Tutor = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  biography: string | null;
  subjects: string[];
  linkedinUrl: string | null;
};

export default function OurTeam() {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  useEffect(() => {
    fetch(publicApiPath("/api/public/tutors"))
      .then((response) => response.ok ? response.json() as Promise<Tutor[]> : [])
      .then(setTutors)
      .catch(() => setTutors([]));
  }, []);
  return (
    <PublicSiteShell eyebrow="People behind the plan">
      <main className="container mx-auto px-6 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Our team</p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">Thoughtful support, close at hand.</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">Meet the tutors currently being prepared for the Accepted Admissions platform. Public biographies and links will appear after administrator approval.</p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {tutors.map((tutor) => (
            <Card key={tutor.id} className="overflow-hidden rounded-3xl">
              <CardContent className="flex flex-col gap-6 p-7 sm:flex-row">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
                  {tutor.photoUrl ? <img src={tutor.photoUrl} alt={`${tutor.name} profile`} className="h-full w-full object-cover" /> : <UserRound className="h-9 w-9" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-accent">{tutor.title}</p>
                  <h2 className="mt-1 text-2xl font-bold">{tutor.name}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{tutor.biography || "Biography pending administrator approval."}</p>
                  <div className="mt-4 flex flex-wrap gap-2">{tutor.subjects.map((subject) => <span key={subject} className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{subject}</span>)}</div>
                  {tutor.linkedinUrl ? <a href={tutor.linkedinUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Linkedin className="h-4 w-4" /> LinkedIn</a> : <p className="mt-5 text-xs text-muted-foreground">LinkedIn link pending content review.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-12 rounded-3xl border border-dashed bg-card/60 p-8 text-center">
          <p className="text-sm font-semibold">Public content checklist</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Headshots, approved biographies, titles, and LinkedIn redirects remain editable administrator content. Nothing is invented or published until it is approved.</p>
          <Button asChild variant="outline" className="mt-5 rounded-full"><a href="/client-request">Ask about working together</a></Button>
        </div>
      </main>
    </PublicSiteShell>
  );
}