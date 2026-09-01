import { useGetDashboard, type CurriculumSession, type Dashboard } from "@workspace/api-client-react";
import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, Eye, Sparkles, Target, Video } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  displaySessionTitle,
  formatSessionDate,
  formatSessionTimeRange,
  sessionDateKey,
  sessionSubjectLabel,
} from "@/lib/session-display";

const FALL_DATES = [
  "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23",
  "2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20",
  "2026-11-27", "2026-12-04", "2026-12-11", "2026-12-18",
] as const;

function fallbackCurriculumSessions(dashboard: Dashboard): CurriculumSession[] {
  return dashboard.upcomingSessions.map((session) => ({
    ...session,
    readiness: session.status === "completed" ? "complete" : "ready",
    nextAction: "Open session plan",
    currentFocus:
      session.subject.toUpperCase() === "IELTS"
        ? "Build confident English communication."
        : "Strengthen SAT reasoning and precision.",
    preparation: null,
    latestResult: null,
  }));
}

function primaryHref(session: CurriculumSession): string {
  if (session.preparation) return `/portal/assignments/${session.preparation.id}`;
  return `/portal/courses/${session.courseId}/sessions/${session.id}`;
}

function readinessLabel(session: CurriculumSession): string {
  if (session.readiness === "complete") return "Complete";
  if (session.readiness === "in_progress") return "In progress";
  if (session.readiness === "not_started") return "Preparation due";
  if (session.readiness === "unavailable") return "Unavailable";
  return session.latestResult ? "Ready · result available" : "Ready";
}

function preparationStatus(assignment: Dashboard["assignments"][number]): string {
  if (assignment.latestAttemptStatus === "active" || assignment.latestAttemptStatus === "paused") return "In progress";
  if (assignment.latestAttemptStatus === "submitted" || assignment.latestAttemptStatus === "expired") {
    return assignment.latestScore == null ? "Complete" : `${Math.round(assignment.latestScore)}%`;
  }
  if (assignment.deadline && new Date(assignment.deadline).getTime() < Date.now()) return "Past due";
  return "Not started";
}

export default function FallWelcomeDashboard() {
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[34rem] rounded-2xl" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <Card className="mx-auto max-w-xl border-destructive/20 bg-destructive/5">
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">Curriculum is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  return <ClientDashboardView dashboard={dashboard} />;
}

