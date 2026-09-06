import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAssignmentQueryKey,
  getListQuestionBankQueryKey,
  useAttachQuestionToAssignment,
  useCreateAdminAssignment,
  useGetAssignment,
  useListQuestionBank,
  useRemoveQuestionFromAssignment,
  useUpdateAdminAssignment,
  useUpdateQuestionBankItem,
  type AdminAssignment,
  type AssignmentDetail,
  type AdminAssignmentInput,
  type AdminAssignmentUpdate,
  type AdminCurriculum,
  type AdminSubmission,
  type QuestionBankItem,
} from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, ClipboardList, Edit3, Plus } from "lucide-react";
import { GenerateQuestionsCard } from "@/components/generate-questions-card";
import { GenerateDraftsCard, apiErrorText } from "@/components/question-bank-authoring";
import { isReusableBankQuiz } from "@/lib/assignable-bank-quizzes";
import { useCloneAdminAssignmentToSession } from "@/lib/clone-admin-assignment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminCurriculumHref, readAdminCurriculumSearch } from "@/lib/admin-curriculum-location";

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string; conflicts?: string[] } } | null)?.data;
  if (!data) return "The operation could not be completed.";
  return [data.error, ...(data.conflicts ?? [])].filter(Boolean).join(" ");
}

function quizHref(quizId?: string) {
  return adminCurriculumHref({ section: "curriculum", tab: "quizzes", quiz: quizId ?? null });
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published" || status === "active" || status === "approved") return "default";
  if (status === "archived" || status === "rejected") return "outline";
  return "secondary";
}

function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : "";
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function emptyDraft(data: AdminCurriculum): AdminAssignmentInput {
  return {
    courseId: data.programs[0]?.id ?? "",
    title: "",
    subject: data.programs[0]?.subject ?? "",
    instructions: "",
    deliveryPhase: "before_session",
    timeLimitMinutes: 30,
    maxAttempts: 1,
    status: "draft",
    sessionId: null,
    deadline: null,
  };
}

export function QuizWorkspace({
  data,
  assignments,
  submissions,
  onChanged,
}: {
  data: AdminCurriculum;
  assignments: AdminAssignment[];
  submissions: AdminSubmission[];
  onChanged: () => void;
}) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [openedQuiz, setOpenedQuiz] = useState<AdminAssignment | null>(null);
  const quizId = readAdminCurriculumSearch(location, searchString).quizId;
  const selected =
    data.assignments.find((item) => item.id === quizId) ??
    (openedQuiz?.id === quizId ? openedQuiz : null) ??
    assignments.find((item) => item.id === quizId) ??
    null;
  const openQuiz = (quiz: AdminAssignment | string) => {
    if (typeof quiz === "string") {
      setLocation(quizHref(quiz));
      return;
    }
    setOpenedQuiz(quiz);
    setLocation(quizHref(quiz.id));
  };
  if (quizId && selected) {
    return (
      <QuizDetail
        quiz={selected}
        data={data}
        submissions={submissions.filter((item) => item.assignmentId === selected.id)}
        onChanged={onChanged}
        onBack={() => setLocation(quizHref())}
      />
    );
  }
  if (quizId) {
    return (
      <QuizDetailFallback
        quizId={quizId}
        data={data}
        submissions={submissions.filter((item) => item.assignmentId === quizId)}
        onChanged={onChanged}
        onBack={() => setLocation(quizHref())}
      />
    );
  }
  return (
    <QuizList
      data={data}
      assignments={assignments}
      submissions={submissions}
      onChanged={onChanged}
      onOpen={openQuiz}
    />
  );
}

