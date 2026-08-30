import { Link } from "wouter";
import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Calendar, Clock, ArrowRight, Target, Brain, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { BookingCard } from "@/pages/portal/booking-card";
import { CalendarConnectionCard } from "@/pages/portal/calendar-connection-card";
import { FinancialCard } from "@/pages/portal/financial-card";

export default function PortalDashboard() {
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-5 w-96 rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-2xl border border-destructive/20">
        <h2 className="text-xl font-bold mb-2">Could not load dashboard</h2>
        <p>There was a problem communicating with the server. Please try again.</p>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-foreground">
            Welcome back, {dashboard.user.displayName.split(' ')[0]}
          </h1>
          <p className="text-lg text-muted-foreground">
            {dashboard.welcomeMessage || "Ready for your next session?"}
          </p>
        </div>
      </div>
      {dashboard.user.role === "viewer" && (
        <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm text-foreground" role="status">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">You are viewing Taito Goto’s dashboard in view-only mode.</p>
            <p className="mt-1 text-muted-foreground">Assignments, sessions, and progress are visible for review. Editing, submissions, uploads, scheduling, purchases, and other changes are disabled.</p>
          </div>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {/* Next Session */}
        <Card className="md:col-span-2 border-primary/10 shadow-lg shadow-primary/5 bg-gradient-to-br from-card to-secondary/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Calendar className="w-48 h-48" />
          </div>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Upcoming Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.upcomingSessions.length > 0 ? (
              dashboard.upcomingSessions.slice(0, 2).map(session => (
                <div key={session.id} className="flex items-center justify-between p-4 rounded-xl bg-card border shadow-sm hover-elevate transition-all">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground text-lg">{session.title}</p>
                    <div className="flex items-center text-sm text-muted-foreground gap-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(parseISO(session.dateTime), "MMM d, h:mm a")}
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-4 h-4" />
                        {session.subject}
                      </span>
                    </div>
                  </div>
                  <Link href={`/portal/courses/${session.courseId}/sessions/${session.id}`}>
                    <Button variant="secondary" className="rounded-full font-medium hover:bg-primary hover:text-primary-foreground">
                      View <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No upcoming sessions scheduled.</p>
            )}
          </CardContent>
        </Card>

        {/* Action Needed */}
        <Card className="border-accent/20 shadow-md shadow-accent/5">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Active Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.assignments.length > 0 ? (
              dashboard.assignments.map(assignment => (
                <div key={assignment.id} className="p-4 rounded-xl border bg-card/50">
                  <p className="font-medium line-clamp-1" title={assignment.title}>{assignment.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">{assignment.subject}</p>
                  {dashboard.user.role === "viewer" ? (
                    <p className="rounded-full bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground">View-only access</p>
                  ) : (
                    <Link href={`/portal/assignments/${assignment.id}`}>
                      <Button size="sm" className="w-full bg-accent hover:bg-accent/90 text-white rounded-full">
                        Start Attempt
                      </Button>
                    </Link>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center p-6 border border-dashed rounded-xl bg-muted/20">
                <p className="text-sm text-muted-foreground">You're all caught up!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dashboard.user.role === "student" && <BookingCard />}
      {(dashboard.user.role === "student" || dashboard.user.role === "viewer") && <FinancialCard />}
      {dashboard.user.role !== "viewer" && <CalendarConnectionCard />}

      {/* Courses */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          Your Courses
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {dashboard.courses.map((course) => (
            <Link key={course.id} href={`/portal/courses/${course.id}`}>
              <Card className="h-full hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/60 hover:border-primary/30 cursor-pointer overflow-hidden group">
                <div className="h-2 w-full bg-gradient-brand opacity-80 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded-md">
                      {course.term}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-mono">
                      {course.status}
                    </span>
                  </div>
                  <CardTitle className="text-xl line-clamp-2">{course.title}</CardTitle>
                  <CardDescription>{course.subject}</CardDescription>
                </CardHeader>
                <CardFooter className="pt-4 mt-auto border-t bg-muted/20">
                  <div className="text-sm text-muted-foreground w-full flex justify-between items-center">
                    <span>{course.completedSessionCount || 0} / {course.sessionCount} Sessions</span>
                    <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}