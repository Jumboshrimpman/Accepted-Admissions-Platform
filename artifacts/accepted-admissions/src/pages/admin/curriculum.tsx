import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminCurriculumQueryKey,
  getListAdminAccessGrantsQueryKey,
  useCreateAdminAccessGrant,
  useCreateAdminAssignment,
  useCreateAdminLibraryAsset,
  useCreateAdminSession,
  useGetAdminCurriculum,
  useListAdminAccessGrants,
  useUpdateAdminAccessGrant,
  useUpdateAdminAssignment,
  useUpdateAdminLibraryAsset,
  useUpdateAdminProgram,
  useUpdateAdminSession,
  useUpdateCurriculumBlock,
  useAttachSessionLibraryAsset,
} from "@workspace/api-client-react";
import type {
  AdminAccessGrant,
  AdminAccessGrantInput,
  AdminAssignment,
  AdminAssignmentInput,
  AdminAssignmentUpdate,
  AdminCurriculum,
  AdminProgram,
  AdminProgramUpdate,
  AdminSession,
  AdminSessionInput,
  AdminSessionUpdate,
  CurriculumLibraryAsset,
  CurriculumLibraryAssetInput,
  ProvisionableRoleCategory,
} from "@workspace/api-client-react";
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Edit3, ExternalLink, FileText, GraduationCap, Library, Mail, Plus, Save, UserPlus, Users } from "lucide-react";
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

type Section = "roadmap" | "people" | "programs" | "curriculum" | "sessions";

const sectionLinks: Array<{ id: Section; label: string; icon: typeof Users }> = [
  { id: "roadmap", label: "Curriculum builder", icon: CalendarDays },
  { id: "people", label: "Clients & tutors", icon: Users },
  { id: "programs", label: "Programs", icon: GraduationCap },
  { id: "curriculum", label: "Content tools", icon: Library },
  { id: "sessions", label: "Session controls", icon: CalendarDays },
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
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const initialSection = (params.get("section") as Section | null) ?? "roadmap";
  const [section, setSection] = useState<Section>(sectionLinks.some((item) => item.id === initialSection) ? initialSection : "roadmap");
  const [search, setSearch] = useState("");
  const curriculum = useGetAdminCurriculum();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAdminCurriculumQueryKey() });

  const selectSection = (next: Section) => {
    setSection(next);
    setLocation(`/admin/curriculum?section=${next}`);
  };

  if (curriculum.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-10 w-72 rounded-xl" /><Skeleton className="h-12 w-full rounded-xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  }
  if (curriculum.error || !curriculum.data) {
    return <Card><CardContent className="p-8"><p className="font-semibold">Curriculum operations are unavailable.</p><p className="mt-2 text-sm text-muted-foreground">{errorText(curriculum.error)}</p></CardContent></Card>;
  }

  const data = curriculum.data;
  const filtered = (value: string) => value.toLowerCase().includes(search.trim().toLowerCase());

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16 animate-in fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin" className="hover:text-primary">Admin overview</Link>
            <ChevronRight className="h-4 w-4" />
            <span>Operations</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI-native curriculum</h1>
          <p className="mt-1 text-muted-foreground">
            Build the Fall plan on the platform: diagnostic, weekly mini-sections, live session focus, and submission alerts in one workspace.
          </p>
        </div>
        <Input className="w-full sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this section…" aria-label="Search operations" />
      </div>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-5" aria-label="Admin operation sections">
        {sectionLinks.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant={section === id ? "default" : "ghost"} className="justify-start gap-2" onClick={() => selectSection(id)}>
            <Icon className="h-4 w-4" /> {label}
          </Button>
        ))}
      </nav>

      {section === "roadmap" && <RoadmapSection data={data} />}
      {section === "people" && <PeopleSection data={data} search={search} />}
      {section === "programs" && <ProgramsSection programs={data.programs.filter((item) => filtered(item.title) || filtered(item.subject) || filtered(item.term))} onSaved={refresh} />}
      {section === "curriculum" && <CurriculumSection data={data} search={search} onChanged={refresh} />}
      {section === "sessions" && <SessionsSection data={data} search={search} onChanged={refresh} />}
    </div>
  );
}

