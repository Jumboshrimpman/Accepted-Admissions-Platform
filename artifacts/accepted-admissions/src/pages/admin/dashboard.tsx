import { Link } from "wouter";
import {
  getGetAdminOverviewQueryKey,
  useGetAdminCurriculum,
  useGetAdminOverview,
  useUpdateAdminNotification,
  useUpdateAdminGuidanceRequest,
  type AdminGuidanceRequest,
  type AdminGuidanceRequestUpdate,
  type AdminNotification,
  type AdminOverview,
  type AdminOverviewUsersItem,
} from "@workspace/api-client-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, CalendarDays, ChevronDown, ClipboardList, Eye, FileText, LogIn, MessageSquareText, Save, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import {
  formSubmissionSourceLabel,
  isFormSubmissionResolved,
  unresolvedFormSubmissions,
} from "@/lib/form-submissions";
import { SessionListDisclosure } from "@/components/session-list-disclosure";
import { QuestionReportsQueue } from "./question-reports-queue";
import { previewableStudents } from "@/lib/previewable-students";
import { isLiveListedSession } from "@/lib/quiz-content";
import {
  collapsedItems,
  disclosedSessions,
  displaySessionTitle,
  formatSessionDateTime,
} from "@/lib/session-display";

const operationLinks = [
  { href: "/admin#guidance-requests", title: "Guidance requests", detail: "Read Get guidance / client-request submissions from the public form.", icon: MessageSquareText },
  { href: "/admin/curriculum?section=people", title: "People & access", detail: "Provision students and tutors, assign them to each other, then preview a client portal.", icon: Users },
  { href: "/admin/curriculum?section=sessions", title: "Sessions & meetings", detail: "Assign bank quizzes as pre-work, Meet links, and conflicts.", icon: CalendarDays },
  { href: "/admin/curriculum?section=curriculum", title: "Quizzes", detail: "Open a quiz, add questions, assign it, review results.", icon: ClipboardList },
  { href: "/admin/content", title: "Website content", detail: "Home, SAT, team, stories, and contact email.", icon: FileText },
];

const accessRoleCategoryLabels: Record<string, string> = {
  administrator: "Administrator",
  sat_tutor: "SAT tutor",
  english_tutor: "English tutor",
  tutor: "General tutor",
  student: "Student",
  viewer: "Viewer",
};

const requestStatusOptions: Array<{ value: AdminGuidanceRequest["status"]; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Closed" },
];

