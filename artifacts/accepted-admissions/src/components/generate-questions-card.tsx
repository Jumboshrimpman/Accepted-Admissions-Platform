import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export type QuestionGenerationStatus = {
  available: boolean;
  provider: "openai" | null;
  model: string | null;
  requiredEnv: string[];
  message: string;
};

const BLOCKED_STATUS: QuestionGenerationStatus = {
  available: false,
  provider: null,
  model: null,
  requiredEnv: ["OPENAI_API_KEY"],
  message:
    "Generate questions needs OPENAI_API_KEY on the API host. Without that key the server returns 503 and does not invent questions.",
};

export async function fetchQuestionGenerationStatus(): Promise<QuestionGenerationStatus> {
  const response = await fetch(`${basePath}/api/question-generation`);
  if (!response.ok) throw new Error("status");
  return (await response.json()) as QuestionGenerationStatus;
}

export async function generateQuestionsForQuiz(
  assignmentId: string,
  data: { count: number; sourceText: string; skill: string; difficulty: "easy" | "medium" | "hard" },
): Promise<{ questions: Array<{ id: string; prompt: string }> }> {
  const response = await fetch(`${basePath}/api/assignments/${assignmentId}/generate-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await response.json()) as {
    error?: string;
    questions?: Array<{ id: string; prompt: string }>;
  };
  if (!response.ok) {
    throw new Error(payload.error || BLOCKED_STATUS.message);
  }
  return { questions: payload.questions ?? [] };
}

export function GenerateQuestionsCard({
  assignmentId,
  defaultSkill,
  onGenerated,
}: {
  assignmentId: string;
  defaultSkill?: string;
  onGenerated: () => void;
}) {
  const [status, setStatus] = useState<QuestionGenerationStatus | null>(null);
  const [count, setCount] = useState(3);
  const [sourceText, setSourceText] = useState("");
  const [skill, setSkill] = useState(defaultSkill ?? "");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchQuestionGenerationStatus()
      .then(setStatus)
      .catch(() => setStatus(BLOCKED_STATUS));
  }, []);

  const resolved = status ?? BLOCKED_STATUS;

  return (
    <Card className="border-primary/20" data-testid="generate-questions-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Generate questions
          <Badge variant={resolved.available ? "default" : "outline"}>
            {resolved.available ? resolved.provider : "Provider required"}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Create questions for this open quiz. Choose how many, optionally paste source material, then review and edit them on the quiz.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!resolved.available ? (
          <div
            role="status"
            data-testid="generate-questions-blocked"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <p className="font-medium">Question generation is blocked until a model provider is configured.</p>
            <p className="mt-2">{resolved.message}</p>
            <p className="mt-2 font-mono text-xs">
              Required: {resolved.requiredEnv.join(", ")} on the API host. Optional: OPENAI_QUESTION_MODEL (default gpt-4o-mini).
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="generate-count">How many questions</Label>
                <Input
                  id="generate-count"
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value) || 1)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="generate-skill">Skill / topic</Label>
                <Input
                  id="generate-skill"
                  value={skill}
                  onChange={(event) => setSkill(event.target.value)}
                  placeholder="Evidence"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="generate-difficulty">Difficulty</Label>
                <select
                  id="generate-difficulty"
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as "easy" | "medium" | "hard")}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generate-source">Optional source material</Label>
              <Textarea
                id="generate-source"
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
                placeholder="Paste lesson notes or an authorized excerpt. Leave blank to generate from the skill only."
                className="min-h-24"
              />
            </div>
            <Button
              data-testid="generate-questions-submit"
              disabled={pending || count < 1}
              onClick={() => {
                setPending(true);
                setMessage("");
                generateQuestionsForQuiz(assignmentId, { count, sourceText, skill, difficulty })
                  .then((result) => {
                    setMessage(`${result.questions.length} questions added to this quiz. Edit them above.`);
                    onGenerated();
                  })
                  .catch((error: unknown) => {
                    setMessage(error instanceof Error ? error.message : BLOCKED_STATUS.message);
                  })
                  .finally(() => setPending(false));
              }}
            >
              {pending ? "Generating…" : "Generate questions"}
            </Button>
          </>
        )}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
