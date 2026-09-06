import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  QUESTION_GENERATION_UNAVAILABLE_CODE,
  generateQuestionsWithProvider,
  parseGeneratedQuestions,
  questionGenerationStatus,
} from "./question-generation.ts";

test("question generation is honestly blocked without OPENAI_API_KEY", () => {
  const status = questionGenerationStatus({} as NodeJS.ProcessEnv);
  assert.equal(status.available, false);
  assert.equal(status.provider, null);
  assert.deepEqual(status.requiredEnv, ["OPENAI_API_KEY"]);
  assert.match(status.message, /OPENAI_API_KEY/);
  assert.doesNotMatch(status.message, /template drafts are AI/i);
});

test("question generation reports OpenAI when a key is present", () => {
  const status = questionGenerationStatus({ OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
  assert.equal(status.available, true);
  assert.equal(status.provider, "openai");
  assert.equal(status.model, "gpt-4o-mini");
});

test("parseGeneratedQuestions keeps only usable multiple-choice items", () => {
  const parsed = parseGeneratedQuestions(
    {
      questions: [
        {
          prompt: "Which choice best supports the claim?",
          skill: "Evidence",
          domain: "Reading",
          difficulty: "medium",
          choices: ["A specific relationship", "An unsupported list", "A copied sentence", "A guess"],
          correctAnswer: "a",
          explanation: "The first choice tests the claim against evidence.",
        },
        { prompt: "too short", skill: "", choices: [] },
      ],
    },
    3,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.choices[0]?.id, "a");
  assert.equal(parsed[0]?.correctAnswer, "a");
});

test("generateQuestionsWithProvider does not invent questions when the key is missing", async () => {
  let called = false;
  await assert.rejects(
    () =>
      generateQuestionsWithProvider({
        subject: "SAT",
        count: 2,
        env: {} as NodeJS.ProcessEnv,
        fetchImpl: async () => {
          called = true;
          return new Response("{}");
        },
      }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, QUESTION_GENERATION_UNAVAILABLE_CODE);
      assert.equal((error as { status?: number }).status, 503);
      return true;
    },
  );
  assert.equal(called, false);
});
