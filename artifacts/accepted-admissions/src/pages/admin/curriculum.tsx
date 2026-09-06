import { useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminCurriculumQueryKey,
  getListAdminAccessGrantsQueryKey,
  getListQuestionBankQueryKey,
  useCreateAdminAccessGrant,
  useCreateAdminLibraryAsset,
  useCreateAdminSession,
  useGetAdminCurriculum,
  useGetAdminOverview,
  useListAdminAccessGrants,
  useListQuestionBank,
  useUpdateAdminAccessGrant,
  useUpdateAdminLibraryAsset,
  useUpdateAdminSession,
  useAttachSessionLibraryAsset,
  useGetAssignment,
  useGetAdaptiveCurriculum,
  useListSatBankCollections,
  useUpdateAdminAssignment,
  type AdminOverviewUsersItem,
} from "@workspace/api-client-react";
import type {
  AdminAccessGrant,
  AdminAccessGrantInput,
  AdminAssignment,
  AdminCurriculum,
  AdminSession,
  AdminSessionInput,
  AdminSessionUpdate,
  AdminSubmission,
  CurriculumLibraryAsset,
  CurriculumLibraryAssetInput,
  ProvisionableRoleCategory,
} from "@workspace/api-client-react";
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Edit3, ExternalLink, Eye, GraduationCap, Library, Mail, Plus, Sparkles, UserPlus, Users, Video } from "lucide-react";
import { AssignBankPreworkControl, SatBankPanel } from "@/pages/admin/sat-bank-panel";
import { MissedOnPreworkList } from "@/components/missed-prework-list";
import {
  BANK_QUIZ_EMPTY_STATE,
  assignableBankQuizzes,
  bankQuizOptionLabel,
  sessionPreworkQuizzes,
} from "@/lib/assignable-bank-quizzes";
import { questionStatusHelp, questionStatusLabel } from "@/lib/question-status";
import { filterPeopleByQuery, mergeSessionPeople, personOptionLabel } from "@/lib/session-people";
import { useCloneAdminAssignmentToSession } from "@/lib/clone-admin-assignment";
import { previewableStudents } from "@/lib/previewable-students";
import { TEMPLATE_DRAFTS_BANK_HINT } from "@/lib/template-drafts";
import { QuizWorkspace } from "@/pages/admin/quiz-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  displaySessionTitle,
  formatSessionDateTime,
  sessionSubjectLabel,
} from "@/lib/session-display";
import { SessionJoinActions } from "@/components/session-join-actions";
import {
  adminCurriculumHref,
  readAdminCurriculumSearch,
  type AdminCurriculumSection,
  type AdminCurriculumTab,
} from "@/lib/admin-curriculum-location";

type Section = AdminCurriculumSection;

const sectionLinks: Array<{ id: Section; label: string; detail: string; icon: typeof Users }> = [
  { id: "people", label: "People", detail: "Provision and preview", icon: Users },
  { id: "sessions", label: "Sessions", detail: "Assign pre-work, Meet", icon: CalendarDays },
  { id: "curriculum", label: "Quizzes", detail: "Questions, assign, results", icon: ClipboardList },
];

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string; conflicts?: string[] } } | null)?.data;
  if (!data) return "The operation could not be completed.";
  return [data.error, ...(data.conflicts ?? [])].filter(Boolean).join(" ");
}

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published" || status === "active" || status === "approved") return "default";
  if (status === "archived" || status === "rejected") return "outline";
  return "secondary";
}

