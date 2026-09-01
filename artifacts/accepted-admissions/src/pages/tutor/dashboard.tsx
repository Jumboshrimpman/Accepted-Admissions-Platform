import {
  getListReviewQueueQueryKey,
  useGetDashboard,
  useListReviewQueue,
  useUpdateReviewQueueItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Users,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TutorDashboard() {
  const queryClient = useQueryClient();
  const { data: dashboard, isLoading: loadingDashboard, error } = useGetDashboard();
  const { data: queue, isLoading: loadingQueue } = useListReviewQueue();
  const updateReview = useUpdateReviewQueueItem();

  if (loadingDashboard || loadingQueue) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-32 rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
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
  const upcomingSessions = dashboard.upcomingSessions.slice(0, 6);
  const handleReview = (id: string) => {
    updateReview.mutate(
      { itemId: id, data: { status: "reviewed", tutorNote: "Reviewed and approved." } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListReviewQueueQueryKey() }) },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <section className="rounded-3xl bg-gradient-brand px-6 py-8 text-white shadow-xl shadow-primary/10 sm:px-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">Tutor workspace</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Good to see you, {dashboard.user.displayName.split(/\s+/)[0]}</h1>
            <p className="mt-2 max-w-2xl text-base text-white/75">Your upcoming sessions, student work, and curriculum tools are ready for the day.</p>
          </div>
          <Badge className="border-white/20 bg-white/10 px-3 py-1.5 text-white">Tutor dashboard</Badge>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><CalendarDays className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Upcoming sessions</p><p className="mt-1 text-2xl font-semibold">{dashboard.upcomingSessions.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-accent/10 p-3 text-accent"><Users className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Assigned students</p><p className="mt-1 text-2xl font-semibold">{dashboard.assignedStudents.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-amber-100 p-3 text-amber-700"><BookOpen className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">New submissions</p><p className="mt-1 text-2xl font-semibold">{dashboard.newSubmissions.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-secondary p-3 text-secondary-foreground"><AlertCircle className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Review queue</p><p className="mt-1 text-2xl font-semibold">{dashboard.openReviewCount}</p></div></CardContent></Card>
      </div>

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <CardHeader className="border-b px-6 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="h-5 w-5 text-primary" />Upcoming sessions</CardTitle>
              <CardDescription className="mt-1">Open a session workspace with the student, homework, analysis, and curriculum in one place.</CardDescription>
            </div>
            <Badge variant="secondary">{dashboard.upcomingSessions.length} scheduled</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {upcomingSessions.length > 0 ? <div className="divide-y">{upcomingSessions.map((session) => <div key={session.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><CalendarDays className="h-5 w-5" /></div><div><p className="font-semibold">{session.student?.name ?? "Student to be confirmed"}</p><p className="mt-1 text-sm">{session.title}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{format(parseISO(session.dateTime), "EEE, MMM d, yyyy")}</span><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{format(parseISO(session.dateTime), "h:mm a")} · {session.timezone}</span></p></div></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button asChild className="flex-1 sm:flex-none"><Link href={`/tutor/sessions/${session.id}`}>Open workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>{session.meetingUrl && <Button asChild variant="outline" className="flex-1 sm:flex-none"><a href={session.meetingUrl} target="_blank" rel="noopener noreferrer"><Video className="mr-2 h-4 w-4" />Join meeting</a></Button>}</div></div>)}</div> : <p className="px-6 py-10 text-center text-sm text-muted-foreground">No upcoming sessions are assigned yet.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader className="px-6 py-5"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-xl"><BookOpen className="h-5 w-5 text-primary" />New submissions</CardTitle><CardDescription className="mt-1">Results that need a quick review.</CardDescription></div>{dashboard.newSubmissions.length > 0 && <Badge>{dashboard.newSubmissions.length}</Badge>}</div></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            {dashboard.newSubmissions.length > 0 ? dashboard.newSubmissions.slice(0, 5).map((submission) => <Link key={submission.attemptId} href={`/tutor/attempts/${submission.attemptId}`}><div className="flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"><div className="min-w-0"><p className="truncate font-semibold">{submission.studentName} · {submission.assignmentTitle}</p><p className="mt-1 text-sm text-muted-foreground">{submission.status === "expired" ? "Time expired" : "Submitted"} · {submission.mistakeCount ?? 0} mistakes · {Math.round(submission.score)}%</p></div><Badge variant="outline">{submission.reviewStatus.replace("_", " ")}</Badge></div></Link>) : <p className="py-5 text-center text-sm text-muted-foreground">No new submissions. You&apos;re caught up.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-6 py-5"><CardTitle className="flex items-center gap-2 text-xl"><Users className="h-5 w-5 text-accent" />Assigned students & programs</CardTitle><CardDescription className="mt-1">Your current student relationships and curriculum access.</CardDescription></CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            {dashboard.assignedStudents.length > 0 ? dashboard.assignedStudents.slice(0, 6).map((student) => <div key={`${student.id}-${student.courseId}`} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-accent/10 p-2 text-accent"><GraduationCap className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate font-medium">{student.name}</p><p className="truncate text-xs text-muted-foreground">{student.courseTitle} · {student.subject}</p></div></div><Link href={`/tutor/courses/${student.courseId}`} className="shrink-0 text-sm font-medium text-primary hover:underline">Open program</Link></div>) : <p className="py-5 text-center text-sm text-muted-foreground">No student assignments are available yet.</p>}
            <div className="border-t pt-3"><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Curriculum</p><div className="flex flex-wrap gap-2">{dashboard.courses.slice(0, 4).map((course) => <Button key={course.id} asChild size="sm" variant="outline"><Link href={`/tutor/courses/${course.id}`}>{course.title}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>)}</div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-accent/20">
        <CardHeader className="px-6 py-5"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-xl"><AlertCircle className="h-5 w-5 text-accent" />Review queue</CardTitle><CardDescription className="mt-1">Flagged answers that need your attention.</CardDescription></div>{openQueue.length > 0 && <Badge className="bg-accent text-white">{openQueue.length} open</Badge>}</div></CardHeader>
        <CardContent className="px-6 pb-6">
          {openQueue.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{openQueue.slice(0, 4).map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{item.studentName}</p><Badge variant="outline">{item.skill}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.reason}</p><div className="mt-3 flex gap-2"><Button asChild size="sm" variant="outline"><Link href={`/tutor/attempts/${item.attemptId}`}>Review result</Link></Button><Button size="sm" variant="secondary" onClick={() => handleReview(item.id)} disabled={updateReview.isPending}>{updateReview.isPending ? "Saving…" : "Mark reviewed"}</Button></div></div>)}</div> : <div className="flex items-center gap-3 py-5 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Queue is clear. Great work.</div>}
        </CardContent>
      </Card>
    </div>
  );
}