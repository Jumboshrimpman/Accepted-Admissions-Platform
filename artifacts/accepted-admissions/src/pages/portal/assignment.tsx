import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import {
  getGetAssignmentQueryKey,
  getGetAttemptQueryKey,
  getGetAttemptResultQueryKey,
  useGetAssignment,
  useGetAttempt,
  useGetAttemptResult,
  useGetCurrentUser,
  usePauseAttempt,
  useResumeAttempt,
  useSaveAttemptResponse,
  useStartAttempt,
  useSubmitAttempt,
  type AssignmentQuestion,
  type AttemptResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Flag,
  Pause,
  Play,
  Timer,
} from "lucide-react";
import {
  COLLABORATIVE_PRACTICE_COPY,
  EMPTY_SUBMIT_MESSAGE,
  answeredQuestionCount,
  canSubmitStudentAttempt,
  isCollaborativeSessionPractice,
  shouldAutoSubmitOnExpiry,
  studentSeesFinishedResult,
  studentSeesPredictionStep,
} from "@/lib/student-attempt-ui";

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function answerText(
  answer: string | null | undefined,
  choices: Array<{ id: string; label: string; text: string }> | undefined,
) {
  if (!answer) return "Not answered";
  return choices?.find((choice) => choice.id === answer)?.text ?? answer.toUpperCase();
}

