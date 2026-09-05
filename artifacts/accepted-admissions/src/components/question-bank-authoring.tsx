import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListContentSourcesQueryKey,
  getListQuestionBankQueryKey,
  type QuestionBankItem,
  useAttachQuestionToAssignment,
  useCreateContentSource,
  useGeneratePracticeQuestions,
  useListContentSources,
  useUpdateQuestionBankItem,
} from "@workspace/api-client-react";
import { CheckCircle2, Save, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function apiErrorText(error: unknown): string {
  const data = (error as { data?: { error?: string; conflicts?: string[] } } | null)?.data;
  if (!data) return "The operation could not be completed.";
  return [data.error, ...(data.conflicts ?? [])].filter(Boolean).join(" ");
}

export function QuestionReviewCard({
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
  const [message, setMessage] = useState("");

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
          rejectionReason: reviewStatus === "rejected" ? rejectionReason : null,
        },
      },
      {
        onSuccess: onChanged,
        onError: (error) => setMessage(apiErrorText(error)),
      },
    );
  };

  return (
    <Card className="border-border/70" data-testid={`question-card-${question.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{question.skill}</CardTitle>
          <Badge variant={question.reviewStatus === "approved" ? "default" : "outline"}>
            {question.reviewStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p role="status" className="text-sm text-destructive">{message}</p> : null}
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
          <p className="mt-3 text-xs font-medium">Correct answer: {question.correctAnswer.toUpperCase()}</p>
        </div>
        <div className="grid gap-2">
          <Label>Explanation</Label>
          <Textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} />
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
          <Button variant="outline" onClick={() => save()} disabled={updateQuestion.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save edits
          </Button>
          <Button onClick={() => save("approved")} disabled={updateQuestion.isPending}>
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
              Add to a quiz
            </p>
            <div className="flex flex-wrap gap-2">
              {assignments.map((assignment) => (
                <Button
                  key={assignment.id}
                  size="sm"
                  variant="secondary"
                  disabled={attachQuestion.isPending || attachedAssignmentIds.includes(assignment.id)}
                  onClick={() =>
                    attachQuestion.mutate(
                      {
                        assignmentId: assignment.id,
                        data: { questionId: question.id },
                      },
                      {
                        onSuccess: () =>
                          setAttachedAssignmentIds((current) => [...current, assignment.id]),
                        onError: (error) => setMessage(apiErrorText(error)),
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

export function GenerateDraftsCard({
  courseId,
  onChanged,
}: {
  courseId: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const sourceParams = { courseId };
  const { data: sources = [] } = useListContentSources(sourceParams, {
    query: {
      enabled: Boolean(courseId),
      queryKey: getListContentSourcesQueryKey(sourceParams),
    },
  });
  const createSource = useCreateContentSource();
  const generateQuestions = useGeneratePracticeQuestions();
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceKind, setSourceKind] = useState<"pdf" | "html" | "text">("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [authorizationNote, setAuthorizationNote] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedSourceId && sources[0]) setSelectedSourceId(sources[0].id);
  }, [selectedSourceId, sources]);

  const refreshSources = () =>
    queryClient.invalidateQueries({ queryKey: getListContentSourcesQueryKey(sourceParams) });

  if (!courseId) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Choose a program first. Draft generation uses that program’s authorized sources.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import an authorized source</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste lesson text you are allowed to use. Generation writes original draft questions from the concepts — it does not copy the source.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <div className="grid gap-2">
              <Label htmlFor="source-title">Source title</Label>
              <Input
                id="source-title"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="Lesson notes — evidence and inference"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source-kind">Format</Label>
              <select
                id="source-kind"
                value={sourceKind}
                onChange={(event) => setSourceKind(event.target.value as "pdf" | "html" | "text")}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="text">Text</option>
                <option value="pdf">PDF</option>
                <option value="html">HTML</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source-url">Source URL (optional)</Label>
            <Input
              id="source-url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source-text">Authorized extracted text</Label>
            <Textarea
              id="source-text"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="Paste at least a short authorized excerpt (40+ characters) so drafts can be generated."
              className="min-h-28"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="source-auth">Authorization note</Label>
            <Textarea
              id="source-auth"
              value={authorizationNote}
              onChange={(event) => setAuthorizationNote(event.target.value)}
              placeholder="Example: Tutor-created handout, owned by Accepted Admissions."
            />
          </div>
          <Button
            className="w-fit"
            onClick={() => {
              createSource.mutate(
                {
                  data: {
                    courseId,
                    title: sourceTitle,
                    sourceKind,
                    sourceUrl: sourceUrl || null,
                    extractedText: sourceText || null,
                    authorizationNote,
                    provenance: { origin: "curriculum-bank" },
                  },
                },
                {
                  onSuccess: (source) => {
                    setSelectedSourceId(source.id);
                    setSourceTitle("");
                    setSourceUrl("");
                    setSourceText("");
                    setAuthorizationNote("");
                    setMessage("Source imported. Generate drafts next.");
                    refreshSources();
                  },
                  onError: (error) => setMessage(apiErrorText(error)),
                },
              );
            }}
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

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate draft questions
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Creates original multiple-choice drafts in the bank. Approve them here, then add them to a quiz.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {message ? (
            <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">
              {message}
            </p>
          ) : null}
          {sources.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Import a source with extracted text first. There is no separate AI endpoint beyond this generator.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
              <select
                aria-label="Source for draft generation"
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
                aria-label="Learning objective"
              />
              <Button
                data-testid="generate-draft-questions"
                disabled={!selectedSourceId || focus.trim().length < 3 || generateQuestions.isPending}
                onClick={() =>
                  generateQuestions.mutate(
                    {
                      sourceId: selectedSourceId,
                      data: { focus, count: 3, difficulty: "medium" },
                    },
                    {
                      onSuccess: (created) => {
                        setMessage(`${created.length} draft questions added to the bank.`);
                        queryClient.invalidateQueries({
                          queryKey: getListQuestionBankQueryKey({ courseId }),
                        });
                        onChanged();
                      },
                      onError: (error) => setMessage(apiErrorText(error)),
                    },
                  )
                }
              >
                {generateQuestions.isPending ? "Generating…" : "Create drafts"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
