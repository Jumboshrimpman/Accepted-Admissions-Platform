import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminCurriculumQueryKey,
  useCreateAdminAssignment,
  useCreateAdminSession,
  useGetAdminCurriculum,
  useUpdateAdminAssignment,
  useUpdateAdminProgram,
  useUpdateAdminSession,
  useUpdateCurriculumBlock,
} from "@workspace/api-client-react";
import type {
  AdminAssignment,
  AdminAssignmentInput,
  AdminAssignmentUpdate,
  AdminCurriculum,
  AdminProgram,
  AdminProgramUpdate,
  AdminSession,
  AdminSessionInput,
  AdminSessionUpdate,
} from "@workspace/api-client-react";
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Edit3, ExternalLink, FileText, GraduationCap, Library, Mail, Plus, Save, Users } from "lucide-react";
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

type Section = "people" | "programs" | "curriculum" | "sessions";

const sectionLinks: Array<{ id: Section; label: string; icon: typeof Users }> = [
  { id: "people", label: "Clients & tutors", icon: Users },
  { id: "programs", label: "Programs", icon: GraduationCap },
  { id: "curriculum", label: "Curriculum", icon: Library },
  { id: "sessions", label: "Sessions", icon: CalendarDays },
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
  const initialSection = (params.get("section") as Section | null) ?? "curriculum";
  const [section, setSection] = useState<Section>(sectionLinks.some((item) => item.id === initialSection) ? initialSection : "curriculum");
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
          <h1 className="text-3xl font-bold tracking-tight">Learning operations</h1>
          <p className="mt-1 text-muted-foreground">Manage programs, assignments, learning materials, people, and sessions from one focused workspace.</p>
        </div>
        <Input className="w-full sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this section…" aria-label="Search operations" />
      </div>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-4" aria-label="Admin operation sections">
        {sectionLinks.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant={section === id ? "default" : "ghost"} className="justify-start gap-2" onClick={() => selectSection(id)}>
            <Icon className="h-4 w-4" /> {label}
          </Button>
        ))}
      </nav>

      {data.attention.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" /> Needs attention <Badge variant="outline">{data.attention.length}</Badge></CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {data.attention.slice(0, 6).map((item, index) => <div key={`${item.kind}-${index}`} className="rounded-xl border bg-background p-3 text-sm"><div className="flex items-center gap-2"><Badge variant={item.severity === "urgent" ? "destructive" : "outline"}>{item.label}</Badge></div><p className="mt-2 text-muted-foreground">{item.detail}</p></div>)}
          </CardContent>
        </Card>
      )}

      {section === "people" && <PeopleSection data={data} search={search} />}
      {section === "programs" && <ProgramsSection programs={data.programs.filter((item) => filtered(item.title) || filtered(item.subject) || filtered(item.term))} onSaved={refresh} />}
      {section === "curriculum" && <CurriculumSection data={data} search={search} onChanged={refresh} />}
      {section === "sessions" && <SessionsSection data={data} search={search} onChanged={refresh} />}
    </div>
  );
}