const fallDateOrder = [
  "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23",
  "2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20",
  "2026-11-27", "2026-12-04", "2026-12-11", "2026-12-18",
];
function PeopleSection({ data, search }: { data: AdminCurriculum; search: string }) {
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
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Provision people
          </CardTitle>
          <CardDescription>
            Quickly grant portal access as a student or tutor. Administrator access stays environment-only. This does not send Clerk invitations.
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
              Identity and approved tutor relationships. Financial details stay in administrator-only finance.
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
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/clients/${client.id}/preview`}>
                        <ExternalLink className="mr-2 h-3.5 w-3.5" /> View client
                      </Link>
                    </Button>
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

function ProgramsSection({ programs, onSaved }: { programs: AdminProgram[]; onSaved: () => void }) {
  const update = useUpdateAdminProgram();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminProgramUpdate>({});
  const [message, setMessage] = useState("");
  const save = (program: AdminProgram) => update.mutate({ programId: program.id, data: draft }, { onSuccess: () => { setEditing(null); setMessage(`${program.title} saved.`); onSaved(); }, onError: (error) => setMessage(errorText(error)) });
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}
    {programs.map((program) => editing === program.id ? <Card key={program.id} className="border-primary/30"><CardContent className="grid gap-4 p-5"><div className="grid gap-3 md:grid-cols-3"><Field label="Program title"><Input value={draft.title ?? program.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field><Field label="Subject"><Input value={draft.subject ?? program.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field><Field label="Term"><Input value={draft.term ?? program.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} /></Field></div><Field label="Goal summary"><Textarea value={draft.goalSummary ?? program.goalSummary ?? ""} onChange={(event) => setDraft({ ...draft, goalSummary: event.target.value || null })} /></Field><div className="grid gap-3 md:grid-cols-3"><Field label="Meet link"><Input value={draft.meetUrl ?? program.meetUrl ?? ""} onChange={(event) => setDraft({ ...draft, meetUrl: event.target.value || null })} /></Field><Field label="Drive link"><Input value={draft.driveUrl ?? program.driveUrl ?? ""} onChange={(event) => setDraft({ ...draft, driveUrl: event.target.value || null })} /></Field><Field label="Publication state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.status ?? program.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminProgramUpdate["status"] })}><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></select></Field></div><div className="flex gap-2"><Button onClick={() => save(program)} disabled={update.isPending}><Save className="mr-2 h-4 w-4" /> Save program</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div></CardContent></Card> : <Card key={program.id}><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{program.title}</h2><Badge variant={statusVariant(program.status)}>{program.status}</Badge><Badge variant="outline">{program.subject}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{program.goalSummary || "No goal summary yet."}</p><p className="mt-2 text-xs text-muted-foreground">{program.sessionCount} sessions · {program.completedSessionCount} completed · {program.term}</p></div><Button variant="outline" onClick={() => { setEditing(program.id); setDraft({}); }}><Edit3 className="mr-2 h-4 w-4" /> Edit</Button></CardContent></Card>)}
    {programs.length === 0 && <Empty text="No matching programs." />}
  </div>;
}

function CurriculumSection({ data, search, onChanged }: { data: AdminCurriculum; search: string; onChanged: () => void }) {
  const [tab, setTab] = useState("assignments");
  const term = search.trim().toLowerCase();
  const assignments = data.assignments.filter((item) => !term || `${item.title} ${item.programTitle} ${item.subject}`.toLowerCase().includes(term));
  const submissions = data.submissions.filter((item) => !term || `${item.assignmentTitle} ${item.studentName}`.toLowerCase().includes(term));
  return <Tabs value={tab} onValueChange={setTab} className="space-y-5">
    <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="assignments"><ClipboardList className="mr-2 h-4 w-4" /> Assignments</TabsTrigger><TabsTrigger value="library"><Library className="mr-2 h-4 w-4" /> Library</TabsTrigger><TabsTrigger value="materials"><FileText className="mr-2 h-4 w-4" /> Materials</TabsTrigger><TabsTrigger value="questions"><Library className="mr-2 h-4 w-4" /> Question bank</TabsTrigger><TabsTrigger value="submissions"><CheckCircle2 className="mr-2 h-4 w-4" /> Submissions</TabsTrigger></TabsList>
    <TabsContent value="assignments"><AssignmentManager data={data} assignments={assignments} onChanged={onChanged} /></TabsContent>
    <TabsContent value="library"><LibraryManager assets={data.libraryAssets} sessions={data.sessions} search={search} onChanged={onChanged} /></TabsContent>
    <TabsContent value="materials"><MaterialsManager data={data} onChanged={onChanged} /></TabsContent>
    <TabsContent value="questions"><div className="grid gap-4 md:grid-cols-2">{data.questionStatus.map((item) => <Card key={item.subject}><CardHeader className="pb-3"><CardTitle className="text-base">{item.subject}</CardTitle><CardDescription>{item.total} total question-bank items</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="secondary">{item.approved} approved</Badge><Badge variant="outline">{item.draft} draft</Badge><Badge variant="outline">{item.rejected} rejected</Badge></CardContent></Card>)}{data.questionStatus.length === 0 && <Empty text="No question-bank items yet." />}</div></TabsContent>
    <TabsContent value="submissions"><Card><CardHeader><CardTitle>Student submissions</CardTitle><CardDescription>Review status, scores, and mistake counts without exposing financial data.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="p-3">Student</th><th className="p-3">Assignment</th><th className="p-3">Score</th><th className="p-3">Review</th><th className="p-3">Submitted</th></tr></thead><tbody>{submissions.map((item) => <tr key={item.attemptId} className="border-b"><td className="p-3 font-medium">{item.studentName}</td><td className="p-3">{item.assignmentTitle}</td><td className="p-3">{item.score}% <span className="text-muted-foreground">· {item.mistakeCount} missed</span></td><td className="p-3"><Badge variant={statusVariant(item.reviewStatus)}>{item.reviewStatus}</Badge></td><td className="p-3 text-muted-foreground">{new Date(item.submittedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{submissions.length === 0 && <Empty text="No matching submissions." />}</div></CardContent></Card></TabsContent>
  </Tabs>;
}

function AssignmentManager({ data, assignments, onChanged }: { data: AdminCurriculum; assignments: AdminAssignment[]; onChanged: () => void }) {
  const create = useCreateAdminAssignment();
  const update = useUpdateAdminAssignment();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AdminAssignmentInput>({ courseId: data.programs[0]?.id ?? "", title: "", subject: data.programs[0]?.subject ?? "", instructions: "", deliveryPhase: "before_session", timeLimitMinutes: 30, maxAttempts: 1, status: "draft", sessionId: null, deadline: null });
  const [message, setMessage] = useState("");
  const reset = () => setDraft({ courseId: data.programs[0]?.id ?? "", title: "", subject: data.programs[0]?.subject ?? "", instructions: "", deliveryPhase: "before_session", timeLimitMinutes: 30, maxAttempts: 1, status: "draft", sessionId: null, deadline: null });
  const save = () => {
    const payload = { ...draft, deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null };
    if (editing) update.mutate({ assignmentId: editing, data: payload as AdminAssignmentUpdate }, { onSuccess: () => { setEditing(null); setMessage("Assignment saved."); onChanged(); }, onError: (error) => setMessage(errorText(error)) });
    else create.mutate({ data: payload }, { onSuccess: () => { setShowCreate(false); reset(); setMessage("Assignment created."); onChanged(); }, onError: (error) => setMessage(errorText(error)) });
  };
  const form = <Card className="border-primary/30"><CardContent className="grid gap-4 p-5"><div className="grid gap-3 md:grid-cols-3"><Field label="Program"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}</select></Field><Field label="Session (optional)"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.sessionId ?? ""} onChange={(event) => setDraft({ ...draft, sessionId: event.target.value || null })}><option value="">Program-level assignment</option>{data.sessions.filter((session) => session.courseId === draft.courseId).map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select></Field><Field label="Phase"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.deliveryPhase} onChange={(event) => setDraft({ ...draft, deliveryPhase: event.target.value as AdminAssignmentInput["deliveryPhase"] })}><option value="before_session">Before session</option><option value="during_session">During session</option></select></Field></div><div className="grid gap-3 md:grid-cols-2"><Field label="Title"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field><Field label="Subject"><Input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field></div><Field label="Instructions / explanation"><Textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Explain the task and what the learner should demonstrate." /></Field><div className="grid gap-3 md:grid-cols-4"><Field label="Due date"><Input type="datetime-local" value={dateInput(draft.deadline)} onChange={(event) => setDraft({ ...draft, deadline: toIso(event.target.value) })} /></Field><Field label="Time limit (minutes)"><Input type="number" min="1" value={draft.timeLimitMinutes} onChange={(event) => setDraft({ ...draft, timeLimitMinutes: Number(event.target.value) })} /></Field><Field label="Max attempts"><Input type="number" min="1" value={draft.maxAttempts ?? 1} onChange={(event) => setDraft({ ...draft, maxAttempts: Number(event.target.value) })} /></Field><Field label="Publication state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.status ?? "draft"} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminAssignmentInput["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="completed">Completed</option><option value="archived">Archived</option></select></Field></div><div className="flex gap-2"><Button onClick={save} disabled={create.isPending || update.isPending || draft.title.trim().length < 2 || draft.instructions.trim().length < 1}>{editing ? "Save assignment" : "Create assignment"}</Button><Button variant="ghost" onClick={() => { setEditing(null); setShowCreate(false); }}>Cancel</Button></div></CardContent></Card>;
  return <div className="space-y-4">{message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}<div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Assignments</h2><p className="text-sm text-muted-foreground">Create, publish, archive, and attach work to a program session.</p></div><Button onClick={() => { reset(); setEditing(null); setShowCreate(true); }}><Plus className="mr-2 h-4 w-4" /> New assignment</Button></div>{(showCreate || editing) && form}<div className="grid gap-3">{assignments.map((assignment) => <Card key={assignment.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{assignment.title}</h3><Badge variant={statusVariant(assignment.status)}>{assignment.status}</Badge><Badge variant="outline">{assignment.deliveryPhase.replace("_", " ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{assignment.programTitle}{assignment.sessionTitle ? ` · ${assignment.sessionTitle}` : ""} · {assignment.subject}</p><p className="mt-2 line-clamp-2 text-sm">{assignment.instructions}</p><p className="mt-2 text-xs text-muted-foreground">{assignment.questionCount} questions · {assignment.submissionCount} submissions · due {assignment.deadline ? new Date(assignment.deadline).toLocaleString() : "not set"}</p></div><Button variant="outline" size="sm" onClick={() => { setEditing(assignment.id); setShowCreate(false); setDraft({ courseId: assignment.courseId, sessionId: assignment.sessionId, deliveryPhase: assignment.deliveryPhase, title: assignment.title, subject: assignment.subject, instructions: assignment.instructions, status: assignment.status, deadline: assignment.deadline, timeLimitMinutes: assignment.timeLimitMinutes, maxAttempts: assignment.maxAttempts }); }}><Edit3 className="mr-2 h-4 w-4" /> Edit</Button></CardContent></Card>)}</div>{assignments.length === 0 && <Empty text="No matching assignments." />}</div>;
}

function MaterialsManager({ data, onChanged }: { data: AdminCurriculum; onChanged: () => void }) {
  const update = useUpdateCurriculumBlock();
  return <Card><CardHeader><CardTitle>Session materials</CardTitle><CardDescription>Review each block's publication state and audience. Changes are audited and server-authorized.</CardDescription></CardHeader><CardContent className="space-y-3">{data.blocks.map((block) => <div key={block.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap gap-2"><Badge variant="secondary">{block.kind}</Badge><Badge variant="outline">{block.visibility}</Badge><Badge variant={statusVariant(block.status)}>{block.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{String(block.config.text ?? block.config.title ?? "Configured curriculum material")} · session {block.sessionId.slice(0, 8)}</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label={`Visibility for ${block.kind}`} className="h-9 rounded-md border bg-background px-2 text-xs" value={block.visibility} disabled={update.isPending} onChange={(event) => update.mutate({ blockId: block.id, data: { visibility: event.target.value as "student" | "tutor" | "both" } }, { onSuccess: onChanged })}><option value="student">Student</option><option value="tutor">Tutor</option><option value="both">Both</option></select><Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ blockId: block.id, data: { status: block.status === "published" ? "draft" : "published" } }, { onSuccess: onChanged })}>{block.status === "published" ? "Unpublish" : "Publish"}</Button><Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={update.isPending} onClick={() => update.mutate({ blockId: block.id, data: { status: block.status === "archived" ? "draft" : "archived" } }, { onSuccess: onChanged })}><Archive className="mr-1 h-3 w-3" /> {block.status === "archived" ? "Restore" : "Archive"}</Button></div></div>)}{data.blocks.length === 0 && <Empty text="No session materials yet." />}</CardContent></Card>;
}

function SessionsSection({ data, search, onChanged }: { data: AdminCurriculum; search: string; onChanged: () => void }) {
  const create = useCreateAdminSession();
  const update = useUpdateAdminSession();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<AdminSessionInput>({ courseId: data.programs[0]?.id ?? "", dateTime: new Date().toISOString(), timezone: "America/New_York", subject: data.programs[0]?.subject ?? "", durationMinutes: 60, status: "draft", bookingStatus: "confirmed", clientUserId: data.clients[0]?.id ?? null, tutorUserId: data.tutors[0]?.id ?? null });
  const term = search.trim().toLowerCase();
  const sessions = data.sessions.filter((item) => !term || `${item.title} ${item.programTitle} ${item.subject} ${item.student?.name ?? ""} ${item.tutor?.name ?? ""}`.toLowerCase().includes(term));
  const selectedTutor = data.tutors.find((tutor) => tutor.id === draft.tutorUserId);
  const calendarBlocked = Boolean(selectedTutor && selectedTutor.calendarStatus !== "connected");
  const reconnectMailto = selectedTutor
    ? `mailto:${selectedTutor.email}?subject=${encodeURIComponent("Reconnect Google Calendar before session assignment")}&body=${encodeURIComponent(`Please sign in to Accepted Admissions and reconnect Google Calendar from your tutor dashboard before this session is assigned.`)}`
    : "";
  const reset = () => setDraft({ courseId: data.programs[0]?.id ?? "", dateTime: new Date().toISOString(), timezone: "America/New_York", subject: data.programs[0]?.subject ?? "", durationMinutes: 60, status: "draft", bookingStatus: "confirmed", clientUserId: data.clients[0]?.id ?? null, tutorUserId: data.tutors[0]?.id ?? null });
  const save = () => {
    const payload = { ...draft, dateTime: new Date(draft.dateTime).toISOString() };
    if (editing) update.mutate({ sessionId: editing, data: payload as AdminSessionUpdate }, { onSuccess: () => { setEditing(null); setMessage("Session saved."); onChanged(); }, onError: (error) => setMessage(errorText(error)) });
    else create.mutate({ data: payload }, { onSuccess: () => { setShowCreate(false); reset(); setMessage("Session created."); onChanged(); }, onError: (error) => setMessage(errorText(error) + " Check the conflict card before trying again.") });
  };
  const form = <Card className="border-primary/30"><CardContent className="grid gap-4 p-5"><div className="grid gap-3 md:grid-cols-3"><Field label="Program"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.title}</option>)}</select></Field><Field label="Student"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.clientUserId ?? ""} onChange={(event) => setDraft({ ...draft, clientUserId: event.target.value || null })}><option value="">Unassigned</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Tutor"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.tutorUserId ?? ""} onChange={(event) => setDraft({ ...draft, tutorUserId: event.target.value || null })}><option value="">Unassigned</option>{data.tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name} — Calendar {tutor.calendarStatus}</option>)}</select></Field></div>{selectedTutor && <div className={`rounded-xl border p-3 text-sm ${calendarBlocked ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`} role={calendarBlocked ? "alert" : "status"}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Google Calendar: {selectedTutor.calendarStatus}</p><p className="mt-1">{calendarBlocked ? selectedTutor.calendarStatus === "unavailable" ? "Google Calendar is currently unavailable. The tutor must reconnect Google Calendar from their tutor dashboard before this session can be assigned." : "This tutor must reconnect Google Calendar from their tutor dashboard before this session can be assigned." : "The tutor calendar is connected and will be checked again before assignment."}</p></div>{calendarBlocked && <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-400 bg-white"><a href={reconnectMailto}><Mail className="mr-2 h-4 w-4" />Email tutor to reconnect</a></Button>}</div></div>}<div className="grid gap-3 md:grid-cols-3"><Field label="Subject"><Input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field><Field label="Start time"><Input type="datetime-local" value={dateInput(draft.dateTime)} onChange={(event) => setDraft({ ...draft, dateTime: new Date(event.target.value).toISOString() })} /></Field><Field label="Duration (minutes)"><Input type="number" min="15" max="480" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} /></Field></div><div className="grid gap-3 md:grid-cols-3"><Field label="Timezone"><Input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></Field><Field label="Session state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.status ?? "draft"} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminSessionInput["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="completed">Completed</option><option value="archived">Archived</option></select></Field><Field label="Booking state"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={draft.bookingStatus ?? "confirmed"} onChange={(event) => setDraft({ ...draft, bookingStatus: event.target.value as AdminSessionInput["bookingStatus"] })}><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option></select></Field></div><p className="text-sm text-muted-foreground">The appointment name is generated from the assigned student, subject, and tutor.</p><div className="flex gap-2"><Button onClick={save} disabled={create.isPending || update.isPending || calendarBlocked}>{editing ? "Save session" : "Create session"}</Button><Button variant="ghost" onClick={() => { setEditing(null); setShowCreate(false); }}>Cancel</Button></div></CardContent></Card>;
  return <div className="space-y-4">{message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}<div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Session operations</h2><p className="text-sm text-muted-foreground">Upcoming and completed sessions with privacy-safe scheduling details.</p></div><Button onClick={() => { reset(); setEditing(null); setShowCreate(true); }}><Plus className="mr-2 h-4 w-4" /> New session</Button></div>{(showCreate || editing) && form}<div className="grid gap-3">{sessions.map((session) => <SessionCard key={session.id} session={session} libraryAssets={data.libraryAssets} onChanged={onChanged} onEdit={() => { setEditing(session.id); setShowCreate(false); setDraft({ courseId: session.courseId, dateTime: session.dateTime, timezone: session.timezone, subject: session.subject, durationMinutes: session.durationMinutes, status: session.status, bookingStatus: session.bookingStatus as AdminSessionInput["bookingStatus"], clientUserId: session.student?.id ?? null, tutorUserId: session.tutor?.id ?? null }); }} />)}</div>{sessions.length === 0 && <Empty text="No matching sessions." />}</div>;
}

function SessionCard({
  session,
  libraryAssets,
  onChanged,
  onEdit,
}: {
  session: AdminSession;
  libraryAssets: CurriculumLibraryAsset[];
  onChanged: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className={session.conflict ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{displaySessionTitle(session.title, session.subject)}</h3>
              <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
              {session.conflict && (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Conflict
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatSessionDateTime(session)} · {session.durationMinutes} min
            </p>
            <p className="mt-1 text-sm">
              {session.programTitle} · {sessionSubjectLabel(session.subject)}
            </p>
            <div className="mt-3">
              <SessionJoinActions meetingUrl={session.meetingUrl} calendarEventUrl={session.calendarEventUrl} />
            </div>
            {session.conflict && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-background p-3 text-sm">
                <p className="font-medium text-destructive">Resolve before assigning this time</p>
                {session.conflictWith.map((item) => (
                  <p key={item} className="mt-1 text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            )}
            <AttachLibraryControl sessionId={session.id} assets={libraryAssets} onChanged={onChanged} />
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 className="mr-2 h-4 w-4" /> Edit / archive
          </Button>
        </div>
      </CardContent>
    </Card>
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
        <Field label="Shared resource URL (Drive, PDF, or licensed test)">
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
            Reusable SAT tests and mini-sections. Attach a block to a session date so Taito, Michelle, and their tutors see it on that dashboard.
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

function RoadmapSection({ data }: { data: AdminCurriculum }) {
  const sessions = data.sessions
    .filter((session) => fallDateOrder.includes(session.dateTime.slice(0, 10)))
    .sort((left, right) => fallDateOrder.indexOf(left.dateTime.slice(0, 10)) - fallDateOrder.indexOf(right.dateTime.slice(0, 10)));
  const diagnostic = data.assignments.find((assignment) =>
    /full sat practice diagnostic|sat diagnostic/i.test(assignment.title),
  );
  const allExceptions = [
    ...sessions.filter((session) => session.conflict).map((session) => ({
      kind: "schedule",
      severity: "urgent" as const,
      label: "Schedule conflict",
      detail: `${displaySessionTitle(session.title, session.subject)} has a scheduling conflict.`,
    })),
    ...sessions.filter((session) => !session.tutor || !session.student).map((session) => ({
      kind: "staffing",
      severity: "warning" as const,
      label: "Assignment needed",
      detail: `${displaySessionTitle(session.title, session.subject)} needs ${!session.tutor ? "a tutor" : "a student"}.`,
    })),
    ...data.assignments.filter((assignment) => assignment.status === "draft").map((assignment) => ({
      kind: "assignment",
      severity: "warning" as const,
      label: "Draft preparation",
      detail: `${assignment.title} is not published yet.`,
    })),
  ];
  const exceptions = allExceptions.slice(0, 6);
  const newSubmissions = data.submissions.filter((item) => item.reviewStatus !== "reviewed").slice(0, 5);

  return <div className="space-y-5">
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Build on the platform</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">One loop for every meeting</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Full timed diagnostic before October 2 → weekly mini-section homework → adaptive analysis for student and tutor → live session focuses on misses (or unfinished homework, or a hard-question bank).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">Shared Meet: meet.google.com/rih-iayt-okb</Badge>
            <Badge variant="outline">Auto similar questions</Badge>
            <Badge variant="outline">Submission alerts</Badge>
          </div>
        </div>
        <div className="rounded-2xl border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pre–Oct 2 diagnostic</p>
          <p className="mt-2 font-semibold">{diagnostic?.title ?? "Full SAT Practice Diagnostic"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {diagnostic
              ? `${diagnostic.questionCount} questions · ${diagnostic.timeLimitMinutes} min · ${diagnostic.submissionCount} submissions`
              : "Seeded when Fall sessions are reconciled."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Tutors get a projected SAT score plus strengths/weaknesses before the first meeting.
          </p>
        </div>
      </CardContent>
    </Card>
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Fall meetings</p><p className="mt-2 text-3xl font-bold">{sessions.length} / 12</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">English / IELTS</p><p className="mt-2 text-3xl font-bold">{sessions.filter((session) => session.subject.toUpperCase() === "IELTS").length} / 3</p></CardContent></Card>
      <Card className={exceptions.length ? "border-amber-400/40" : ""}><CardContent className="p-5"><p className="text-sm text-muted-foreground">Exceptions</p><p className="mt-2 text-3xl font-bold">{allExceptions.length}</p></CardContent></Card>
    </div>
    {newSubmissions.length > 0 && (
      <Card className="border-accent/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Latest submission alerts</CardTitle>
          <CardDescription>New homework results waiting for tutor review and live-plan prep.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {newSubmissions.map((item) => (
            <div key={item.attemptId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <div>
                <p className="font-medium">{item.studentName} · {item.assignmentTitle}</p>
                <p className="text-muted-foreground">{Math.round(item.score)}% · {item.mistakeCount} misses · {item.reviewStatus}</p>
              </div>
              <Badge variant="outline">{new Date(item.submittedAt).toLocaleDateString()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    )}
    {exceptions.length > 0 && <details className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4">
      <summary className="cursor-pointer font-semibold"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />Review {allExceptions.length} exception{allExceptions.length === 1 ? "" : "s"}</summary>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{exceptions.map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-xl border bg-background p-3 text-sm"><Badge variant={item.severity === "urgent" ? "destructive" : "outline"}>{item.label}</Badge><p className="mt-2 text-muted-foreground">{item.detail}</p></div>)}</div>
    </details>}
    <Card className="overflow-hidden">
      <CardHeader className="border-b"><CardTitle>Twelve-date curriculum builder</CardTitle><CardDescription>Each date already carries before-session homework and during-session practice. Open a brief to auto-prepare the live plan from the latest submission.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {sessions.length ? <div className="divide-y">{sessions.map((session, index) => {
          const assignments = data.assignments.filter((assignment) => assignment.sessionId === session.id);
          const preparation = assignments.find((assignment) => assignment.deliveryPhase === "before_session");
          const during = assignments.find((assignment) => assignment.deliveryPhase === "during_session");
          const ready = session.status === "published" && Boolean(session.tutor) && Boolean(session.student);
          return <div key={session.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[3rem_12rem_1fr_10rem_auto] lg:items-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">{index + 1}</div>
            <div><p className="font-semibold">{new Date(session.dateTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: session.timezone })}</p><Badge variant="outline" className="mt-1">{sessionSubjectLabel(session.subject)}</Badge></div>
            <div><p className="text-sm font-medium">{displaySessionTitle(session.title, session.subject)}</p><p className="mt-1 text-xs text-muted-foreground">Before: {preparation ? `${preparation.title} (${preparation.status})` : "not required"} · During: {during ? during.status : "auto-prepared in session"} · Report: {session.hasReport ? "ready" : "pending"}</p></div>
            <Badge variant={ready ? "default" : "secondary"} className="w-fit">{ready ? "Ready" : "Needs setup"}</Badge>
            <Button asChild size="sm" variant="outline"><Link href={`/tutor/sessions/${session.id}`}>Open builder <ChevronRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>;
        })}</div> : <Empty text="No Fall curriculum dates are available." />}
      </CardContent>
    </Card>
  </div>;
}
