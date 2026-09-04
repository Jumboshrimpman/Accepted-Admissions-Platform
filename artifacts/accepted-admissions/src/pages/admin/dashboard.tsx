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
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, BookOpen, CalendarDays, ChevronDown, ClipboardList, FileText, LogIn, MessageSquareText, Save, Users, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import {
  disclosedSessions,
  displaySessionTitle,
  formatSessionDateTime,
} from "@/lib/session-display";

const operationLinks = [
  { href: "/admin/curriculum?section=people", title: "Clients & tutors", detail: "Provision tutors and students, review people, and subject access.", icon: Users },
  { href: "/admin/curriculum?section=programs", title: "Programs", detail: "Publish, archive, and update program details.", icon: BookOpen },
  { href: "/admin/curriculum?section=curriculum", title: "Curriculum", detail: "Assignments, materials, question bank, and submissions.", icon: ClipboardList },
  { href: "/admin/curriculum?section=sessions", title: "Sessions", detail: "Participants, Meet links, status, and conflicts.", icon: CalendarDays },
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

export default function AdminDashboard() {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const { data: overview, isLoading: overviewLoading } = useGetAdminOverview();
  const { data: curriculum, isLoading: curriculumLoading } = useGetAdminCurriculum();
  const queryClient = useQueryClient();
  const updateNotification = useUpdateAdminNotification();
  if (overviewLoading || curriculumLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72 rounded-xl" /><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>;
  }
  const platform = (overview as typeof overview & { platform?: { outstandingInvoices: number; upcomingSessions: number; newRequests: number } } | undefined)?.platform;
  const loginActivity = overview?.loginActivity ?? [];
  const guidanceRequests = overview?.guidanceRequests ?? [];
  const notifications = overview?.notifications ?? [];
  const activeNotifications = notifications.filter((notification) => notification.status === "unread");
  const priorNotifications = notifications.filter((notification) => notification.status !== "unread");
  const administrators = (overview?.users ?? []).filter((user) => user.role === "administrator");
  const accessConflicts = overview?.accessConflicts ?? [];
  const latestLogin = loginActivity[0];
  const statCards = [
    { label: "Programs", value: curriculum?.programs.length ?? 0, icon: BookOpen },
    { label: "Upcoming sessions", value: platform?.upcomingSessions ?? curriculum?.sessions.filter((item) => item.status === "published").length ?? 0, icon: CalendarDays },
    { label: "Open assignments", value: curriculum?.assignments.filter((item) => item.status !== "archived").length ?? 0, icon: ClipboardList },
    { label: "Outstanding invoices", value: platform?.outstandingInvoices ?? 0, icon: WalletCards },
    { label: "New guidance requests", value: platform?.newRequests ?? guidanceRequests.filter((request) => request.status === "new").length, icon: MessageSquareText },
  ];
  const upcomingSessions = (curriculum?.sessions ?? [])
    .filter((session) => new Date(session.dateTime).getTime() >= Date.now() && session.status !== "archived" && session.bookingStatus !== "cancelled")
    .sort((left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime());
  const visibleUpcomingSessions = disclosedSessions(upcomingSessions, showAllSessions);
  return <div className="mx-auto max-w-7xl space-y-7 pb-16 animate-in fade-in">
     <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-sm font-medium text-primary">Accepted Admissions · administrator</p><h1 className="text-3xl font-bold tracking-tight">Admin overview</h1><p className="mt-1 text-muted-foreground">A compact view of the learning product and the work that needs an operator.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/financials"><WalletCards className="mr-2 h-4 w-4" /> Finance</Link></Button><Button asChild variant="outline"><Link href="/admin/content"><FileText className="mr-2 h-4 w-4" /> Public content</Link></Button></div></div>
     {accessConflicts.length > 0 && <Card className="border-amber-300 bg-amber-50 text-amber-950" role="alert"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5" /> Portal access configuration warning</CardTitle><CardDescription className="text-amber-900">Some identities appear in more than one role allowlist. Sign-in will be denied for each overlap until the configuration is corrected.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="space-y-2">{accessConflicts.map((conflict, index) => <div key={`${conflict.roleCategories.join("-")}-${index}`} className="rounded-lg border border-amber-300/80 bg-white/60 px-3 py-2 text-sm"><span className="font-medium">Conflicting role categories:</span>{" "}{conflict.roleCategories.map((category) => accessRoleCategoryLabels[category] ?? category).join(", ")}</div>)}</div><p className="text-sm font-medium">Remove each overlapping identity from all but one role allowlist, then retry access.</p></CardContent></Card>}
     {notifications.length > 0 && <Card data-testid="card-admin-notifications"><CardHeader><CardTitle>Assignment notifications</CardTitle><CardDescription>Ownership changes addressed to you, with unresolved alerts kept at the top.</CardDescription></CardHeader><CardContent className="space-y-5">
       {activeNotifications.length > 0 && <section aria-labelledby="active-notifications-heading" className="space-y-3">
         <div className="flex items-center justify-between gap-3"><h2 id="active-notifications-heading" className="text-sm font-semibold">Needs attention</h2><Badge variant="default">{activeNotifications.length}</Badge></div>
         {activeNotifications.map((notification) => <AdminNotificationItem key={notification.id} notification={notification} isPending={updateNotification.isPending} onUpdate={(status) => updateNotification.mutate({ notificationId: notification.id, data: { status } }, { onSuccess: (updated) => queryClient.setQueryData<AdminOverviewWithPlatform>(getGetAdminOverviewQueryKey(), (current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === updated.id ? updated : item) } : current) })} />)}
       </section>}
       {priorNotifications.length > 0 && <section aria-labelledby="prior-notifications-heading" className="space-y-3 border-t pt-5">
         <div className="flex items-center justify-between gap-3"><h2 id="prior-notifications-heading" className="text-sm font-semibold">Prior notifications</h2><Badge variant="secondary">{priorNotifications.length}</Badge></div>
          {priorNotifications.map((notification) => <AdminNotificationItem key={notification.id} notification={notification} isPending={updateNotification.isPending} onUpdate={(status) => updateNotification.mutate({ notificationId: notification.id, data: { status } }, { onSuccess: (updated) => queryClient.setQueryData<AdminOverviewWithPlatform>(getGetAdminOverviewQueryKey(), (current) => current ? { ...current, notifications: current.notifications.map((item) => item.id === updated.id ? updated : item) } : current) })} />)}
       </section>}
     </CardContent></Card>}
     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{statCards.map(({ label, value, icon: Icon }) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-primary" /></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Operations</CardTitle><CardDescription>Jump directly to a focused area instead of scanning one long workspace.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{operationLinks.map(({ href, title, detail, icon: Icon }) => <Link key={href} href={href} className="group rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"><div className="flex items-start justify-between"><Icon className="h-5 w-5 text-primary" /><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></Link>)}</CardContent></Card>
    <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Upcoming sessions</CardTitle><CardDescription>The next scheduled appointments across authorized programs.</CardDescription></div><Badge variant="secondary">{upcomingSessions.length} scheduled</Badge></div></CardHeader><CardContent className="space-y-3">{visibleUpcomingSessions.map((session) => <div key={session.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{displaySessionTitle(session.title, session.subject)}</p><p className="mt-1 text-sm text-muted-foreground">{formatSessionDateTime(session)}</p></div><Button asChild variant="outline" size="sm"><Link href="/admin/curriculum?section=sessions">Manage session</Link></Button></div>)}{upcomingSessions.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">No upcoming sessions are scheduled.</p>}{upcomingSessions.length > 3 && <Button variant="outline" onClick={() => setShowAllSessions((value) => !value)} aria-expanded={showAllSessions}>{showAllSessions ? "View less" : `View more (${upcomingSessions.length - 3})`}</Button>}</CardContent></Card>
     <Card data-testid="card-guidance-requests">
       <CardHeader>
         <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
           <div>
             <CardTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" /> Guidance requests</CardTitle>
             <CardDescription>Private submissions from the public guidance form, newest first.</CardDescription>
           </div>
           <div className="flex flex-wrap gap-2">
             <Badge variant="secondary" data-testid="count-guidance-requests">{guidanceRequests.length} total</Badge>
             <Badge variant={guidanceRequests.some((request) => request.status === "new") ? "default" : "outline"} data-testid="count-new-guidance-requests">{platform?.newRequests ?? guidanceRequests.filter((request) => request.status === "new").length} new</Badge>
           </div>
         </div>
       </CardHeader>
       <CardContent className="space-y-3">
         {guidanceRequests.length === 0 ? (
           <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-guidance-requests">No guidance requests have been submitted yet.</p>
         ) : (
            guidanceRequests.map((request) => <GuidanceRequestItem key={request.id} request={request} administrators={administrators} />)
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
  </div>;
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
        {onUpdate && <div className="flex shrink-0 gap-2">
          {notification.status === "unread" ? (
            <>
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => onUpdate("read")} data-testid={`notification-read-${notification.id}`}>Mark read</Button>
              <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onUpdate("dismissed")} data-testid={`notification-dismiss-${notification.id}`}>Dismiss</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => onUpdate("unread")} data-testid={`notification-restore-${notification.id}`}>Restore</Button>
          )}
        </div>}
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
          queryClient.setQueryData<AdminOverviewWithPlatform>(
            getGetAdminOverviewQueryKey(),
            (current) => {
              if (!current) return current;
              return {
                ...current,
                guidanceRequests: current.guidanceRequests.map((item) =>
                  item.id === updated.id ? updated : item
                ),
                platform: current.platform
                  ? {
                      ...current.platform,
                      newRequests: current.guidanceRequests.reduce(
                        (count, item) =>
                          count + ((item.id === updated.id ? updated.status : item.status) === "new" ? 1 : 0),
                        0,
                      ),
                    }
                  : undefined,
              };
            },
          );
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

  return (
    <details className="group rounded-xl border" data-testid={`details-guidance-request-${request.id}`}>
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold" data-testid={`text-guidance-request-student-${request.id}`}>{request.studentName}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{request.guardianName} · {request.serviceRequested}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={receivedAt.toISOString()} data-testid={`time-guidance-request-${request.id}`}>{receivedLabel}</time>
          <Badge variant={request.status === "new" ? "default" : "secondary"} data-testid={`status-guidance-request-${request.id}`}>{request.status}</Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t px-4 py-4 sm:px-6">
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