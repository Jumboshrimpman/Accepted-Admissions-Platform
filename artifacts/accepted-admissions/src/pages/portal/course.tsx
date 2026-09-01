import { useParams, Link } from "wouter";
import { useGetCourse, getGetCourseQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { Calendar, Video, FileText, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function PortalCourse() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { data: course, isLoading, error } = useGetCourse(courseId, { query: { enabled: !!courseId, queryKey: getGetCourseQueryKey(courseId) } });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-2xl">
        <h2 className="text-xl font-bold mb-2">Could not load course</h2>
        <p>Course not found or you don't have access.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{course.title}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{course.title}</h1>
          <p className="text-lg text-muted-foreground mt-1">{course.subject} &middot; {course.term}</p>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          {course.meetUrl && (
            <Button asChild className="flex-1 md:flex-none bg-primary text-white rounded-full shadow-md">
              <a href={course.meetUrl} target="_blank" rel="noopener noreferrer">
                <Video className="w-4 h-4 mr-2" />
                Join Meet
              </a>
            </Button>
          )}
          {course.driveUrl && (
            <Button asChild variant="secondary" className="flex-1 md:flex-none rounded-full">
              <a href={course.driveUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4 mr-2" />
                Course Drive
              </a>
            </Button>
          )}
        </div>
      </div>

      {course.goalSummary && (
        <Card className="bg-primary/5 border-primary/20 shadow-none">
          <CardContent className="p-6">
            <h3 className="font-semibold text-primary mb-2 text-sm uppercase tracking-wider">Goal Summary</h3>
            <p className="text-foreground leading-relaxed">{course.goalSummary}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          Sessions
        </h2>
        
        <div className="grid gap-4">
          {course.sessions.map((session, index) => {
            const isCompleted = session.status === 'completed';
            const isUpcoming = !isCompleted && new Date(session.dateTime) > new Date();
            
            return (
              <Link key={session.id} href={`/portal/courses/${course.id}/sessions/${session.id}`}>
                <Card className={`group cursor-pointer transition-all hover-elevate ${
                  isCompleted ? "opacity-75 bg-muted/30" : "hover:border-primary/50"
                }`}>
                  <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        isCompleted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                      }`}>
                        <span className="font-bold text-lg">{index + 1}</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                          {session.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {format(parseISO(session.dateTime), "EEEE, MMM d 'at' h:mm a")}
                          </span>
                          {session.tutor && (
                            <span>with {session.tutor.name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 self-end md:self-auto">
                       {session.meetingUrl && (
                         <Button
                           asChild
                           size="sm"
                           variant="outline"
                           onClick={(event) => event.stopPropagation()}
                         >
                           <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                             <Video className="mr-1.5 h-3.5 w-3.5" /> Join Meet
                           </a>
                         </Button>
                       )}
                      {session.hasHomework && (
                        <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                          Homework
                        </Badge>
                      )}
                      {isCompleted ? (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      ) : isUpcoming ? (
                        <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20">
                          Upcoming
                        </Badge>
                      ) : null}
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  );
}