export default function AdminCurriculum() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { section } = readAdminCurriculumSearch(location, searchString);
  const [search, setSearch] = useState("");
  const curriculum = useGetAdminCurriculum();
  const overview = useGetAdminOverview();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAdminCurriculumQueryKey() });
  const previewStudents = previewableStudents({
    curriculumClients: curriculum.data?.clients,
    overviewUsers: overview.data?.users,
  });

  if (curriculum.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72 rounded-xl" /><Skeleton className="h-12 w-full rounded-xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  }
  if (curriculum.error || !curriculum.data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Card>
          <CardContent className="p-8">
            <p className="font-semibold">Curriculum operations are unavailable.</p>
            <p className="mt-2 text-sm text-muted-foreground">{errorText(curriculum.error)}</p>
          </CardContent>
        </Card>
        <ClientPreviewCard students={previewStudents} />
      </div>
    );
  }

  const data = curriculum.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16 animate-in fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin" className="hover:text-primary">Admin overview</Link>
            <ChevronRight className="h-4 w-4" />
            <span>Operations</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">People, sessions, and quizzes</h1>
          <p className="mt-1 text-muted-foreground">
            Open a quiz to edit its questions, assign it to a session, then review the attempt. Preview a student portal from People or Overview.
          </p>
        </div>
        <Input className="w-full sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this section…" aria-label="Search operations" />
      </div>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-3" aria-label="Admin operation sections">
        {sectionLinks.map(({ id, label, detail, icon: Icon }) => (
          <Button key={id} variant={section === id ? "default" : "ghost"} className="h-auto flex-col items-start justify-start gap-1 px-3 py-2 text-left" asChild>
            <Link href={adminCurriculumHref({ section: id })} data-testid={`admin-section-link-${id}`}>
              <span className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4" /> {label}</span>
              <span className={`text-xs font-normal ${section === id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{detail}</span>
            </Link>
          </Button>
        ))}
      </nav>

      {section === "people" && (
        <div data-testid="admin-section-people">
          <PeopleSection data={data} search={search} previewStudents={previewStudents} />
        </div>
      )}
      {section === "curriculum" && (
        <div data-testid="admin-section-curriculum">
          <CurriculumSection data={data} search={search} onChanged={refresh} />
        </div>
      )}
      {section === "sessions" && (
        <div data-testid="admin-section-sessions">
          <SessionsSection
            data={data}
            search={search}
            onChanged={refresh}
            overviewUsers={overview.data?.users ?? []}
          />
        </div>
      )}
    </div>
  );
}

function ClientPreviewCard({
  students,
}: {
  students: Array<{ id: string; name: string; email: string }>;
}) {
  return (
    <Card data-testid="card-student-portals">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" /> Client preview
        </CardTitle>
        <CardDescription>
          Open a student portal from here even if quizzes or sessions fail to load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {students.map((student) => (
          <div key={student.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{student.name}</p>
              <p className="text-sm text-muted-foreground">{student.email}</p>
            </div>
            <Button asChild size="sm">
              <Link href={`/admin/clients/${student.id}/preview`} data-testid={`link-preview-client-${student.id}`}>
                <Eye className="mr-2 h-3.5 w-3.5" /> Preview client portal
              </Link>
            </Button>
          </div>
        ))}
        {students.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No students on file yet. Provision them under People, then invite the same email in Clerk.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PeopleSection({
  data,
  search,
  previewStudents,
}: {
  data: AdminCurriculum;
  search: string;
  previewStudents: Array<{ id: string; name: string; email: string }>;
}) {
  const queryClient = useQueryClient();
  const grantsQuery = useListAdminAccessGrants();
  const createGrant = useCreateAdminAccessGrant();
  const updateGrant = useUpdateAdminAccessGrant();
  const [draft, setDraft] = useState<AdminAccessGrantInput>({
    email: "",
    displayName: "",
    roleCategory: "student",
    clerkUserId: null,
    notes: null,
  });
  const [message, setMessage] = useState("");
  const term = search.trim().toLowerCase();
  const tutors = data?.tutors.filter((item) => !term || `${item.name} ${item.email} ${item.subjects.join(" ")}`.toLowerCase().includes(term)) ?? [];
  const clients = data?.clients.filter((item) => !term || `${item.name} ${item.email}`.toLowerCase().includes(term)) ?? [];
  const grants = (grantsQuery.data?.grants ?? []).filter(
    (grant) =>
      !term ||
      `${grant.displayName} ${grant.email} ${grant.roleCategory}`.toLowerCase().includes(term),
  );

  const refreshPeople = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminCurriculumQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAdminAccessGrantsQueryKey() });
  };

  const roleLabel = (category: ProvisionableRoleCategory) => {
    switch (category) {
      case "student":
        return "Student";
      case "sat_tutor":
        return "SAT tutor";
      case "english_tutor":
        return "IELTS tutor";
      case "tutor":
        return "Tutor (all subjects)";
    }
  };

  const provision = () => {
    const payload: AdminAccessGrantInput = {
      email: draft.email.trim(),
      displayName: draft.displayName.trim(),
      roleCategory: draft.roleCategory,
      clerkUserId: draft.clerkUserId?.trim() ? draft.clerkUserId.trim() : null,
      notes: draft.notes?.trim() ? draft.notes.trim() : null,
    };
    createGrant.mutate(
      { data: payload },
      {
        onSuccess: (grant) => {
          setMessage(`${grant.displayName} provisioned as ${roleLabel(grant.roleCategory)}. They can sign in once invited in Clerk.`);
          setDraft({
            email: "",
            displayName: "",
            roleCategory: "student",
            clerkUserId: null,
            notes: null,
          });
          refreshPeople();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };

  const revoke = (grant: AdminAccessGrant) => {
    updateGrant.mutate(
      { grantId: grant.id, data: { active: false } },
      {
        onSuccess: () => {
          setMessage(`${grant.displayName} access revoked.`);
          refreshPeople();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };

  const reactivate = (grant: AdminAccessGrant) => {
    updateGrant.mutate(
      {
        grantId: grant.id,
        data: {
          active: true,
          roleCategory: grant.roleCategory,
          displayName: grant.displayName,
        },
      },
      {
        onSuccess: () => {
          setMessage(`${grant.displayName} access restored.`);
          refreshPeople();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <ClientPreviewCard students={previewStudents.filter((student) => !term || `${student.name} ${student.email}`.toLowerCase().includes(term))} />
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Provision people
          </CardTitle>
          <CardDescription>
            Grant portal access as a student or tutor. This does not send Clerk invitations — invite the same email in Clerk before they can sign in or be previewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Display name">
              <Input
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                placeholder="Full name"
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="person@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Role">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={draft.roleCategory}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    roleCategory: event.target.value as ProvisionableRoleCategory,
                  })
                }
                aria-label="Provision role"
              >
                <option value="student">Student</option>
                <option value="sat_tutor">SAT tutor</option>
                <option value="english_tutor">IELTS tutor</option>
                <option value="tutor">Tutor (all subjects)</option>
              </select>
            </Field>
            <Field label="Clerk user ID (optional)">
              <Input
                value={draft.clerkUserId ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    clerkUserId: event.target.value || null,
                  })
                }
                placeholder="user_…"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input
              value={draft.notes ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  notes: event.target.value || null,
                })
              }
              placeholder="Cohort, referral, or onboarding note"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={provision}
              disabled={
                createGrant.isPending ||
                draft.displayName.trim().length < 1 ||
                draft.email.trim().length < 3 ||
                !draft.email.includes("@")
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Provision access
            </Button>
            <p className="text-sm text-muted-foreground">
              After provisioning, invite them in Clerk with the same email, then they sign in at /login.
            </p>
            <p className="text-sm text-muted-foreground" data-testid="hint-michelle-provision">
              Michelle Makarem (michaelmakarem@gmail.com) is not available as a Clerkless demo. Provision her here, send a Clerk invite, then use Preview client portal.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Access grants
          </CardTitle>
          <CardDescription>
            Database-backed portal grants for tutors and students. Revoking removes portal access unless the identity remains on an environment allowlist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {grantsQuery.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
          {grantsQuery.error && (
            <p className="text-sm text-destructive">{errorText(grantsQuery.error)}</p>
          )}
          {grants.map((grant) => (
            <div key={grant.id} className="rounded-xl border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{grant.displayName}</p>
                    <Badge variant={grant.active ? "default" : "outline"}>
                      {grant.active ? "Active" : "Revoked"}
                    </Badge>
                    <Badge variant="secondary">{roleLabel(grant.roleCategory)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{grant.email}</p>
                  {grant.clerkUserId && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{grant.clerkUserId}</p>
                  )}
                  {grant.notes && <p className="mt-2 text-sm text-muted-foreground">{grant.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {grant.active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateGrant.isPending}
                      onClick={() => revoke(grant)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateGrant.isPending}
                      onClick={() => reactivate(grant)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!grantsQuery.isLoading && grants.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No matching access grants yet. Provision someone above to get started.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Clients / students
            </CardTitle>
            <CardDescription>
              Relationships and assigned tutors. Use Client preview above to open a portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {clients.map((client) => (
              <div key={client.id} className="rounded-xl border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Student</Badge>
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assigned tutors
                  </p>
                  {client.assignedTutors.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {client.assignedTutors.map((tutor) => (
                        <Badge
                          key={`${tutor.id}-${tutor.courseId}-${tutor.subject}`}
                          variant="secondary"
                        >
                          {tutor.name} · {sessionSubjectLabel(tutor.subject)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No tutor relationship is provisioned yet.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {clients.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching clients.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Tutors
            </CardTitle>
            <CardDescription>
              Subject access, approved clients, and activity. Compensation is never returned by this operational view.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tutors.map((tutor) => (
              <div key={tutor.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{tutor.name}</p>
                    <p className="text-sm text-muted-foreground">{tutor.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {tutor.subjects.map((subject) => (
                        <Badge key={subject} variant="secondary">
                          {sessionSubjectLabel(subject)}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tutor.sessionCount} total sessions · {tutor.upcomingSessionCount} upcoming
                    </p>
                  </div>
                  <Badge variant={tutor.active ? "default" : "outline"}>
                    {tutor.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assigned clients
                  </p>
                  {tutor.assignedStudents.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tutor.assignedStudents.map((student) => (
                        <Badge
                          key={`${student.id}-${student.courseId}-${student.subject}`}
                          variant="secondary"
                        >
                          {student.name} · {sessionSubjectLabel(student.subject)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No client relationship is provisioned yet.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {tutors.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching tutors.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CurriculumSection({ data, search, onChanged }: { data: AdminCurriculum; search: string; onChanged: () => void }) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const { tab, quizId, collectionId } = readAdminCurriculumSearch(location, searchString);
  const setTab = (next: string) => {
    setLocation(
      adminCurriculumHref({
        section: "curriculum",
        tab: next as AdminCurriculumTab,
        quiz: next === "quizzes" ? quizId : null,
        collection: next === "sat-bank" ? collectionId : null,
      }),
    );
  };
  const term = search.trim().toLowerCase();
  const assignments = data.assignments.filter((item) => !term || `${item.title} ${item.programTitle} ${item.subject}`.toLowerCase().includes(term));
  const submissions = data.submissions.filter((item) => !term || `${item.assignmentTitle} ${item.studentName}`.toLowerCase().includes(term));
  return <Tabs value={tab} onValueChange={setTab} className="space-y-5">
    <div>
      <h2 className="text-xl font-semibold">Quiz workspace</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A quiz is the unit of work: open it, add questions, assign it to a session, then review results.
      </p>
    </div>
    <ol className="grid gap-2 rounded-2xl border bg-muted/20 p-3 text-sm sm:grid-cols-4" data-testid="curriculum-bank-path" aria-label="Curriculum path">
      <li className="rounded-xl bg-background p-3"><span className="font-semibold">1. Quiz</span><p className="mt-1 text-muted-foreground">Open or create the quiz.</p></li>
      <li className="rounded-xl bg-background p-3"><span className="font-semibold">2. Questions</span><p className="mt-1 text-muted-foreground">Add or generate questions on that quiz.</p></li>
      <li className="rounded-xl bg-background p-3"><span className="font-semibold">3. Assign</span><p className="mt-1 text-muted-foreground">Clone it onto a session as pre-work.</p></li>
      <li className="rounded-xl bg-background p-3"><span className="font-semibold">4. Results</span><p className="mt-1 text-muted-foreground">Review the student attempt.</p></li>
    </ol>
    <TabsList className="h-auto flex-wrap justify-start">
      <TabsTrigger value="quizzes"><ClipboardList className="mr-2 h-4 w-4" /> Quizzes</TabsTrigger>
      <TabsTrigger value="questions"><Sparkles className="mr-2 h-4 w-4" /> Questions</TabsTrigger>
      <TabsTrigger value="sat-bank"><BookOpen className="mr-2 h-4 w-4" /> SAT/PSAT bank</TabsTrigger>
      <TabsTrigger value="library"><Library className="mr-2 h-4 w-4" /> Resources</TabsTrigger>
      <TabsTrigger value="submissions"><CheckCircle2 className="mr-2 h-4 w-4" /> Submissions</TabsTrigger>
    </TabsList>
    <TabsContent value="quizzes" data-testid="admin-tab-quizzes"><QuizWorkspace data={data} assignments={assignments} submissions={submissions} onChanged={onChanged} /></TabsContent>
    <TabsContent value="questions" data-testid="admin-tab-questions"><QuestionBankManager data={data} onChanged={onChanged} /></TabsContent>
    <TabsContent value="sat-bank" data-testid="admin-tab-sat-bank">
      <SatBankPanel
        collectionId={collectionId}
        onOpenCollection={(id) =>
          setLocation(
            adminCurriculumHref({
              section: "curriculum",
              tab: "sat-bank",
              collection: id,
            }),
          )
        }
      />
    </TabsContent>
    <TabsContent value="library" data-testid="admin-tab-library"><LibraryManager assets={data.libraryAssets} sessions={data.sessions} search={search} onChanged={onChanged} /></TabsContent>
    <TabsContent value="submissions" data-testid="admin-tab-submissions"><Card><CardHeader><CardTitle>Student submissions</CardTitle><CardDescription>Right/wrong results stay available for session review. Open an attempt from Sessions or the tutor session page.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Student</th><th className="p-3">Quiz</th><th className="p-3">Score</th><th className="p-3">Review</th><th className="p-3">Submitted</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.attemptId} className="border-b"><td className="p-3 font-medium">{item.studentName}</td><td className="p-3">{item.assignmentTitle}</td><td className="p-3">{item.score}% <span className="text-muted-foreground">· {item.mistakeCount} missed</span></td><td className="p-3"><Button asChild size="sm" variant="outline"><Link href={`/tutor/attempts/${item.attemptId}`}>Open review</Link></Button></td><td className="p-3 text-muted-foreground">{new Date(item.submittedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{submissions.length === 0 && <Empty text="No matching submissions." />}</div></CardContent></Card></TabsContent>
  </Tabs>;
}

function QuestionBankManager({ data, onChanged }: { data: AdminCurriculum; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState(data.programs[0]?.id ?? "");
  const questionParams = { courseId };
  const { data: questions = [], isLoading } = useListQuestionBank(questionParams, {
    query: {
      enabled: Boolean(courseId),
      queryKey: getListQuestionBankQueryKey(questionParams),
    },
  });
  const bankQuizzes = data.assignments.filter(
    (item) => item.courseId === courseId && item.sessionId == null && item.status !== "archived",
  );
  const refreshQuestions = () => {
    queryClient.invalidateQueries({ queryKey: getListQuestionBankQueryKey(questionParams) });
    onChanged();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Question bank</h3>
          <p className="text-sm text-muted-foreground">{TEMPLATE_DRAFTS_BANK_HINT}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Draft means not on a quiz yet. Ready for quiz means it sits on one quiz. Open a quiz to add or edit questions.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Program">
            <select
              aria-label="Question bank program"
              className="h-10 min-w-56 rounded-md border bg-background px-3 text-sm"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {data.programs.map((program) => (
                <option key={program.id} value={program.id}>{program.title}</option>
              ))}
            </select>
          </Field>
          <Button asChild variant="outline">
            <Link
              href={adminCurriculumHref({
                section: "curriculum",
                tab: "quizzes",
                quiz: bankQuizzes[0]?.id ?? null,
              })}
            >
              Open a quiz to generate
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Skill</th>
              <th className="p-3">Prompt</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => (
              <tr key={question.id} className="border-b" data-testid={`question-row-${question.id}`}>
                <td className="p-3 font-medium">{question.skill}</td>
                <td className="p-3 text-muted-foreground">{question.prompt.slice(0, 120)}</td>
                <td className="p-3">
                  <Badge variant={question.reviewStatus === "approved" || question.reviewStatus === "reviewed" ? "default" : "outline"}>
                    {questionStatusLabel(question.reviewStatus)}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{questionStatusHelp(question.reviewStatus)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading questions…</p> : null}
        {!isLoading && questions.length === 0 ? (
          <Empty text="No questions yet. Open a quiz and generate drafts there." />
        ) : null}
      </div>
    </div>
  );
}

function SessionsSection({
  data,
  search,
  onChanged,
  overviewUsers,
}: {
  data: AdminCurriculum;
  search: string;
  onChanged: () => void;
  overviewUsers: AdminOverviewUsersItem[];
}) {
  const create = useCreateAdminSession();
  const update = useUpdateAdminSession();
  const bankCollections = useListSatBankCollections();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"upcoming" | "conflicts" | "all">("upcoming");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<AdminSessionInput>({ courseId: data.programs[0]?.id ?? "", dateTime: new Date().toISOString(), timezone: "America/New_York", subject: data.programs[0]?.subject ?? "", durationMinutes: 60, status: "draft", bookingStatus: "confirmed", clientUserId: data.clients[0]?.id ?? null, tutorUserId: data.tutors[0]?.id ?? null });
  const term = search.trim().toLowerCase();
  const now = Date.now();
  const matched = data.sessions.filter((item) => !term || `${item.title} ${item.programTitle} ${item.subject} ${item.student?.name ?? ""} ${item.tutor?.name ?? ""}`.toLowerCase().includes(term));
  const sessions = matched.filter((item) => {
    if (filter === "conflicts") return item.conflict;
    if (filter === "upcoming") {
      return new Date(item.dateTime).getTime() >= now && item.status !== "archived" && item.bookingStatus !== "cancelled";
    }
    return true;
  });
  const conflictCount = matched.filter((item) => item.conflict).length;
  const students = mergeSessionPeople(data.clients, overviewUsers, "student", { assignedTutors: [] });
  const tutors = mergeSessionPeople(data.tutors, overviewUsers, "tutor", {
    subjects: [] as string[],
    active: true,
    calendarStatus: "unavailable" as const,
    sessionCount: 0,
    upcomingSessionCount: 0,
    assignedStudents: [],
  });
  const selectedTutor = tutors.find((tutor) => tutor.id === draft.tutorUserId);
  const calendarDisconnected = Boolean(selectedTutor && selectedTutor.calendarStatus !== "connected");
  const reconnectMailto = selectedTutor && "email" in selectedTutor && selectedTutor.email
    ? `mailto:${selectedTutor.email}?subject=${encodeURIComponent("Reconnect Google Calendar (optional)")}&body=${encodeURIComponent("You can reconnect Google Calendar from the tutor dashboard. Scheduling assign does not require calendar or full portal provisioning.")}`
    : "";
  const reset = () => setDraft({ courseId: data.programs[0]?.id ?? "", dateTime: new Date().toISOString(), timezone: "America/New_York", subject: data.programs[0]?.subject ?? "", durationMinutes: 60, status: "draft", bookingStatus: "confirmed", clientUserId: data.clients[0]?.id ?? null, tutorUserId: data.tutors[0]?.id ?? null });
  const save = () => {
    const payload = { ...draft, dateTime: new Date(draft.dateTime).toISOString() };
    if (editing) update.mutate({ sessionId: editing, data: payload as AdminSessionUpdate }, { onSuccess: () => { setEditing(null); setMessage("Session saved."); onChanged(); }, onError: (error) => setMessage(errorText(error)) });
    else create.mutate({ data: payload }, { onSuccess: () => { setShowCreate(false); reset(); setMessage("Session created."); onChanged(); }, onError: (error) => setMessage(errorText(error) + " Check the conflict card before trying again.") });
  };
  const form = <Card className="border-primary/30"><CardContent className="grid gap-4 p-5"><div className="grid gap-3 md:grid-cols-3"><Field label="Program"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}</select></Field><PersonSelect label="Student" ariaLabel="Session student" value={draft.clientUserId} people={students} onChange={(id) => setDraft({ ...draft, clientUserId: id })} /><PersonSelect label="Tutor" ariaLabel="Session tutor" value={draft.tutorUserId} people={tutors.map((tutor) => ({ ...tutor, name: `${tutor.name} — Calendar ${tutor.calendarStatus}` }))} onChange={(id) => setDraft({ ...draft, tutorUserId: id })} /></div>{selectedTutor && <div className={`rounded-xl border p-3 text-sm ${calendarDisconnected ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`} role="status"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Google Calendar: {selectedTutor.calendarStatus}</p><p className="mt-1">{calendarDisconnected ? "Calendar is not connected. You can still assign this student and tutor for scheduling. This does not grant curriculum-bank admin or portal access." : "The tutor calendar is connected. Scheduling assign still does not grant curriculum-bank admin."}</p></div>{calendarDisconnected && reconnectMailto ? <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-400 bg-white"><a href={reconnectMailto}><Mail className="mr-2 h-4 w-4" />Email tutor to reconnect</a></Button> : null}</div></div>}<div className="grid gap-3 md:grid-cols-3"><Field label="Subject"><Input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field><Field label="Start time"><Input type="datetime-local" value={dateInput(draft.dateTime)} onChange={(event) => setDraft({ ...draft, dateTime: new Date(event.target.value).toISOString() })} /></Field><Field label="Duration (minutes)"><Input type="number" min="15" max="480" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} /></Field></div><div className="grid gap-3 md:grid-cols-3"><Field label="Timezone"><Input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></Field><Field label="Session state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.status ?? "draft"} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminSessionInput["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="completed">Completed</option><option value="archived">Archived</option></select></Field><Field label="Booking state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.bookingStatus ?? "confirmed"} onChange={(event) => setDraft({ ...draft, bookingStatus: event.target.value as AdminSessionInput["bookingStatus"] })}><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option></select></Field></div><p className="text-sm text-muted-foreground">The appointment name is generated from the assigned student, subject, and tutor. Scheduling assign is allowed even if the person is not fully provisioned for the portal.</p><div className="flex gap-2"><Button onClick={save} disabled={create.isPending || update.isPending}>{editing ? "Save session" : "Create session"}</Button><Button variant="ghost" onClick={() => { setEditing(null); setShowCreate(false); }}>Cancel</Button></div></CardContent></Card>;
  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sessions & meetings</h2>
          <p className="text-sm text-muted-foreground">Assign an existing bank quiz as pre-session homework. Session pages stay light — review the attempt, don’t build quizzes here.</p>
        </div>
        <Button onClick={() => { reset(); setEditing(null); setShowCreate(true); }}><Plus className="mr-2 h-4 w-4" /> New session</Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Session filters">
        {([
          ["upcoming", `Upcoming (${matched.filter((item) => new Date(item.dateTime).getTime() >= now && item.status !== "archived" && item.bookingStatus !== "cancelled").length})`],
          ["conflicts", `Conflicts (${conflictCount})`],
          ["all", `All (${matched.length})`],
        ] as const).map(([id, label]) => (
          <Button key={id} size="sm" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
            {label}
          </Button>
        ))}
      </div>
      {(showCreate || editing) && form}
      <div className="grid gap-3">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            assignments={data.assignments}
            submissions={data.submissions}
            libraryAssets={data.libraryAssets ?? []}
            bankCollections={bankCollections.data ?? []}
            onChanged={onChanged}
            onEdit={() => {
              setEditing(session.id);
              setShowCreate(false);
              setDraft({
                courseId: session.courseId,
                dateTime: session.dateTime,
                timezone: session.timezone,
                subject: session.subject,
                durationMinutes: session.durationMinutes,
                status: session.status,
                bookingStatus: session.bookingStatus as AdminSessionInput["bookingStatus"],
                clientUserId: session.student?.id ?? null,
                tutorUserId: session.tutor?.id ?? null,
              });
            }}
          />
        ))}
      </div>
      {sessions.length === 0 && (
        <Empty text={filter === "upcoming" ? "No upcoming sessions. Switch to All or create a session." : "No matching sessions."} />
      )}
    </div>
  );
}

function SessionCard({
  session,
  assignments,
  submissions,
  libraryAssets,
  bankCollections,
  onChanged,
  onEdit,
}: {
  session: AdminSession;
  assignments: AdminAssignment[];
  submissions: AdminSubmission[];
  libraryAssets: CurriculumLibraryAsset[];
  bankCollections: Array<{ id: string; title: string; questionCount: number }>;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const prework = sessionPreworkQuizzes(assignments, session);
  const reviews = submissions.filter((item) => prework.some((quiz) => quiz.id === item.assignmentId));
  return (
    <Card className={session.conflict ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{displaySessionTitle(session.title, session.subject)}</h3>
              <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
              <Badge variant="outline" className="capitalize">{session.bookingStatus.replaceAll("_", " ")}</Badge>
              {session.conflict && (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Conflict
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm">
              <span className="font-medium">{session.student?.name ?? "Unassigned student"}</span>
              {" · "}
              <span>{session.tutor?.name ?? "Unassigned tutor"}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatSessionDateTime(session)} · {session.durationMinutes} min · {session.programTitle}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 className="mr-2 h-4 w-4" /> Edit
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.meetingUrl ? (
            <SessionJoinActions meetingUrl={session.meetingUrl} calendarEventUrl={session.calendarEventUrl} meetingLabel="Join Meet" />
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Video className="mr-1 h-3 w-3" /> No Meet link
            </Badge>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/tutor/sessions/${session.id}`}>Open session review</Link>
          </Button>
        </div>
        {session.conflict && (
          <div className="rounded-lg border border-destructive/30 bg-background p-3 text-sm">
            <p className="font-medium text-destructive">Resolve before assigning this time</p>
            {session.conflictWith.map((item) => (
              <p key={item} className="mt-1 text-muted-foreground">
                {item}
              </p>
            ))}
          </div>
        )}
        <div className="rounded-lg border bg-muted/20 p-3" data-testid={`session-prework-${session.id}`}>
          <p className="text-sm font-medium">Pre-session quiz</p>
          {prework.length > 0 ? (
            <div className="mt-2 space-y-2">
              {prework.map((quiz) => (
                <div key={quiz.id} className="rounded-md bg-background px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{quiz.title}</p>
                      <p className="text-xs text-muted-foreground">{quiz.questionCount} questions · {quiz.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reviews.filter((item) => item.assignmentId === quiz.id).map((item) => (
                        <Button key={item.attemptId} asChild size="sm" variant="secondary">
                          <Link href={`/tutor/attempts/${item.attemptId}`}>Review {item.studentName}</Link>
                        </Button>
                      ))}
                      {reviews.filter((item) => item.assignmentId === quiz.id).length === 0 && (
                        <span className="text-xs text-muted-foreground">No attempt yet</span>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/curriculum?section=curriculum&tab=quizzes&quiz=${quiz.id}`}>Open quiz</Link>
                      </Button>
                    </div>
                  </div>
                  <PreworkQuestionPrompts assignmentId={quiz.id} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No quiz attached. Assign one from the bank below.</p>
          )}
          <AssignPreworkControl
            session={session}
            assignments={assignments}
            existing={prework}
            onChanged={onChanged}
          />
          <AssignBankPreworkControl
            sessionId={session.id}
            collections={bankCollections}
            onChanged={onChanged}
          />
        </div>
        <SessionMissedPrework
          sessionId={session.id}
          reviewHref={reviews[0] ? `/tutor/attempts/${reviews[0].attemptId}` : null}
          submissionMistakes={reviews.flatMap((item) =>
            Array.from({ length: item.mistakeCount }, (_, index) => ({
              skill: `${item.studentName} missed`,
              prompt: index === 0 ? `${item.mistakeCount} incorrect on ${item.assignmentTitle}` : "",
            })),
          )}
        />
        <details className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Attach library material</summary>
          <AttachLibraryControl sessionId={session.id} assets={libraryAssets} onChanged={onChanged} />
        </details>
      </CardContent>
    </Card>
  );
}

function PreworkQuestionPrompts({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading } = useGetAssignment(assignmentId);
  const prompts = data?.questions ?? [];
  return (
    <details className="mt-2" data-testid={`prework-questions-${assignmentId}`}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        View questions
      </summary>
      {isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading questions…</p>
      ) : prompts.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No questions on this quiz yet.</p>
      ) : (
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          {prompts.map((question) => (
            <li key={question.id}>{question.prompt}</li>
          ))}
        </ol>
      )}
    </details>
  );
}

function SessionMissedPrework({
  sessionId,
  reviewHref,
  submissionMistakes = [],
}: {
  sessionId: string;
  reviewHref: string | null;
  submissionMistakes?: Array<{ skill: string; prompt?: string }>;
}) {
  const { data: adaptive } = useGetAdaptiveCurriculum(sessionId);
  const mistakes = (adaptive?.mistakes ?? []).map((item) => ({
    skill: item.skill,
    prompt: "prompt" in item ? String(item.prompt ?? "") : "",
  }));
  return (
    <MissedOnPreworkList
      mistakes={mistakes.some((item) => item.prompt || item.skill) ? mistakes : submissionMistakes}
      reviewHref={reviewHref}
    />
  );
}

function PersonSelect({
  label,
  ariaLabel,
  value,
  people,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string | null | undefined;
  people: Array<{ id: string; name: string; email?: string | null }>;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = filterPeopleByQuery(people, query);
  const selected = people.find((person) => person.id === value);
  const options =
    query.trim()
      ? visible
      : selected && !visible.some((person) => person.id === selected.id)
        ? [selected, ...visible]
        : visible;
  return (
    <Field label={label}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or email"
        aria-label={`${ariaLabel} search`}
      />
      <select
        aria-label={ariaLabel}
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Unassigned</option>
        {options.map((person) => (
          <option key={person.id} value={person.id}>
            {personOptionLabel(person)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AssignPreworkControl({
  session,
  assignments,
  existing,
  onChanged,
}: {
  session: AdminSession;
  assignments: AdminAssignment[];
  existing: AdminAssignment[];
  onChanged: () => void;
}) {
  const cloneAssignment = useCloneAdminAssignmentToSession();
  const updateAssignment = useUpdateAdminAssignment();
  const replacing = existing.length > 0;
  const assignable = assignableBankQuizzes(assignments, session, {
    includeAssignedTitles: replacing,
  });
  const [assignmentId, setAssignmentId] = useState(assignable[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selectedId = assignable.some((item) => item.id === assignmentId)
    ? assignmentId
    : (assignable[0]?.id ?? "");
  const archiveExisting = (then?: () => void) => {
    const next = (index: number) => {
      if (index >= existing.length) {
        then?.();
        return;
      }
      updateAssignment.mutate(
        { assignmentId: existing[index]!.id, data: { status: "archived" } },
        {
          onSuccess: () => next(index + 1),
          onError: (error) => setMessage(errorText(error)),
        },
      );
    };
    next(0);
  };
  const cloneSelected = () => {
    cloneAssignment.mutate(
      {
        assignmentId: selectedId,
        sessionId: session.id,
      },
      {
        onSuccess: () => {
          setMessage(
            replacing
              ? "Replaced pre-work. The previous session copy was archived; the bank quiz is unchanged."
              : "Cloned as pre-session homework. The original bank quiz is unchanged.",
          );
          onChanged();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };
  if (assignable.length === 0 && existing.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {BANK_QUIZ_EMPTY_STATE}
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      {assignable.length > 0 ? (
        <select
          aria-label="Quiz to assign as pre-session work"
          className="h-9 max-w-md rounded-md border bg-background px-2 text-xs"
          value={selectedId}
          onChange={(event) => setAssignmentId(event.target.value)}
        >
          {assignable.map((item) => (
            <option key={item.id} value={item.id}>
              {bankQuizOptionLabel(item)}
            </option>
          ))}
        </select>
      ) : null}
      {assignable.length > 0 ? (
        <Button
          size="sm"
          data-testid={`assign-prework-${session.id}`}
          disabled={cloneAssignment.isPending || updateAssignment.isPending || !selectedId}
          onClick={() => (replacing ? archiveExisting(cloneSelected) : cloneSelected())}
        >
          {replacing ? "Replace pre-work" : "Assign as pre-work"}
        </Button>
      ) : null}
      {existing.length > 0 ? (
        <Button
          size="sm"
          variant="outline"
          data-testid={`remove-prework-${session.id}`}
          disabled={cloneAssignment.isPending || updateAssignment.isPending}
          onClick={() =>
            archiveExisting(() => {
              setMessage("Removed pre-work from this session. The session copy is archived.");
              onChanged();
            })
          }
        >
          Remove pre-work
        </Button>
      ) : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function AttachLibraryControl({
  sessionId,
  assets,
  onChanged,
}: {
  sessionId: string;
  assets: CurriculumLibraryAsset[];
  onChanged: () => void;
}) {
  const attach = useAttachSessionLibraryAsset();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [message, setMessage] = useState("");
  if (assets.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Add a practice test or mini-section in the Library tab, then attach it here.
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        aria-label="Library asset to attach"
        className="h-9 max-w-md rounded-md border bg-background px-2 text-xs"
        value={assetId}
        onChange={(event) => setAssetId(event.target.value)}
      >
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.title} · {asset.kind.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={attach.isPending || !assetId}
        onClick={() =>
          attach.mutate(
            { sessionId, data: { libraryAssetId: assetId } },
            {
              onSuccess: () => {
                setMessage("Attached to this session dashboard.");
                onChanged();
              },
              onError: (error) => setMessage(errorText(error)),
            },
          )
        }
      >
        Attach to this session
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function LibraryManager({
  assets,
  sessions,
  search,
  onChanged,
}: {
  assets: CurriculumLibraryAsset[];
  sessions: AdminSession[];
  search: string;
  onChanged: () => void;
}) {
  const create = useCreateAdminLibraryAsset();
  const update = useUpdateAdminLibraryAsset();
  const attach = useAttachSessionLibraryAsset();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CurriculumLibraryAssetInput>({
    title: "",
    kind: "practice_test",
    description: "",
    resourceUrl: "",
    body: "",
  });
  const [attachSessionId, setAttachSessionId] = useState(sessions[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const term = search.trim().toLowerCase();
  const visible = assets.filter(
    (item) => !term || `${item.title} ${item.kind} ${item.description ?? ""}`.toLowerCase().includes(term),
  );
  const reset = () =>
    setDraft({ title: "", kind: "practice_test", description: "", resourceUrl: "", body: "" });
  const save = () => {
    const payload = {
      ...draft,
      description: draft.description?.trim() || null,
      resourceUrl: draft.resourceUrl?.trim() || null,
      body: draft.body?.trim() || null,
    };
    if (editing) {
      update.mutate(
        { assetId: editing, data: payload },
        {
          onSuccess: () => {
            setEditing(null);
            setMessage("Library asset saved.");
            onChanged();
          },
          onError: (error) => setMessage(errorText(error)),
        },
      );
      return;
    }
    create.mutate(
      { data: payload },
      {
        onSuccess: () => {
          setShowCreate(false);
          reset();
          setMessage("Library asset created.");
          onChanged();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };
  const form = (
    <Card className="border-primary/30">
      <CardContent className="grid gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title">
            <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          <Field label="Kind">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as CurriculumLibraryAssetInput["kind"] })
              }
            >
              <option value="practice_test">Full SAT practice test</option>
              <option value="mini_section">Mini-section</option>
              <option value="resource">Resource</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={draft.description ?? ""}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="What students and tutors should do with this block."
          />
        </Field>
        <Field label="Shared resource URL (PDF or licensed test)">
          <Input
            value={draft.resourceUrl ?? ""}
            onChange={(event) => setDraft({ ...draft, resourceUrl: event.target.value })}
            placeholder="https://"
          />
        </Field>
        <Field label="Notes shown on the session dashboard">
          <Textarea value={draft.body ?? ""} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={save} disabled={create.isPending || update.isPending || draft.title.trim().length < 2}>
            {editing ? "Save asset" : "Create asset"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(null);
              setShowCreate(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Curriculum library</h2>
          <p className="text-sm text-muted-foreground">
            Reusable SAT tests and mini-sections. Attach a block to a session so students and tutors see it on that dashboard.
          </p>
        </div>
        <Button
          onClick={() => {
            reset();
            setEditing(null);
            setShowCreate(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New library asset
        </Button>
      </div>
      {(showCreate || editing) && form}
      <div className="grid gap-3">
        {visible.map((asset) => (
          <Card key={asset.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{asset.title}</h3>
                  <Badge variant="outline">{asset.kind.replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{asset.description || "No description yet."}</p>
                {asset.resourceUrl ? (
                  <a
                    href={asset.resourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Open resource
                  </a>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(asset.id);
                    setShowCreate(false);
                    setDraft({
                      title: asset.title,
                      kind: asset.kind,
                      description: asset.description ?? "",
                      resourceUrl: asset.resourceUrl ?? "",
                      body: asset.body ?? "",
                    });
                  }}
                >
                  <Edit3 className="mr-2 h-4 w-4" /> Edit
                </Button>
                {sessions.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label={`Attach ${asset.title} to session`}
                      className="h-9 max-w-xs rounded-md border bg-background px-2 text-xs"
                      value={attachSessionId}
                      onChange={(event) => setAttachSessionId(event.target.value)}
                    >
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {formatSessionDateTime(session)} · {displaySessionTitle(session.title, session.subject)}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={attach.isPending || !attachSessionId}
                      onClick={() =>
                        attach.mutate(
                          { sessionId: attachSessionId, data: { libraryAssetId: asset.id } },
                          {
                            onSuccess: () => {
                              setMessage(`Attached ${asset.title} to the selected session.`);
                              onChanged();
                            },
                            onError: (error) => setMessage(errorText(error)),
                          },
                        )
                      }
                    >
                      Attach to session
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {visible.length === 0 && <Empty text="No library assets yet. Create a practice test or mini-section to attach to a session date." />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