function PeopleSection({ data, search }: { data: AdminCurriculum; search: string }) {
  const term = search.trim().toLowerCase();
  const tutors = data?.tutors.filter((item) => !term || `${item.name} ${item.email} ${item.subjects.join(" ")}`.toLowerCase().includes(term)) ?? [];
  const clients = data?.clients.filter((item) => !term || `${item.name} ${item.email}`.toLowerCase().includes(term)) ?? [];
  return <div className="grid gap-6 lg:grid-cols-2">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Clients / students</CardTitle><CardDescription>Identity and program operations only. Financial details stay in administrator-only finance.</CardDescription></CardHeader><CardContent className="space-y-2">{clients.map((client) => <div key={client.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{client.name}</p><p className="text-sm text-muted-foreground">{client.email}</p></div><Badge variant="outline">Student</Badge></div>)}{clients.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching clients.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /> Tutors</CardTitle><CardDescription>Subject access and activity. Compensation is never returned by this operational view.</CardDescription></CardHeader><CardContent className="space-y-2">{tutors.map((tutor) => <div key={tutor.id} className="flex items-center justify-between rounded-xl border p-3"><div><p className="font-medium">{tutor.name}</p><p className="text-sm text-muted-foreground">{tutor.email}</p><div className="mt-2 flex flex-wrap gap-1">{tutor.subjects.map((subject) => <Badge key={subject} variant="secondary">{subject}</Badge>)}</div><p className="mt-2 text-xs text-muted-foreground">{tutor.sessionCount} total sessions · {tutor.upcomingSessionCount} upcoming</p></div><Badge variant={tutor.active ? "default" : "outline"}>{tutor.active ? "Active" : "Inactive"}</Badge></div>)}{tutors.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No matching tutors.</p>}</CardContent></Card>
  </div>;
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
    <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="assignments"><ClipboardList className="mr-2 h-4 w-4" /> Assignments</TabsTrigger><TabsTrigger value="materials"><FileText className="mr-2 h-4 w-4" /> Materials</TabsTrigger><TabsTrigger value="questions"><Library className="mr-2 h-4 w-4" /> Question bank</TabsTrigger><TabsTrigger value="submissions"><CheckCircle2 className="mr-2 h-4 w-4" /> Submissions</TabsTrigger></TabsList>
    <TabsContent value="assignments"><AssignmentManager data={data} assignments={assignments} onChanged={onChanged} /></TabsContent>
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
  return <div className="space-y-4">{message && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p>}<div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Session operations</h2><p className="text-sm text-muted-foreground">Upcoming and completed sessions with privacy-safe scheduling details.</p></div><Button onClick={() => { reset(); setEditing(null); setShowCreate(true); }}><Plus className="mr-2 h-4 w-4" /> New session</Button></div>{(showCreate || editing) && form}<div className="grid gap-3">{sessions.map((session) => <SessionCard key={session.id} session={session} onEdit={() => { setEditing(session.id); setShowCreate(false); setDraft({ courseId: session.courseId, dateTime: session.dateTime, timezone: session.timezone, subject: session.subject, durationMinutes: session.durationMinutes, status: session.status, bookingStatus: session.bookingStatus as AdminSessionInput["bookingStatus"], clientUserId: session.student?.id ?? null, tutorUserId: session.tutor?.id ?? null }); }} />)}</div>{sessions.length === 0 && <Empty text="No matching sessions." />}</div>;
}

function SessionCard({ session, onEdit }: { session: AdminSession; onEdit: () => void }) {
  return <Card className={session.conflict ? "border-destructive/50 bg-destructive/5" : ""}><CardContent className="p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{displaySessionTitle(session.title, session.subject)}</h3><Badge variant={statusVariant(session.status)}>{session.status}</Badge>{session.conflict && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Conflict</Badge>}</div><p className="mt-2 text-sm text-muted-foreground">{formatSessionDateTime(session)} · {session.durationMinutes} min</p><p className="mt-1 text-sm">{session.programTitle} · {sessionSubjectLabel(session.subject)}</p><div className="mt-3 flex flex-wrap gap-2 text-sm">{session.meetingUrl && <Button asChild size="sm" variant="link" className="h-auto p-0"><a href={session.meetingUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" /> Open Meet link</a></Button>}</div>{session.conflict && <div className="mt-3 rounded-lg border border-destructive/30 bg-background p-3 text-sm"><p className="font-medium text-destructive">Resolve before assigning this time</p>{session.conflictWith.map((item) => <p key={item} className="mt-1 text-muted-foreground">{item}</p>)}</div>}</div><Button variant="outline" size="sm" onClick={onEdit}><Edit3 className="mr-2 h-4 w-4" /> Edit / archive</Button></div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{text}</div>;
}
