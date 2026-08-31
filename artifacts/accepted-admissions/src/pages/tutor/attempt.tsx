import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  getGetAttemptResultQueryKey,
  getListReviewSubmissionsQueryKey,
  type AttemptResult,
  useGetAttemptResult,
  useUpdateAttemptReview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ChevronRight, CircleAlert, Save } from "lucide-react";

function answerText(answer: string | null | undefined, choices: AttemptResult["items"][number]["choices"]) {
  if (!answer) return "Not answered";
  return choices?.find((choice) => choice.id === answer)?.text ?? answer.toUpperCase();
}

export default function TutorAttempt() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const queryClient = useQueryClient();
  const { data: result, isLoading, error } = useGetAttemptResult(attemptId, {
    query: { enabled: Boolean(attemptId), queryKey: getGetAttemptResultQueryKey(attemptId) },
  });
  const [notes, setNotes] = useState<string | null>(null);
  const updateReview = useUpdateAttemptReview();

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  if (error || !result) return <div className="rounded-2xl bg-destructive/10 p-8 text-center text-destructive">This submission is not available.</div>;
  const tutorNotes = notes ?? result.tutorNotes ?? "";
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 animate-in fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/tutor" className="hover:text-primary">Dashboard</Link><ChevronRight className="h-4 w-4" /><span>Submission review</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold">SAT submission review</h1><p className="mt-1 text-muted-foreground">Consolidated result · {result.correctCount} / {result.totalCount} correct</p></div>
        <Badge variant={result.reviewStatus === "reviewed" ? "default" : "outline"}>{result.reviewStatus ?? "new"}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Score</div><div className="text-3xl font-bold">{Math.round(result.score)}%</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Active time</div><div className="text-3xl font-bold">{Math.floor(result.activeSeconds / 60)}m</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Mistakes</div><div className="text-3xl font-bold">{result.items.filter((item) => !item.correct).length}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">Analysis</div><div className="mt-1 font-semibold">{result.analysis.label}</div></CardContent></Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Strengths</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{result.analysis.strengths.map((item) => <li key={item}>✓ {item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>Recommended next focus</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{result.analysis.nextFocus.map((item) => <li key={item}>→ {item}</li>)}</ul></CardContent></Card>
      </div>
      <Card className="border-amber-200 dark:border-amber-900"><CardHeader><CardTitle>Mistake patterns</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{result.analysis.mistakePatterns.map((item) => <li key={item}>• {item}</li>)}</ul></CardContent></Card>
      <Card><CardHeader><CardTitle>Private tutor notes</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={tutorNotes} onChange={(event) => setNotes(event.target.value)} placeholder="Record what to revisit in the next session…" className="min-h-28" /><div className="flex flex-wrap gap-2"><Button onClick={() => updateReview.mutate({ attemptId, data: { reviewStatus: "in_review", tutorNotes } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetAttemptResultQueryKey(attemptId) }); queryClient.invalidateQueries({ queryKey: getListReviewSubmissionsQueryKey() }); } })} disabled={updateReview.isPending}><Save className="mr-2 h-4 w-4" /> Save notes</Button><Button variant="outline" onClick={() => updateReview.mutate({ attemptId, data: { reviewStatus: "reviewed", tutorNotes } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetAttemptResultQueryKey(attemptId) }); queryClient.invalidateQueries({ queryKey: getListReviewSubmissionsQueryKey() }); } })} disabled={updateReview.isPending}>Mark reviewed</Button></div></CardContent></Card>
      <div><h2 className="mb-3 text-xl font-bold">Question-by-question review</h2><div className="space-y-3">{result.items.map((item, index) => <Card key={item.questionId} className={item.correct ? "border-emerald-200" : "border-amber-200"}><CardContent className="space-y-3 p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.correct ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{index + 1}</div><div><Badge variant="outline">{item.skill}</Badge><p className="mt-2 font-medium">{item.prompt}</p></div></div>{item.correct ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-600" />}</div><div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-lg bg-muted/50 p-3"><span className="text-muted-foreground">Student:</span> {answerText(item.finalAnswer, item.choices)}</div><div className="rounded-lg bg-primary/5 p-3"><span className="text-muted-foreground">Correct:</span> {answerText(item.correctAnswer, item.choices)}</div></div><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Explanation:</span> {item.explanation}</p>{item.prediction && <p className="text-xs text-muted-foreground">Prediction first: {item.prediction}</p>}</CardContent></Card>)}</div></div>
    </div>
  );
}