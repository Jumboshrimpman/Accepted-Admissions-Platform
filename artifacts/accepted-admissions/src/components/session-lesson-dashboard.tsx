import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSessionLessonQueryKey,
  useGetSessionLesson,
  useRecordRetryOutcome,
  useRequestSessionRetry,
} from "@workspace/api-client-react";
import { BookOpenCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string; blockedReason?: string } } | null)?.data;
  return data?.blockedReason || data?.error || "The lesson request could not be completed.";
}

export function SessionLessonDashboard({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const lesson = useGetSessionLesson(sessionId, {
    query: {
      enabled: Boolean(sessionId),
      queryKey: getGetSessionLessonQueryKey(sessionId),
    },
  });
  const requestRetry = useRequestSessionRetry();
  const recordOutcome = useRecordRetryOutcome();
  const [openMiss, setOpenMiss] = useState<string | null>(null);
  const [retryAnswer, setRetryAnswer] = useState("");
  const [message, setMessage] = useState("");
  const data = lesson.data;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetSessionLessonQueryKey(sessionId) });

  if (lesson.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading session lesson…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Session lesson is unavailable until this meeting can be loaded.
      </p>
    );
  }

  const selectedMiss = data.misses.find((item) => item.questionId === openMiss) ?? data.misses[0];
  const activeRetry = data.retries.find((item) => item.outcome === "pending" && item.retryQuestionId);

  return (
    <Card className="border-primary/20" data-testid="session-lesson-dashboard">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-primary" /> Session lesson from pre-work
        </CardTitle>
        <p className="text-sm text-muted-foreground">{data.scoreHonesty}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{message}</p> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs uppercase text-muted-foreground">Accuracy</p>
            <p className="text-2xl font-semibold">
              {data.accuracyPercent == null ? "—" : `${Math.round(data.accuracyPercent)}%`}
            </p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs uppercase text-muted-foreground">Weakness groups</p>
            <p className="text-2xl font-semibold">{data.weaknessGroups.length}</p>
          </div>
          <div className="rounded-xl border bg-background p-3">
            <p className="text-xs uppercase text-muted-foreground">Reporting</p>
            <p className="text-sm font-medium">
              {data.scoreReporting === "none" ? "Accuracy only" : "Estimated diagnostic"}
            </p>
          </div>
        </div>

        {data.weaknessGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.attemptId
              ? "No grouped misses. Use leftover time on harder bank items if needed."
              : "Waiting on the student to submit the 60-minute pre-work."}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="font-medium">Priority weaknesses</p>
            {data.weaknessGroups.map((group) => (
              <div key={group.id} className="rounded-xl border bg-background p-3" data-testid={`weakness-group-${group.priority}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Priority {group.priority}</Badge>
                  <span className="font-medium">{group.skill}</span>
                  <span className="text-sm text-muted-foreground">{group.missCount} miss{group.missCount === 1 ? "" : "es"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.misses.length > 0 ? (
          <div className="space-y-3">
            <p className="font-medium">Open a miss with teaching context</p>
            <div className="flex flex-wrap gap-2">
              {data.misses.map((miss) => (
                <Button
                  key={miss.questionId}
                  size="sm"
                  variant={selectedMiss?.questionId === miss.questionId ? "default" : "outline"}
                  onClick={() => setOpenMiss(miss.questionId)}
                >
                  {miss.skill}
                </Button>
              ))}
            </div>
            {selectedMiss ? (
              <div className="rounded-xl border p-4" data-testid="opened-miss">
                <Badge variant="outline">{selectedMiss.skill}</Badge>
                <p className="mt-2 font-medium">{selectedMiss.prompt}</p>
                {selectedMiss.stimulus ? (
                  <p className="mt-2 text-sm text-muted-foreground">{selectedMiss.stimulus}</p>
                ) : null}
                <p className="mt-3 text-sm">
                  <span className="font-medium">Student answer:</span>{" "}
                  {selectedMiss.studentAnswer || "Not answered"}
                </p>
                <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Official explanation</p>
                  <p className="mt-1 text-muted-foreground">
                    {selectedMiss.officialExplanation ||
                      "Official explanation is not in the extract yet. Do not invent College Board wording."}
                  </p>
                </div>
                {selectedMiss.aiTutorGuidance ? (
                  <div className="mt-3 rounded-lg border p-3 text-sm">
                    <p className="font-medium">AI tutor guidance (separate)</p>
                    <p className="mt-1 text-muted-foreground">{selectedMiss.aiTutorGuidance}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No AI annotation yet. Official explanation is preferred when present.
                  </p>
                )}
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={requestRetry.isPending}
                  data-testid="request-similar-retry"
                  onClick={() =>
                    requestRetry.mutate(
                      { sessionId, data: { sourceQuestionId: selectedMiss.questionId } },
                      {
                        onSuccess: (retry) => {
                          if (retry.source === "blocked") {
                            setMessage(
                              retry.blockedReason ||
                                "Retry blocked. OPENAI_API_KEY is required only after the bank is exhausted.",
                            );
                          } else {
                            setMessage(
                              retry.source === "bank"
                                ? "Unused similar bank question ready. Answer is hidden until you record the outcome."
                                : "Analogous original item drafted. Official wording was not copied.",
                            );
                          }
                          refresh();
                        },
                        onError: (error) => setMessage(errorText(error)),
                      },
                    )
                  }
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {requestRetry.isPending ? "Finding retry…" : "Request similar retry"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {data.retries.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium">Retry outcomes</p>
            {data.retries.map((retry) => (
              <div key={retry.id} className="rounded-lg border p-3 text-sm" data-testid={`retry-${retry.id}`}>
                <Badge variant="outline">{retry.source}</Badge>{" "}
                <span>{retry.outcome.replaceAll("_", " ")}</span>
                {retry.prompt ? (
                  <p className="mt-2" data-testid={`retry-prompt-${retry.id}`}>
                    {retry.prompt}
                  </p>
                ) : null}
                {retry.choices && retry.choices.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {retry.choices.map((choice) => (
                      <li key={choice.id}>
                        {choice.label}. {choice.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {retry.blockedReason ? (
                  <p className="mt-1 text-muted-foreground">{retry.blockedReason}</p>
                ) : null}
              </div>
            ))}
            {activeRetry ? (
              <div className="flex flex-wrap gap-2">
                <input
                  aria-label="Retry answer"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={retryAnswer}
                  onChange={(event) => setRetryAnswer(event.target.value)}
                  placeholder="Student answer (a–d)"
                />
                <Button
                  size="sm"
                  disabled={recordOutcome.isPending || !retryAnswer.trim()}
                  data-testid="record-retry-outcome"
                  onClick={() =>
                    recordOutcome.mutate(
                      { retryId: activeRetry.id, data: { studentAnswer: retryAnswer.trim() } },
                      {
                        onSuccess: (result) => {
                          setMessage(
                            result.outcome === "mastered"
                              ? "Recorded as mastered."
                              : "Recorded as still struggling.",
                          );
                          setRetryAnswer("");
                          refresh();
                        },
                        onError: (error) => setMessage(errorText(error)),
                      },
                    )
                  }
                >
                  Record outcome
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
