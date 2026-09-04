import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  getGetSessionQueryKey,
  getGetAdaptiveCurriculumQueryKey,
  getGetAssignmentQueryKey,
  getListContentSourcesQueryKey,
  getListQuestionBankQueryKey,
  getListSessionArtifactsQueryKey,
  type QuestionBankItem,
  useGetAdaptiveCurriculum,
  useGetAssignment,
  useRefreshAdaptiveCurriculum,
  useUpdateAdaptiveRecommendation,
  useUpdateAssignmentQuestion,
  useRemoveQuestionFromAssignment,
  useAttachQuestionToAssignment,
  useCreateContentSource,
  useCreateCurriculumBlock,
  useUpdateCurriculumBlock,
  useGeneratePracticeQuestions,
  useGetSession,
  useListContentSources,
  useListQuestionBank,
  useListSessionArtifacts,
  useUpdateQuestionBankItem,
  useUpsertSessionArtifact,
} from "@workspace/api-client-react";
import {
  BookOpenCheck,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  FileInput,
  FileText,
  GripVertical,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  ListChecks,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  displaySessionTitle,
  formatSessionDateTime,
  formatSessionDate,
  formatSessionTimeRange,
  sessionStudentLabel,
  sessionSubjectLabel,
} from "@/lib/session-display";

