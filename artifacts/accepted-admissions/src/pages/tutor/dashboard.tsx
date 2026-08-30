import { useListReviewQueue, useListCourses, useUpdateReviewQueueItem, getListReviewQueueQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Users, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CalendarConnectionCard } from "@/pages/portal/calendar-connection-card";

export default function TutorDashboard() {
  const queryClient = useQueryClient();
  const { data: queue, isLoading: loadingQueue } = useListReviewQueue();
  const { data: courses, isLoading: loadingCourses } = useListCourses();
  const updateReview = useUpdateReviewQueueItem();

  const handleReview = (id: string) => {
    updateReview.mutate({
      itemId: id,
      data: { status: 'reviewed', tutorNote: "Reviewed and approved." }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListReviewQueueQueryKey() });
      }
    });
  };

  if (loadingQueue || loadingCourses) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const openQueue = queue?.filter(q => q.status === 'open') || [];
  
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tutor Dashboard</h1>
        <p className="text-muted-foreground text-lg mt-1">Manage your students and review their work.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Review Queue */}
        <Card className="border-accent/20 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-accent" />
              Review Queue
              {openQueue.length > 0 && (
                <Badge className="ml-2 bg-accent text-white">{openQueue.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Student work that requires your attention</CardDescription>
          </CardHeader>
          <CardContent>
            {openQueue.length > 0 ? (
              <div className="space-y-4">
                {openQueue.map(item => (
                  <div key={item.id} className="p-4 rounded-xl border bg-card hover:border-accent/40 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold">{item.studentName}</span>
                      <Badge variant="outline" className="text-xs">{item.skill}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{item.reason}</p>
                    <div className="bg-muted/50 p-3 rounded-md mb-4 text-sm font-mono">
                      {item.prediction ? `Pred: ${item.prediction}` : 'No prediction'}
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleReview(item.id)}
                      disabled={updateReview.isPending}
                      className="w-full bg-accent hover:bg-accent/90 text-white rounded-md"
                    >
                      {updateReview.isPending ? "Marking..." : "Mark Reviewed"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground space-y-3">
                <CheckCircle2 className="w-12 h-12 text-muted-foreground/30" />
                <p>Queue is clear! Great job.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My Courses / Students */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              My Students & Courses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses && courses.length > 0 ? (
              <div className="space-y-3">
                {courses.map(course => (
                  <Link key={course.id} href={`/tutor/courses/${course.id}`}>
                    <div className="group flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-transparent hover:border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium group-hover:text-primary transition-colors">{course.title}</p>
                          <p className="text-xs text-muted-foreground">{course.term} &middot; {course.subject}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No active courses assigned.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <CalendarConnectionCard />
    </div>
  );
}