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
  Lock,
  Pause,
  Play,
  Timer,
} from "lucide-react";

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

function ResultView({
  result,
}: {
  result: AttemptResult;
}) {
  const correctPercent = result.totalCount
    ? Math.round((result.correctCount / result.totalCount) * 100)
    : 0;
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
              <h1 className="text-3xl font-bold">Your SAT result</h1>
              <p className="mt-2 text-white/80">
                {result.correctCount} of {result.totalCount} correct · {formatTime(result.activeSeconds)} active
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 px-6 py-4 text-center">
              <div className="text-5xl font-bold">{Math.round(result.score)}%</div>
              <div className="text-sm text-white/75">overall score</div>
            </div>
          </div>
        </div>
        <CardContent className="space-y-6 p-6">
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
              <CardHeader className="pb-2"><CardTitle className="text-base">Strengths</CardTitle></CardHeader>
              <CardContent><ul className="space-y-2 text-sm">{result.analysis.strengths.map((item) => <li key={item}>✓ {item}</li>)}</ul></CardContent>
            </Card>
            <Card className="bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2"><CardTitle className="text-base">Next focus</CardTitle></CardHeader>
              <CardContent><ul className="space-y-2 text-sm">{result.analysis.nextFocus.map((item) => <li key={item}>→ {item}</li>)}</ul></CardContent>
            </Card>
          </div>
          <div>
            <h2 className="mb-3 text-xl font-bold">Skill breakdown</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.breakdown.map((skill) => (
                <div key={skill.skill} className="rounded-xl border p-4">
                  <div className="font-medium">{skill.skill}</div>
                  <div className="mt-1 text-2xl font-bold">{Math.round(skill.accuracy ?? 0)}%</div>
                  <div className="text-xs text-muted-foreground">{skill.correct} / {skill.total} correct</div>
                </div>
              ))}
            </div>
          </div>
          {result.analysis.weaknesses.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <h2 className="mb-2 font-semibold">Skills to revisit</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">{result.analysis.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <div>
            <h2 className="mb-3 text-xl font-bold">Question review</h2>
            <div className="space-y-3">
              {result.items.map((item, index) => (
                <Card key={item.questionId} className={item.correct ? "border-emerald-200" : "border-amber-200"}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.correct ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{index + 1}</div>
                        <div>
                          <Badge variant="outline">{item.skill}</Badge>
                          <p className="mt-2 font-medium">{item.prompt}</p>
                        </div>
                      </div>
                      {item.correct ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-600" />}
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">Your answer:</span> {answerText(item.finalAnswer, item.choices)}</div>
                      <div className="rounded-lg bg-primary/5 p-3"><span className="text-muted-foreground">Correct answer:</span> {answerText(item.correctAnswer, item.choices)}</div>
                    </div>
                    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Why:</span> {item.explanation}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{correctPercent}% of questions were correct. Your tutor can use this result to plan the next session.</p>
        </CardContent>
      </Card>
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
  const [localResponses, setLocalResponses] = useState<Record<string, { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean }>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const expirySubmitted = useRef(false);

  useEffect(() => {
    if (!attemptId && assignment?.latestAttemptId) setAttemptId(assignment.latestAttemptId);
  }, [assignment?.latestAttemptId, attemptId]);

  useEffect(() => {
    if (!attempt) return;
    setRemainingSeconds(attempt.remainingSeconds);
    const responseMap: Record<string, { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean }> = {};
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
    if (attempt?.status !== "active") return;
    const interval = window.setInterval(() => setRemainingSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [attempt?.status]);

  const submit = useCallback(() => {
    if (!attemptId || submitAttempt.isPending || expirySubmitted.current) return;
    expirySubmitted.current = true;
    submitAttempt.mutate({ attemptId, data: { confirm: true } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) });
        queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(assignmentId) });
        queryClient.invalidateQueries({ queryKey: getGetAttemptResultQueryKey(attemptId) });
      },
      onError: () => { expirySubmitted.current = false; },
    });
  }, [attemptId, assignmentId, queryClient, submitAttempt]);

  useEffect(() => {
    if (attempt?.status === "active" && remainingSeconds <= 0) submit();
  }, [attempt?.status, remainingSeconds, submit]);

  const updateResponse = (questionId: string, updates: { prediction?: string; finalAnswer?: string; locked?: boolean; flagged?: boolean }) => {
    const current = localResponses[questionId] ?? {};
    const next = { ...current, ...updates };
    setLocalResponses((responses) => ({ ...responses, [questionId]: next }));
    if (!attemptId || viewer) return;
    saveResponse.mutate({
      attemptId,
      data: {
        questionId,
        prediction: next.prediction ?? null,
        lockPrediction: next.locked,
        finalAnswer: next.finalAnswer ?? null,
        flagged: next.flagged,
        timeSpentSeconds: 0,
      },
    }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAttemptQueryKey(attemptId) }) });
  };

  if (loadingAssignment || !assignment) return <div className="p-8"><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (!attemptId) {
    return (
      <div className="mx-auto max-w-3xl space-y-8 py-8">
        <Link href="/portal" className="text-sm text-muted-foreground hover:text-primary">← Back to Dashboard</Link>
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="border-b bg-primary/5 pb-6">
            <Badge variant="outline" className="mb-3 w-fit">{assignment.subject}</Badge>
            <CardTitle className="text-3xl">{assignment.title}</CardTitle>
            <div className="mt-3 flex gap-4 text-sm text-muted-foreground"><span><Timer className="mr-1 inline h-4 w-4" />{assignment.timeLimitMinutes} min</span><span>{assignment.questionCount} questions</span></div>
          </CardHeader>
          <CardContent className="space-y-4 p-6"><p className="whitespace-pre-wrap text-muted-foreground">{assignment.instructions}</p><p className="text-sm text-muted-foreground">Your timer is tracked on the server. You can pause, and your responses autosave as you work.</p></CardContent>
          <CardContent className="bg-muted/30"><Button size="lg" className="w-full rounded-full" onClick={() => startAttempt.mutate({ assignmentId }, { onSuccess: (data) => setAttemptId(data.id) })} disabled={viewer || startAttempt.isPending}>{viewer ? "Viewer mode — read only" : startAttempt.isPending ? "Starting…" : "Start quiz"}</Button></CardContent>
        </Card>
      </div>
    );
  }
  if (loadingAttempt || !attempt) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (attempt.status === "submitted" || attempt.status === "expired") {
    if (resultQuery.isLoading || !resultQuery.data) return <div className="p-8"><Skeleton className="h-96 w-full rounded-2xl" /></div>;
    return <ResultView result={resultQuery.data} />;
  }
  if (attempt.status === "paused") {
    return <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center space-y-5 text-center"><div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted"><Pause className="h-10 w-10 text-muted-foreground" /></div><h2 className="text-3xl font-bold">Attempt paused</h2><p className="max-w-md text-lg text-muted-foreground">Your timer and responses are saved. Question content is hidden while paused.</p>{viewer ? <p className="text-sm text-muted-foreground">Viewer mode is read only.</p> : <Button size="lg" className="rounded-full" onClick={() => resumeAttempt.mutate({ attemptId }, { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) })} disabled={resumeAttempt.isPending}><Play className="mr-2 h-5 w-5" /> Resume assignment</Button>}</div>;
  }
  const question = assignment.questions[currentQuestionIndex];
  if (!question) return null;
  const response = localResponses[question.id] ?? {};
  const predictionLocked = response.locked || !question.predictionFirst;
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div className="sticky top-16 z-30 flex items-center justify-between border-b bg-background/95 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4"><span className="text-lg font-semibold">Question {currentQuestionIndex + 1} of {assignment.questions.length}</span><Button variant="ghost" size="sm" onClick={() => updateResponse(question.id, { flagged: !response.flagged })} className={response.flagged ? "bg-destructive/10 text-destructive" : "text-muted-foreground"}><Flag className="mr-2 h-4 w-4" /> {response.flagged ? "Flagged" : "Flag"}</Button></div>
        <div className="flex items-center gap-3"><div className={`rounded-md px-3 py-1 font-mono text-lg font-bold ${remainingSeconds <= 60 ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}><Timer className="mr-1 inline h-4 w-4" />{formatTime(remainingSeconds)}</div>{!viewer && <Button variant="outline" size="sm" onClick={() => pauseAttempt.mutate({ attemptId }, { onSuccess: (data) => queryClient.setQueryData(getGetAttemptQueryKey(attemptId), data) })} disabled={pauseAttempt.isPending}><Pause className="mr-2 h-4 w-4" /> Pause</Button>}</div>
      </div>
      <div className="grid gap-8 pt-4 md:grid-cols-2">
        <div className="space-y-6">{question.stimulus && <Card className="border-0 bg-muted/30 shadow-none"><CardContent className="p-6"><p className="whitespace-pre-wrap">{question.stimulus}</p></CardContent></Card>}<div className="text-lg font-medium leading-relaxed">{question.prompt}</div></div>
        <div className="space-y-6">
          {question.predictionFirst && <Card className={`border-2 ${predictionLocked ? "border-muted opacity-80" : "border-accent shadow-md shadow-accent/10"}`}><CardHeader className="py-4"><CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-accent" /> Prediction first</CardTitle></CardHeader><CardContent className="space-y-4 pt-2"><Textarea placeholder="Predict the answer before looking at choices…" value={response.prediction ?? ""} onChange={(event) => updateResponse(question.id, { prediction: event.target.value })} disabled={viewer || predictionLocked} className="min-h-24 resize-none" />{!predictionLocked && !viewer && <div className="flex gap-3"><Button className="w-full" onClick={() => updateResponse(question.id, { locked: true })}><Lock className="mr-2 h-4 w-4" /> Lock prediction</Button><Button variant="outline" onClick={() => updateResponse(question.id, { locked: true, prediction: "I don't know" })}>I don&apos;t know</Button></div>}</CardContent></Card>}
          {predictionLocked && question.choices && <div className="space-y-3"><h3 className="text-lg font-semibold">Select your answer</h3>{question.choices.map((choice) => { const selected = response.finalAnswer === choice.id; return <button key={choice.id} disabled={viewer} onClick={() => updateResponse(question.id, { finalAnswer: choice.id })} className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/50"} ${viewer ? "cursor-default" : ""}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-medium ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{choice.label}</div><div className="flex-1">{choice.text}</div></button>; })}</div>}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4"><div className="mx-auto flex max-w-4xl items-center justify-between"><Button variant="outline" size="lg" className="rounded-full" onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))} disabled={currentQuestionIndex === 0}><ChevronLeft className="mr-1 h-5 w-5" /> Previous</Button>{currentQuestionIndex < assignment.questions.length - 1 ? <Button size="lg" className="rounded-full" onClick={() => setCurrentQuestionIndex((index) => Math.min(assignment.questions.length - 1, index + 1))}>Next <ChevronRight className="ml-1 h-5 w-5" /></Button> : <Button size="lg" className="rounded-full bg-accent text-white hover:bg-accent/90" onClick={submit} disabled={viewer || submitAttempt.isPending}>{submitAttempt.isPending ? "Submitting…" : viewer ? "Viewer mode" : "Submit assignment"} <CheckCircle className="ml-2 h-5 w-5" /></Button>}</div></div>
    </div>
  );
}