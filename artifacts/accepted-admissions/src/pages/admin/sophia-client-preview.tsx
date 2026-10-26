import { useState } from "react";
import type { AdminClientDashboard } from "@workspace/api-client-react";
import { CalendarClock, ClipboardList, Eye } from "lucide-react";
import { BillingHistorySection } from "@/pages/portal/billing-history";
import {
  CONSULTING_TUTOR_PHOTO_CLASS,
  consultingCreditsTutorLabel,
} from "@/lib/consulting-tutor-display";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SophiaPreviewTutorCard = NonNullable<AdminClientDashboard["previewSatTutors"]>[number];

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

function TutorPreviewCard({ tutor }: { tutor: SophiaPreviewTutorCard }) {
  const [bioOpen, setBioOpen] = useState(false);
  const rate = `${dollars(tutor.hourlyRateCents)}/hr`;
  return (
    <article
      className="rounded-2xl border bg-card p-4"
      data-testid={`sophia-preview-tutor-${tutor.tutorKey}`}
    >
      <div className="flex items-start gap-4">
        {tutor.photoUrl ? (
          <img
            src={tutor.photoUrl}
            alt=""
            width={112}
            height={112}
            className={CONSULTING_TUTOR_PHOTO_CLASS}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-sm font-semibold">
            {tutor.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{consultingCreditsTutorLabel(tutor.name)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{tutor.title}</p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {rate}
            </Badge>
          </div>
          {tutor.tagline ? <p className="mt-2 text-sm leading-snug">{tutor.tagline}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`sophia-preview-status-${tutor.tutorKey}`}>
            {tutor.prepaidHours} prepaid hour{tutor.prepaidHours === 1 ? "" : "s"}
            {tutor.comingSoon
              ? " · Coming soon"
              : tutor.bookable
                ? " · Calendar connected"
                : " · Calendar not connected"}
          </p>
          {tutor.comingSoon ? (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="sophia-preview-victoria-coming-soon">
              Coming soon. Booking stays closed until her Google Calendar is connected.
            </p>
          ) : null}
        </div>
      </div>
      {tutor.biography ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            aria-expanded={bioOpen}
            data-testid={`sophia-preview-bio-${tutor.tutorKey}`}
            onClick={() => setBioOpen((open) => !open)}
          >
            {bioOpen ? "Hide bio" : "Read bio"}
          </button>
          {bioOpen ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tutor.biography}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function SophiaClientPreview({ dashboard }: { dashboard: AdminClientDashboard }) {
  const tutors: SophiaPreviewTutorCard[] = dashboard.previewSatTutors ?? [];
  const sessions = [...(dashboard.upcomingSessions ?? [])].sort(
    (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime(),
  );
  const firstName = dashboard.user.displayName.trim().split(/\s+/)[0] || "there";
  const creditsSummary = dashboard.credits.creditsRemainingLabel?.trim() || "0 credits remaining";
  const quizzes = dashboard.assignments ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8" data-testid="sophia-preview-dashboard">
      <section className="overflow-hidden rounded-3xl bg-brand-ink px-6 py-8 text-white sm:px-9" data-testid="sophia-preview-welcome">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/65">SAT</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Welcome back, {firstName}.</h2>
      </section>

      <Card data-testid="sophia-preview-sessions">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            Upcoming meetings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Your meetings will appear here when they are scheduled.
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session) => (
                <li key={session.id} className="rounded-xl border p-4" data-testid={`sophia-preview-session-${session.id}`}>
                  <p className="font-medium">{session.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(session.dateTime).toLocaleString()}
                    {session.tutor?.name ? ` · ${session.tutor.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <details className="rounded-2xl border bg-card" data-testid="sophia-preview-credits">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold">{creditsSummary}</summary>
        <div className="space-y-3 border-t px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchased</p>
              <p className="mt-1 text-2xl font-semibold">{dashboard.credits.purchasedHours}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Used</p>
              <p className="mt-1 text-2xl font-semibold">{dashboard.credits.usedHours}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
              <p className="mt-1 text-2xl font-semibold">{dashboard.credits.remainingHours}</p>
            </div>
          </div>
        </div>
      </details>

      <Card data-testid="client-quizzes">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            Quizzes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quizzes are assigned yet.</p>
          ) : (
            <ul className="space-y-3">
              {quizzes.map((quiz) => (
                <li key={quiz.id} className="rounded-xl border p-4" data-testid={`client-quiz-${quiz.id}`}>
                  <p className="font-medium">{quiz.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {quiz.subject} · {quiz.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <Eye className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Read-only SAT preview</p>
          <p className="mt-1 text-amber-800">
            Booking, checkout, and email stay off. Victoria becomes bookable on Sophia&apos;s portal when her Google Calendar connects.
          </p>
        </div>
      </div>

      <Card data-testid="sophia-preview-tutors">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Tutors</CardTitle>
          <CardDescription>Sophia&apos;s SAT rates. Choosing a time is disabled here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tutors.map((tutor) => (
            <TutorPreviewCard key={tutor.tutorKey} tutor={tutor} />
          ))}
        </CardContent>
      </Card>

      <BillingHistorySection clientId={dashboard.user.id} />
    </div>
  );
}
