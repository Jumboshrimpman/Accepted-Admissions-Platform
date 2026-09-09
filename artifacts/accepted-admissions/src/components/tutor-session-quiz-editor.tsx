import { useEffect, useState } from "react";
import {
  customFetch,
  getGetAssignmentQueryKey,
  useGetAssignment,
  useRemoveQuestionFromAssignment,
  useUpdateAssignmentQuestion,
  type AssignmentQuestion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Save, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  draftFromAssignmentQuestion,
  isSessionMcqQuestion,
  sessionQuestionUpdateBody,
  type SessionQuestionDraft,
} from "@/lib/session-quiz-edit";

function createSessionAssignmentQuestion(
  assignmentId: string,
  body: Partial<SessionQuestionDraft> = {},
) {
  return customFetch<AssignmentQuestion>(`/api/tutor/assignments/${assignmentId}/questions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || (error instanceof Error ? error.message : "The question could not be saved.");
}

export function TutorSessionQuizEditor({
  assignmentId,
  heading,
  emptyLabel = "No questions are on this session copy yet.",
  onChanged,
}: {
  assignmentId: string;
  heading: string;
  emptyLabel?: string;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: assignment } = useGetAssignment(assignmentId, {
    query: {
      enabled: Boolean(assignmentId),
      queryKey: getGetAssignmentQueryKey(assignmentId),
    },
  });
  const updateQuestion = useUpdateAssignmentQuestion();
  const removeQuestion = useRemoveQuestionFromAssignment();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SessionQuestionDraft | null>(null);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setEditingId(null);
    setDraft(null);
  }, [assignmentId]);

  if (!assignmentId) return null;

  const questions = assignment?.questions ?? [];
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAssignmentQueryKey(assignmentId) });
    onChanged?.();
  };

  const startEdit = (question: (typeof questions)[number]) => {
    setEditingId(question.id);
    setDraft(draftFromAssignmentQuestion(question));
    setMessage("");
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    updateQuestion.mutate(
      {
        assignmentId,
        questionId: editingId,
        data: sessionQuestionUpdateBody(draft),
      },
      {
        onSuccess: () => {
          setEditingId(null);
          setDraft(null);
          setMessage("Saved on this session’s quiz copy only.");
          refresh();
        },
        onError: (error) => setMessage(errorText(error)),
      },
    );
  };

  const addQuestion = async () => {
    setAdding(true);
    try {
      await createSessionAssignmentQuestion(assignmentId);
      setMessage("Added a multiple-choice question to this session copy.");
      refresh();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setAdding(false);
    }
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const question = questions[index];
    const swap = questions[index + direction];
    if (!question || !swap) return;
    updateQuestion.mutate(
      {
        assignmentId,
        questionId: question.id,
        data: { position: swap.position },
      },
      {
        onSuccess: () =>
          updateQuestion.mutate(
            {
              assignmentId,
              questionId: swap.id,
              data: { position: question.position },
            },
            { onSuccess: refresh },
          ),
      },
    );
  };

  return (
    <div className="space-y-3 rounded-xl border bg-background p-4" data-testid="tutor-session-quiz-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{heading}</p>
          <p className="text-xs text-muted-foreground">
            Edits stay on this session’s copy. The shared bank and other sessions are unchanged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{questions.length} questions</Badge>
          <Button
            size="sm"
            variant="outline"
            data-testid="tutor-session-quiz-add"
            disabled={adding}
            onClick={() => void addQuestion()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add question
          </Button>
        </div>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        questions.map((question, index) => {
          const editing = editingId === question.id && draft;
          const mcq = isSessionMcqQuestion(question.questionType);
          return (
            <div key={question.id} className="space-y-3 rounded-lg border p-3" data-testid={`tutor-session-question-${question.id}`}>
              <div className="flex items-start gap-2">
                <span className="w-6 pt-1 text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor={`session-q-prompt-${question.id}`}>Prompt</Label>
                        <Textarea
                          id={`session-q-prompt-${question.id}`}
                          data-testid={`tutor-session-question-prompt-${question.id}`}
                          value={draft.prompt}
                          onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                        />
                      </div>
                      {draft.choices.map((choice, choiceIndex) => (
                        <div key={choice.id} className="grid gap-2 sm:grid-cols-[auto_1fr]">
                          <Label className="pt-2">{choice.label}</Label>
                          <Input
                            data-testid={`tutor-session-question-choice-${question.id}-${choice.id}`}
                            value={choice.text}
                            onChange={(event) => {
                              const choices = draft.choices.map((item, itemIndex) =>
                                itemIndex === choiceIndex ? { ...item, text: event.target.value } : item,
                              );
                              setDraft({ ...draft, choices });
                            }}
                          />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <Label htmlFor={`session-q-correct-${question.id}`}>Correct answer</Label>
                        <select
                          id={`session-q-correct-${question.id}`}
                          data-testid={`tutor-session-question-correct-${question.id}`}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={draft.correctAnswer}
                          onChange={(event) => setDraft({ ...draft, correctAnswer: event.target.value })}
                        >
                          {draft.choices.map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`session-q-explain-${question.id}`}>Explanation</Label>
                        <Textarea
                          id={`session-q-explain-${question.id}`}
                          data-testid={`tutor-session-question-explanation-${question.id}`}
                          value={draft.explanation}
                          onChange={(event) => setDraft({ ...draft, explanation: event.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          data-testid={`tutor-session-question-save-${question.id}`}
                          disabled={updateQuestion.isPending}
                          onClick={saveEdit}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save session copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm">{question.prompt}</p>
                      {mcq && question.correctAnswer ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Correct: {question.correctAnswer.toUpperCase()}
                          {question.explanation ? ` · ${question.explanation}` : ""}
                        </p>
                      ) : null}
                      {!mcq ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Student-produced responses stay hidden from students and cannot be edited here.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {mcq && !editing ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`tutor-session-question-edit-${question.id}`}
                      onClick={() => startEdit(question)}
                      aria-label="Edit question"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === 0 || updateQuestion.isPending}
                    onClick={() => moveQuestion(index, -1)}
                    aria-label="Move question up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === questions.length - 1 || updateQuestion.isPending}
                    onClick={() => moveQuestion(index, 1)}
                    aria-label="Move question down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    disabled={removeQuestion.isPending}
                    onClick={() =>
                      removeQuestion.mutate(
                        { assignmentId, questionId: question.id },
                        { onSuccess: refresh },
                      )
                    }
                    aria-label="Remove question"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