function QuestionReviewCard({
  question,
  assignments,
  onChanged,
}: {
  question: QuestionBankItem;
  assignments: Array<{ id: string; title: string }>;
  onChanged: () => void;
}) {
  const updateQuestion = useUpdateQuestionBankItem();
  const attachQuestion = useAttachQuestionToAssignment();
  const [prompt, setPrompt] = useState(question.prompt);
  const [skill, setSkill] = useState(question.skill);
  const [explanation, setExplanation] = useState(question.explanation);
  const [tags, setTags] = useState(question.tags.join(", "));
  const [rejectionReason, setRejectionReason] = useState("");
  const [attachedAssignmentIds, setAttachedAssignmentIds] = useState<string[]>([]);

  const save = (reviewStatus = question.reviewStatus) => {
    updateQuestion.mutate(
      {
        questionId: question.id,
        data: {
          prompt,
          skill,
          explanation,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          reviewStatus,
          rejectionReason:
            reviewStatus === "rejected" ? rejectionReason : null,
        },
      },
      { onSuccess: onChanged },
    );
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{question.skill}</CardTitle>
          <Badge
            variant={question.reviewStatus === "approved" ? "default" : "outline"}
          >
            {question.reviewStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Prompt</Label>
          <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Skill</Label>
            <Input value={skill} onChange={(event) => setSkill(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Tags</Label>
            <Input value={tags} onChange={(event) => setTags(event.target.value)} />
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="mb-2 font-medium">Answer choices</p>
          <ul className="space-y-1 text-muted-foreground">
            {question.choices.map((choice) => (
              <li key={choice.id}>
                {choice.label}. {choice.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-medium">
            Correct answer: {question.correctAnswer.toUpperCase()}
          </p>
        </div>
        <div className="grid gap-2">
          <Label>Explanation</Label>
          <Textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
          />
        </div>
        {question.reviewStatus !== "approved" && (
          <div className="grid gap-2">
            <Label>Rejection reason</Label>
            <Input
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Required only when rejecting"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => save()}
            disabled={updateQuestion.isPending}
          >
            <Save className="mr-2 h-4 w-4" /> Save edits
          </Button>
          <Button
            onClick={() => save("approved")}
            disabled={updateQuestion.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
          </Button>
          <Button
            variant="destructive"
            onClick={() => save("rejected")}
            disabled={!rejectionReason.trim() || updateQuestion.isPending}
          >
            <XCircle className="mr-2 h-4 w-4" /> Reject
          </Button>
        </div>
        {question.reviewStatus === "approved" && assignments.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reuse in this session
            </p>
            <div className="flex flex-wrap gap-2">
              {assignments.map((assignment) => (
                <Button
                  key={assignment.id}
                  size="sm"
                  variant="secondary"
                  disabled={
                    attachQuestion.isPending ||
                    attachedAssignmentIds.includes(assignment.id)
                  }
                  onClick={() =>
                    attachQuestion.mutate(
                      {
                        assignmentId: assignment.id,
                        data: { questionId: question.id },
                      },
                      {
                        onSuccess: () =>
                          setAttachedAssignmentIds((current) => [
                            ...current,
                            assignment.id,
                          ]),
                      },
                    )
                  }
                >
                  {attachedAssignmentIds.includes(assignment.id)
                    ? `Added to ${assignment.title}`
                    : `Add to ${assignment.title}`}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TutorSession() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();
  const { data: session, isLoading, error } = useGetSession(sessionId, {
    query: {
      enabled: Boolean(sessionId),
      queryKey: getGetSessionQueryKey(sessionId),
    },
  });
  const courseId = session?.courseId ?? "";
  const sourceParams = { courseId };
  const questionParams = { courseId };
  const { data: sources = [] } = useListContentSources(sourceParams, {
    query: {
      enabled: Boolean(courseId),
      queryKey: getListContentSourcesQueryKey(sourceParams),
    },
  });
  const { data: questions = [] } = useListQuestionBank(questionParams, {
    query: {
      enabled: Boolean(courseId),
      queryKey: getListQuestionBankQueryKey(questionParams),
    },
  });
  const { data: artifacts = [] } = useListSessionArtifacts(sessionId, {
    query: {
      enabled: Boolean(sessionId),
      queryKey: getListSessionArtifactsQueryKey(sessionId),
    },
  });
  const duringAssignmentId =
    session?.assignments.find(
      (assignment) => assignment.deliveryPhase === "during_session",
    )?.id ?? "";
  const { data: duringAssignment } = useGetAssignment(duringAssignmentId, {
    query: {
      enabled: Boolean(duringAssignmentId),
      queryKey: getGetAssignmentQueryKey(duringAssignmentId),
    },
  });
  const { data: adaptive } = useGetAdaptiveCurriculum(sessionId, {
    query: {
      enabled: Boolean(sessionId),
      queryKey: getGetAdaptiveCurriculumQueryKey(sessionId),
    },
  });
  const createBlock = useCreateCurriculumBlock();
  const updateBlock = useUpdateCurriculumBlock();
  const createSource = useCreateContentSource();
  const generateQuestions = useGeneratePracticeQuestions();
  const saveArtifact = useUpsertSessionArtifact();
  const refreshAdaptive = useRefreshAdaptiveCurriculum();
  const updateRecommendation = useUpdateAdaptiveRecommendation();
  const attachQuestion = useAttachQuestionToAssignment();
  const updateAssignmentQuestion = useUpdateAssignmentQuestion();
  const removeAssignmentQuestion = useRemoveQuestionFromAssignment();

  const [addingBlock, setAddingBlock] = useState(false);
  const [newBlockText, setNewBlockText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] = useState<"pdf" | "html" | "text">("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [authorizationNote, setAuthorizationNote] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [focus, setFocus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [report, setReport] = useState("");
  const [tutorNotes, setTutorNotes] = useState("");

  useEffect(() => {
    if (!selectedSourceId && sources[0]) setSelectedSourceId(sources[0].id);
  }, [selectedSourceId, sources]);

  useEffect(() => {
    setTranscript(
      artifacts.find((artifact) => artifact.kind === "transcript")?.content ?? "",
    );
    setReport(
      artifacts.find((artifact) => artifact.kind === "report")?.content ?? "",
    );
    setTutorNotes(
      artifacts.find((artifact) => artifact.kind === "tutor_notes")?.content ?? "",
    );
  }, [artifacts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/4 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !session) return <div>Session not found</div>;

  const refreshSources = () =>
    queryClient.invalidateQueries({
      queryKey: getListContentSourcesQueryKey(sourceParams),
    });
  const refreshQuestions = () =>
    queryClient.invalidateQueries({
      queryKey: getListQuestionBankQueryKey(questionParams),
    });
  const refreshArtifacts = () =>
    queryClient.invalidateQueries({
      queryKey: getListSessionArtifactsQueryKey(sessionId),
    });
  const refreshAdaptiveData = () => {
    queryClient.invalidateQueries({
      queryKey: getGetAdaptiveCurriculumQueryKey(sessionId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetSessionQueryKey(sessionId),
    });
    if (duringAssignmentId) {
      queryClient.invalidateQueries({
        queryKey: getGetAssignmentQueryKey(duringAssignmentId),
      });
    }
  };
  const saveTutorNotes = () =>
    saveArtifact.mutate(
      {
        sessionId,
        data: {
          kind: "tutor_notes",
          content: tutorNotes,
          visibility: "tutor",
          status: "draft",
        },
      },
      { onSuccess: refreshArtifacts },
    );

  const handleAddHeading = () => {
    if (!newBlockText.trim()) return;
    createBlock.mutate(
      {
        sessionId,
        data: {
          kind: "heading",
          visibility: "student",
          config: { text: newBlockText },
          position: session.blocks.length,
        },
      },
      {
        onSuccess: () => {
          setAddingBlock(false);
          setNewBlockText("");
          queryClient.invalidateQueries({
            queryKey: getGetSessionQueryKey(sessionId),
          });
        },
      },
    );
  };

  const handleImportSource = () => {
    if (!sourceTitle.trim() || !authorizationNote.trim()) return;
    createSource.mutate(
      {
        data: {
          courseId,
          title: sourceTitle,
          sourceKind,
          sourceUrl: sourceUrl || null,
          extractedText: sourceText || null,
          authorizationNote,
          provenance: { sessionId },
        },
      },
      {
        onSuccess: (source) => {
          setSelectedSourceId(source.id);
          setSourceTitle("");
          setSourceUrl("");
          setSourceText("");
          setAuthorizationNote("");
          refreshSources();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-20 animate-in fade-in">
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Link href="/tutor" className="text-sm text-muted-foreground hover:text-primary">
            Dashboard
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link
            href={`/tutor/courses/${session.courseId}`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Course
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Manage session</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge className="mb-3">{sessionSubjectLabel(session.subject)}</Badge>
            <h1 className="mb-2 text-3xl font-bold tracking-tight">{displaySessionTitle(session.title, session.subject)}</h1>
            <p className="text-muted-foreground">
              {formatSessionDateTime(session)}
            </p>
          </div>
          <Badge variant="outline">{session.status}</Badge>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03] shadow-sm">
        <CardHeader className="border-b bg-card/80 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookOpenCheck className="h-5 w-5 text-primary" />
                Session workspace
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Review the student&apos;s readiness, results, focus areas, and session plan together.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={refreshAdaptive.isPending}
                onClick={() =>
                  refreshAdaptive.mutate(
                    { sessionId },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getGetAdaptiveCurriculumQueryKey(sessionId),
                        });
                        queryClient.invalidateQueries({
                          queryKey: getGetSessionQueryKey(sessionId),
                        });
                      },
                    },
                  )
                }
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {refreshAdaptive.isPending ? "Preparing…" : "Auto-prepare session"}
              </Button>
              {session.meetingUrl && (
                <Button asChild>
                  <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer">
                    <Video className="mr-2 h-4 w-4" /> Join meeting
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {adaptive?.sessionPrep && (
          <div className="border-b bg-accent/5 px-6 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  AI-native live plan
                </p>
                <p className="mt-1 text-sm font-medium">{adaptive.sessionPrep.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mode: {adaptive.sessionPrep.mode.replaceAll("_", " ")}
                  {adaptive.sessionPrep.attachedQuestionCount > 0
                    ? ` · ${adaptive.sessionPrep.attachedQuestionCount} in-session questions ready`
                    : ""}
                </p>
              </div>
              <Badge variant="outline">{adaptive.sessionPrep.mode.replaceAll("_", " ")}</Badge>
            </div>
          </div>
        )}
        <CardContent className="grid gap-4 p-6 md:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Student</p>
              <p className="mt-2 flex items-center gap-2 font-semibold">
                <UserRound className="h-4 w-4 text-primary" />
                {sessionStudentLabel(session)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatSessionDate(session)} · {formatSessionTimeRange(session)}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Meeting</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {session.meetingUrl ? "Meeting link is ready." : "No meeting link has been added yet."}
              </p>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {session.tutorNotes ?? tutorNotes ?? "No tutor notes saved yet."}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Homework status & results</p>
                <Badge variant="outline">{session.homework?.length ?? 0} assignment{session.homework?.length === 1 ? "" : "s"}</Badge>
              </div>
              {session.homework && session.homework.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {session.homework.map((homework) => (
                    <div key={homework.assignmentId} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{homework.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {homework.deadline ? `Due ${format(parseISO(homework.deadline), "MMM d, yyyy")}` : "No due date"}
                          </p>
                        </div>
                        <Badge variant={homework.attemptStatus === "submitted" || homework.attemptStatus === "expired" ? "default" : "secondary"}>
                          {homework.attemptStatus === "submitted" || homework.attemptStatus === "expired" ? "Complete" : homework.attemptStatus === "active" || homework.attemptStatus === "paused" ? "In progress" : "Not started"}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>Score: {homework.score === null ? "—" : `${Math.round(homework.score)}%`}</span>
                        <span>Mistakes: {homework.mistakeCount}</span>
                      </div>
                      {homework.analysis && (
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <p><span className="font-medium text-emerald-700">Strength:</span> {homework.analysis.strengths[0] ?? "No strength summary yet."}</p>
                          <p><span className="font-medium text-amber-700">Recommended focus:</span> {homework.analysis.nextFocus[0] ?? homework.analysis.weaknesses[0] ?? "Keep practicing."}</p>
                          <Badge variant="outline" className="w-fit sm:col-span-2">
                            {homework.analysis.label} · shared with student
                          </Badge>
                        </div>
                      )}
                      {homework.attemptId && (
                        <Link href={`/tutor/attempts/${homework.attemptId}`}>
                          <Button size="sm" variant="outline" className="mt-3">
                            Open detailed result
                          </Button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No homework is linked to this session yet.</p>
              )}
            </div>
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Recommended practice</p>
                <Badge variant="outline">{adaptive?.recommendations.filter((item) => item.status === "recommended").length ?? 0} suggested</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {adaptive?.recommendations.filter((item) => item.status === "recommended").slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="font-medium">{item.skill}</span>
                    <span className="text-muted-foreground"> · {item.reason}</span>
                  </div>
                ))}
                {!adaptive || adaptive.recommendations.filter((item) => item.status === "recommended").length === 0 ? (
                  <p className="text-sm text-muted-foreground">Recommendations will appear after a completed result.</p>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <p className="font-semibold">Curriculum</p>
              <p className="mt-1 text-sm text-muted-foreground">{session.blocks.filter((block) => block.status === "published").length} published blocks are available for this session.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="curriculum" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="curriculum">Live plan</TabsTrigger>
          <TabsTrigger value="practice">Authoring tools</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="practice" className="space-y-6">
          <Card className="border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileInput className="h-5 w-5 text-accent" />
                Import authorized source
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Register provenance for PDF, HTML, or text you are authorized to use.
                Source text stays in the tutor workspace and is never returned in
                student assignment responses.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                <div className="grid gap-2">
                  <Label>Source title</Label>
                  <Input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="Lesson notes — evidence and inference"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Format</Label>
                  <select
                    value={sourceKind}
                    onChange={(event) =>
                      setSourceKind(event.target.value as "pdf" | "html" | "text")
                    }
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="text">Text</option>
                    <option value="pdf">PDF</option>
                    <option value="html">HTML</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Source URL (optional)</Label>
                <Input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="grid gap-2">
                <Label>Authorized extracted text (optional when a URL is supplied)</Label>
                <Textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="Paste text extracted from material you are permitted to use."
                  className="min-h-28"
                />
              </div>
              <div className="grid gap-2">
                <Label>Authorization and provenance note</Label>
                <Textarea
                  value={authorizationNote}
                  onChange={(event) => setAuthorizationNote(event.target.value)}
                  placeholder="Example: Tutor-created handout, owned by Accepted Admissions."
                />
              </div>
              <Button
                className="w-fit"
                onClick={handleImportSource}
                disabled={
                  createSource.isPending ||
                  !sourceTitle.trim() ||
                  !authorizationNote.trim() ||
                  (!sourceUrl.trim() && !sourceText.trim())
                }
              >
                {createSource.isPending ? "Importing…" : "Import source"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                Generate original practice drafts
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Generation uses your learning objective, not copied source passages.
                Every item remains a draft until a tutor approves it.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[220px_1fr_auto]">
              <select
                value={selectedSourceId}
                onChange={(event) => setSelectedSourceId(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select a source</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.title}
                  </option>
                ))}
              </select>
              <Input
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder="Learning objective, e.g. distinguish evidence from inference"
              />
              <Button
                disabled={
                  !selectedSourceId ||
                  focus.trim().length < 3 ||
                  generateQuestions.isPending
                }
                onClick={() =>
                  generateQuestions.mutate(
                    {
                      sourceId: selectedSourceId,
                      data: { focus, count: 3, difficulty: "medium" },
                    },
                    { onSuccess: refreshQuestions },
                  )
                }
              >
                {generateQuestions.isPending ? "Generating…" : "Create drafts"}
              </Button>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="flex items-center gap-2 text-2xl font-bold">
                <BookOpenCheck className="h-5 w-5 text-primary" />
                Tutor review
              </h2>
              <Badge variant="secondary">{questions.length} reusable items</Badge>
            </div>
            {questions.length > 0 ? (
              questions.map((question) => (
                <QuestionReviewCard
                  key={question.id}
                  question={question}
                  assignments={session.assignments}
                  onChanged={refreshQuestions}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                Import a source and create drafts to begin the tutor review queue.
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="curriculum" className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Adaptive session plan
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start with Before Session homework, then publish the approved
                    During Session sequence. Recommendations never expose source
                    extracts.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refreshAdaptive.isPending}
                  onClick={() =>
                    refreshAdaptive.mutate(
                      { sessionId },
                      { onSuccess: refreshAdaptiveData },
                    )
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {refreshAdaptive.isPending ? "Refreshing…" : "Refresh from latest result"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-semibold">Before Session</p>
                    <Badge variant="outline">
                      {adaptive?.homework?.latestAttemptStatus === "submitted" ||
                      adaptive?.homework?.latestAttemptStatus === "expired"
                        ? "Complete"
                        : "Incomplete"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {adaptive?.homework
                      ? `${adaptive.homework.title} · ${adaptive.homework.questionCount} questions`
                      : "No homework assignment is linked to this session yet."}
                  </p>
                  {adaptive?.homework?.latestAttemptId ? (
                    <Button asChild size="sm" variant="secondary" className="mt-3">
                      <Link href={`/tutor/attempts/${adaptive.homework.latestAttemptId}`}>
                        Open homework / result
                      </Link>
                    </Button>
                  ) : adaptive?.homework ? (
                    <p className="mt-3 text-sm text-muted-foreground">No submitted attempt yet.</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Incomplete homework can still be worked through during the session.
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-semibold">During Session</p>
                    <Badge variant="secondary">
                      {duringAssignment?.questions.length ?? 0} questions
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {duringAssignment
                      ? duringAssignment.title
                      : "The in-session workspace will appear after the Fall materials refresh."}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Only approved original practice can enter this sequence.
                  </p>
                </div>
              </div>

              {adaptive && adaptive.mistakes.length > 0 && (
                <div className="rounded-xl border bg-background p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <p className="font-semibold">Latest result — missed skills</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[...new Set(adaptive.mistakes.map((mistake) => mistake.skill))].map(
                      (skill) => (
                        <div key={skill} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                          <span className="font-medium">{skill}</span>
                          <span className="ml-2 text-muted-foreground">
                            {adaptive.mistakes.filter((mistake) => mistake.skill === skill).length}{" "}
                            missed
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {adaptive && adaptive.recommendations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Recommended original practice</p>
                    <Badge variant="outline">
                      {adaptive.recommendations.filter(
                        (recommendation) => recommendation.status === "recommended",
                      ).length}{" "}
                      awaiting decision
                    </Badge>
                  </div>
                  {adaptive.recommendations.map((recommendation) => (
                    <div key={recommendation.id} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{recommendation.skill}</Badge>
                            <Badge
                              variant={
                                recommendation.status === "accepted" ? "default" : "outline"
                              }
                            >
                              {recommendation.status}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {recommendation.reason}
                          </p>
                        </div>
                        {recommendation.status === "recommended" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={updateRecommendation.isPending}
                              onClick={() =>
                                updateRecommendation.mutate(
                                  {
                                    recommendationId: recommendation.id,
                                    data: {
                                      status: "accepted",
                                      assignmentId: duringAssignmentId || null,
                                    },
                                  },
                                  { onSuccess: refreshAdaptiveData },
                                )
                              }
                            >
                              Add to session
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updateRecommendation.isPending}
                              onClick={() =>
                                updateRecommendation.mutate(
                                  {
                                    recommendationId: recommendation.id,
                                    data: { status: "dismissed" },
                                  },
                                  { onSuccess: refreshAdaptiveData },
                                )
                              }
                            >
                              Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                      {recommendation.question && (
                        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
                          {recommendation.question.prompt}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {adaptive && adaptive.hardQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">Hard-question bank</p>
                    <Badge variant="outline">Available after completed homework</Badge>
                  </div>
                  {adaptive.hardQuestions.map((question) => (
                    <div key={question.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
                      <div>
                        <Badge variant="secondary">{question.skill}</Badge>
                        <p className="mt-1 text-sm">{question.prompt}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !duringAssignmentId ||
                          !duringAssignment ||
                          duringAssignment.questions.some((item) => item.id === question.id)
                        }
                        onClick={() =>
                          duringAssignmentId &&
                          attachQuestion.mutate(
                            {
                              assignmentId: duringAssignmentId,
                              data: {
                                questionId: question.id,
                                position: duringAssignment?.questions.length ?? 0,
                              },
                            },
                            { onSuccess: refreshAdaptiveData },
                          )
                        }
                      >
                        Add hard question
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {duringAssignment && duringAssignment.questions.length > 0 && (
                <div className="space-y-3 rounded-xl border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{duringAssignment.status === "published" ? "Published in-session sequence" : "Draft in-session sequence"}</p>
                  </div>
                  {duringAssignment.questions.map((question, index) => (
                    <div key={question.id} className="flex items-center gap-2 rounded-lg border p-3">
                      <span className="w-6 text-sm font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <p className="flex-1 truncate text-sm">{question.prompt}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index === 0 || updateAssignmentQuestion.isPending}
                        onClick={() => {
                          const previous = duringAssignment.questions[index - 1];
                          updateAssignmentQuestion.mutate(
                            {
                              assignmentId: duringAssignment.id,
                              questionId: question.id,
                              data: { position: previous.position },
                            },
                            {
                              onSuccess: () =>
                                updateAssignmentQuestion.mutate(
                                  {
                                    assignmentId: duringAssignment.id,
                                    questionId: previous.id,
                                    data: { position: question.position },
                                  },
                                  { onSuccess: refreshAdaptiveData },
                                ),
                            },
                          );
                        }}
                        aria-label="Move question up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={
                          index === duringAssignment.questions.length - 1 ||
                          updateAssignmentQuestion.isPending
                        }
                        onClick={() => {
                          const next = duringAssignment.questions[index + 1];
                          updateAssignmentQuestion.mutate(
                            {
                              assignmentId: duringAssignment.id,
                              questionId: question.id,
                              data: { position: next.position },
                            },
                            {
                              onSuccess: () =>
                                updateAssignmentQuestion.mutate(
                                  {
                                    assignmentId: duringAssignment.id,
                                    questionId: next.id,
                                    data: { position: question.position },
                                  },
                                  { onSuccess: refreshAdaptiveData },
                                ),
                            },
                          );
                        }}
                        aria-label="Move question down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        disabled={removeAssignmentQuestion.isPending}
                        onClick={() =>
                          removeAssignmentQuestion.mutate(
                            {
                              assignmentId: duringAssignment.id,
                              questionId: question.id,
                            },
                            { onSuccess: refreshAdaptiveData },
                          )
                        }
                        aria-label="Remove question"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border bg-background p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-semibold">Private tutor guidance</p>
                  <Badge variant="outline">Tutor only</Badge>
                </div>
                <Textarea
                  value={tutorNotes}
                  onChange={(event) => setTutorNotes(event.target.value)}
                  placeholder="Write prompts, misconceptions to probe, or a plan for working through incomplete homework."
                  className="min-h-24"
                />
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={!tutorNotes.trim() || saveArtifact.isPending}
                  onClick={saveTutorNotes}
                >
                  <Save className="mr-2 h-4 w-4" /> Save private guidance
                </Button>
              </div>
            </CardContent>
          </Card>

          <details className="rounded-2xl border bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              Curriculum blocks
              <Badge variant="outline">{session.blocks.length} blocks</Badge>
            </summary>
            <div className="mt-5 flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="text-xl font-bold">Block editor</h2>
                <p className="mt-1 text-sm text-muted-foreground">Secondary authoring tools for the published live plan.</p>
              </div>
              <Button size="sm" onClick={() => setAddingBlock(true)} disabled={addingBlock}>
                <Plus className="mr-2 h-4 w-4" /> Add block
              </Button>
            </div>
          {session.blocks.map((block) => (
            <Card key={block.id}>
              <CardContent className="flex gap-4 p-4">
                <GripVertical className="mt-1 h-5 w-5 text-muted-foreground/40" />
                <div className="flex-1">
                  <div className="mb-2 flex justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{block.kind}</Badge>
                      <Badge variant="outline">{block.visibility}</Badge>
                      <Badge variant={block.status === "published" ? "default" : "outline"}>
                        {block.status}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateBlock.isPending}
                      onClick={() =>
                        updateBlock.mutate(
                          {
                            blockId: block.id,
                            data: {
                              status: block.status === "published" ? "draft" : "published",
                            },
                          },
                          {
                            onSuccess: () =>
                              queryClient.invalidateQueries({
                                queryKey: getGetSessionQueryKey(sessionId),
                              }),
                          },
                        )
                      }
                    >
                      {block.status === "published" ? "Unpublish" : "Publish"}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {block.kind === "heading"
                      ? String(block.config.text ?? "")
                      : JSON.stringify(block.config)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          {session.blocks.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
              No curriculum blocks yet.
            </div>
          )}
          {addingBlock && (
            <Card className="border-accent">
              <CardContent className="space-y-4 p-4">
                <Textarea
                  value={newBlockText}
                  onChange={(event) => setNewBlockText(event.target.value)}
                  placeholder="Heading text"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setAddingBlock(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddHeading}
                    disabled={!newBlockText.trim() || createBlock.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" /> Save block
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          </details>
        </TabsContent>

        <TabsContent value="records" className="grid gap-6 md:grid-cols-2">
          {(
            [
              ["transcript", "Transcript", transcript, setTranscript],
              ["report", "Post-session report", report, setReport],
            ] as const
          ).map(([kind, title, content, setContent]) => (
            <Card key={kind}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {title}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Course visibility is enforced by membership on the server.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-64"
                  placeholder={`Write the ${title.toLowerCase()}…`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={kind === "report" ? "outline" : "default"}
                    disabled={!content.trim() || saveArtifact.isPending}
                    onClick={() =>
                      saveArtifact.mutate(
                        {
                          sessionId,
                          data: {
                            kind,
                            content,
                            visibility: "tutor",
                            status: "draft",
                          },
                        },
                        { onSuccess: refreshArtifacts },
                      )
                    }
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {kind === "transcript"
                      ? "Save private transcript"
                      : "Save private draft"}
                  </Button>
                  {kind === "report" && (
                    <Button
                      disabled={!content.trim() || saveArtifact.isPending}
                      onClick={() =>
                        saveArtifact.mutate(
                          {
                            sessionId,
                            data: {
                              kind: "report",
                              content,
                              visibility: "course",
                              status: "published",
                            },
                          },
                          { onSuccess: refreshArtifacts },
                        )
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Publish to course
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
