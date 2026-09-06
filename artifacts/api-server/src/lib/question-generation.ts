export const QUESTION_GENERATION_REQUIRED_ENV = ["OPENAI_API_KEY"] as const;
export const QUESTION_GENERATION_MODEL = "gpt-4o-mini";
export const QUESTION_GENERATION_UNAVAILABLE_CODE = "QUESTION_GENERATION_UNAVAILABLE";

export type QuestionGenerationStatus = {
  available: boolean;
  provider: "openai" | null;
  model: string | null;
  requiredEnv: string[];
  message: string;
};

export type GeneratedQuizQuestion = {
  prompt: string;
  skill: string;
  domain: string;
  difficulty: "easy" | "medium" | "hard";
  choices: Array<{ id: string; label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
};

export class QuestionGenerationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly statusPayload: QuestionGenerationStatus;

  constructor(status: number, code: string, message: string, statusPayload: QuestionGenerationStatus) {
    super(message);
    this.name = "QuestionGenerationError";
    this.status = status;
    this.code = code;
    this.statusPayload = statusPayload;
  }
}

export function questionGenerationStatus(
  env: NodeJS.ProcessEnv = process.env,
): QuestionGenerationStatus {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      available: false,
      provider: null,
      model: null,
      requiredEnv: [...QUESTION_GENERATION_REQUIRED_ENV],
      message:
        "Generate questions needs OPENAI_API_KEY on the API host. Without that key this endpoint returns 503 and does not invent questions. Template drafts are a separate experimental path and are not a model provider.",
    };
  }
  return {
    available: true,
    provider: "openai",
    model: env.OPENAI_QUESTION_MODEL?.trim() || QUESTION_GENERATION_MODEL,
    requiredEnv: [...QUESTION_GENERATION_REQUIRED_ENV],
    message: "OpenAI will draft questions for this quiz. Review and edit them on the quiz before students see them.",
  };
}

export function parseGeneratedQuestions(payload: unknown, count: number): GeneratedQuizQuestion[] {
  const root =
    payload && typeof payload === "object" ? (payload as { questions?: unknown }) : null;
  const rows = Array.isArray(root?.questions) ? root.questions : Array.isArray(payload) ? payload : [];
  const parsed = rows
    .map((row) => parseOneQuestion(row))
    .filter((row): row is GeneratedQuizQuestion => Boolean(row));
  if (parsed.length === 0) {
    throw new Error("The model did not return any usable questions.");
  }
  return parsed.slice(0, Math.max(1, Math.min(count, 10)));
}

function parseOneQuestion(row: unknown): GeneratedQuizQuestion | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
  const skill = typeof candidate.skill === "string" ? candidate.skill.trim() : "";
  const explanation = typeof candidate.explanation === "string" ? candidate.explanation.trim() : "";
  if (prompt.length < 8 || !skill || explanation.length < 4) return null;
  const rawChoices = Array.isArray(candidate.choices) ? candidate.choices : [];
  const texts = rawChoices
    .map((choice) => {
      if (typeof choice === "string") return choice.trim();
      if (choice && typeof choice === "object" && typeof (choice as { text?: unknown }).text === "string") {
        return (choice as { text: string }).text.trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 4);
  if (texts.length < 2) return null;
  const choices = texts.map((text, choiceIndex) => ({
    id: String.fromCharCode(97 + choiceIndex),
    label: String.fromCharCode(65 + choiceIndex),
    text,
  }));
  const correctRaw =
    typeof candidate.correctAnswer === "string"
      ? candidate.correctAnswer.trim().toLowerCase()
      : typeof candidate.correctIndex === "number"
        ? String.fromCharCode(97 + candidate.correctIndex)
        : "a";
  const correctAnswer = choices.some((choice) => choice.id === correctRaw) ? correctRaw : choices[0]!.id;
  const difficulty =
    candidate.difficulty === "easy" || candidate.difficulty === "hard" ? candidate.difficulty : "medium";
  const domain =
    typeof candidate.domain === "string" && candidate.domain.trim()
      ? candidate.domain.trim()
      : "Generated practice";
  return {
    prompt,
    skill,
    domain,
    difficulty,
    choices,
    correctAnswer,
    explanation,
  };
}

export async function generateQuestionsWithProvider(input: {
  subject: string;
  count: number;
  sourceText?: string;
  skill?: string;
  difficulty?: "easy" | "medium" | "hard";
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<GeneratedQuizQuestion[]> {
  const env = input.env ?? process.env;
  const status = questionGenerationStatus(env);
  if (!status.available || !status.provider || !status.model) {
    throw new QuestionGenerationError(
      503,
      QUESTION_GENERATION_UNAVAILABLE_CODE,
      status.message,
      status,
    );
  }
  const count = Math.max(1, Math.min(input.count || 3, 10));
  const source = input.sourceText?.trim() || "No extra source text was pasted. Write original SAT-style practice.";
  const skill = input.skill?.trim() || "Evidence and reasoning";
  const response = await (input.fetchImpl ?? fetch)("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY!.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: status.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write original multiple-choice tutoring questions. Never copy source wording. Return JSON {\"questions\":[...]} only.",
        },
        {
          role: "user",
          content: [
            `Create ${count} ${input.subject} multiple-choice questions.`,
            `Skill focus: ${skill}.`,
            `Difficulty: ${input.difficulty ?? "medium"}.`,
            "Each question needs prompt, skill, domain, difficulty, four choices, correctAnswer (a-d), and explanation.",
            "Source material (optional context, do not quote verbatim):",
            source.slice(0, 8000),
          ].join("\n"),
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new QuestionGenerationError(
      502,
      "QUESTION_GENERATION_PROVIDER_ERROR",
      "OpenAI did not return questions. No quiz items were added.",
      status,
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new QuestionGenerationError(
      502,
      "QUESTION_GENERATION_INVALID_OUTPUT",
      "OpenAI returned a response that could not be parsed as questions.",
      status,
    );
  }
  return parseGeneratedQuestions(parsed, count);
}
