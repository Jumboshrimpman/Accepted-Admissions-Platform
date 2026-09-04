import { Link, useParams } from "wouter";
import {
  getGetAdaptiveCurriculumQueryKey,
  getGetSessionQueryKey,
  getListSessionArtifactsQueryKey,
  type CurriculumBlock,
  useGetAdaptiveCurriculum,
  useGetCurrentUser,
  useGetSession,
  useListSessionArtifacts,
} from "@workspace/api-client-react";
import { BookOpen, Calendar, CheckCircle2, ChevronRight, Clock, FileText, PenTool, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  displaySessionTitle,
  formatSessionDate,
  formatSessionTimeRange,
  sessionSubjectLabel,
} from "@/lib/session-display";
import { CurriculumBlockView } from "@/components/curriculum-block-view";
import { SessionJoinActions } from "@/components/session-join-actions";

function RenderBlock({ block }: { block: CurriculumBlock }) {
  return <CurriculumBlockView block={block} />;
}

function assignmentAction(status?: string | null): string {
  if (status === "submitted" || status === "expired") return "Review result";
  if (status === "active" || status === "paused") return "Continue preparation";
  return "Start preparation";
}

export default function PortalSession() {
  const { courseId = "", sessionId = "" } = useParams<{ courseId: string; sessionId: string }>();
  const { data: currentUser } = useGetCurrentUser();
  const viewer = currentUser?.role === "viewer";
  const { data: session, isLoading, error } = useGetSession(sessionId, {
    query: { enabled: Boolean(sessionId), queryKey: getGetSessionQueryKey(sessionId) },
  });
  const { data: adaptive, isLoading: adaptiveLoading, isError: adaptiveUnavailable } = useGetAdaptiveCurriculum(sessionId, {
    query: { enabled: Boolean(sessionId), queryKey: getGetAdaptiveCurriculumQueryKey(sessionId) },
  });
  const { data: artifacts = [] } = useListSessionArtifacts(sessionId, {
    query: { enabled: Boolean(sessionId), queryKey: getListSessionArtifactsQueryKey(sessionId) },
  });

  if (isLoading) return <div className="mx-auto max-w-4xl space-y-5"><Skeleton className="h-44 rounded-3xl" /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (error || !session) return <Card className="mx-auto max-w-xl"><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">Session unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This session is not visible to your account.</p></CardContent></Card>;

  const beforeAssignments = session.assignments.filter((item) => item.deliveryPhase !== "during_session");
  const duringAssignments = session.assignments.filter((item) => item.deliveryPhase === "during_session");
  const studentBlocks = session.blocks.filter((item) => item.visibility !== "tutor");
  const reports = artifacts.filter((item) => item.kind === "report");
  const analysis = session.homework?.find((item) => item.analysis)?.analysis;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/portal/curriculum" className="hover:text-primary">Curriculum</Link><ChevronRight className="h-4 w-4" />
        <Link href={`/portal/courses/${courseId}`} className="hover:text-primary">Fall plan</Link><ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{formatSessionDate(session)}</span>
      </nav>

      <section className="rounded-3xl bg-brand-ink p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge className="border-0 bg-white/20 text-white">{sessionSubjectLabel(session.subject)}</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">{displaySessionTitle(session.title, session.subject)}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/75">
              <span className="flex items-center gap-2"><Calendar className="h-4 w-4" />{formatSessionDate(session)}</span>
              <span className="flex items-center gap-2"><Clock className="h-4 w-4" />{formatSessionTimeRange(session)}</span>
            </div>
          </div>
            <SessionJoinActions meetingUrl={session.meetingUrl} calendarEventUrl={session.calendarEventUrl} size="lg" />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3" aria-label="Session learning loop">
        <Card className="border-accent/25"><CardContent className="p-5"><p className="flex items-center gap-2 font-semibold"><PenTool className="h-4 w-4 text-accent" />Before</p><p className="mt-2 text-sm text-muted-foreground">Complete or review subject-specific preparation.</p></CardContent></Card>
        <Card className="border-primary/25"><CardContent className="p-5"><p className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4 text-primary" />During</p><p className="mt-2 text-sm text-muted-foreground">Follow the tutor-approved session sequence.</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />After</p><p className="mt-2 text-sm text-muted-foreground">Review feedback and the published report.</p></CardContent></Card>
      </div>

      <Card className="border-accent/25">
        <CardHeader><CardTitle className="flex items-center gap-2"><PenTool className="h-5 w-5 text-accent" />Before the session</CardTitle><CardDescription>{sessionSubjectLabel(session.subject)} preparation only.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {beforeAssignments.length ? beforeAssignments.map((assignment) => (
            <div key={assignment.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{assignment.title}</p><p className="mt-1 text-sm text-muted-foreground">{assignment.questionCount} questions · {assignment.timeLimitMinutes} minutes{assignment.latestScore == null ? "" : ` · ${Math.round(assignment.latestScore)}%`}</p></div>
              <Button asChild disabled={viewer && !assignment.latestAttemptId}><Link href={`/portal/assignments/${assignment.id}`}>{viewer && !assignment.latestAttemptId ? "Not started" : assignmentAction(assignment.latestAttemptStatus)}<ArrowIcon /></Link></Button>
            </div>
          )) : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No preparation is required for this meeting.</p>}
          {analysis && (
            <div className="grid gap-3 rounded-xl bg-muted/35 p-4 sm:grid-cols-3">
              <div><p className="text-xs font-semibold uppercase text-muted-foreground">Strength</p><p className="mt-1 text-sm">{analysis.strengths[0] ?? "Building a baseline"}</p></div>
              <div><p className="text-xs font-semibold uppercase text-muted-foreground">Missed skill</p><p className="mt-1 text-sm">{analysis.weaknesses[0] ?? "No repeated miss"}</p></div>
              <div><p className="text-xs font-semibold uppercase text-muted-foreground">Next practice</p><p className="mt-1 text-sm">{analysis.nextFocus[0] ?? "Continue the session plan"}</p></div>
              <Badge variant="outline" className="w-fit sm:col-span-3">{analysis.label} · {analysis.source === "provider" ? analysis.provider ?? "AI provider" : "Deterministic fallback"}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/25">
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />During the session</CardTitle><CardDescription>The sequence below is published or approved by the tutor.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {studentBlocks.length ? studentBlocks.map((block) => <div key={block.id} className="rounded-xl border p-4"><RenderBlock block={block} /></div>) : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">The tutor has not published this sequence yet.</p>}
          {duringAssignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-xl border bg-primary/[0.03] p-4"><div><p className="font-medium">{assignment.title}</p><p className="text-xs text-muted-foreground">{assignment.questionCount} approved original questions</p></div><Button asChild size="sm" variant="secondary"><Link href={`/portal/assignments/${assignment.id}`}>Open</Link></Button></div>)}
          {adaptiveLoading && <p className="text-sm text-muted-foreground">Loading the approved adaptive sequence…</p>}
          {adaptiveUnavailable && <p role="status" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><Sparkles className="mr-2 inline h-4 w-4" />Adaptive guidance is unavailable. The published tutor plan remains available.</p>}
          {adaptive && adaptive.publishedBlocks.length === 0 && adaptive.recommendations.length === 0 && <p className="text-xs text-muted-foreground">No adaptive additions have been published for this meeting.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-600" />After the session</CardTitle><CardDescription>Feedback and reports appear only after they are published.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {session.studentNotes && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Tutor feedback</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{session.studentNotes}</p></details>}
          {reports.map((report) => <details key={report.id} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Published session report</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{report.content}</p></details>)}
          {!session.studentNotes && reports.length === 0 && <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Feedback and the session report are not available yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ArrowIcon() {
  return <ChevronRight className="ml-2 h-4 w-4" />;
}