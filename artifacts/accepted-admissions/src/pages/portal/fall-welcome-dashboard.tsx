import { useGetDashboard } from "@workspace/api-client-react";
import { BookOpen, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FALL_START = new Date("2026-10-01T00:00:00.000Z");
const WINTER_START = new Date("2027-01-01T00:00:00.000Z");

function subjectLabel(subject: string): string {
  return subject === "IELTS" ? "English" : subject;
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "there";
}

export default function FallWelcomeDashboard() {
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-destructive/10 p-8 text-center text-destructive">
        <h2 className="text-xl font-semibold">Could not load your Fall schedule</h2>
        <p className="mt-2 text-sm">Please try again in a moment.</p>
      </div>
    );
  }

  const fallSessions = dashboard.upcomingSessions
    .filter((session) => {
      const date = parseISO(session.dateTime);
      return (
        (session.subject === "SAT" || session.subject === "IELTS") &&
        date >= FALL_START &&
        date < WINTER_START
      );
    })
    .sort(
      (first, second) =>
        parseISO(first.dateTime).getTime() - parseISO(second.dateTime).getTime(),
    );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="rounded-3xl bg-gradient-brand px-6 py-10 text-white shadow-xl shadow-primary/10 sm:px-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">
          Fall 2026
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome, {firstName(dashboard.user.displayName)}
        </h1>
        <p className="mt-3 max-w-xl text-base text-white/75 sm:text-lg">
          Your October–December schedule is ready.
        </p>
      </section>

      <Card className="border-primary/15 bg-primary/[0.03] shadow-none">
        <CardContent className="flex items-start gap-4 p-6 sm:p-7">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Curriculum to be shared soon
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              We&apos;re preparing your Fall learning materials now.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-card px-6 py-5 sm:px-7">
          <CardTitle className="flex items-center gap-3 text-xl">
            <CalendarDays className="h-5 w-5 text-primary" />
            Fall schedule
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              October – December
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {fallSessions.length > 0 ? (
            <div className="divide-y">
              {fallSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 sm:px-7"
                >
                  <time
                    dateTime={session.dateTime}
                    className="text-base font-medium text-foreground"
                  >
                    {format(parseISO(session.dateTime), "MMMM d, yyyy")}
                  </time>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {subjectLabel(session.subject)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground sm:px-7">
              Your Fall dates will appear here soon.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}