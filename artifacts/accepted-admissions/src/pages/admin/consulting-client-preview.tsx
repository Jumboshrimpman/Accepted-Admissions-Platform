import { useState } from "react";
import type { AdminClientDashboard } from "@workspace/api-client-react";
import { CalendarClock, Eye } from "lucide-react";
import { isEssayProductSlug } from "@/components/essay-editing-panel";
import { BillingHistorySection } from "@/pages/portal/billing-history";
import {
  CONSULTING_TUTOR_PHOTO_CLASS,
  consultingCreditsTutorLabel,
} from "@/lib/consulting-tutor-display";
import { neelCreditsRemainingLabel } from "@/lib/credits-remaining-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ConsultingPreviewTutorCard = NonNullable<AdminClientDashboard["previewConsultingTutors"]>[number];

type ConsultingPreviewSession = {
  id: string;
  title: string;
  dateTime: string | Date;
  tutor?: { name?: string | null } | null;
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

const ESSAY_PREVIEW_FALLBACK = [
  {
    slug: "college-consulting-nika-essay-async",
    name: "Essay editing, 1 hr (async)",
    description:
      "One hour of asynchronous essay editing with Nika. Upload one PDF and choose a due time at least 24 hours later. There is no meeting.",
    priceCents: 10_000,
  },
  {
    slug: "college-consulting-nika-essay-followup",
    name: "Essay editing + 1 hr follow-up call, 2 hrs",
    description:
      "One hour of asynchronous essay editing with Nika, plus a one-hour follow-up call. Upload one PDF and choose a due time at least 24 hours later. Book the call with Nika at least 24 hours after that due time.",
    priceCents: 20_000,
  },
] as const;

function essayCards(dashboard: AdminClientDashboard) {
  const fromOffers = (dashboard.previewOffers ?? []).filter((offer) => isEssayProductSlug(offer.slug ?? ""));
  if (fromOffers.length > 0) {
    return fromOffers.map((offer) => ({
      slug: offer.slug ?? offer.name,
      name: offer.name,
      description: offer.description,
      priceCents: offer.priceCents,
    }));
  }
  return [...ESSAY_PREVIEW_FALLBACK];
}

function TutorPreviewCard({ tutor }: { tutor: ConsultingPreviewTutorCard }) {
  const [bioOpen, setBioOpen] = useState(false);
  return (
    <article
      className="rounded-2xl border bg-card p-4"
      data-testid={`consulting-preview-tutor-${tutor.tutorKey}`}
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
            {tutor.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part: string) => part[0] ?? "")
              .join("")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{consultingCreditsTutorLabel(tutor.name)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{tutor.title}</p>
            </div>
            <Badge variant="secondary" className="rounded-full">
              {dollars(tutor.hourlyRateCents)}/hr
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-snug">{tutor.tagline}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {tutor.prepaidHours} prepaid hour{tutor.prepaidHours === 1 ? "" : "s"}
            {tutor.calendarConnected ? " · Calendar connected" : " · Calendar not connected"}
          </p>
        </div>
      </div>
      {tutor.biography ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            aria-expanded={bioOpen}
            data-testid={`consulting-preview-bio-${tutor.tutorKey}`}
            onClick={() => setBioOpen((open) => !open)}
          >
            {bioOpen ? "Hide bio" : "Read bio"}
          </button>
          {bioOpen ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid={`consulting-preview-bio-text-${tutor.tutorKey}`}>
              {tutor.biography}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ConsultingClientPreview({ dashboard }: { dashboard: AdminClientDashboard }) {
  const tutors: ConsultingPreviewTutorCard[] = dashboard.previewConsultingTutors ?? [];
  const sessions = [...(dashboard.upcomingSessions ?? [])].sort(
    (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime(),
  );
  const firstName = dashboard.user.displayName.trim().split(/\s+/)[0] || "there";
  const creditsSummary = neelCreditsRemainingLabel(
    tutors.map((tutor) => ({
      tutorKey: tutor.tutorKey,
      name: tutor.name,
      hours: tutor.prepaidHours,
    })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8" data-testid="consulting-preview-dashboard">
      <section className="overflow-hidden rounded-3xl bg-brand-ink px-6 py-8 text-white sm:px-9" data-testid="consulting-preview-welcome">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/65">College Consulting</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Welcome back, {firstName}.</h2>
      </section>

      <Card data-testid="consulting-preview-sessions">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            Upcoming sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="consulting-preview-empty-sessions">
              No upcoming College Consulting sessions.
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session: ConsultingPreviewSession) => (
                <li key={session.id} className="rounded-xl border p-4" data-testid={`consulting-preview-session-${session.id}`}>
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

      <details className="rounded-2xl border bg-card" data-testid="consulting-preview-credits">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold">
          {creditsSummary}
        </summary>
        <div className="space-y-3 border-t px-5 py-4">
          {tutors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No College Consulting credits are on file.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {tutors.map((tutor: ConsultingPreviewTutorCard) => (
                <div key={tutor.tutorKey} className="rounded-xl border p-4" data-testid={`consulting-preview-credit-${tutor.tutorKey}`}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {consultingCreditsTutorLabel(tutor.name)}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{tutor.prepaidHours}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tutor.prepaidHours === 0 ? "No prepaid hours yet" : "Prepaid hours"} · {dollars(tutor.hourlyRateCents)}/hr
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <Eye className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Read-only College Consulting preview</p>
          <p className="mt-1 text-amber-800" data-testid="consulting-preview-readonly">
            Booking, checkout, and email stay off. This view does not change the calendar.
          </p>
        </div>
      </div>

      <Card data-testid="consulting-preview-tutors">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Tutors</CardTitle>
          <CardDescription>Taglines and bios match the student booking cards. Choosing a time is disabled here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tutors.length === 0 ? (
            <p className="text-sm text-muted-foreground">College Consulting tutors are not available in this preview.</p>
          ) : (
            tutors.map((tutor: ConsultingPreviewTutorCard) => <TutorPreviewCard key={tutor.tutorKey} tutor={tutor} />)
          )}
        </CardContent>
      </Card>

      <Card data-testid="consulting-preview-essays">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Essay editing with Nika</CardTitle>
          <CardDescription>
            $100 for editing only (async PDF). $200 adds a one-hour follow-up call. Nothing is sent from this preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {essayCards(dashboard).map((offer) => (
            <div key={offer.slug} className="rounded-xl border p-4" data-testid={`consulting-preview-essay-${offer.slug}`}>
              <p className="font-semibold">{offer.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{offer.description}</p>
              <p className="mt-3 text-2xl font-semibold">{dollars(offer.priceCents)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <BillingHistorySection clientId={dashboard.user.id} />
    </div>
  );
}
