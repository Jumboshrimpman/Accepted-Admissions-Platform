import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  customFetch,
  getListSatBankQuestionsQueryKey,
  listSatBankQuestions,
  type AdminAssignment,
  type AdminProgram,
  type SatBankQuestion,
} from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, ListPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TUTOR_QUIZ_SPR_NOTE,
  choiceLabel,
  compactFigureSrc,
  filterBankQuestionsForPicker,
  moveSelectedId,
} from "@/lib/tutor-quiz-builder";

function errorText(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error || (error instanceof Error ? error.message : "The quiz could not be created.");
}

export function TutorQuizBuilder({
  open,
  onOpenChange,
  programs,
  collections,
  defaultCourseId,
  onCreated,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programs: AdminProgram[];
  collections: Array<{ id: string; title: string; questionCount: number }>;
  defaultCourseId?: string;
  onCreated: (quiz: AdminAssignment) => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(defaultCourseId || programs[0]?.id || "");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<"all" | "rw" | "math">("all");
  const [collectionId, setCollectionId] = useState("");
  const [examFamily, setExamFamily] = useState<"" | "sat" | "psat">("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const bank = useQuery({
    queryKey: getListSatBankQuestionsQueryKey({
      questionType: "mcq",
      includeKeys: "true",
      collectionId: collectionId || undefined,
      section: section === "all" ? undefined : section,
      examFamily: examFamily || undefined,
    }),
    queryFn: () =>
      listSatBankQuestions({
        questionType: "mcq",
        includeKeys: "true",
        collectionId: collectionId || undefined,
        section: section === "all" ? undefined : section,
        examFamily: examFamily || undefined,
      }),
    enabled: open,
  });

  const createQuiz = useMutation({
    mutationFn: (data: { courseId: string; title: string; bankQuestionIds: string[] }) =>
      customFetch<AdminAssignment>("/api/tutor/quizzes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });

  const visible = useMemo(
    () => filterBankQuestionsForPicker(Array.isArray(bank.data) ? bank.data : [], search),
    [bank.data, search],
  );
  const byId = useMemo(() => {
    const map = new Map<string, SatBankQuestion>();
    for (const question of bank.data ?? []) map.set(question.id, question);
    return map;
  }, [bank.data]);

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const reset = () => {
    setTitle("");
    setSelectedIds([]);
    setSearch("");
    setExpandedId(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-4xl"
        data-testid="tutor-quiz-builder"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5 text-primary" />
            Create quiz from bank
          </DialogTitle>
          <DialogDescription>
            Multi-select official SAT/PSAT multiple-choice questions, then save a reusable quiz you
            can assign like the existing bank quizzes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                data-testid="tutor-quiz-builder-search"
                placeholder="Search stems, skills, or source keys"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                data-testid="tutor-quiz-builder-collection"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                <option value="">All collections</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title} · {collection.questionCount}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                data-testid="tutor-quiz-builder-section"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={section}
                onChange={(event) => setSection(event.target.value as "all" | "rw" | "math")}
              >
                <option value="all">All sections</option>
                <option value="rw">Reading & Writing</option>
                <option value="math">Math</option>
              </select>
              <select
                data-testid="tutor-quiz-builder-family"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={examFamily}
                onChange={(event) => setExamFamily(event.target.value as "" | "sat" | "psat")}
              >
                <option value="">SAT + PSAT</option>
                <option value="sat">SAT</option>
                <option value="psat">PSAT</option>
              </select>
              <p className="self-center text-xs text-muted-foreground">{TUTOR_QUIZ_SPR_NOTE}</p>
            </div>
            <ScrollArea className="h-[22rem] rounded-lg border">
              <ul className="divide-y" data-testid="tutor-quiz-builder-list">
                {bank.isLoading ? (
                  <li className="p-3 text-sm text-muted-foreground">Loading official bank…</li>
                ) : visible.length === 0 ? (
                  <li className="p-3 text-sm text-muted-foreground">
                    No multiple-choice bank questions match these filters.
                  </li>
                ) : (
                  visible.map((question) => {
                    const checked = selectedIds.includes(question.id);
                    const figure = compactFigureSrc(question);
                    return (
                      <li key={question.id} className="p-2.5" data-testid={`tutor-bank-question-${question.id}`}>
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(question.id)}
                            aria-label={`Select question ${question.questionNumber}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary">Q{question.questionNumber}</Badge>
                              <Badge variant="outline">
                                {question.section === "math" ? "Math" : "R&W"}
                              </Badge>
                              {question.module ? (
                                <Badge variant="outline">Mod {question.module}</Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm">{question.prompt}</p>
                            {figure ? (
                              <img
                                src={figure}
                                alt="Question figure"
                                className="mt-1 max-h-16 w-auto rounded border bg-white"
                              />
                            ) : null}
                            {question.choices && question.choices.length > 0 ? (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {question.choices
                                  .map((choice) => `${choiceLabel(choice)}. ${choice.text}`)
                                  .join("  ")}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              className="mt-1 text-xs text-primary underline"
                              data-testid={`tutor-bank-question-explain-${question.id}`}
                              onClick={() =>
                                setExpandedId((current) => (current === question.id ? null : question.id))
                              }
                            >
                              {expandedId === question.id ? "Hide explanation" : "Show explanation"}
                            </button>
                            {expandedId === question.id ? (
                              <div
                                className="mt-1 rounded-md bg-muted/60 p-2 text-xs"
                                data-testid={`tutor-bank-question-key-${question.id}`}
                              >
                                <p>
                                  <span className="font-medium">Correct: </span>
                                  {question.correctAnswer || "—"}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                  {question.officialExplanation || "Official explanation is not on file."}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </ScrollArea>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tutor-quiz-builder-title">Quiz title</Label>
              <Input
                id="tutor-quiz-builder-title"
                data-testid="tutor-quiz-builder-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Evidence mini-section"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tutor-quiz-builder-course">Program</Label>
              <select
                id="tutor-quiz-builder-course"
                data-testid="tutor-quiz-builder-course"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              >
                <option value="">Select a program</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.title}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} selected · drag order with the arrows
            </p>
            <ul className="space-y-2" data-testid="tutor-quiz-builder-selected">
              {selectedIds.map((id, index) => {
                const question = byId.get(id);
                return (
                  <li key={id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <span className="mt-0.5 text-xs text-muted-foreground">{index + 1}.</span>
                    <p className="min-w-0 flex-1 line-clamp-2">
                      {question?.prompt || "Selected question"}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setSelectedIds((current) => moveSelectedId(current, id, -1))}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setSelectedIds((current) => moveSelectedId(current, id, 1))}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => toggle(id)}
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            data-testid="tutor-quiz-builder-save"
            disabled={
              createQuiz.isPending || !title.trim() || !courseId || selectedIds.length === 0
            }
            onClick={() =>
              createQuiz.mutate(
                { courseId, title: title.trim(), bankQuestionIds: selectedIds },
                {
                  onSuccess: (quiz) => {
                    reset();
                    onOpenChange(false);
                    onCreated(quiz);
                  },
                  onError: (error) => onError(errorText(error)),
                },
              )
            }
          >
            {createQuiz.isPending ? "Saving…" : "Save reusable quiz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
