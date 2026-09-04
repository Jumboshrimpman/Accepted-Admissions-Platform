import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicSiteShell } from "@/components/public-site-shell";

export function NotFoundContent({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return (
    <main
      className={
        embedded
          ? "mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center"
          : "container mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-20 text-center"
      }
      data-testid="status-not-found"
    >
      <AlertCircle className="h-10 w-10 text-accent" aria-hidden="true" />
      <h1 className="mt-4 font-display text-3xl tracking-tight">
        This page is not available.
      </h1>
      <p className="mt-3 text-muted-foreground">
        The address may have moved with the new Accepted Admissions site. SAT
        tutoring, team profiles, student stories, and private guidance requests
        are still here.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="rounded-md">
          <Link href="/" data-testid="link-not-found-home">
            Back to home
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-md">
          <Link href="/sat" data-testid="link-not-found-sat">
            SAT tutoring
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-md">
          <Link href="/client-request" data-testid="link-not-found-guidance">
            Request guidance
          </Link>
        </Button>
      </div>
    </main>
  );
}

export default function NotFound({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  if (embedded) {
    return <NotFoundContent embedded />;
  }

  return (
    <PublicSiteShell
      eyebrow="Page not found"
      title="Page not found | Accepted Admissions"
      description="This page is not available on the Accepted Admissions site. Continue to SAT tutoring, the team, or a private guidance request."
    >
      <NotFoundContent />
    </PublicSiteShell>
  );
}