function ResultView({ result }: { result: AttemptResult }) {
  const correctPercent = result.totalCount
    ? Math.round((result.correctCount / result.totalCount) * 100)
    : 0;
  const estimated = result.estimatedSatScore;
  const showEstimated =
    result.homeworkKind === "diagnostic" || result.scoreReporting === "estimated_diagnostic";
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 animate-in fade-in">
      <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary">
        ← Back to Dashboard
      </Link>
      <Card className="overflow-hidden border-primary/20 shadow-lg">
        <div className="bg-brand-ink p-8 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="mb-3 border-0 bg-white/20 text-white">
                {result.status === "expired" ? "Time expired" : "Submitted"}
              </Badge>
              <h1 className="text-3xl font-bold">
                {result.homeworkKind === "diagnostic"
                  ? "Diagnostic result"
                  : result.homeworkKind === "routine"
                    ? "Pre-work result"
                    : "Your SAT result"}
              </h1>
              <p className="mt-2 text-white/80">
                {result.correctCount} of {result.totalCount} correct · {formatTime(result.activeSeconds)}{" "}
                active
              </p>
              {showEstimated ? (
                <p className="mt-2 text-sm text-white/70">
                  {estimated?.methodology ??
                    "Any projected SAT band is estimated. This is not an official College Board adaptive digital score."}
                </p>
              ) : result.homeworkKind === "routine" ? (
                <p className="mt-2 text-sm text-white/70">
                  Accuracy only — this 60-minute set is not an official SAT score.
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl bg-white/15 px-6 py-4 text-center">
              {showEstimated && estimated?.rangeLow != null && estimated.rangeHigh != null ? (
                <>
                  <div className="text-4xl font-bold">
                    {estimated.rangeLow}–{estimated.rangeHigh}
                  </div>
                  <div className="text-sm text-white/75">estimated SAT range</div>
                  <div className="mt-1 text-xs text-white/60">
                    mid ~{estimated.total}
                    {estimated.readingWriting != null ? ` · R&W ~${estimated.readingWriting}` : ""}
                    {estimated.math != null ? ` · Math ~${estimated.math}` : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-5xl font-bold">{Math.round(result.score)}%</div>
                  <div className="text-sm text-white/75">
                    {result.homeworkKind ? "accuracy" : "overall score"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <CardContent className="space-y-6 p-6">
          {showEstimated && estimated?.label ? (
            <p className="text-sm text-muted-foreground">{estimated.label}</p>
          ) : null}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <Brain className="h-4 w-4 text-accent" /> Feedback
            </div>
            <p className="text-sm text-muted-foreground">{result.studentFeedback}</p>
            <Badge variant="outline" className="mt-3">
              {result.analysis.label} · shared with your tutor
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {result.analysis.strengths.map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Next focus</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {result.analysis.nextFocus.map((item) => (
                    <li key={item}>→ {item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
          <div>
            <h2 className="mb-3 text-xl font-bold">Skill breakdown</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.breakdown.map((skill) => (
                <div key={skill.skill} className="rounded-xl border p-4">
                  <div className="font-medium">{skill.skill}</div>
                  <div className="mt-1 text-2xl font-bold">{Math.round(skill.accuracy ?? 0)}%</div>
                  <div className="text-xs text-muted-foreground">
                    {skill.correct} / {skill.total} correct
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-xl font-bold">Question review</h2>
            <div className="space-y-3">
              {result.items.map((item, index) => (
                <Card key={item.questionId} className={item.correct ? "border-emerald-200" : "border-amber-200"}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.correct ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <Badge variant="outline">{item.skill}</Badge>
                          <p className="mt-2 font-medium">{item.prompt}</p>
                        </div>
                      </div>
                      {item.correct ? (
                        <CheckCircle className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <CircleAlert className="h-5 w-5 text-amber-600" />
                      )}
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <span className="text-muted-foreground">Your answer:</span>{" "}
                        {answerText(item.finalAnswer, item.choices)}
                      </div>
                      <div className="rounded-lg bg-primary/5 p-3">
                        <span className="text-muted-foreground">Correct answer:</span>{" "}
                        {answerText(item.correctAnswer, item.choices)}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Why:</span> {item.explanation}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {correctPercent}% of questions were correct. Your tutor can use this result to plan the next
            session.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AnswerChoices({
  question,
  selected,
  disabled,
  onSelect,
  tone = "default",
}: {
  question: AssignmentQuestion;
  selected?: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
  tone?: "default" | "ink";
}) {
  const ink = tone === "ink";
  if (question.choices && question.choices.length > 0) {
    return (
      <div className="space-y-3" data-testid="answer-choices">
        <h3 className={`text-lg font-semibold ${ink ? "text-white" : ""}`}>
          {ink ? "Choose together" : "Select your answer"}
        </h3>
        {question.choices.map((choice) => {
          const isSelected = selected === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(choice.id)}
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                ink
                  ? isSelected
                    ? "border-white bg-white/15 text-white shadow-sm"
                    : "border-white/25 text-white hover:border-white/60 hover:bg-white/10"
                  : isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
              } ${disabled ? "cursor-default" : ""}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-medium ${
                  ink
                    ? isSelected
                      ? "bg-white text-foreground"
                      : "bg-white/15 text-white"
                    : isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {choice.label}
              </div>
              <div className="flex-1">{choice.text}</div>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="spr-answer">
      <h3 className={`text-lg font-semibold ${ink ? "text-white" : ""}`}>
        {ink ? "Write the answer together" : "Enter your answer"}
      </h3>
      <Textarea
        value={selected ?? ""}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
        placeholder="Type the student-produced response"
        className={`min-h-24 ${ink ? "border-white/30 bg-white/10 text-white placeholder:text-white/50" : ""}`}
      />
    </div>
  );
}

export default function PortalAssignment() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const viewer = currentUser?.role === "viewer";
  const { data: assignment, isLoading: loadingAssignment } = useGetAssignment(assignmentId, {
    query: { enabled: Boolean(assignmentId), queryKey: getGetAssignmentQueryKey(assignmentId) },
  });
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const { data: attempt, isLoading: loadingAttempt } = useGetAttempt(attemptId ?? "", {
    query: {
      enabled: Boolean(attemptId),
      queryKey: getGetAttemptQueryKey(attemptId ?? ""),
      refetchInterval: 5000,
    },
  });
  const resultQuery = useGetAttemptResult(attemptId ?? "", {
    query: {
      enabled: Boolean(attemptId && (attempt?.status === "submitted" || attempt?.status === "expired")),
      queryKey: getGetAttemptResultQueryKey(attemptId ?? ""),
    },
  });
  const startAttempt = useStartAttempt();
  const pauseAttempt = usePauseAttempt();
  const resumeAttempt = useResumeAttempt();
  const submitAttempt = useSubmitAttempt();
  const saveResponse = useSaveAttemptResponse();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [localResponses, setLocalResponses] = useState<
    Record<string, { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean }>
  >({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const expirySubmitted = useRef(false);
  const collaborative = isCollaborativeSessionPractice(assignment?.deliveryPhase);

  useEffect(() => {
    if (!attemptId && assignment?.latestAttemptId) setAttemptId(assignment.latestAttemptId);
  }, [assignment?.latestAttemptId, attemptId]);

  useEffect(() => {
    if (!attempt) return;
    setRemainingSeconds(attempt.remainingSeconds);
    const responseMap: Record<
      string,
      { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean }
    > = {};
    for (const response of attempt.responses) {
      responseMap[response.questionId] = {
        prediction: response.prediction ?? "",
        finalAnswer: response.finalAnswer ?? "",
        locked: response.predictionLocked,
        flagged: response.flagged,
      };
    }
    setLocalResponses(responseMap);
  }, [attempt]);

  useEffect(() => {
    if (collaborative || attempt?.status !== "active") return;
    const interval = window.setInterval(() => setRemainingSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [attempt?.status, collaborative]);

  const answeredCount = answeredQuestionCount(localResponses);
  const submitGuard = canSubmitStudentAttempt({
    viewer,
    answeredCount,
    pending: submitAttempt.isPending,
  });

  const submit = useCallback(() => {
    if (!attemptId || expirySubmitted.current) return;
    const guard = canSubmitStudentAttempt({
      viewer,
      answeredCount: answeredQuestionCount(localResponses),
      pending: submitAttempt.isPending,
    });
    if (!guard.ok) {
      if (guard.reason === "empty") setSubmitError(EMPTY_SUBMIT_MESSAGE);
      return;
    }
    expirySubmitted.current = true;
    submitAttempt.mutate(
      { attemptId, data: { confirm: true } },
      {
        onSuccess: () => {
          setSubmitError(null);
          queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) });
          queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(assignmentId) });
          queryClient.invalidateQueries({ queryKey: getGetAttemptResultQueryKey(attemptId) });
        },
        onError: (error) => {
          expirySubmitted.current = false;
          const message = (error as { data?: { error?: string } } | null)?.data?.error;
          setSubmitError(message || EMPTY_SUBMIT_MESSAGE);
        },
      },
    );
  }, [attemptId, assignmentId, localResponses, queryClient, submitAttempt, viewer]);

  useEffect(() => {
    if (collaborative) return;
    if (attempt?.status === "active" && remainingSeconds <= 0 && shouldAutoSubmitOnExpiry(answeredCount)) {
      submit();
    }
  }, [answeredCount, attempt?.status, collaborative, remainingSeconds, submit]);

  const updateResponse = (
    questionId: string,
    updates: { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean },
  ) => {
    const current = localResponses[questionId] ?? {};
    const next = { ...current, ...updates };
    setLocalResponses((responses) => ({ ...responses, [questionId]: next }));
    setSubmitError(null);
    if (!attemptId || viewer) return;
    saveResponse.mutate(
      {
        attemptId,
        data: {
          questionId,
          prediction: null,
          lockPrediction: false,
          finalAnswer: next.finalAnswer ?? null,
          flagged: next.flagged,
          timeSpentSeconds: 0,
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) }) },
    );
  };

  if (loadingAssignment || !assignment) {
    return (
      <div className="p-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (!attemptId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-8">
        <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary">
          ← Back to Dashboard
        </Link>
        <Card className={collaborative ? "overflow-hidden border-0 shadow-lg" : "border-primary/20 shadow-lg"}>
          {collaborative ? (
            <CardHeader className="bg-brand-ink pb-6 text-white">
              <Badge className="mb-3 w-fit border-0 bg-white/20 text-white">Session practice</Badge>
              <CardTitle className="text-3xl">{assignment.title}</CardTitle>
              <p className="mt-3 text-sm text-white/75">{COLLABORATIVE_PRACTICE_COPY}</p>
            </CardHeader>
          ) : (
            <CardHeader className="border-b bg-primary/5 pb-6">
              <Badge variant="outline" className="mb-3 w-fit">
                {assignment.subject}
              </Badge>
              <CardTitle className="text-3xl">{assignment.title}</CardTitle>
              <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
                <span>
                  <Timer className="mr-1 inline h-4 w-4" />
                  {assignment.timeLimitMinutes} min
                </span>
                <span>{assignment.questionCount} questions</span>
              </div>
            </CardHeader>
          )}
          <CardContent className="space-y-4 p-6">
            <p className="whitespace-pre-wrap text-muted-foreground">{assignment.instructions}</p>
            {collaborative ? (
              <p className="text-sm text-muted-foreground">
                There is no prediction step and no empty auto-submit. Record answers as you work them with
                your tutor.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your timer is tracked on the server. You can pause, and your responses autosave as you work.
                Submit is blocked until at least one question is answered.
              </p>
            )}
          </CardContent>
          <CardContent className="bg-muted/30">
            <Button
              size="lg"
              className="w-full rounded-full"
              onClick={() =>
                startAttempt.mutate({ assignmentId }, { onSuccess: (data) => setAttemptId(data.id) })
              }
              disabled={viewer || startAttempt.isPending}
            >
              {viewer
                ? "Viewer mode — read only"
                : startAttempt.isPending
                  ? "Starting…"
                  : collaborative
                    ? "Open practice together"
                    : "Start quiz"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (loadingAttempt || !attempt) {
    return (
      <div className="p-8">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (attempt.status === "submitted" || attempt.status === "expired") {
    const finished = studentSeesFinishedResult({
      status: attempt.status,
      hasResult: Boolean(resultQuery.data),
      resultError: resultQuery.isError,
    });
    if (!finished && (resultQuery.isError || !resultQuery.isLoading)) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 py-10">
          <h2 className="text-2xl font-bold">Attempt not submitted</h2>
          <p className="text-muted-foreground">{EMPTY_SUBMIT_MESSAGE}</p>
          {viewer ? (
            <p className="text-sm text-muted-foreground">Viewer mode is read only.</p>
          ) : (
            <Button
              size="lg"
              className="rounded-full"
              data-testid="restart-empty-attempt"
              onClick={() =>
                startAttempt.mutate({ assignmentId }, { onSuccess: (data) => setAttemptId(data.id) })
              }
              disabled={startAttempt.isPending}
            >
              {startAttempt.isPending ? "Starting…" : "Start again"}
            </Button>
          )}
        </div>
      );
    }
    if (resultQuery.isLoading || !resultQuery.data) {
      return (
        <div className="p-8">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      );
    }
    return <ResultView result={resultQuery.data} />;
  }
  if (attempt.status === "paused") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center space-y-5 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <Pause className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold">Attempt paused</h2>
        <p className="max-w-md text-lg text-muted-foreground">
          Your timer and responses are saved. Question content is hidden while paused.
        </p>
        {viewer ? (
          <p className="text-sm text-muted-foreground">Viewer mode is read only.</p>
        ) : (
          <Button
            size="lg"
            className="rounded-full"
            onClick={() =>
              resumeAttempt.mutate(
                { attemptId },
                { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) },
              )
            }
            disabled={resumeAttempt.isPending}
          >
            <Play className="mr-2 h-5 w-5" /> Resume assignment
          </Button>
        )}
      </div>
    );
  }
  const question = assignment.questions[currentQuestionIndex];
  if (!question) return null;
  const response = localResponses[question.id] ?? {};
  const showPrediction = studentSeesPredictionStep(question.predictionFirst);
  const recordedHere = Boolean(response.finalAnswer?.trim());

  if (collaborative) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 pb-16">
        <p className="text-sm text-muted-foreground">
          Open any problem, discuss it with your tutor, and record the answer you agree on. This is
          not a timed quiz.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="practice-problem-picker">
          {assignment.questions.map((item, index) => {
            const recorded = Boolean(localResponses[item.id]?.finalAnswer?.trim());
            return (
              <Button
                key={item.id}
                size="sm"
                variant={index === currentQuestionIndex ? "default" : "outline"}
                onClick={() => setCurrentQuestionIndex(index)}
              >
                {index + 1}
                {recorded ? " · recorded" : ""}
              </Button>
            );
          })}
        </div>
        <section
          className="rounded-3xl bg-brand-ink p-6 text-white shadow-xl sm:p-8"
          data-testid="session-practice-board"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
            Tutor + student practice
          </p>
          <p className="mt-2 text-sm text-white/80">{COLLABORATIVE_PRACTICE_COPY}</p>
          {question.skill ? (
            <Badge className="mt-4 border-0 bg-white/20 text-white">{question.skill}</Badge>
          ) : null}
          {question.stimulus ? (
            <p className="mt-5 whitespace-pre-wrap text-white/90">{question.stimulus}</p>
          ) : null}
          <p className="mt-5 text-xl font-medium leading-relaxed">{question.prompt}</p>
          <div className="mt-6">
            {showPrediction ? (
              <p data-testid="prediction-step">Prediction first</p>
            ) : (
              <AnswerChoices
                question={question}
                selected={response.finalAnswer}
                disabled={viewer}
                tone="ink"
                onSelect={(value) => updateResponse(question.id, { finalAnswer: value })}
              />
            )}
          </div>
          {recordedHere ? (
            <p className="mt-4 text-sm text-white/75">Recorded. Keep discussing or open another problem.</p>
          ) : (
            <p className="mt-4 text-sm text-white/70">Choose an answer together to record this problem.</p>
          )}
        </section>
        {submitError || (!submitGuard.ok && submitGuard.reason === "empty") ? (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
            data-testid="empty-submit-error"
          >
            {submitError || EMPTY_SUBMIT_MESSAGE}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous problem
          </Button>
          <Button
            variant="outline"
            onClick={submit}
            disabled={!submitGuard.ok}
            data-testid="finish-practice"
          >
            {submitAttempt.isPending
              ? "Saving…"
              : viewer
                ? "Viewer mode"
                : "Finish practice"}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setCurrentQuestionIndex((index) => Math.min(assignment.questions.length - 1, index + 1))
            }
            disabled={currentQuestionIndex >= assignment.questions.length - 1}
          >
            Next problem <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div className="sticky top-16 z-30 flex items-center justify-between border-b bg-background/95 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold">
            Question {currentQuestionIndex + 1} of {assignment.questions.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateResponse(question.id, { flagged: !response.flagged })}
            className={response.flagged ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}
          >
            <Flag className="mr-2 h-4 w-4" /> {response.flagged ? "Flagged" : "Flag"}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`rounded-md px-3 py-1 font-mono text-lg font-bold ${remainingSeconds <= 60 ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
          >
            <Timer className="mr-1 inline h-4 w-4" />
            {formatTime(remainingSeconds)}
          </div>
          {!viewer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                pauseAttempt.mutate(
                  { attemptId },
                  { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) },
                )
              }
              disabled={pauseAttempt.isPending}
            >
              <Pause className="mr-2 h-4 w-4" /> Pause
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-8 pt-4 md:grid-cols-2">
        <div className="space-y-6">
          {question.stimulus && (
            <Card className="border-0 bg-muted/30 shadow-none">
              <CardContent className="p-6">
                <p className="whitespace-pre-wrap">{question.stimulus}</p>
              </CardContent>
            </Card>
          )}
          <div className="text-lg font-medium leading-relaxed">{question.prompt}</div>
        </div>
        <div />
      </div>
      <div className="-mt-4">
        {showPrediction ? (
          <p data-testid="prediction-step">Prediction first</p>
        ) : (
          <AnswerChoices
            question={question}
            selected={response.finalAnswer}
            disabled={viewer}
            onSelect={(value) => updateResponse(question.id, { finalAnswer: value })}
          />
        )}
      </div>
      {submitError || (!submitGuard.ok && submitGuard.reason === "empty") ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="empty-submit-error">
          {submitError || EMPTY_SUBMIT_MESSAGE}
        </p>
      ) : null}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Button
            variant="outline"
            size="lg"
            className="rounded-full"
            onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="mr-1 h-5 w-5" /> Previous
          </Button>
          {currentQuestionIndex < assignment.questions.length - 1 ? (
            <Button
              size="lg"
              className="rounded-full"
              onClick={() =>
                setCurrentQuestionIndex((index) => Math.min(assignment.questions.length - 1, index + 1))
              }
            >
              Next <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="rounded-full bg-accent text-white hover:bg-accent/90"
              onClick={submit}
              disabled={!submitGuard.ok}
            >
              {submitAttempt.isPending ? "Submitting…" : viewer ? "Viewer mode" : "Submit assignment"}{" "}
              <CheckCircle className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
