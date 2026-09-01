import { useParams, Link } from "wouter";
import {
  useGetSession,
  getGetSessionQueryKey,
  getListSessionArtifactsQueryKey,
  useListSessionArtifacts,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { Calendar, ChevronRight, Clock, BookOpen, Target, PenTool, ExternalLink, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type CurriculumBlock } from "@workspace/api-client-react";

function RenderBlock({ block }: { block: CurriculumBlock }) {
  const { kind, config } = block;
  
  switch(kind) {
    case 'heading':
      return <h3 className="text-xl font-bold mt-6 mb-3 text-foreground">{String(config.text || '')}</h3>;
    case 'rich_text':
      return <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">{String(config.html || '')}</div>;
    case 'callout':
      return (
        <div className="my-4 p-4 rounded-xl bg-accent/10 border border-accent/20 flex gap-3 text-accent-foreground">
          <BookOpen className="w-5 h-5 shrink-0 text-accent" />
          <div>{String(config.text || '')}</div>
        </div>
      );
    case 'objectives':
      const items = Array.isArray(config.items) ? config.items : [];
      return (
        <Card className="my-6 border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-primary">
              <Target className="w-5 h-5" /> Objectives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {items.map((item: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span className="text-foreground">{String(item)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      );
    case 'external_link':
      return (
        <a href={String(config.url || '#')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 my-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
          <ExternalLink className="w-4 h-4" />
          {String(config.label || 'External Link')}
        </a>
      );
    default:
      return null;
  }
}

export default function PortalSession() {
  const params = useParams();
  const courseId = params.courseId as string;
  const sessionId = params.sessionId as string;
  const { data: session, isLoading, error } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: getGetSessionQueryKey(sessionId) } });
  const { data: artifacts = [] } = useListSessionArtifacts(sessionId, {
    query: {
      enabled: Boolean(sessionId),
      queryKey: getListSessionArtifactsQueryKey(sessionId),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/4 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-2xl">
        <h2 className="text-xl font-bold mb-2">Could not load session</h2>
        <p>Session not found.</p>
      </div>
    );
  }

  const studentBlocks = session.blocks.filter(b => b.visibility === 'student' || b.visibility === 'both');
  const beforeSessionAssignments = session.assignments.filter(
    (assignment) => assignment.deliveryPhase !== "during_session",
  );
  const duringSessionAssignments = session.assignments.filter(
    (assignment) => assignment.deliveryPhase === "during_session",
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500 pb-20">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <Link href={`/portal/courses/${courseId}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Course
          </Link>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Session</span>
        </div>
        
        <div className="p-8 rounded-3xl bg-gradient-brand text-white shadow-xl">
          <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 mb-4 rounded-full">
            {session.subject}
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{session.title}</h1>
          
          <div className="flex flex-wrap items-center gap-6 text-white/80">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <span>{format(parseISO(session.dateTime), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <span>{format(parseISO(session.dateTime), "h:mm a")}</span>
            </div>
             {session.meetingUrl && (
               <Button asChild variant="secondary" className="rounded-full">
                 <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                   <Video className="mr-2 h-4 w-4" /> Join Meet
                 </a>
               </Button>
             )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold border-b pb-2">During Session curriculum</h2>
          {studentBlocks.length > 0 ? (
            <div className="space-y-4">
              {studentBlocks.map(block => (
                <RenderBlock key={block.id} block={block} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground italic">No curriculum blocks published for this session yet.</p>
          )}
          {duringSessionAssignments.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Practice with your tutor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {duringSessionAssignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                    <div>
                      <p className="font-medium text-sm">{assignment.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.questionCount} original practice questions
                      </p>
                    </div>
                    <Link href={`/portal/assignments/${assignment.id}`}>
                      <Button size="sm" variant="secondary">
                        Open
                      </Button>
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {beforeSessionAssignments.length > 0 && (
            <Card className="border-accent/20 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-accent" />
                  Before Session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {beforeSessionAssignments.map(assignment => (
                  <div key={assignment.id} className="p-3 rounded-lg bg-accent/5 border border-accent/10">
                    <p className="font-medium text-sm mb-2">{assignment.title}</p>
                    <Link href={`/portal/assignments/${assignment.id}`}>
                      <Button size="sm" className="w-full bg-accent hover:bg-accent/90 text-white rounded-full">
                        {assignment.latestAttemptStatus === "submitted" ||
                        assignment.latestAttemptStatus === "expired"
                          ? "View result"
                          : "Start"}
                      </Button>
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {session.studentNotes && (
            <Card className="bg-secondary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Tutor Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{session.studentNotes}</p>
              </CardContent>
            </Card>
          )}

          {artifacts.map((artifact) => (
            <Card key={artifact.id} className="bg-secondary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {artifact.kind === "report"
                    ? "Post-session report"
                    : "Session transcript"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {artifact.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}