function QuizList({
  data,
  assignments,
  submissions,
  onChanged,
  onOpen,
}: {
  data: AdminCurriculum;
  assignments: AdminAssignment[];
  submissions: AdminSubmission[];
  onChanged: () => void;
  onOpen: (quiz: AdminAssignment | string) => void;
}) {
  const create = useCreateAdminAssignment();
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AdminAssignmentInput>(emptyDraft(data));
  const [message, setMessage] = useState("");
  const save = () => {
    create.mutate(
      { data: { ...draft, deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null } },
      {
        onSuccess: (created) => {
          setShowCreate(false);
          setDraft(emptyDraft(data));
          setMessage("Quiz created. Add questions next.");
          onChanged();
          onOpen(created);
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };
  const bankQuizzes = assignments.filter((item) => item.sessionId == null);
  return (
    <div className="space-y-4">
      {message ? <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p> : null}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Quizzes</h2>
          <p className="text-sm text-muted-foreground">
            Reusable bank quizzes only. Open one to add questions and assign it. Session copies live on Sessions (Open quiz).
          </p>
        </div>
        <Button
          onClick={() => {
            setDraft(emptyDraft(data));
            setShowCreate(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New quiz
        </Button>
      </div>
      {showCreate ? (
        <QuizFields
          data={data}
          draft={draft}
          setDraft={setDraft}
          pending={create.isPending}
          submitLabel="Create quiz"
          onSubmit={save}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}
      <div className="grid gap-3">
        {bankQuizzes.map((assignment) => {
          const results = submissions.filter((item) => item.assignmentId === assignment.id);
          return (
            <Card key={assignment.id} data-testid={`quiz-card-${assignment.id}`}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{assignment.title}</h3>
                    <Badge variant={statusVariant(assignment.status)}>{assignment.status}</Badge>
                    <Badge variant="outline">{assignment.sessionId ? "Assigned copy" : "Reusable bank quiz"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {assignment.programTitle}
                    {assignment.sessionTitle ? ` · ${assignment.sessionTitle}` : " · not assigned to a session yet"}
                    {" · "}
                    {assignment.subject}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {assignment.questionCount} questions · {assignment.submissionCount} submissions
                    {results[0] ? ` · latest ${results[0].studentName} ${results[0].score}%` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => onOpen(assignment)} data-testid={`open-quiz-${assignment.id}`}>
                  <ClipboardList className="mr-2 h-4 w-4" /> Open quiz
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {bankQuizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No bank quizzes yet. Create one, add questions here, then assign it as pre-session work.
        </div>
      ) : null}
    </div>
  );
}

function assignmentToAdminQuiz(
  assignment: AssignmentDetail,
  data: AdminCurriculum,
  submissions: AdminSubmission[],
): AdminAssignment {
  const program =
    data.programs.find((item) => item.subject === assignment.subject) ?? data.programs[0];
  return {
    id: assignment.id,
    courseId: program?.id ?? "",
    sessionId: assignment.sessionId ?? null,
    programTitle: program?.title ?? "",
    sessionTitle:
      data.sessions.find((session) => session.id === assignment.sessionId)?.title ?? null,
    deliveryPhase: assignment.deliveryPhase ?? "before_session",
    title: assignment.title,
    subject: assignment.subject,
    instructions: assignment.instructions,
    status: assignment.status,
    deadline: assignment.deadline ?? null,
    timeLimitMinutes: assignment.timeLimitMinutes,
    maxAttempts: assignment.maxAttempts ?? 1,
    questionCount: assignment.questions.length,
    submissionCount: submissions.length,
  };
}

function QuizDetailFallback({
  quizId,
  data,
  submissions,
  onChanged,
  onBack,
}: {
  quizId: string;
  data: AdminCurriculum;
  submissions: AdminSubmission[];
  onChanged: () => void;
  onBack: () => void;
}) {
  const { data: assignment, isLoading } = useGetAssignment(quizId);
  if (isLoading) {
    return <p className="text-sm text-muted-foreground" data-testid={`quiz-opening-${quizId}`}>Opening quiz…</p>;
  }
  if (!assignment) {
    return (
      <div className="rounded-xl border p-6 text-sm text-muted-foreground">
        This quiz could not be opened.{" "}
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to quizzes
        </Button>
      </div>
    );
  }
  return (
    <QuizDetail
      quiz={assignmentToAdminQuiz(assignment, data, submissions)}
      data={data}
      submissions={submissions}
      onChanged={onChanged}
      onBack={onBack}
    />
  );
}

function QuizDetail({
  quiz,
  data,
  submissions,
  onChanged,
  onBack,
}: {
  quiz: AdminAssignment;
  data: AdminCurriculum;
  submissions: AdminSubmission[];
  onChanged: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateAdminAssignment();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AdminAssignmentInput>({
    courseId: quiz.courseId,
    sessionId: quiz.sessionId,
    deliveryPhase: quiz.deliveryPhase,
    title: quiz.title,
    subject: quiz.subject,
    instructions: quiz.instructions,
    status: quiz.status,
    deadline: quiz.deadline,
    timeLimitMinutes: quiz.timeLimitMinutes,
    maxAttempts: quiz.maxAttempts,
  });
  const [message, setMessage] = useState("");
  const refreshQuiz = () => {
    queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(quiz.id) });
    queryClient.invalidateQueries({ queryKey: getListQuestionBankQueryKey({ courseId: quiz.courseId }) });
    onChanged();
  };
  return (
    <div className="space-y-4" data-testid={`quiz-detail-${quiz.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All quizzes
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing((open) => !open)}>
          <Edit3 className="mr-2 h-4 w-4" /> {editing ? "Close details" : "Edit details"}
        </Button>
      </div>
      {message ? <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p> : null}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
          <Badge variant={statusVariant(quiz.status)}>{quiz.status}</Badge>
          <Badge variant="outline">{quiz.sessionId ? "Assigned copy" : "Reusable bank quiz"}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {quiz.programTitle}
          {quiz.sessionTitle ? ` · currently on ${quiz.sessionTitle}` : " · assign from here or from a session"}
        </p>
      </div>
      {editing ? (
        <QuizFields
          data={data}
          draft={draft}
          setDraft={setDraft}
          pending={update.isPending}
          submitLabel="Save quiz"
          onSubmit={() =>
            update.mutate(
              {
                assignmentId: quiz.id,
                data: {
                  ...draft,
                  deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
                } as AdminAssignmentUpdate,
              },
              {
                onSuccess: () => {
                  setEditing(false);
                  setMessage("Quiz saved.");
                  onChanged();
                },
                onError: (error) => setMessage(errorText(error)),
              },
            )
          }
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="text-sm">{quiz.instructions}</p>
      )}
      <QuizQuestionEditor quiz={quiz} onChanged={refreshQuiz} />
      <QuizAssignControl quiz={quiz} sessions={data.sessions} assignments={data.assignments} onChanged={onChanged} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Submission results</CardTitle>
          <CardDescription>Open an attempt to review right/wrong answers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {submissions.map((item) => (
            <div key={item.attemptId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <p>
                <span className="font-medium">{item.studentName}</span>
                {" · "}
                {item.score}% · {item.mistakeCount} missed
              </p>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/tutor/attempts/${item.attemptId}`}>Review {item.studentName}</Link>
              </Button>
            </div>
          ))}
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet. Results appear here after a student takes this quiz.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function QuizQuestionEditor({
  quiz,
  onChanged,
}: {
  quiz: AdminAssignment;
  onChanged: () => void;
}) {
  const { data, isLoading } = useGetAssignment(quiz.id);
  const { data: bank = [] } = useListQuestionBank(
    { courseId: quiz.courseId },
    { query: { enabled: Boolean(quiz.courseId), queryKey: getListQuestionBankQueryKey({ courseId: quiz.courseId }) } },
  );
  const attach = useAttachQuestionToAssignment();
  const updateQuestion = useUpdateQuestionBankItem();
  const removeQuestion = useRemoveQuestionFromAssignment();
  const [generated, setGenerated] = useState<QuestionBankItem[]>([]);
  const [questionId, setQuestionId] = useState("");
  const [message, setMessage] = useState("");
  const attachedIds = new Set((data?.questions ?? []).map((item) => item.id));
  const pendingDrafts = generated.filter((item) => !attachedIds.has(item.id));
  const attachableBank = bank.filter(
    (item) => item.reviewStatus !== "rejected" && !attachedIds.has(item.id),
  );
  const attachableId = attachableBank.some((item) => item.id === questionId)
    ? questionId
    : (attachableBank[0]?.id || "");
  const addToQuiz = (id: string) => {
    attach.mutate(
      { assignmentId: quiz.id, data: { questionId: id } },
      {
        onSuccess: () => {
          setGenerated((items) => items.filter((item) => item.id !== id));
          setMessage("Question added to this quiz. It is ready for this quiz only.");
          // Parent refreshQuiz invalidates getGetAssignmentQueryKey so the list is not stale.
          onChanged();
        },
        onError: (error) => setMessage(apiErrorText(error)),
      },
    );
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Questions on this quiz</CardTitle>
        <CardDescription>
          Add questions here manually or generate them for this quiz. Template drafts stay experimental and are not a model provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading questions…</p> : null}
        <ol className="space-y-3" data-testid={`quiz-question-list-${quiz.id}`}>
          {(data?.questions ?? []).map((question, index) => {
            const bankItem = bank.find((item) => item.id === question.id);
            return (
              <li key={question.id}>
                <QuizQuestionEditorCard
                  index={index + 1}
                  questionId={question.id}
                  prompt={question.prompt}
                  skill={question.skill}
                  choices={question.choices?.length ? question.choices : bankItem?.choices ?? []}
                  explanation={bankItem?.explanation ?? ""}
                  correctAnswer={bankItem?.correctAnswer ?? "a"}
                  pending={updateQuestion.isPending || removeQuestion.isPending}
                  onSave={(payload) =>
                    updateQuestion.mutate(
                      {
                        questionId: question.id,
                        data: {
                          prompt: payload.prompt,
                          skill: payload.skill,
                          explanation: payload.explanation,
                          choices: payload.choices,
                          correctAnswer: payload.correctAnswer,
                        },
                      },
                      {
                        onSuccess: () => {
                          setMessage("Question saved on this quiz.");
                          onChanged();
                        },
                        onError: (error) => setMessage(apiErrorText(error)),
                      },
                    )
                  }
                  onRemove={() =>
                    removeQuestion.mutate(
                      { assignmentId: quiz.id, questionId: question.id },
                      {
                        onSuccess: () => {
                          setMessage("Question removed from this quiz.");
                          onChanged();
                        },
                        onError: (error) => setMessage(apiErrorText(error)),
                      },
                    )
                  }
                />
              </li>
            );
          })}
        </ol>
        {(data?.questions ?? []).length === 0 && !isLoading ? (
          <p className="text-sm text-muted-foreground">No questions yet. Generate them for this quiz or add one from the bank.</p>
        ) : null}
        <GenerateQuestionsCard
          assignmentId={quiz.id}
          defaultSkill={quiz.subject}
          onGenerated={onChanged}
        />
        <div className="rounded-xl border bg-muted/20 p-3">
          <GenerateDraftsCard
            courseId={quiz.courseId}
            compact
            onGenerated={(items) => {
              setGenerated(items);
              items.forEach((item) => addToQuiz(item.id));
            }}
            onChanged={onChanged}
          />
        </div>
        {pendingDrafts.length > 0 ? (
          <div className="space-y-2" data-testid="quiz-generated-drafts">
            <p className="text-sm font-medium">Adding drafts to this quiz…</p>
            {pendingDrafts.map((question) => (
              <div key={question.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <p className="min-w-0 flex-1">{question.prompt}</p>
                <Button
                  size="sm"
                  disabled={updateQuestion.isPending || attach.isPending || attachedIds.has(question.id)}
                  onClick={() => addToQuiz(question.id)}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Add to quiz
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {attachableBank.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extra bank questions to attach. Generate drafts on this quiz instead.</p>
          ) : (
            <>
              <select
                aria-label="Bank question to add"
                className="h-9 max-w-xl rounded-md border bg-background px-2 text-sm"
                value={attachableId}
                onChange={(event) => setQuestionId(event.target.value)}
              >
                {attachableBank.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.skill} · {item.prompt.slice(0, 80)}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={attach.isPending || !attachableId} onClick={() => addToQuiz(attachableId)}>
                Add to this quiz
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuizQuestionEditorCard({
  index,
  questionId,
  prompt,
  skill,
  choices,
  explanation,
  correctAnswer,
  pending,
  onSave,
  onRemove,
}: {
  index: number;
  questionId: string;
  prompt: string;
  skill: string;
  choices: Array<{ id: string; label: string; text: string }>;
  explanation: string;
  correctAnswer: string;
  pending: boolean;
  onSave: (payload: {
    prompt: string;
    skill: string;
    explanation: string;
    choices: Array<{ id: string; label: string; text: string }>;
    correctAnswer: string;
  }) => void;
  onRemove: () => void;
}) {
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [draftSkill, setDraftSkill] = useState(skill);
  const [draftExplanation, setDraftExplanation] = useState(explanation);
  const [draftChoices, setDraftChoices] = useState(choices);
  const [draftAnswer, setDraftAnswer] = useState(correctAnswer);
  return (
    <div className="rounded-xl border bg-background p-4" data-testid={`quiz-question-editor-${questionId}`}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question {index}</p>
      <div className="grid gap-3">
        <div className="space-y-2">
          <Label>Prompt</Label>
          <Textarea
            aria-label={`Question ${index} prompt`}
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Skill</Label>
          <Input
            aria-label={`Question ${index} skill`}
            value={draftSkill}
            onChange={(event) => setDraftSkill(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Answer choices</Label>
          {draftChoices.map((choice, choiceIndex) => (
            <Input
              key={choice.id || choice.label || choiceIndex}
              aria-label={`Question ${index} choice ${choice.label || choiceIndex + 1}`}
              value={choice.text}
              onChange={(event) =>
                setDraftChoices((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === choiceIndex ? { ...item, text: event.target.value } : item,
                  ),
                )
              }
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Correct answer</Label>
            <select
              aria-label={`Question ${index} correct answer`}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
            >
              {(draftChoices.length ? draftChoices : [{ id: "a", label: "A", text: "" }]).map((choice) => (
                <option key={choice.id || choice.label} value={(choice.id || choice.label || "a").toLowerCase()}>
                  {choice.label || choice.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Explanation</Label>
            <Textarea
              aria-label={`Question ${index} explanation`}
              value={draftExplanation}
              onChange={(event) => setDraftExplanation(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || draftPrompt.trim().length < 2}
            onClick={() =>
              onSave({
                prompt: draftPrompt,
                skill: draftSkill,
                explanation: draftExplanation,
                choices: draftChoices,
                correctAnswer: draftAnswer,
              })
            }
          >
            Save question
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={onRemove}>
            Remove from quiz
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuizAssignControl({
  quiz,
  sessions,
  assignments,
  onChanged,
}: {
  quiz: AdminAssignment;
  sessions: AdminCurriculum["sessions"];
  assignments: AdminAssignment[];
  onChanged: () => void;
}) {
  const cloneAssignment = useCloneAdminAssignmentToSession();
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState("");
  const title = quiz.title.trim().replace(/\s+/g, " ").toLowerCase();
  // Same title-only limitation as assignableBankQuizzes: no clone lineage on the payload.
  const targets = sessions.filter((session) => {
    if (session.courseId !== quiz.courseId) return false;
    return !assignments.some(
      (item) =>
        item.sessionId === session.id &&
        item.status !== "archived" &&
        item.deliveryPhase === quiz.deliveryPhase &&
        item.title.trim().replace(/\s+/g, " ").toLowerCase() === title,
    );
  });
  const selectedId = targets.some((session) => session.id === sessionId)
    ? sessionId
    : (targets[0]?.id || "");
  if (quiz.sessionId) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          This copy is already on {quiz.sessionTitle ?? "a session"}. Assign the reusable bank quiz (no session) to clone it onto another meeting.
        </CardContent>
      </Card>
    );
  }
  if (!isReusableBankQuiz(quiz)) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Only published or draft before-session bank quizzes can be assigned as pre-work.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assign to a session</CardTitle>
        <CardDescription>Clones this bank quiz onto the meeting. The original stays reusable.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every matching session already has this quiz, or no sessions exist in the program.</p>
        ) : (
          <>
            <select
              aria-label="Session to assign this quiz"
              className="h-9 max-w-md rounded-md border bg-background px-2 text-sm"
              value={selectedId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              {targets.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              data-testid={`assign-quiz-${quiz.id}`}
              disabled={cloneAssignment.isPending || !selectedId}
              onClick={() =>
                cloneAssignment.mutate(
                  { assignmentId: quiz.id, sessionId: selectedId },
                  {
                    onSuccess: () => {
                      setMessage("Cloned as pre-session homework. The original bank quiz is unchanged.");
                      onChanged();
                    },
                    onError: (error) => setMessage(errorText(error)),
                  },
                )
              }
            >
              Assign as pre-work
            </Button>
          </>
        )}
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

function QuizFields({
  data,
  draft,
  setDraft,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  data: AdminCurriculum;
  draft: AdminAssignmentInput;
  setDraft: (next: AdminAssignmentInput) => void;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="border-primary/30">
      <CardContent className="grid gap-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Program</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={draft.courseId}
              onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}
            >
              {data.programs.map((program) => (
                <option key={program.id} value={program.id}>{program.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Phase</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={draft.deliveryPhase}
              onChange={(event) =>
                setDraft({ ...draft, deliveryPhase: event.target.value as AdminAssignmentInput["deliveryPhase"] })
              }
            >
              <option value="before_session">Before session</option>
              <option value="during_session">During session</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Publication state</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={draft.status ?? "draft"}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as AdminAssignmentInput["status"] })
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input aria-label="Title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Instructions / explanation</Label>
          <Textarea
            aria-label="Instructions / explanation"
            value={draft.instructions}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            placeholder="Explain the task and what the learner should demonstrate."
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input
              type="datetime-local"
              value={dateInput(draft.deadline)}
              onChange={(event) => setDraft({ ...draft, deadline: toIso(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Time limit (minutes)</Label>
            <Input
              type="number"
              min="1"
              value={draft.timeLimitMinutes}
              onChange={(event) => setDraft({ ...draft, timeLimitMinutes: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max attempts</Label>
            <Input
              type="number"
              min="1"
              value={draft.maxAttempts ?? 1}
              onChange={(event) => setDraft({ ...draft, maxAttempts: Number(event.target.value) })}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={pending || draft.title.trim().length < 2 || draft.instructions.trim().length < 1}>
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
