import {
  getGetDashboardQueryKey,
  getListReviewQueueQueryKey,
  useGetDashboard,
  useListReviewQueue,
  useUpdateReviewQueueItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarConnectionCard } from "@/pages/portal/calendar-connection-card";
import { SessionJoinActions } from "@/components/session-join-actions";
import { sessionsForDashboardRole } from "@/lib/dashboard-session-scope";
import {
  displaySessionTitle,
  disclosedSessions,
  formatSessionDate,
  formatSessionTimeRange,
} from "@/lib/session-display";

export default function TutorDashboard() {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const queryClient = useQueryClient();
  const { data: dashboard, isLoading: loadingDashboard, error } = useGetDashboard();
  const { data: queue, isLoading: loadingQueue } = useListReviewQueue();
  const updateReview = useUpdateReviewQueueItem();

  if (loadingDashboard || loadingQueue) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">
        <h2 className="text-xl font-semibold">Could not load your tutor dashboard</h2>
        <p className="mt-2 text-sm">Please try again in a moment.</p>
      </div>
    );
  }

  const openQueue = queue?.filter((item) => item.status === "open") ?? [];
  const upcomingSessions = disclosedSessions(
    sessionsForDashboardRole(dashboard.upcomingSessions, dashboard.user),
    showAllSessions,
  );
  const fallCourse =
    dashboard.courses.find((course) => /fall/i.test(course.title)) ??
    dashboard.courses[0];

  type AttentionItem = {
    attemptId: string;
    studentName: string;
    assignmentTitle: string;
    status: string;
    score: number | null;
    mistakeCount: number;
    submittedAt: string | null;
    sessionDateTime: string | null;
    sessionId: string | null;
    reviewStatus: string;
    analysisPreview: string | null;
    nextFocus: string[];
    queueItems: typeof openQueue;
  };

  const attentionByAttempt = new Map<string, AttentionItem>();

  dashboard.newSubmissions.forEach((submission) => {
    attentionByAttempt.set(submission.attemptId, {
      attemptId: submission.attemptId,
      studentName: submission.studentName,
      assignmentTitle: submission.assignmentTitle,
      status: submission.status,
      score: submission.score,
      mistakeCount: submission.mistakeCount ?? 0,
      submittedAt: submission.submittedAt,
      sessionDateTime: submission.sessionDateTime,
      sessionId: submission.sessionId,
      reviewStatus: submission.reviewStatus,
      analysisPreview: submission.analysisPreview ?? null,
      nextFocus: submission.nextFocus ?? [],
      queueItems: [],
    });
  });

  openQueue.forEach((item) => {
    const existing = attentionByAttempt.get(item.attemptId);
    if (existing) {
      existing.queueItems.push(item);
      return;
    }

    attentionByAttempt.set(item.attemptId, {
      attemptId: item.attemptId,
      studentName: item.studentName,
      assignmentTitle: "Flagged answer review",
      status: "submitted",
      score: null,
      mistakeCount: 1,
      submittedAt: null,
      sessionDateTime: null,
      sessionId: null,
      reviewStatus: "in_review",
      analysisPreview: item.reason,
      nextFocus: [item.skill],
      queueItems: [item],
    });
  });

  const attentionItems = Array.from(attentionByAttempt.values()).slice(0, 8);
  const markQueueItemsReviewed = (items: typeof openQueue) => {
    items.forEach((item) => {
      updateReview.mutate(
        {
          itemId: item.id,
          data: { status: "reviewed", tutorNote: "Reviewed and approved." },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListReviewQueueQueryKey(),
            });
            queryClient.invalidateQueries({
              queryKey: getGetDashboardQueryKey(),
            });
          },
        },
      );
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <section className="rounded-3xl bg-brand-ink px-6 py-7 text-white sm:px-9">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">
          Tutor workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {dashboard.user.displayName.split(/\s+/)[0]}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          Sessions and student work that need you today.
        </p>
      </section>

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <CardHeader className="border-b px-6 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-primary" />
                Upcoming sessions
              </CardTitle>
              <CardDescription className="mt-1">
                Open a session workspace to teach and review.
              </CardDescription>
            </div>
            <Badge variant="secondary">{dashboard.upcomingSessions.length} scheduled</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingSessions.length > 0 ? (
            <div className="divide-y">
              {upcomingSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"
                >
                  <div>
                    <p className="font-semibold">
                      {displaySessionTitle(session.title, session.subject)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatSessionDate(session)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatSessionTimeRange(session)}
                      </span>
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Button asChild className="flex-1 sm:flex-none">
                      <Link href={`/tutor/sessions/${session.id}`}>
                        Open workspace
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <SessionJoinActions
                      meetingUrl={session.meetingUrl}
                      calendarEventUrl={session.calendarEventUrl}
                      className="flex flex-wrap gap-2 sm:w-auto"
                    />
                  </div>
                </div>
              ))}
              {dashboard.upcomingSessions.length > 3 && (
                <div className="px-6 py-4 sm:px-7">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllSessions((value) => !value)}
                    aria-expanded={showAllSessions}
                  >
                    {showAllSessions
                      ? "View less"
                      : `View more (${dashboard.upcomingSessions.length - 3})`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No upcoming sessions are assigned yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-accent/20">
        <CardHeader className="px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="h-5 w-5 text-accent" />
                New submission alerts
              </CardTitle>
              <CardDescription className="mt-1">
                When a student submits homework for an upcoming meeting, review the adaptive analysis and open the session plan.
              </CardDescription>
            </div>
            {attentionItems.length > 0 && (
              <Badge className="bg-accent text-white">
                {attentionItems.length} to review
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {attentionItems.length > 0 ? (
            <div className="space-y-3">
              {attentionItems.map((item) => (
                <div
                  key={item.attemptId}
                  className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.studentName}</p>
                      <Badge variant="outline">
                        {item.reviewStatus.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm">{item.assignmentTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.status === "expired" ? "Time expired" : "Submitted"}
                      {item.sessionDateTime
                        ? ` · Meeting ${format(parseISO(item.sessionDateTime), "MMM d, yyyy")}`
                        : ""}
                      {item.submittedAt
                        ? ` · ${format(parseISO(item.submittedAt), "MMM d, h:mm a")}`
                        : ""}
                      {item.score === null ? "" : ` · ${Math.round(item.score)}%`}
                      {` · ${item.mistakeCount} mistake${item.mistakeCount === 1 ? "" : "s"}`}
                    </p>
                    {item.analysisPreview && (
                      <p className="mt-2 line-clamp-2 text-sm text-foreground/80">
                        {item.analysisPreview}
                      </p>
                    )}
                    {item.nextFocus.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Focus: {item.nextFocus.slice(0, 3).join(" · ")}
                      </p>
                    )}
                    {item.queueItems.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Flagged skills:{" "}
                        {item.queueItems.map((queueItem) => queueItem.skill).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                    <Button asChild className="flex-1 sm:flex-none">
                      <Link href={`/tutor/attempts/${item.attemptId}`}>
                        Review submission
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    {item.sessionId && (
                      <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none">
                        <Link href={`/tutor/sessions/${item.sessionId}`}>
                          Open meeting plan
                        </Link>
                      </Button>
                    )}
                    {item.queueItems.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markQueueItemsReviewed(item.queueItems)}
                        disabled={updateReview.isPending}
                      >
                        {updateReview.isPending ? "Saving…" : "Clear flags"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Everything is caught up. Great work.
            </div>
          )}
        </CardContent>
      </Card>

      {fallCourse ? (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">Fall curriculum</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Session plans, homework, and practice materials.
                </p>
              </div>
            </div>
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href={`/tutor/courses/${fallCourse.id}`}>
                Open Fall 2026 curriculum
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <CalendarConnectionCard location="tutor_dashboard" />
    </div>
  );
}
