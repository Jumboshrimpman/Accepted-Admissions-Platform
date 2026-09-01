import { useGetDashboard } from "@workspace/api-client-react";
import { format, isPast, parseISO } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  GraduationCap,
  Target,
  Video,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  displaySessionTitle,
  disclosedSessions,
  formatSessionDate,
  formatSessionTimeRange,
  sessionDateKey,
  sessionSubjectLabel,
} from "@/lib/session-display";

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "there";
}

function assignmentStatus(
  assignment: {
    latestAttemptStatus?: string | null;
    latestScore?: number | null;
    deadline?: string | null;
  },
): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (assignment.latestAttemptStatus === "active" || assignment.latestAttemptStatus === "paused") {
    return { label: "In progress", variant: "secondary" };
  }
  if (assignment.latestAttemptStatus === "submitted" || assignment.latestAttemptStatus === "expired") {
    return { label: assignment.latestScore == null ? "Complete" : `${Math.round(assignment.latestScore)}%`, variant: "default" };
  }
  if (assignment.deadline && isPast(parseISO(assignment.deadline))) {
    return { label: "Past due", variant: "destructive" };
  }
  return { label: "Not started", variant: "outline" };
}

export default function FallWelcomeDashboard() {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-44 rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">
        <h2 className="text-xl font-semibold">Could not load your Fall dashboard</h2>
        <p className="mt-2 text-sm">Please try again in a moment.</p>
      </div>
    );
  }

  const viewer = dashboard.user.role === "viewer";
  const fallSessions = dashboard.upcomingSessions
    .filter((session) => {
      const dateKey = sessionDateKey(session);
      return (
        (session.subject === "SAT" || session.subject === "IELTS") &&
        dateKey >= "2026-10-01" &&
        dateKey < "2027-01-01"
      );
    })
    .sort((first, second) => parseISO(first.dateTime).getTime() - parseISO(second.dateTime).getTime());
  const nextSession = fallSessions[0];
  const visibleFallSessions = disclosedSessions(fallSessions, showAllSessions);
  const homework = dashboard.assignments
    .filter((assignment) => assignment.deliveryPhase !== "during_session")
    .slice(0, 4);
  const progressPercent =
    dashboard.progress.totalSessions > 0
      ? (dashboard.progress.completedSessions / dashboard.progress.totalSessions) * 100
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <section className="rounded-3xl bg-gradient-brand px-6 py-8 text-white shadow-xl shadow-primary/10 sm:px-10 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">Fall 2026</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome, {firstName(dashboard.user.displayName)}
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/75 sm:text-lg">
              Your learning plan, sessions, and next steps in one place.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm backdrop-blur-sm">
            <p className="text-white/65">Program</p>
            <p className="mt-1 font-medium">October – December</p>
          </div>
        </div>
      </section>

      {viewer && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          <GraduationCap className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Viewing Taito&apos;s dashboard in view-only mode</p>
            <p className="mt-1 text-amber-800 dark:text-amber-200">You can review schedule, homework, and progress, but nothing can be changed from this account.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/15 bg-primary/[0.03] shadow-none">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next session</p>
              <p className="mt-1 font-semibold">{nextSession ? formatSessionDate(nextSession) : "Not scheduled"}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-accent/10 p-3 text-accent"><Target className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Session progress</p>
              <p className="mt-1 font-semibold">{dashboard.progress.completedSessions} of {dashboard.progress.totalSessions} complete</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-secondary p-3 text-secondary-foreground"><CreditCard className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sessions available</p>
              <p className="mt-1 font-semibold">{dashboard.credits.remainingHours} {dashboard.credits.remainingHours === 1 ? "hour" : "hours"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardHeader className="border-b bg-card px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="h-5 w-5 text-primary" />Next session</CardTitle>
                <CardDescription className="mt-1">Your next scheduled step in the Fall plan.</CardDescription>
              </div>
               {nextSession && <Badge variant="secondary">{sessionSubjectLabel(nextSession.subject)}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {nextSession ? (
              <div className="space-y-5">
                <div>
                 <p className="text-2xl font-semibold">{displaySessionTitle(nextSession.title, nextSession.subject)}</p>
                  <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                     <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{formatSessionDate(nextSession)}</p>
                     <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" />{formatSessionTimeRange(nextSession)}</p>
                    <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" />{nextSession.tutor?.name ?? "Tutor to be confirmed"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild><Link href={`/portal/courses/${nextSession.courseId}/sessions/${nextSession.id}`}>Open session <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                  {nextSession.meetingUrl && <Button asChild variant="outline"><a href={nextSession.meetingUrl} target="_blank" rel="noopener noreferrer"><Video className="mr-2 h-4 w-4" />Join meeting</a></Button>}
                </div>
              </div>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">Your next session will appear here when it is scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="px-6 py-5">
            <CardTitle className="flex items-center gap-2 text-xl"><BookOpen className="h-5 w-5 text-primary" />Upcoming homework</CardTitle>
            <CardDescription>Keep your practice moving between sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            {homework.length > 0 ? homework.map((assignment) => {
              const state = assignmentStatus(assignment);
              const action = assignment.latestAttemptStatus === "active" || assignment.latestAttemptStatus === "paused"
                ? "Continue"
                : assignment.latestAttemptStatus === "submitted" || assignment.latestAttemptStatus === "expired"
                  ? "View result"
                  : "Start";
              return (
                <div key={assignment.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-medium">{assignment.title}</p><p className="mt-1 text-xs text-muted-foreground">{assignment.deadline ? `Due ${format(parseISO(assignment.deadline), "MMM d, yyyy")}` : "No due date"}</p></div>
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </div>
                  <Button asChild size="sm" variant="outline" className="mt-3 w-full"><Link href={`/portal/assignments/${assignment.id}`}>{action}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
                </div>
              );
            }) : <p className="py-5 text-sm text-muted-foreground">No homework is assigned yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader className="px-6 py-5"><CardTitle className="flex items-center gap-2 text-xl"><CheckCircle2 className="h-5 w-5 text-accent" />Recent results</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {dashboard.recentScores.length > 0 ? <div className="space-y-3">{dashboard.recentScores.map((result) => <div key={`${result.label}-${result.date}`} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{result.label}</p><p className="text-xs text-muted-foreground">{format(parseISO(result.date), "MMM d, yyyy")}</p></div><span className="text-xl font-semibold text-primary">{Math.round(result.score)}%</span></div>)}</div> : <p className="py-5 text-sm text-muted-foreground">Complete an assignment to see your results here.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-6 py-5"><CardTitle className="flex items-center gap-2 text-xl"><Target className="h-5 w-5 text-primary" />Your progress</CardTitle><CardDescription>Small, useful signals from your completed work.</CardDescription></CardHeader>
          <CardContent className="space-y-5 px-6 pb-6">
            <div><div className="mb-2 flex justify-between text-sm"><span>Sessions completed</span><span className="font-medium">{Math.round(progressPercent)}%</span></div><Progress value={progressPercent} /></div>
            <div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Average score</p><p className="mt-1 text-2xl font-semibold">{dashboard.progress.averageScore === null ? "—" : `${Math.round(dashboard.progress.averageScore)}%`}</p></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Strength</p><p className="mt-1 text-sm font-medium">{dashboard.progress.strengths[0] ?? "Building your baseline"}</p></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Next focus</p><p className="mt-1 text-sm font-medium">{dashboard.progress.weaknesses[0] ?? "Keep practicing"}</p></div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b px-6 py-5 sm:px-7"><CardTitle className="flex items-center gap-3 text-xl"><CalendarDays className="h-5 w-5 text-primary" />Fall schedule<span className="ml-auto text-sm font-normal text-muted-foreground">October – December</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          {fallSessions.length > 0 ? <><div className="divide-y">{visibleFallSessions.map((session) => <Link key={session.id} href={`/portal/courses/${session.courseId}/sessions/${session.id}`}><div className="flex flex-col gap-2 px-6 py-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:px-7"><div><p className="font-medium">{displaySessionTitle(session.title, session.subject)}</p><p className="text-sm text-muted-foreground">{formatSessionDate(session)} · {formatSessionTimeRange(session)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{sessionSubjectLabel(session.subject)}</Badge><ArrowRight className="h-4 w-4 text-muted-foreground" /></div></div></Link>)}</div>{fallSessions.length > 3 && <div className="border-t px-6 py-4 sm:px-7"><Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowAllSessions((value) => !value)} aria-expanded={showAllSessions}>{showAllSessions ? "View less" : `View more (${fallSessions.length - 3})`}</Button></div>}</> : <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">Your Fall dates will appear here soon.</p>}
        </CardContent>
      </Card>
    </div>
  );
}