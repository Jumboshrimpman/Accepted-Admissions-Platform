import { useParams, Link } from "wouter";
import { useGetCourse, getGetCourseQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Video, ChevronRight, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  displaySessionTitle,
  formatSessionDateTime,
} from "@/lib/session-display";
import { SessionJoinActions } from "@/components/session-join-actions";

export default function TutorCourse() {
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

  if (error || !course) return <div>Course not found</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/tutor" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{course.title}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{course.title} <Badge className="ml-2 align-middle">{course.status}</Badge></h1>
          <p className="text-lg text-muted-foreground mt-1">Tutor View</p>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          {course.meetUrl && (
            <Button asChild className="flex-1 md:flex-none bg-primary text-white rounded-md shadow-sm">
              <a href={course.meetUrl} target="_blank" rel="noopener noreferrer">
                <Video className="w-4 h-4 mr-2" />
                Join Meet
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Sessions
          </h2>
        </div>
        
        <div className="grid gap-4">
          {course.sessions.map((session, index) => {
            const isCompleted = session.status === 'completed';
            
            return (
              <Card key={session.id} className={`group border-l-4 transition-all ${isCompleted ? 'border-l-muted/50 bg-muted/20 opacity-75' : 'border-l-primary hover:border-l-accent'}`}>
                <CardContent className="p-4 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <span className="font-bold text-secondary-foreground">{index + 1}</span>
                    </div>
                    <div>
                       <h3 className="text-lg font-semibold">{displaySessionTitle(session.title, session.subject)}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-muted-foreground">
                         <span>{formatSessionDateTime(session)}</span>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{session.status}</Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                     <SessionJoinActions
                       meetingUrl={session.meetingUrl}
                       calendarEventUrl={session.calendarEventUrl}
                       meetingLabel="Join Meet"
                     />
                    <Link href={`/tutor/sessions/${session.id}`} className="flex-1 md:flex-none">
                      <Button variant="secondary" size="sm" className="w-full">
                        <Settings className="w-4 h-4 mr-2" /> Manage Curriculum
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  );
}