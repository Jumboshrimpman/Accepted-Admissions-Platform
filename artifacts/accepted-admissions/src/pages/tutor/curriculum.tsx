import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useAssignSatBankPrework,
  useAttachSessionLibraryAsset,
  useCloneAdminAssignmentToSession,
  type AdminAssignment,
  type AdminProgram,
  type AdminSession,
  type CurriculumLibraryAsset,
  type DashboardStudent,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Library,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assignableBankQuizzes,
  bankQuizOptionLabel,
  sessionPreworkQuizzes,
} from "@/lib/assignable-bank-quizzes";
import {
  displaySessionTitle,
  formatSessionDateTime,
} from "@/lib/session-display";

export type TutorCurriculum = {
  programs: AdminProgram[];
  students: DashboardStudent[];
  sessions: AdminSession[];
  quizzes: AdminAssignment[];
  libraryAssets: CurriculumLibraryAsset[];
  satBankCollections: Array<{ id: string; title: string; questionCount: number }>;
};

export const TUTOR_CURRICULUM_QUERY_KEY = ["/api/tutor/curriculum"];

function dateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || (error instanceof Error ? error.message : "The request could not be completed.");
}

export default function TutorCurriculum() {
  const queryClient = useQueryClient();
  const curriculum = useQuery({
    queryKey: TUTOR_CURRICULUM_QUERY_KEY,
    queryFn: () => customFetch<TutorCurriculum>("/api/tutor/curriculum"),
  });
  const createSession = useMutation({
    mutationFn: (data: {
      courseId: string;
      clientUserId: string;
      dateTime: string;
      timezone: string;
      subject: string;
      durationMinutes: number;
    }) =>
      customFetch<AdminSession>("/api/tutor/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
  const cloneAssignment = useCloneAdminAssignmentToSession();
  const assignBank = useAssignSatBankPrework();
  const attachLibrary = useAttachSessionLibraryAsset();

  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    courseId: "",
    clientUserId: "",
    subject: "SAT",
    dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    durationMinutes: 60,
  });
  const [assignQuizId, setAssignQuizId] = useState("");
  const [assignSessionId, setAssignSessionId] = useState("");
  const [bankCollectionId, setBankCollectionId] = useState("");
  const [bankSessionId, setBankSessionId] = useState("");
  const [libraryAssetId, setLibraryAssetId] = useState("");
  const [librarySessionId, setLibrarySessionId] = useState("");

  const data = curriculum.data;
  const students = data?.students ?? [];
  const programs = data?.programs ?? [];
  const sessions = data?.sessions ?? [];
  const quizzes = data?.quizzes ?? [];
  const libraryAssets = data?.libraryAssets ?? [];
  const collections = data?.satBankCollections ?? [];

  const selectedStudent = students.find((student) => student.id === draft.clientUserId);
  const studentPrograms = useMemo(
    () =>
      selectedStudent
        ? programs.filter((program) => program.id === selectedStudent.courseId)
        : programs,
    [programs, selectedStudent],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: TUTOR_CURRICULUM_QUERY_KEY });
  };

  if (curriculum.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (curriculum.error || !data) {
    return (
      <Card className="mx-auto max-w-xl border-destructive/20 bg-destructive/5">
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">Curriculum is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  const assignableForSelected = assignSessionId
    ? assignableBankQuizzes(quizzes, sessions.find((session) => session.id === assignSessionId) ?? {
        id: assignSessionId,
        courseId: sessions[0]?.courseId ?? "",
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12" data-testid="tutor-curriculum-page">
      <section className="rounded-3xl bg-brand-ink px-6 py-7 text-white sm:px-9">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/65">
          Tutor workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Curriculum & sessions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/75">
          Browse the shared bank, create a session for a linked student, and attach quizzes or SAT homework without waiting on an administrator.
        </p>
      </section>

      {message ? (
        <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">
          {message}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Create a session
            </CardTitle>
            <CardDescription>
              Only students linked to you appear here. SAT booking for clients stays at /portal/sat.
            </CardDescription>
          </div>
          <Button
            data-testid="tutor-create-session-toggle"
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus className="mr-2 h-4 w-4" />
            {showCreate ? "Close" : "New session"}
          </Button>
        </CardHeader>
        {showCreate ? (
          <CardContent className="grid gap-4" data-testid="tutor-create-session-form">
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No linked students yet. An administrator needs to assign a student to you first.
              </p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tutor-session-student">Student</Label>
                    <select
                      id="tutor-session-student"
                      data-testid="tutor-session-student"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.clientUserId}
                      onChange={(event) => {
                        const student = students.find((item) => item.id === event.target.value);
                        setDraft((current) => ({
                          ...current,
                          clientUserId: event.target.value,
                          courseId: student?.courseId || current.courseId,
                          subject: student?.subject && student.subject !== "all" ? student.subject : current.subject,
                        }));
                      }}
                    >
                      <option value="">Select a linked student</option>
                      {students.map((student) => (
                        <option key={`${student.id}-${student.courseId}-${student.subject}`} value={student.id}>
                          {student.name} · {student.subject} · {student.courseTitle}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tutor-session-program">Program</Label>
                    <select
                      id="tutor-session-program"
                      data-testid="tutor-session-program"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={draft.courseId}
                      onChange={(event) => setDraft((current) => ({ ...current, courseId: event.target.value }))}
                    >
                      <option value="">Select a program</option>
                      {studentPrograms.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="tutor-session-subject">Subject</Label>
                    <Input
                      id="tutor-session-subject"
                      data-testid="tutor-session-subject"
                      value={draft.subject}
                      onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tutor-session-start">Start time</Label>
                    <Input
                      id="tutor-session-start"
                      data-testid="tutor-session-start"
                      type="datetime-local"
                      value={dateInput(draft.dateTime)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          dateTime: new Date(event.target.value).toISOString(),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tutor-session-duration">Duration (minutes)</Label>
                    <Input
                      id="tutor-session-duration"
                      type="number"
                      min={15}
                      max={480}
                      value={draft.durationMinutes}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          durationMinutes: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
                <Button
                  data-testid="tutor-create-session-submit"
                  disabled={createSession.isPending || !draft.clientUserId || !draft.courseId}
                  onClick={() =>
                    createSession.mutate(
                      {
                        courseId: draft.courseId,
                        clientUserId: draft.clientUserId,
                        dateTime: new Date(draft.dateTime).toISOString(),
                        timezone: draft.timezone,
                        subject: draft.subject,
                        durationMinutes: draft.durationMinutes,
                      },
                      {
                        onSuccess: (created) => {
                          setMessage(`Created ${created.title}.`);
                          setShowCreate(false);
                          refresh();
                        },
                        onError: (error) => setMessage(errorText(error)),
                      },
                    )
                  }
                >
                  {createSession.isPending ? "Creating…" : "Create session"}
                </Button>
              </>
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked students</CardTitle>
          <CardDescription>You can only author work for these students.</CardDescription>
        </CardHeader>
        <CardContent>
          {students.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2" data-testid="tutor-linked-students">
              {students.map((student) => (
                <li key={`${student.id}-${student.courseId}-${student.subject}`} className="rounded-xl border p-4">
                  <p className="font-semibold">{student.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {student.subject} · {student.courseTitle}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No linked students yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your sessions</CardTitle>
          <CardDescription>Open a workspace or assign bank work below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="tutor-curriculum-sessions">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions assigned to you yet.</p>
          ) : (
            sessions.map((session) => {
              const prework = sessionPreworkQuizzes(quizzes, session);
              return (
                <div key={session.id} className="rounded-xl border p-4" data-testid={`tutor-session-card-${session.id}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{displaySessionTitle(session.title, session.subject)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.student?.name ?? "Unassigned student"} · {formatSessionDateTime(session)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {prework.length > 0
                          ? `Pre-work: ${prework.map((item) => item.title).join(", ")}`
                          : "No quiz attached yet"}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/tutor/sessions/${session.id}`}>
                        Open workspace
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Assign quiz or SAT bank homework
          </CardTitle>
          <CardDescription>
            Reusable quizzes and official SAT/PSAT extracts. Assigning clones or attaches work to your session only.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="tutor-assign-quiz">
            <div className="space-y-2">
              <Label htmlFor="tutor-assign-session">Session</Label>
              <select
                id="tutor-assign-session"
                data-testid="tutor-assign-quiz-session"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={assignSessionId}
                onChange={(event) => setAssignSessionId(event.target.value)}
              >
                <option value="">Select a session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {displaySessionTitle(session.title, session.subject)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tutor-assign-quiz">Bank quiz</Label>
              <select
                id="tutor-assign-quiz"
                data-testid="tutor-assign-quiz-select"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={assignQuizId}
                onChange={(event) => setAssignQuizId(event.target.value)}
              >
                <option value="">Select a reusable quiz</option>
                {(assignableForSelected.length > 0 ? assignableForSelected : quizzes.filter((item) => item.sessionId == null)).map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {bankQuizOptionLabel(quiz)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              data-testid="tutor-assign-quiz-submit"
              disabled={cloneAssignment.isPending || !assignSessionId || !assignQuizId}
              onClick={() =>
                cloneAssignment.mutate(
                  { assignmentId: assignQuizId, data: { sessionId: assignSessionId } },
                  {
                    onSuccess: () => {
                      setMessage("Assigned the quiz as pre-session homework.");
                      refresh();
                    },
                    onError: (error) => setMessage(errorText(error)),
                  },
                )
              }
            >
              Assign quiz
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="tutor-assign-bank">
            <div className="space-y-2">
              <Label htmlFor="tutor-bank-session">Session</Label>
              <select
                id="tutor-bank-session"
                data-testid="tutor-assign-bank-session"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={bankSessionId}
                onChange={(event) => setBankSessionId(event.target.value)}
              >
                <option value="">Select a session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {displaySessionTitle(session.title, session.subject)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tutor-bank-collection">SAT/PSAT collection</Label>
              <select
                id="tutor-bank-collection"
                data-testid="tutor-assign-bank-collection"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={bankCollectionId}
                onChange={(event) => setBankCollectionId(event.target.value)}
              >
                <option value="">Any matching official extract</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title} · {collection.questionCount} questions
                  </option>
                ))}
              </select>
            </div>
            <Button
              data-testid="tutor-assign-bank-submit"
              disabled={assignBank.isPending || !bankSessionId}
              onClick={() =>
                assignBank.mutate(
                  {
                    sessionId: bankSessionId,
                    data: {
                      collectionId: bankCollectionId || null,
                      homeworkKind: "routine",
                      targetMinutes: 60,
                    },
                  },
                  {
                    onSuccess: (result) => {
                      setMessage(`Assigned ${result.questionCount} SAT bank questions as homework.`);
                      refresh();
                    },
                    onError: (error) => setMessage(errorText(error)),
                  },
                )
              }
            >
              Assign SAT homework
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Curriculum library
          </CardTitle>
          <CardDescription>Attach a shared practice test or resource to one of your sessions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="tutor-library-bank">
          <div className="space-y-2">
            <Label htmlFor="tutor-library-asset">Library asset</Label>
            <select
              id="tutor-library-asset"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={libraryAssetId}
              onChange={(event) => setLibraryAssetId(event.target.value)}
            >
              <option value="">Select a library item</option>
              {libraryAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tutor-library-session">Session</Label>
            <select
              id="tutor-library-session"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={librarySessionId}
              onChange={(event) => setLibrarySessionId(event.target.value)}
            >
              <option value="">Select a session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {displaySessionTitle(session.title, session.subject)}
                </option>
              ))}
            </select>
          </div>
          <Button
            data-testid="tutor-attach-library-submit"
            disabled={attachLibrary.isPending || !libraryAssetId || !librarySessionId}
            onClick={() =>
              attachLibrary.mutate(
                { sessionId: librarySessionId, data: { libraryAssetId } },
                {
                  onSuccess: () => {
                    setMessage("Attached the library material to the session.");
                    refresh();
                  },
                  onError: (error) => setMessage(errorText(error)),
                },
              )
            }
          >
            Attach to session
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
