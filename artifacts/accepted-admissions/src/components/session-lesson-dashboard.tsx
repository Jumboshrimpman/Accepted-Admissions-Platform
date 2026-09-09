import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSessionLessonQueryKey,
  useGetCurrentUser,
  useGetSessionLesson,
  useRecordRetryOutcome,
  useRequestSessionRetry,
} from "@workspace/api-client-react";
import { BookOpenCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  displaySkill,
  missPickerLabel,
  retryOutcomeHeading,
  retryRecordedMessage,
  retrySourceLabel,
} from "./session-lesson-display";

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string; blockedReason?: string } } | null)?.data;
  return data?.blockedReason || data?.error || "The lesson request could not be completed.";
}

function formatAnswer(
  answer: string | null | undefined,
  choices?: Array<{ id: string; label: string; text: string }>,
) {
  if (!answer) return "Not answered";
  const match = choices?.find(
    (choice) =>
      choice.id.toLowerCase() === answer.toLowerCase() ||
      choice.label.toLowerCase() === answer.toLowerCase(),
  );
  return match ? `${match.label}. ${match.text}` : answer;
}

export function SessionLessonDashboard({
  sessionId,
  audience = "tutor",
}: {
  sessionId: string;
  audience?: "tutor" | "student";
}) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const canRecord = currentUser?.role !== "viewer";
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
          <BookOpenCheck className="h-5 w-5 text-primary" />{" "}
          {audience === "student" ? "Practice together from pre-work" : "Session lesson from pre-work"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Open a wrong answer, review the official explanation, try a similar problem, and see if the
          new answer is correct.
        </p>
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
              : "Waiting on pre-work to be submitted so you can open misses together."}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="font-medium">Priority weaknesses</p>
            {data.weaknessGroups.map((group) => (
              <div key={group.id} className="rounded-xl border bg-background p-3" data-testid={`weakness-group-${group.priority}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Priority {group.priority}</Badge>
                  <span className="font-medium">{displaySkill(group.skill, group.domain)}</span>
                  <span className="text-sm text-muted-foreground">{group.missCount} miss{group.missCount === 1 ? "" : "es"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.misses.length > 0 ? (
          <div className="space-y-3">
            <p className="font-medium">Open a wrong answer to review with correct explanation</p>
            <div className="flex flex-wrap gap-2">
              {data.misses.map((miss, index) => (
                <Button
                  key={miss.questionId}
                  size="sm"
                  variant={selectedMiss?.questionId === miss.questionId ? "default" : "outline"}
                  data-testid={`miss-picker-${miss.questionId}`}
                  onClick={() => setOpenMiss(miss.questionId)}
                >
                  {missPickerLabel(miss, index)}
                </Button>
              ))}
            </div>
            {selectedMiss ? (
              <div className="rounded-3xl bg-brand-ink p-5 text-white shadow-lg" data-testid="opened-miss">
                <Badge className="border-0 bg-white/20 text-white">
                  {displaySkill(selectedMiss.skill, selectedMiss.domain)}
                </Badge>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  Review this wrong answer together
                </p>
                <p className="mt-2 font-medium">{selectedMiss.prompt}</p>
                {selectedMiss.stimulus ? (
                  <p className="mt-2 text-sm text-white/75">{selectedMiss.stimulus}</p>
                ) : null}
                {selectedMiss.choices && selectedMiss.choices.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-white/90" data-testid="opened-miss-choices">
                    {selectedMiss.choices.map((choice) => (
                      <li key={choice.id}>
                        {choice.label}. {choice.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-sm">
                  <span className="font-medium">Student answer:</span>{" "}
                  {formatAnswer(selectedMiss.studentAnswer, selectedMiss.choices)}
                </p>
                <p className="mt-2 text-sm" data-testid="opened-miss-correct-answer">
                  <span className="font-medium">Correct answer:</span>{" "}
                  {formatAnswer(selectedMiss.correctAnswer, selectedMiss.choices)}
                </p>
                <div className="mt-3 rounded-lg bg-white/10 p-3 text-sm">
                  <p className="font-medium">Official explanation</p>
                  <p className="mt-1 text-white/75">
                    {selectedMiss.officialExplanation ||
                      "Official explanation is not in the extract yet. Do not invent College Board wording."}
                  </p>
                </div>
                {selectedMiss.aiTutorGuidance ? (
                  <div className="mt-3 rounded-lg border border-white/20 p-3 text-sm">
                    <p className="font-medium">AI tutor guidance (separate)</p>
                    <p className="mt-1 text-white/75">{selectedMiss.aiTutorGuidance}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-white/70">
                    No AI annotation yet. Official explanation is preferred when present.
                  </p>
                )}
                {canRecord ? (
                  <Button
                    size="sm"
                    className="mt-3 bg-white text-foreground hover:bg-white/90"
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
                                  "A similar problem is not available. OPENAI_API_KEY is required only after the bank is exhausted.",
                              );
                            } else {
                              setMessage(
                                retry.source === "bank"
                                  ? "Similar problem ready. Discuss it, choose together, then check the answer."
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
                    {requestRetry.isPending ? "Finding similar…" : "Try a similar problem"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {data.retries.length > 0 ? (
          <div className="space-y-3">
            <p className="font-medium">Similar problems</p>
            {data.retries.map((retry) => {
              const heading = retryOutcomeHeading(retry);
              const graded = retry.outcome !== "pending";
              return (
                <div
                  key={retry.id}
                  className={
                    retry.outcome === "pending" && retry.retryQuestionId
                      ? "rounded-3xl bg-brand-ink p-5 text-white shadow-lg"
                      : "rounded-lg border p-3 text-sm"
                  }
                  data-testid={`retry-${retry.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        retry.outcome === "pending" && retry.retryQuestionId
                          ? "border-white/30 text-white"
                          : undefined
                      }
                    >
                      {retrySourceLabel(retry.source)}
                    </Badge>
                    {heading ? (
                      <Badge
                        data-testid={`retry-outcome-${retry.id}`}
                        className={
                          heading === "Correct"
                            ? "border-0 bg-emerald-600 text-white"
                            : "border-0 bg-rose-600 text-white"
                        }
                      >
                        {heading}
                      </Badge>
                    ) : null}
                  </div>
                  {retry.prompt ? (
                    <p className="mt-2" data-testid={`retry-prompt-${retry.id}`}>
                      {retry.prompt}
                    </p>
                  ) : null}
                  {retry.choices && retry.choices.length > 0 ? (
                    retry.outcome === "pending" && retry.retryQuestionId ? (
                      <div className="mt-3 space-y-2">
                        {retry.choices.map((choice) => (
                          <button
                            key={choice.id}
                            type="button"
                            data-testid={`retry-choice-${retry.id}-${choice.id}`}
                            className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left ${
                              retryAnswer === choice.id || retryAnswer === choice.label
                                ? "border-white bg-white/15"
                                : "border-white/25 hover:bg-white/10"
                            }`}
                            onClick={() => setRetryAnswer(choice.id)}
                          >
                            <span className="font-medium">{choice.label}.</span> {choice.text}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {retry.choices.map((choice) => (
                          <li key={choice.id}>
                            {choice.label}. {choice.text}
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                  {graded ? (
                    <div className="mt-3 space-y-1" data-testid={`retry-feedback-${retry.id}`}>
                      {retry.studentAnswer ? (
                        <p>
                          <span className="font-medium">Your answer:</span>{" "}
                          {formatAnswer(retry.studentAnswer, retry.choices)}
                        </p>
                      ) : null}
                      {heading === "Incorrect" && retry.correctAnswer ? (
                        <p>
                          <span className="font-medium">Correct answer:</span>{" "}
                          {formatAnswer(retry.correctAnswer, retry.choices)}
                        </p>
                      ) : null}
                      {heading === "Incorrect" && retry.explanation ? (
                        <p className="text-muted-foreground">{retry.explanation}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {retry.blockedReason ? (
                    <p className="mt-1 text-muted-foreground">{retry.blockedReason}</p>
                  ) : null}
                </div>
              );
            })}
            {activeRetry && canRecord ? (
              <div className="flex flex-wrap gap-2">
                {!(activeRetry.choices && activeRetry.choices.length > 0) ? (
                  <input
                    aria-label="Retry answer"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={retryAnswer}
                    onChange={(event) => setRetryAnswer(event.target.value)}
                    placeholder="Student answer"
                  />
                ) : null}
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
                            retryRecordedMessage({
                              correct: result.correct,
                              formattedCorrectAnswer: formatAnswer(
                                result.correctAnswer,
                                activeRetry.choices,
                              ),
                              explanation: result.explanation,
                            }),
                          );
                          setRetryAnswer("");
                          refresh();
                        },
                        onError: (error) => setMessage(errorText(error)),
                      },
                    )
                  }
                >
                  Check answer
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