export function ClientDashboardView({
  dashboard,
  adminPreview = false,
}: {
  dashboard: Dashboard;
  adminPreview?: boolean;
}) {
  const viewer = dashboard.user.role === "viewer" || adminPreview;
  const sessions = (dashboard.curriculumSessions?.length
    ? dashboard.curriculumSessions
    : fallbackCurriculumSessions(dashboard))
    .filter((session) => FALL_DATES.includes(sessionDateKey(session) as (typeof FALL_DATES)[number]))
    .sort(
      (left, right) =>
        FALL_DATES.indexOf(sessionDateKey(left) as (typeof FALL_DATES)[number]) -
        FALL_DATES.indexOf(sessionDateKey(right) as (typeof FALL_DATES)[number]),
    );
  const nextSession =
    sessions.find((session) => session.readiness !== "complete") ?? sessions.at(-1);
  const analysis = nextSession?.latestResult?.analysis;
  const completed = sessions.filter((session) => session.readiness === "complete").length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-14">
      <section className="overflow-hidden rounded-3xl bg-gradient-brand px-6 py-8 text-white shadow-xl shadow-primary/10 sm:px-9">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/65">Fall 2026 curriculum</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              One plan. Twelve focused meetings.
            </h1>
            <p className="mt-3 text-white/75">
              SAT and English preparation stay separate, while every meeting follows the same clear before, during, and after loop.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-white/65">Progress</p>
              <p className="mt-1 text-lg font-semibold">{completed} of {sessions.length || 12}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-white/65">English dates</p>
              <p className="mt-1 text-lg font-semibold">Oct 23 · Nov 13 · Dec 4</p>
            </div>
          </div>
        </div>
      </section>

      {viewer && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <Eye className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Curriculum in view-only mode</p>
            <p className="mt-1 text-amber-800">You can review the complete plan, preparation, and published results. Only the student can complete work.</p>
          </div>
        </div>
      )}

      {nextSession ? (
        <Card className="border-primary/25 shadow-sm">
          <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{sessionSubjectLabel(nextSession.subject)}</Badge>
                <span className="text-sm text-muted-foreground">Next meeting · {formatSessionDate(nextSession)}</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold">{displaySessionTitle(nextSession.title, nextSession.subject)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{formatSessionTimeRange(nextSession)}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current focus</p>
              <p className="mt-2 text-sm font-medium">{nextSession.currentFocus ?? "Open the session to review the focus."}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {nextSession.preparation ? `${nextSession.preparation.title} · ${readinessLabel(nextSession)}` : "No required preparation."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {adminPreview ? <Button disabled size="lg">Read only</Button> : <>
                <Button asChild size="lg" className="w-full lg:w-auto">
                  <Link href={primaryHref(nextSession)}>
                    {viewer && nextSession.preparation && !nextSession.latestResult ? "Review preparation" : nextSession.nextAction}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                {nextSession.meetingUrl && <Button asChild variant="outline" size="sm"><a href={nextSession.meetingUrl} target="_blank" rel="noopener noreferrer"><Video className="mr-2 h-4 w-4" />Join meeting</a></Button>}
              </>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">The Fall curriculum will appear here when it is available.</CardContent></Card>
      )}

      {nextSession?.latestResult && analysis && (
        <Card className="border-accent/20 bg-accent/[0.03]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-accent" />Adaptive guidance</CardTitle>
              <Badge variant="outline">{analysis.label} · {analysis.source === "provider" ? analysis.provider ?? "AI provider" : "Deterministic fallback"}</Badge>
            </div>
            <CardDescription>Based only on the latest finalized {sessionSubjectLabel(nextSession.subject)} result.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Strength</p><p className="mt-2 text-sm">{analysis.strengths[0] ?? "Keep building your baseline."}</p></div>
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Missed skill</p><p className="mt-2 text-sm">{analysis.weaknesses[0] ?? "No repeated missed skill yet."}</p></div>
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Next practice</p><p className="mt-2 text-sm">{analysis.nextFocus[0] ?? "Continue with the published session plan."}</p></div>
          </CardContent>
        </Card>
      )}

      {!dashboard.curriculumSessions?.length && dashboard.assignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-lg">Required preparation</CardTitle><CardDescription>A compact status list while the detailed roadmap is loading.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dashboard.assignments.map((assignment) => <Badge key={assignment.id} variant="outline"><span>{assignment.title}</span><span aria-hidden="true"> · </span><span>{preparationStatus(assignment)}</span></Badge>)}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="h-5 w-5 text-primary" />Twelve-session roadmap</CardTitle>
          <CardDescription>Open any date to see its before, during, and after learning loop.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length > 0 ? (
            <ol className="divide-y">
              {sessions.map((session, index) => (
                <li key={session.id} className={session.id === nextSession?.id ? "bg-primary/[0.035]" : ""}>
                  <div className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[3rem_12rem_1fr_10rem_auto] lg:items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">{index + 1}</div>
                    <div>
                      <p className="font-semibold">{formatSessionDate(session)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatSessionTimeRange(session)}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={sessionSubjectLabel(session.subject) === "English" ? "secondary" : "outline"}>{sessionSubjectLabel(session.subject)}</Badge>
                        <span className="truncate text-sm font-medium">{session.currentFocus}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.preparation ? `Before: ${session.preparation.title}` : "Before: no required pre-work"} · During: published {sessionSubjectLabel(session.subject)} plan · After: {session.hasReport ? "report ready" : "feedback and report"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {session.readiness === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : session.readiness === "not_started" ? <Target className="h-4 w-4 text-amber-600" /> : <BookOpenCheck className="h-4 w-4 text-primary" />}
                      <span>{readinessLabel(session)}</span>
                    </div>
                    {adminPreview ? <Button disabled variant="ghost" size="sm">Read only</Button> : <Button asChild variant={session.id === nextSession?.id ? "default" : "ghost"} size="sm">
                      <Link href={`/portal/courses/${session.courseId}/sessions/${session.id}`}>
                        Open <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">No Fall sessions are visible for this account.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}