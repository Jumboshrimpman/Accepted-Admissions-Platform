import { useGetAdminOverview, useListCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { BarChart3, Users, BookOpen, Layers, CalendarDays, FileText, Wallet, Eye, TriangleAlert } from "lucide-react";
import { AdminFinancialsPanel } from "@/pages/admin/financials-panel";
import { PublicContentPanel } from "@/pages/admin/public-content-panel";
import { CalendarConnectionCard } from "@/pages/portal/calendar-connection-card";

export default function AdminDashboard() {
  const { data: courses, isLoading } = useListCourses();
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverview();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid gap-6 md:grid-cols-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const activeCourses = courses?.filter(c => c.status === 'active') || [];
  const completedCourses = courses?.filter(c => c.status === 'completed') || [];
  const platform = (overview as typeof overview & {
    platform?: {
      totalUsers: number;
      clients: number;
      tutors: number;
      viewers: number;
      upcomingSessions: number;
      newRequests: number;
      outstandingInvoices: number;
      collectedRevenueCents: number;
      tutorCostsCents: number;
      grossProfitCents: number;
      providerStatus: Record<string, string>;
    };
  } | undefined)?.platform;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Workspace</h1>
        <p className="text-muted-foreground mt-1">Platform overview and management.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Courses</CardTitle>
            <BookOpen className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{courses?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Courses</CardTitle>
            <Layers className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCourses.length}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Courses</CardTitle>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCourses.length}</div>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">System Health</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Operational</div>
          </CardContent>
        </Card>
      </div>

      {platform && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Users, "Users", platform.totalUsers],
              [Eye, "View-only viewers", platform.viewers],
              [CalendarDays, "Upcoming sessions", platform.upcomingSessions],
              [FileText, "New client requests", platform.newRequests],
            ].map(([Icon, label, value]) => {
              const MetricIcon = Icon as typeof Users;
              return (
                <Card key={label as string} className="border-border/70">
                  <CardContent className="flex items-center justify-between p-5">
                    <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-bold">{value as number}</p></div>
                    <MetricIcon className="h-5 w-5 text-accent" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Financial snapshot</CardTitle>
                <CardDescription>Derived from recorded payments and completed-session costs.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-3">
                <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Collected revenue</p><p className="mt-2 text-2xl font-bold">${(platform.collectedRevenueCents / 100).toLocaleString()}</p></div>
                <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Tutor costs</p><p className="mt-2 text-2xl font-bold">${(platform.tutorCostsCents / 100).toLocaleString()}</p></div>
                <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Gross profit</p><p className="mt-2 text-2xl font-bold text-accent">${(platform.grossProfitCents / 100).toLocaleString()}</p></div>
              </CardContent>
            </Card>
            <Card className="border-accent/20 bg-accent/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-accent" /> Provider readiness</CardTitle>
                <CardDescription>Nothing is labeled live until it is authorized and tested.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(platform.providerStatus).map(([provider, status]) => <div key={provider} className="rounded-xl border bg-card p-3"><p className="capitalize text-muted-foreground">{provider}</p><p className="mt-1 font-medium">{status}</p></div>)}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <AdminFinancialsPanel />
      <CalendarConnectionCard />
      <PublicContentPanel />

      <Card>
        <CardHeader>
          <CardTitle>All Courses</CardTitle>
          <CardDescription>Comprehensive list of all platform courses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Term</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {courses?.map(course => (
                  <tr key={course.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-4 font-medium">{course.title}</td>
                    <td className="px-4 py-4 text-muted-foreground">{course.subject}</td>
                    <td className="px-4 py-4"><Badge variant="outline">{course.term}</Badge></td>
                    <td className="px-4 py-4">
                      <Badge variant="secondary" className={
                        course.status === 'active' ? 'bg-primary/10 text-primary' : 
                        course.status === 'completed' ? 'bg-muted text-muted-foreground' : ''
                      }>
                        {course.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground font-mono">
                      {course.completedSessionCount || 0}/{course.sessionCount}
                    </td>
                  </tr>
                ))}
                {(!courses || courses.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No courses found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Access provisioning</CardTitle>
            <CardDescription>
              Database-backed users, roles, memberships, and tutor assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overviewLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="space-y-3">
                {overview?.users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{user.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{user.role}</Badge>
                  </div>
                ))}
                {!overview?.users.length && (
                  <p className="text-sm text-muted-foreground">
                    No provisioned users have signed in yet.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memberships & audit</CardTitle>
            <CardDescription>
              Review subject boundaries and recent sensitive actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              {overview?.memberships.map((membership) => (
                <div key={membership.id} className="flex justify-between gap-3 text-sm">
                  <span>{membership.userName} · {membership.courseTitle}</span>
                  <Badge variant="secondary">{membership.subject}</Badge>
                </div>
              ))}
              {!overview?.memberships.length && (
                <p className="text-sm text-muted-foreground">No memberships recorded.</p>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tutor assignments
              </p>
              {overview?.assignments.map((assignment) => (
                <div key={assignment.id} className="flex justify-between gap-3 py-1 text-sm">
                  <span>{assignment.tutorName} → {assignment.studentName}</span>
                  <Badge variant="secondary">{assignment.subject}</Badge>
                </div>
              ))}
              {!overview?.assignments.length && (
                <p className="text-sm text-muted-foreground">No tutor assignments recorded.</p>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent audit events
              </p>
              {overview?.audit.slice(0, 5).map((event) => (
                <div key={event.id} className="flex justify-between gap-3 py-1 text-sm">
                  <span>{event.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {!overview?.audit.length && (
                <p className="text-sm text-muted-foreground">No audit events yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}