const conversionStatusOptions: Array<{ value: AdminGuidanceRequest["conversionStatus"]; label: string }> = [
  { value: "unqualified", label: "Unqualified" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

type AdminOverviewWithPlatform = AdminOverview & {
  platform?: {
    outstandingInvoices: number;
    upcomingSessions: number;
    newRequests: number;
  };
};

function notificationsByNewest<T extends { createdAt: string | Date }>(notifications: readonly T[]): T[] {
  return [...notifications].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function applyGuidanceRequestUpdate(queryClient: QueryClient, updated: AdminGuidanceRequest) {
  queryClient.setQueryData<AdminOverviewWithPlatform>(getGetAdminOverviewQueryKey(), (current) => {
    if (!current) return current;
    const guidanceRequests = current.guidanceRequests.map((item) =>
      item.id === updated.id ? updated : item,
    );
    return {
      ...current,
      guidanceRequests,
      platform: current.platform
        ? {
            ...current.platform,
            newRequests: guidanceRequests.reduce(
              (count, item) => count + (item.status === "new" ? 1 : 0),
              0,
            ),
          }
        : undefined,
    };
  });
}

function revealAdminHashTarget(hash: string) {
  if (hash === "guidance-requests") {
    document.getElementById("guidance-requests")?.scrollIntoView({ block: "start" });
    return;
  }
  if (!hash.startsWith("guidance-request-")) return;
  const requestId = hash.slice("guidance-request-".length);
  const element = document.getElementById(`guidance-request-${requestId}`);
  if (!element) return;
  const history = document.getElementById("resolved-form-submissions");
  if (history instanceof HTMLDetailsElement && history.contains(element)) history.open = true;
  if (element instanceof HTMLDetailsElement) element.open = true;
  element.scrollIntoView({ block: "start" });
}

function resolutionSummary(request: AdminGuidanceRequest): string {
  if (!isFormSubmissionResolved(request) || !request.resolvedAt) return "Unresolved";
  if (request.resolvedByName) {
    return `Resolved ${new Date(request.resolvedAt).toLocaleString()} by ${request.resolvedByName}`;
  }
  return "Resolved earlier";
}

export default function AdminDashboard() {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverview();
  const { data: curriculum } = useGetAdminCurriculum();
  const queryClient = useQueryClient();
  const updateNotification = useUpdateAdminNotification();
  useEffect(() => {
    if (overviewLoading || !overview) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    revealAdminHashTarget(hash);
  }, [overview, overviewLoading]);
  if (overviewLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72 rounded-xl" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>;
  }
  const portalStudents = previewableStudents({
    curriculumClients: curriculum?.clients,
    overviewUsers: overview?.users,
  });
  const platform = (overview as typeof overview & { platform?: { outstandingInvoices: number; upcomingSessions: number; newRequests: number } } | undefined)?.platform;
  const loginActivity = overview?.loginActivity ?? [];
  const guidanceRequests = overview?.guidanceRequests ?? [];
  const unresolvedRequests = unresolvedFormSubmissions(guidanceRequests);
  const resolvedRequests = guidanceRequests.filter((request) => isFormSubmissionResolved(request));
  const notifications = notificationsByNewest(overview?.notifications ?? []);
  const unreadNotifications = notifications.filter((notification) => notification.status === "unread");
  const priorNotifications = notifications.filter((notification) => notification.status !== "unread");
  const unreadList = collapsedItems(unreadNotifications, showAllNotifications);
  const unreadCount = unreadNotifications.length;
  const priorCount = priorNotifications.length;
  const activeNotifications = unreadList.visible;
  const applyNotificationStatus = (notificationId: string, status: "unread" | "read" | "dismissed") => {
    updateNotification.mutate(
      { notificationId, data: { status } },
      {
        onSuccess: (updated) =>
          queryClient.setQueryData<AdminOverviewWithPlatform>(getGetAdminOverviewQueryKey(), (current) =>
            current
              ? { ...current, notifications: current.notifications.map((item) => (item.id === updated.id ? updated : item)) }
              : current,
          ),
      },
    );
  };
  const administrators = (overview?.users ?? []).filter((user) => user.role === "administrator");
  const accessConflicts = overview?.accessConflicts ?? [];
  const latestLogin = loginActivity[0];
  const upcomingSessions = (curriculum?.sessions ?? [])
    .filter((session) => new Date(session.dateTime).getTime() >= Date.now() && isLiveListedSession(session))
    .sort((left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime());
  const visibleUpcomingSessions = disclosedSessions(upcomingSessions, showAllSessions);
  const newRequestCount = platform?.newRequests ?? guidanceRequests.filter((request) => request.status === "new").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16 animate-in fade-in">
      <UnresolvedFormSubmissionsAlert requests={unresolvedRequests} />
      <div>
        <p className="mb-2 text-sm font-medium text-primary">Accepted Admissions · administrator</p>
        <h1 className="text-3xl font-bold tracking-tight">Admin overview</h1>
        <p className="mt-1 text-muted-foreground">
          {upcomingSessions.length} upcoming session{upcomingSessions.length === 1 ? "" : "s"}
          {" · "}
          {newRequestCount} new guidance request{newRequestCount === 1 ? "" : "s"}
        </p>
      </div>

      {accessConflicts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 text-amber-950" role="alert">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" /> Portal access configuration warning
            </CardTitle>
            <CardDescription className="text-amber-900">
              Some identities appear in more than one role allowlist. Sign-in will be denied for each overlap until the configuration is corrected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {accessConflicts.map((conflict, index) => (
                <div key={`${conflict.roleCategories.join("-")}-${index}`} className="rounded-lg border border-amber-300/80 bg-white/60 px-3 py-2 text-sm">
                  <span className="font-medium">Conflicting role categories:</span>{" "}
                  {conflict.roleCategories.map((category) => accessRoleCategoryLabels[category] ?? category).join(", ")}
                </div>
              ))}
            </div>
            <p className="text-sm font-medium">Remove each overlapping identity from all but one role allowlist, then retry access.</p>
          </CardContent>
        </Card>
      )}

      <QuestionReportsQueue />

      {notifications.length > 0 && (
        <Card data-testid="card-admin-notifications">
          <CardHeader>
            <CardTitle>Assignment notifications</CardTitle>
            <CardDescription>Ownership changes addressed to you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeNotifications.length > 0 && (
              <section aria-labelledby="active-notifications-heading" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="active-notifications-heading" className="text-sm font-semibold">Needs attention</h2>
                  <Badge variant="default">{unreadCount}</Badge>
                </div>
                {activeNotifications.map((notification) => (
                  <AdminNotificationItem
                    key={notification.id}
                    notification={notification}
                    isPending={updateNotification.isPending}
                    onUpdate={(status) => applyNotificationStatus(notification.id, status)}
                  />
                ))}
                <SessionListDisclosure
                  canToggle={unreadList.canToggle}
                  expanded={showAllNotifications}
                  onToggle={() => setShowAllNotifications((value) => !value)}
                  testId="assignment-notifications-show-more"
                />
              </section>
            )}
            {priorCount > 0 && (
              <details
                className={`group${activeNotifications.length > 0 ? " border-t pt-5" : ""}`}
                aria-labelledby="prior-notifications-heading"
                data-testid="prior-notifications"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <h2 id="prior-notifications-heading" className="text-sm font-semibold">Prior notifications</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{priorCount}</Badge>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="space-y-3 pt-3">
                  {priorNotifications.map((notification) => (
                    <AdminNotificationItem
                      key={notification.id}
                      notification={notification}
                      isPending={updateNotification.isPending}
                      onUpdate={(status) => applyNotificationStatus(notification.id, status)}
                    />
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Jump to the area you need.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {operationLinks.map(({ href, title, detail, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
              <div className="flex items-start justify-between">
                <Icon className="h-5 w-5 text-primary" />
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="card-student-portals">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> Student portals
          </CardTitle>
          <CardDescription>
            Preview an existing student’s portal. New people must be provisioned under People & access before they can sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {portalStudents.map((client) => (
            <div key={client.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-muted-foreground">{client.email}</p>
              </div>
              <Button asChild size="sm">
                <Link href={`/admin/clients/${client.id}/preview`} data-testid={`link-preview-client-${client.id}`}>
                  <Eye className="mr-2 h-4 w-4" /> Preview client portal
                </Link>
              </Button>
            </div>
          ))}
          {portalStudents.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-student-portals">
              No students on file yet. Provision them under People & access, then they can sign in at /login.
            </p>
          )}
          <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="hint-michelle-provision">
            Michelle Makarem (<span className="font-medium">michaelmakarem@gmail.com</span>) must be provisioned via People & access before preview or login. There is no Clerkless demo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Upcoming sessions
              </CardTitle>
              <CardDescription>Next scheduled appointments.</CardDescription>
            </div>
            <Badge variant="secondary">{upcomingSessions.length} scheduled</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleUpcomingSessions.map((session) => (
            <div key={session.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{displaySessionTitle(session.title, session.subject)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatSessionDateTime(session)}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/tutor/sessions/${session.id}`}>Open session</Link>
              </Button>
            </div>
          ))}
          {upcomingSessions.length === 0 && (
            <p className="py-5 text-center text-sm text-muted-foreground">No upcoming sessions are scheduled.</p>
          )}
          {upcomingSessions.length > 3 && (
            <Button variant="outline" onClick={() => setShowAllSessions((value) => !value)} aria-expanded={showAllSessions}>
              {showAllSessions ? "View less" : `View more (${upcomingSessions.length - 3})`}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card id="guidance-requests" data-testid="card-guidance-requests" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" /> Guidance requests
              </CardTitle>
              <CardDescription>
                Every public Get guidance / client-request submission is saved here for follow-up, including when email is unavailable. Resolve a submission to clear its alert. Resolved submissions stay in history.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" data-testid="count-guidance-requests">{guidanceRequests.length} total</Badge>
              <Badge variant={newRequestCount > 0 ? "default" : "outline"} data-testid="count-new-guidance-requests">
                {newRequestCount} new
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {guidanceRequests.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-guidance-requests">
              No guidance requests have been submitted yet.
            </p>
          ) : (
            <>
              {unresolvedRequests.map((request) => (
                <GuidanceRequestItem key={request.id} request={request} administrators={administrators} />
              ))}
              {unresolvedRequests.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-unresolved-form-submissions">
                  No unresolved form submissions.
                </p>
              )}
              {resolvedRequests.length > 0 && (
                <details id="resolved-form-submissions" className="rounded-xl border" data-testid="resolved-form-submissions">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    Resolved history ({resolvedRequests.length})
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </summary>
                  <div className="space-y-3 border-t p-4">
                    {resolvedRequests.map((request) => (
                      <GuidanceRequestItem key={request.id} request={request} administrators={administrators} />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <LogIn className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Login activity</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {latestLogin
                  ? `Latest: ${latestLogin.userName} · ${new Date(latestLogin.signedInAt).toLocaleString()}`
                  : "No successful sign-ins have been recorded since tracking began."}
              </p>
            </div>
            <Badge variant="secondary">{loginActivity.length}</Badge>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <CardContent className="border-t px-3 py-3 sm:px-6">
            {loginActivity.length > 0 ? (
              <div className="divide-y">
                {loginActivity.map((item) => (
                  <div key={item.id} className="grid gap-1 px-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.userName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.userEmail}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Badge variant="outline" className="capitalize">{item.role}</Badge>
                      <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={new Date(item.signedInAt).toISOString()}>
                        {new Date(item.signedInAt).toLocaleString()}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-2 py-5 text-sm text-muted-foreground">Activity will appear here after each user’s next successful sign-in.</p>
            )}
          </CardContent>
        </details>
      </Card>
    </div>
  );
}

function UnresolvedFormSubmissionsAlert({ requests }: { requests: AdminGuidanceRequest[] }) {
  const queryClient = useQueryClient();
  const updateRequest = useUpdateAdminGuidanceRequest();
  const [error, setError] = useState("");
  if (requests.length === 0) return null;

  const resolve = (requestId: string) => {
    setError("");
    updateRequest.mutate(
      { requestId, data: { resolved: true } },
      {
        onSuccess: (updated) => applyGuidanceRequestUpdate(queryClient, updated),
        onError: (updateError) => {
          const detail = (updateError as { data?: { error?: string } } | null)?.data?.error;
          setError(detail || "Could not resolve this submission. Please try again.");
        },
      },
    );
  };

  return (
    <section
      role="alert"
      aria-labelledby="unresolved-form-submissions-heading"
      data-testid="alert-unresolved-form-submissions"
      className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="unresolved-form-submissions-heading" className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquareText className="h-5 w-5" />
            Unresolved form submissions
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            {requests.length} public {requests.length === 1 ? "client request is" : "client requests are"} waiting. {requests.length === 1 ? "It stays" : "They stay"} here until you resolve {requests.length === 1 ? "it" : "them"}.
          </p>
        </div>
        <Badge className="w-fit border-transparent bg-amber-500 text-amber-950 hover:bg-amber-500" data-testid="count-unresolved-form-submissions">
          {requests.length} unresolved
        </Badge>
      </div>
      <ul className="mt-4 space-y-3">
        {requests.map((request) => {
          const receivedAt = new Date(request.createdAt);
          return (
            <li key={request.id} className="rounded-xl border border-amber-300 bg-white/80 p-4 text-foreground" data-testid={`alert-form-submission-${request.id}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/admin#guidance-request-${request.id}`}
                  className="min-w-0"
                  onClick={() => revealAdminHashTarget(`guidance-request-${request.id}`)}
                  data-testid={`link-unresolved-form-submission-${request.id}`}
                >
                  <p className="font-semibold">{request.studentName}</p>
                  <p className="mt-1 text-sm">Parent {request.guardianName} · {formSubmissionSourceLabel(request.sourcePage)} · {request.serviceRequested}</p>
                  <time className="mt-1 block text-xs text-amber-800" dateTime={receivedAt.toISOString()} data-testid={`time-unresolved-form-submission-${request.id}`}>
                    Received {receivedAt.toLocaleString()}
                  </time>
                </Link>
                <Button type="button" size="sm" onClick={() => resolve(request.id)} disabled={updateRequest.isPending} data-testid={`resolve-form-submission-${request.id}`}>
                  Resolve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-sm font-medium text-destructive" data-testid="error-unresolved-form-submissions">{error}</p> : null}
    </section>
  );
}

function AdminNotificationItem({
  notification,
  isPending,
  onUpdate,
}: {
  notification: AdminNotification;
  isPending: boolean;
  onUpdate?: (status: "unread" | "read" | "dismissed") => void;
}) {
  const createdAt = new Date(notification.createdAt);
  return (
    <div className="rounded-xl border bg-muted/20 p-4" data-testid={`notification-${notification.id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{notification.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
          <time className="mt-2 block text-xs text-muted-foreground" dateTime={createdAt.toISOString()}>{createdAt.toLocaleString()}</time>
        </div>
        {onUpdate && (
          <div className="flex shrink-0 gap-2">
            {notification.status === "unread" ? (
              <>
                <Button variant="outline" size="sm" disabled={isPending} onClick={() => onUpdate("read")} data-testid={`notification-read-${notification.id}`}>Mark read</Button>
                <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onUpdate("dismissed")} data-testid={`notification-dismiss-${notification.id}`}>Dismiss</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => onUpdate("unread")} data-testid={`notification-restore-${notification.id}`}>Restore</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuidanceRequestItem({ request, administrators }: { request: AdminGuidanceRequest; administrators: AdminOverviewUsersItem[] }) {
  const receivedAt = new Date(request.createdAt);
  const receivedLabel = receivedAt.toLocaleString();
  const queryClient = useQueryClient();
  const updateRequest = useUpdateAdminGuidanceRequest();
  const [draft, setDraft] = useState<AdminGuidanceRequestUpdate>({
    status: request.status,
    assignedStaffUserId: request.assignedStaffUserId,
    followUpNotes: request.followUpNotes,
    conversionStatus: request.conversionStatus,
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft({
      status: request.status,
      assignedStaffUserId: request.assignedStaffUserId,
      followUpNotes: request.followUpNotes,
      conversionStatus: request.conversionStatus,
    });
  }, [request.assignedStaffUserId, request.conversionStatus, request.followUpNotes, request.status]);

  const hasChanges =
    draft.status !== request.status ||
    draft.assignedStaffUserId !== request.assignedStaffUserId ||
    (draft.followUpNotes ?? "") !== (request.followUpNotes ?? "") ||
    draft.conversionStatus !== request.conversionStatus;

  const save = () => {
    setMessage("");
    updateRequest.mutate(
      { requestId: request.id, data: draft },
      {
        onSuccess: (updated) => {
          applyGuidanceRequestUpdate(queryClient, updated);
          setDraft({
            status: updated.status,
            assignedStaffUserId: updated.assignedStaffUserId,
            followUpNotes: updated.followUpNotes,
            conversionStatus: updated.conversionStatus,
          });
          setMessage(
            updated.notificationDelivery?.status === "failed"
              ? "Triage details saved, but the assignment notification could not be delivered."
              : updated.notificationDelivery?.status === "sent"
                ? "Triage details saved and assignment notification sent."
                : "Triage details saved.",
          );
        },
        onError: (error) => {
          const detail = (error as { data?: { error?: string } } | null)?.data?.error;
          setMessage(detail || "Could not save triage details. Please try again.");
        },
      },
    );
  };

  const resolved = isFormSubmissionResolved(request);
  const setResolution = (nextResolved: boolean) => {
    setMessage("");
    updateRequest.mutate(
      { requestId: request.id, data: { resolved: nextResolved } },
      {
        onSuccess: (updated) => {
          applyGuidanceRequestUpdate(queryClient, updated);
          setMessage(nextResolved ? "Resolved. This submission will no longer alert." : "Reopened. This submission is alerting again.");
        },
        onError: (error) => {
          const detail = (error as { data?: { error?: string } } | null)?.data?.error;
          setMessage(detail || "Could not update resolution. Please try again.");
        },
      },
    );
  };

  return (
    <details id={`guidance-request-${request.id}`} className="group scroll-mt-24 rounded-xl border" data-testid={`details-guidance-request-${request.id}`}>
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold" data-testid={`text-guidance-request-student-${request.id}`}>{request.studentName}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{request.guardianName} · {request.serviceRequested}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={receivedAt.toISOString()} data-testid={`time-guidance-request-${request.id}`}>{receivedLabel}</time>
          <Badge variant={resolved ? "outline" : "default"} data-testid={`resolution-guidance-request-${request.id}`}>{resolved ? "Resolved" : "Unresolved"}</Badge>
          <Badge variant={request.status === "new" ? "default" : "secondary"} data-testid={`status-guidance-request-${request.id}`}>{request.status}</Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t px-4 py-4 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`resolution-panel-guidance-request-${request.id}`}>
          <div>
            <h3 className="font-semibold">{resolved ? "Resolved" : "Needs resolution"}</h3>
            <p className="mt-1 text-sm text-muted-foreground" data-testid={`text-resolution-guidance-request-${request.id}`}>{resolutionSummary(request)}</p>
          </div>
          {resolved ? (
            <Button type="button" variant="outline" onClick={() => setResolution(false)} disabled={updateRequest.isPending} data-testid={`reopen-guidance-request-${request.id}`}>
              Reopen
            </Button>
          ) : (
            <Button type="button" onClick={() => setResolution(true)} disabled={updateRequest.isPending} data-testid={`resolve-guidance-request-${request.id}`}>
              Resolve
            </Button>
          )}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <RequestField label="Parent / guardian" value={request.guardianName} testId={`text-guidance-request-guardian-${request.id}`} />
          <RequestField label="Email" value={request.email} testId={`text-guidance-request-email-${request.id}`} />
          <RequestField label="Phone" value={request.phone} testId={`text-guidance-request-phone-${request.id}`} />
          <RequestField label="Student" value={request.studentName} testId={`text-guidance-request-student-detail-${request.id}`} />
          <RequestField label="Grade or graduation year" value={request.gradeOrGraduationYear} />
          <RequestField label="Current school" value={request.currentSchool} />
          <RequestField label="Service requested" value={request.serviceRequested} />
          <RequestField label="Current SAT total" value={request.currentSatTotal} />
          <RequestField label="Current Reading/Writing" value={request.currentReadingWriting} />
          <RequestField label="Current Math" value={request.currentMath} />
          <RequestField label="Target SAT score" value={request.targetSatScore} />
          <RequestField label="Planned test date" value={request.plannedTestDate} />
          <RequestField label="Referral source" value={request.referralSource} />
          <RequestField label="Received" value={receivedLabel} />
          <RequestField label="Source page" value={request.sourcePage} />
          <RequestField label="Contact consent" value={request.consentToContact ? "Granted" : "Not granted"} />
          <RequestField label="Privacy acknowledged" value={request.privacyAcknowledged ? "Yes" : "No"} />
        </dl>
        <div className="mt-4 grid gap-4">
          <RequestField label="Goals and explanation of requested help" value={request.goals} multiline />
          <RequestField label="General scheduling availability" value={request.schedulingAvailability} multiline />
        </div>
        <div className="mt-6 rounded-xl border bg-muted/20 p-4" data-testid={`triage-guidance-request-${request.id}`}>
          <div>
            <h3 className="font-semibold">Private triage</h3>
            <p className="mt-1 text-sm text-muted-foreground">Ownership, progress, and notes are visible only to administrators.</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`request-status-${request.id}`}>Request status</Label>
              <select
                id={`request-status-${request.id}`}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminGuidanceRequest["status"] })}
                disabled={updateRequest.isPending}
              >
                {requestStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`conversion-status-${request.id}`}>Conversion status</Label>
              <select
                id={`conversion-status-${request.id}`}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.conversionStatus}
                onChange={(event) => setDraft({ ...draft, conversionStatus: event.target.value as AdminGuidanceRequest["conversionStatus"] })}
                disabled={updateRequest.isPending}
              >
                {conversionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`assigned-staff-${request.id}`}>Assigned administrator</Label>
              <select
                id={`assigned-staff-${request.id}`}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.assignedStaffUserId ?? ""}
                onChange={(event) => setDraft({ ...draft, assignedStaffUserId: event.target.value || null })}
                disabled={updateRequest.isPending}
              >
                <option value="">Unassigned</option>
                {administrators.map((administrator) => <option key={administrator.id} value={administrator.id}>{administrator.displayName}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`follow-up-notes-${request.id}`}>Private follow-up notes</Label>
              <span className="text-xs text-muted-foreground">{(draft.followUpNotes ?? "").length}/5000</span>
            </div>
            <Textarea
              id={`follow-up-notes-${request.id}`}
              rows={4}
              maxLength={5000}
              value={draft.followUpNotes ?? ""}
              onChange={(event) => setDraft({ ...draft, followUpNotes: event.target.value || null })}
              placeholder="Add contact attempts, next steps, or context for the team."
              disabled={updateRequest.isPending}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={!hasChanges || updateRequest.isPending} data-testid={`save-guidance-request-${request.id}`}>
              <Save className="mr-2 h-4 w-4" />
              {updateRequest.isPending ? "Saving…" : "Save triage"}
            </Button>
            {message && <p className="text-sm text-muted-foreground" role={message.toLowerCase().includes("could not") ? "alert" : "status"}>{message}</p>}
          </div>
        </div>
      </div>
    </details>
  );
}

function RequestField({ label, value, testId, multiline = false }: { label: string; value: string | null | undefined; testId?: string; multiline?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${multiline ? "max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3" : ""}`} data-testid={testId}>{value || "Not provided"}</dd>
    </div>
  );
}
