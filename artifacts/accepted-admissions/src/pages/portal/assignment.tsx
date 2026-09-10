import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
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
  customFetch,
  type AssignmentQuestion,
  type AttemptResponse,
  type AttemptResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizContent } from "@/components/quiz-content";
import {
  BookmarkPlus,
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
import { isUnfinishedHomeworkClientCopy } from "@/lib/quiz-content";
import {
  COLLABORATIVE_PRACTICE_COPY,
  EMPTY_SUBMIT_MESSAGE,
  IN_SESSION_PARTIAL_SUBMIT_COPY,
  IN_SESSION_PER_QUESTION_FEEDBACK_COPY,
  IN_SESSION_PRACTICE_CHECK_COPY,
  answeredQuestionCount,
  allowsInSessionPerQuestionFeedback,
  canSubmitStudentAttempt,
  isAnsweredValue,
  isCollaborativeSessionPractice,
  isInSessionHomeworkCompletion,
  isQuestionFeedbackRevealed,
  shouldAutoSubmitOnExpiry,
  studentSeesFinishedResult,
  studentSeesPredictionStep,
  normalizeQuestionIndex,
  wantsResumeAttempt,
} from "@/lib/student-attempt-ui";
import {
  displayAnswerLabel,
  formatStudentChoiceText,
  formatStudentStemText,
  figurePrimaryChoices,
  hasCompleteLetterChoiceText,
  isFigurePrimaryQuestion,
  isStudentAnswerableQuizQuestion,
  isStudentReadableChoiceText,
  shouldHideMismatchedQuizFigures,
  shouldHideQuizOcrStem,
  shouldShowQuizChoices,
} from "@/lib/quiz-figure-primary";
import { splitQuizRichText } from "@/lib/quiz-rich-text";

function QuizRichText({
  text,
  className,
  imageClassName,
  hideGarbledText,
  hideImages,
}: {
  text: string | null | undefined;
  className?: string;
  imageClassName?: string;
  hideGarbledText?: boolean;
  hideImages?: boolean;
}) {
  if (!text) return null;
  const parts = splitQuizRichText(formatStudentStemText(text), { hideGarbledText, hideImages });
  if (parts.length === 0) return null;
  return (
    <div
      className={`min-w-0 max-w-full overflow-x-auto overflow-y-visible ${className ?? ""}`}
      data-testid="quiz-rich-text"
    >
      {parts.map((part, index) =>
        part.type === "image" ? (
          <img
            key={`${part.src}-${index}`}
            src={part.src}
            alt={part.alt}
            className={imageClassName ?? "my-3 h-auto max-h-[min(44rem,85vh)] w-auto max-w-full object-contain rounded-md bg-white"}
          />
        ) : part.type === "table" ? (
          <div key={`table-${index}`} className="my-3 max-w-full overflow-x-auto" data-testid="quiz-data-table">
            <table className="min-w-[12rem] border-collapse text-sm">
              <thead>
                <tr>
                  {part.headers.map((header) => (
                    <th key={header} className="border border-border bg-muted/50 px-3 py-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {part.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`} className="border border-border px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : part.preformatted ? (
          <pre
            key={`text-${index}`}
            className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed"
          >
            {part.value}
          </pre>
        ) : (
          <p key={`text-${index}`} className="max-w-full whitespace-pre-wrap break-words leading-relaxed">
            {part.value}
          </p>
        ),
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function answerText(
  answer: string | null | undefined,
  choices: Array<{ id: string; label: string; text: string }> | undefined,
) {
  return displayAnswerLabel(answer, choices);
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
                  Accuracy only — this pre-work set is not an official SAT score.
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
                          {item.stimulus ? (
                            <QuizRichText
                              text={item.stimulus}
                              className="mt-2 text-sm text-muted-foreground"
                              hideGarbledText={item.presentation === "figure_primary"}
                              hideImages={shouldHideMismatchedQuizFigures(item)}
                            />
                          ) : null}
                          {item.presentation === "figure_primary" && !item.prompt ? null : (
                            <QuizRichText
                              text={item.prompt}
                              className="mt-2 font-medium"
                              hideGarbledText={item.presentation === "figure_primary"}
                            />
                          )}
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
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Why:</span>{" "}
                      <QuizContent text={item.explanation} className="mt-1 inline-block" />
                    </div>
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

function InSessionQuestionFeedback({
  correct,
  studentAnswer,
  correctAnswer,
  explanation,
  choices,
  tone = "default",
}: {
  correct?: boolean | null;
  studentAnswer?: string | null;
  correctAnswer?: string | null;
  explanation?: string | null;
  choices?: Array<{ id: string; label: string; text: string }>;
  tone?: "default" | "ink";
}) {
  const ink = tone === "ink";
  return (
    <div
      className={`mt-4 space-y-3 rounded-xl p-4 ${
        ink
          ? correct
            ? "bg-emerald-500/20 text-white"
            : "bg-amber-400/20 text-white"
          : correct
            ? "border border-emerald-200 bg-emerald-50/80"
            : "border border-amber-200 bg-amber-50/80"
      }`}
      data-testid="question-feedback"
    >
      <div className="flex items-center gap-2 font-semibold">
        {correct ? (
          <CheckCircle className={`h-5 w-5 ${ink ? "text-emerald-200" : "text-emerald-600"}`} />
        ) : (
          <CircleAlert className={`h-5 w-5 ${ink ? "text-amber-200" : "text-amber-600"}`} />
        )}
        {correct ? "Correct" : "Incorrect"}
      </div>
      <div className={`grid gap-2 text-sm ${ink ? "text-white/90" : ""} sm:grid-cols-2`}>
        <div className={ink ? "rounded-lg bg-white/10 p-3" : "rounded-lg bg-background/70 p-3"}>
          <span className={ink ? "text-white/70" : "text-muted-foreground"}>Your answer:</span>{" "}
          {answerText(studentAnswer, choices)}
        </div>
        <div className={ink ? "rounded-lg bg-white/10 p-3" : "rounded-lg bg-background/70 p-3"}>
          <span className={ink ? "text-white/70" : "text-muted-foreground"}>Correct answer:</span>{" "}
          {answerText(correctAnswer, choices)}
        </div>
      </div>
      {explanation ? (
        <p className={`text-sm ${ink ? "text-white/85" : "text-muted-foreground"}`}>
          <span className={ink ? "font-medium text-white" : "font-medium text-foreground"}>Why:</span>{" "}
          {explanation}
        </p>
      ) : null}
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
  const figurePrimary = isFigurePrimaryQuestion(question);
  const rawChoices = figurePrimary ? figurePrimaryChoices(question) : question.choices;
  const choices = (rawChoices ?? [])
    .map((choice) => ({ ...choice, text: formatStudentChoiceText(choice.text) }))
    .filter((choice) => isStudentReadableChoiceText(choice.text));
  if (shouldShowQuizChoices({ ...question, choices }) && hasCompleteLetterChoiceText(choices)) {
    return (
      <div className="min-w-0 max-w-full space-y-3 overflow-visible" data-testid="answer-choices">
        <h3 className={`text-lg font-semibold ${ink ? "text-white" : ""}`}>
          {ink ? "Choose together" : "Select your answer"}
        </h3>
        {choices.map((choice) => {
          const isSelected = selected === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(choice.id)}
              data-testid="quiz-answer-choice"
              className={`flex w-full min-w-0 max-w-full items-start gap-4 overflow-visible rounded-xl border-2 p-4 text-left transition-all ${
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
              <div className="min-w-0 max-w-full flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {choice.text}
              </div>
            </button>
          );
        })}
      </div>
    );
  }
  return null;
}

export default function PortalAssignment() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const viewer = currentUser?.role === "viewer";
  const { data: assignment, isLoading: loadingAssignment, isError: assignmentError } = useGetAssignment(assignmentId, {
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
    Record<
      string,
      {
        prediction?: string;
        finalAnswer?: string;
        locked?: boolean;
        flagged?: boolean;
        revealed?: boolean;
        correct?: boolean | null;
        correctAnswer?: string | null;
        explanation?: string | null;
      }
    >
  >({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"incorrect" | "bug" | "other">("bug");
  const [reportNote, setReportNote] = useState("");
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportPending, setReportPending] = useState(false);
  const [reportedQuestionIds, setReportedQuestionIds] = useState<Set<string>>(new Set());
  const expirySubmitted = useRef(false);
  const restoredAttemptId = useRef<string | null>(null);
  const autoResumed = useRef(false);
  const inSessionHomework = isInSessionHomeworkCompletion({
    deliveryPhase: assignment?.deliveryPhase,
    title: assignment?.title,
  });
  const collaborative = isCollaborativeSessionPractice(
    assignment?.deliveryPhase,
    assignment?.title,
  );
  const perQuestionFeedback = allowsInSessionPerQuestionFeedback({
    deliveryPhase: assignment?.deliveryPhase,
  });

  useEffect(() => {
    if (!attemptId && assignment?.latestAttemptId) setAttemptId(assignment.latestAttemptId);
  }, [assignment?.latestAttemptId, attemptId]);

  const questions = (assignment?.questions ?? []).filter(isStudentAnswerableQuizQuestion);
  const questionCount = questions.length;
  if (attempt?.id && questionCount > 0 && restoredAttemptId.current !== attempt.id) {
    restoredAttemptId.current = attempt.id;
    const restoredIndex = normalizeQuestionIndex(attempt.currentQuestionIndex, questionCount);
    if (restoredIndex !== currentQuestionIndex) {
      setCurrentQuestionIndex(restoredIndex);
    }
  }

  useEffect(() => {
    if (autoResumed.current || viewer || !attemptId || attempt?.status !== "paused") return;
    if (!wantsResumeAttempt(search)) return;
    autoResumed.current = true;
    resumeAttempt.mutate(
      { attemptId },
      { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) },
    );
  }, [attempt?.status, attemptId, queryClient, resumeAttempt, search, viewer]);

  useEffect(() => {
    if (!attempt) return;
    setRemainingSeconds(attempt.remainingSeconds);
    const responseMap: Record<
      string,
      {
        prediction?: string;
        finalAnswer?: string;
        locked?: boolean;
        flagged?: boolean;
        revealed?: boolean;
        correct?: boolean | null;
        correctAnswer?: string | null;
        explanation?: string | null;
      }
    > = {};
    for (const response of attempt.responses) {
      const revealed =
        allowsInSessionPerQuestionFeedback({ deliveryPhase: assignment?.deliveryPhase }) &&
        isQuestionFeedbackRevealed(response);
      responseMap[response.questionId] = {
        prediction: response.prediction ?? "",
        finalAnswer: response.finalAnswer ?? "",
        locked: response.predictionLocked,
        flagged: response.flagged,
        revealed,
        correct: revealed ? response.correct : null,
        correctAnswer: revealed ? response.correctAnswer : null,
        explanation: revealed ? response.explanation : null,
      };
    }
    setLocalResponses(responseMap);
  }, [assignment?.deliveryPhase, attempt]);

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

  const applySavedFeedback = (questionId: string, saved: AttemptResponse) => {
    const revealed = isQuestionFeedbackRevealed(saved);
    setLocalResponses((responses) => ({
      ...responses,
      [questionId]: {
        ...responses[questionId],
        finalAnswer: saved.finalAnswer ?? responses[questionId]?.finalAnswer,
        flagged: saved.flagged,
        revealed,
        correct: revealed ? saved.correct : null,
        correctAnswer: revealed ? saved.correctAnswer : null,
        explanation: revealed ? saved.explanation : null,
      },
    }));
  };

  const updateResponse = (
    questionId: string,
    updates: { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean },
    options?: { checkAnswer?: boolean },
  ) => {
    const current = localResponses[questionId] ?? {};
    if (isQuestionFeedbackRevealed(current) && updates.finalAnswer !== undefined) {
      return;
    }
    const next = { ...current, ...updates };
    setLocalResponses((responses) => ({ ...responses, [questionId]: next }));
    setSubmitError(null);
    setCheckError(null);
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
          checkAnswer: options?.checkAnswer,
          currentQuestionIndex,
        },
      },
      {
        onSuccess: (saved) => {
          applySavedFeedback(questionId, saved);
          queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) });
        },
        onError: (error) => {
          const message = (error as { data?: { error?: string } } | null)?.data?.error;
          if (options?.checkAnswer) {
            setCheckError(message || "Could not check this answer.");
          }
        },
      },
    );
  };

  const checkCurrentAnswer = (questionId: string) => {
    const current = localResponses[questionId] ?? {};
    if (!isAnsweredValue(current.finalAnswer) || isQuestionFeedbackRevealed(current)) return;
    updateResponse(questionId, { finalAnswer: current.finalAnswer }, { checkAnswer: true });
  };

  const persistQuestionIndex = (index: number) => {
    const question = assignment?.questions[index];
    if (!attemptId || viewer || !question || attempt?.status !== "active") return;
    const current = localResponses[question.id] ?? {};
    saveResponse.mutate({
      attemptId,
      data: {
        questionId: question.id,
        prediction: null,
        lockPrediction: false,
        finalAnswer: current.finalAnswer ?? null,
        flagged: current.flagged,
        timeSpentSeconds: 0,
        currentQuestionIndex: index,
      },
    });
  };

  const goToQuestion = (index: number) => {
    const next = normalizeQuestionIndex(index, assignment?.questions.length ?? 0);
    setCurrentQuestionIndex(next);
    persistQuestionIndex(next);
  };

  const pauseCurrentAttempt = (leaveAfterPause: boolean) => {
    if (!attemptId || viewer) return;
    if (attempt?.status === "paused") {
      if (leaveAfterPause) setLocation("/portal");
      return;
    }
    pauseAttempt.mutate(
      { attemptId, data: { currentQuestionIndex } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data);
          queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(assignmentId) });
          if (leaveAfterPause) setLocation("/portal");
        },
      },
    );
  };

  if (loadingAssignment) {
    return (
      <div className="p-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (assignmentError || !assignment) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary">
          ← Back to Dashboard
        </Link>
        <h2 className="text-2xl font-bold">Quiz could not be opened</h2>
        <p className="text-muted-foreground" data-testid="assignment-open-error">
          This quiz is unavailable or failed to load. Go back and try again — an empty error page
          is not a saved attempt.
        </p>
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
            {isUnfinishedHomeworkClientCopy(assignment.instructions) ? null : (
              <p className="text-muted-foreground">{assignment.instructions}</p>
            )}
            {collaborative ? (
              <p className="text-sm text-muted-foreground">
                {IN_SESSION_PRACTICE_CHECK_COPY} There is no prediction step and no empty auto-submit.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {inSessionHomework
                  ? `${IN_SESSION_PARTIAL_SUBMIT_COPY} ${IN_SESSION_PER_QUESTION_FEEDBACK_COPY}`
                  : "Your timer is tracked on the server. Answers autosave as you work. Pause hides the questions; Save for later leaves the quiz so you can Resume from the portal. Submit is blocked until at least one question is answered."}
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
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center space-y-5 px-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <Pause className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-bold">Attempt paused</h2>
        <p className="max-w-md text-lg text-muted-foreground">
          Your timer, answers, and place in the quiz are saved. Question content is hidden while
          paused.
        </p>
        {viewer ? (
          <p className="text-sm text-muted-foreground">Viewer mode is read only.</p>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Button
              size="lg"
              className="h-12 w-full rounded-full"
              onClick={() =>
                resumeAttempt.mutate(
                  { attemptId },
                  { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) },
                )
              }
              disabled={resumeAttempt.isPending}
            >
              <Play className="mr-2 h-5 w-5" /> Resume
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-full"
              data-testid="save-for-later"
              onClick={() => setLocation("/portal")}
            >
              <BookmarkPlus className="mr-2 h-5 w-5" /> Save for later
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10" data-testid="quiz-no-answerable-questions">
        <h2 className="text-2xl font-bold">No answerable questions</h2>
        <p className="text-muted-foreground">
          This quiz has no complete A–D multiple-choice items, so it cannot be taken here.
          Ask your tutor to replace the broken items. Flagged and reported questions aren’t scored.
        </p>
      </div>
    );
  }
  const question = questions[currentQuestionIndex];
  if (!question) return null;
  const response = localResponses[question.id] ?? {};
  const showPrediction = studentSeesPredictionStep(question.predictionFirst);
  const recordedHere = Boolean(response.finalAnswer?.trim());
  const revealedHere = isQuestionFeedbackRevealed(response);

  if (collaborative) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 pb-16">
        <p className="text-sm text-muted-foreground">
          {IN_SESSION_PRACTICE_CHECK_COPY} This is not a timed quiz.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="practice-problem-picker">
          {questions.map((item, index) => {
            const recorded = Boolean(localResponses[item.id]?.finalAnswer?.trim());
            const checked = isQuestionFeedbackRevealed(localResponses[item.id]);
            return (
              <Button
                key={item.id}
                size="sm"
                variant={index === currentQuestionIndex ? "default" : "outline"}
                onClick={() => goToQuestion(index)}
              >
                {index + 1}
                {checked ? " · checked" : recorded ? " · recorded" : ""}
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
            <QuizRichText
              text={question.stimulus}
              className="mt-5 text-white/90"
              imageClassName="my-3 h-auto max-h-[min(28rem,70vh)] w-auto max-w-full rounded-md bg-white"
              hideGarbledText={shouldHideQuizOcrStem(question)}
              hideImages={shouldHideMismatchedQuizFigures(question)}
            />
          ) : null}
          {shouldHideQuizOcrStem(question) || (isFigurePrimaryQuestion(question) && !question.prompt) ? null : (
            <QuizRichText
              text={question.prompt}
              className="mt-5 text-xl font-medium leading-relaxed"
              hideGarbledText={shouldHideQuizOcrStem(question)}
            />
          )}
          <div className="mt-6">
            {showPrediction ? (
              <p data-testid="prediction-step">Prediction first</p>
            ) : (
              <AnswerChoices
                question={question}
                selected={response.finalAnswer}
                disabled={viewer || revealedHere}
                tone="ink"
                onSelect={(value) => updateResponse(question.id, { finalAnswer: value })}
              />
            )}
          </div>
          {perQuestionFeedback && !revealedHere ? (
            <Button
              className="mt-4 rounded-full bg-white text-foreground hover:bg-white/90"
              data-testid="check-answer"
              disabled={viewer || !recordedHere || saveResponse.isPending}
              onClick={() => checkCurrentAnswer(question.id)}
            >
              {saveResponse.isPending ? "Checking…" : "Check answer"}
            </Button>
          ) : null}
          {perQuestionFeedback && revealedHere ? (
            <InSessionQuestionFeedback
              correct={response.correct}
              studentAnswer={response.finalAnswer}
              correctAnswer={response.correctAnswer}
              explanation={response.explanation}
              choices={question.choices}
              tone="ink"
            />
          ) : recordedHere ? (
            <p className="mt-4 text-sm text-white/75">Recorded. Check the answer, or open another problem.</p>
          ) : (
            <p className="mt-4 text-sm text-white/70">Choose an answer together, then check it.</p>
          )}
        </section>
        {checkError ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="check-answer-error">
            {checkError}
          </p>
        ) : null}
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
            onClick={() => goToQuestion(currentQuestionIndex - 1)}
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
            onClick={() => goToQuestion(currentQuestionIndex + 1)}
            disabled={currentQuestionIndex >= questions.length - 1}
          >
            Next problem <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateResponse(question.id, { flagged: !response.flagged })}
              className={response.flagged ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}
            >
              <Flag className="mr-2 h-4 w-4" /> {response.flagged ? "Flagged" : "Flag"}
            </Button>
            <p className="text-xs text-muted-foreground">Flagged and reported questions aren’t scored.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`rounded-md px-3 py-1 font-mono text-lg font-bold ${remainingSeconds <= 60 ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}
          >
            <Timer className="mr-1 inline h-4 w-4" />
            {formatTime(remainingSeconds)}
          </div>
          {!viewer && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => pauseCurrentAttempt(false)}
                disabled={pauseAttempt.isPending}
              >
                <Pause className="mr-2 h-4 w-4" /> Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                data-testid="save-for-later"
                onClick={() => pauseCurrentAttempt(true)}
                disabled={pauseAttempt.isPending}
              >
                <BookmarkPlus className="mr-2 h-4 w-4" /> Save for later
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                data-testid="report-question"
                onClick={() => {
                  setReportOpen((open) => !open);
                  setReportMessage(null);
                }}
                disabled={reportPending || reportedQuestionIds.has(question.id)}
              >
                <CircleAlert className="mr-2 h-4 w-4" />
                {reportedQuestionIds.has(question.id) ? "Reported" : "Report question"}
              </Button>
            </>
          )}
        </div>
      </div>
      {reportOpen && !viewer && attemptId ? (
        <form
          className="space-y-3 rounded-xl border bg-muted/20 p-4"
          data-testid="report-question-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setReportPending(true);
            setReportMessage(null);
            try {
              await customFetch(`/api/attempts/${attemptId}/question-reports`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  questionId: question.id,
                  reason: reportReason,
                  note: reportNote.trim() || undefined,
                }),
              });
              setReportedQuestionIds((current) => new Set(current).add(question.id));
              setReportOpen(false);
              setReportNote("");
              setReportMessage("Reported. You can keep going — this question isn’t scored.");
            } catch (error) {
              setReportMessage(error instanceof Error ? error.message : "Could not report this question.");
            } finally {
              setReportPending(false);
            }
          }}
        >
          <p className="text-sm font-medium">
            Report this question as incorrect or a bug. You can continue the quiz after sending it.
            Reported questions aren’t scored.
          </p>
          <label className="block text-sm">
            <span className="text-muted-foreground">Reason</span>
            <select
              className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value as "incorrect" | "bug" | "other")}
            >
              <option value="incorrect">Answer or wording looks incorrect</option>
              <option value="bug">Broken display / missing figure</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Optional note</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              placeholder="What looks wrong?"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={reportPending}>
              {reportPending ? "Sending…" : "Send report"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {reportMessage ? (
        <p className="text-sm text-muted-foreground" data-testid="report-question-status">
          {reportMessage}
        </p>
      ) : null}
      <div
        className="min-w-0 space-y-6 overflow-visible pt-4"
        data-testid={isFigurePrimaryQuestion(question) ? "figure-primary-question" : "quiz-question-stem"}
      >
        <div className="min-w-0 space-y-6 overflow-visible" data-testid="quiz-stimulus-panel">
          {question.stimulus && (
            <Card className="overflow-visible border-0 bg-muted/30 shadow-none">
              <CardContent className="min-w-0 overflow-x-auto overflow-y-visible p-6">
                <QuizRichText
                  text={question.stimulus}
                  hideGarbledText={shouldHideQuizOcrStem(question)}
                  hideImages={shouldHideMismatchedQuizFigures(question)}
                />
              </CardContent>
            </Card>
          )}
          {shouldHideQuizOcrStem(question) || (isFigurePrimaryQuestion(question) && !question.prompt) ? null : (
            <QuizRichText
              text={question.prompt}
              className="text-lg font-medium leading-relaxed"
              hideGarbledText={shouldHideQuizOcrStem(question)}
            />
          )}
        </div>
      </div>
      <div className="-mt-4">
        {showPrediction ? (
          <p data-testid="prediction-step">Prediction first</p>
        ) : (
          <AnswerChoices
            question={question}
            selected={response.finalAnswer}
            disabled={viewer || revealedHere}
            onSelect={(value) => updateResponse(question.id, { finalAnswer: value })}
          />
        )}
      </div>
      {perQuestionFeedback && !revealedHere ? (
        <Button
          className="rounded-full"
          data-testid="check-answer"
          disabled={viewer || !recordedHere || saveResponse.isPending}
          onClick={() => checkCurrentAnswer(question.id)}
        >
          {saveResponse.isPending ? "Checking…" : "Check answer"}
        </Button>
      ) : null}
      {perQuestionFeedback && revealedHere ? (
        <InSessionQuestionFeedback
          correct={response.correct}
          studentAnswer={response.finalAnswer}
          correctAnswer={response.correctAnswer}
          explanation={response.explanation}
          choices={question.choices}
        />
      ) : null}
      {inSessionHomework ? (
        <p className="text-sm text-muted-foreground" data-testid="partial-submit-in-session">
          {IN_SESSION_PARTIAL_SUBMIT_COPY} {IN_SESSION_PER_QUESTION_FEEDBACK_COPY}
        </p>
      ) : null}
      {checkError ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="check-answer-error">
          {checkError}
        </p>
      ) : null}
      {submitError || (!submitGuard.ok && submitGuard.reason === "empty") ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="empty-submit-error">
          {submitError || EMPTY_SUBMIT_MESSAGE}
        </p>
      ) : null}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Button
            variant="outline"
            size="lg"
            className="rounded-full"
            onClick={() => goToQuestion(currentQuestionIndex - 1)}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="mr-1 h-5 w-5" /> Previous
          </Button>
          {inSessionHomework ? (
            <Button
              size="lg"
              className="rounded-full bg-accent text-white hover:bg-accent/90"
              onClick={submit}
              disabled={!submitGuard.ok}
              data-testid="submit-in-session-homework"
            >
              {submitAttempt.isPending ? "Submitting…" : viewer ? "Viewer mode" : "Submit for results"}{" "}
              <CheckCircle className="ml-2 h-5 w-5" />
            </Button>
          ) : null}
          {currentQuestionIndex < questions.length - 1 ? (
            <Button
              size="lg"
              className="rounded-full"
              onClick={() => goToQuestion(currentQuestionIndex + 1)}
            >
              Next <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          ) : inSessionHomework ? null : (
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
