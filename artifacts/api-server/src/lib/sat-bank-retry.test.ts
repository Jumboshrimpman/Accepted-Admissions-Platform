import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { decideRetrySource, retryOutcomeFromAnswer, studentRetryShape } from "./sat-bank-retry.ts";

const source = {
  id: "miss-1",
  sourceKey: "sat:11:rw:1:3",
  skill: "Transitions",
  section: "rw" as const,
};

test("prefers an unused same-skill bank question over AI", () => {
  const decision = decideRetrySource({
    source,
    unusedBank: [
      {
        id: "bank-9",
        sourceKey: "sat:10:rw:2:4",
        skill: "Transitions",
        section: "rw",
        module: 2,
        questionNumber: 4,
      },
    ],
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(decision.kind, "bank");
  if (decision.kind === "bank") {
    assert.equal(decision.candidate.sourceKey, "sat:10:rw:2:4");
  }
});

test("blocks analog generation honestly when the bank is exhausted and OPENAI is missing", () => {
  const decision = decideRetrySource({
    source,
    unusedBank: [],
    env: {} as NodeJS.ProcessEnv,
  });
  assert.equal(decision.kind, "blocked");
  if (decision.kind === "blocked") {
    assert.deepEqual(decision.status.requiredEnv, ["OPENAI_API_KEY"]);
    assert.match(decision.reason, /OPENAI_API_KEY/);
  }
});

test("offers AI only when no unused bank match remains and a key is present", () => {
  const decision = decideRetrySource({
    source,
    unusedBank: [],
    env: { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
  });
  assert.equal(decision.kind, "ai");
});

test("records mastered vs still struggling without exposing the answer first", () => {
  assert.deepEqual(retryOutcomeFromAnswer({ studentAnswer: "b", correctAnswer: "b" }), {
    correct: true,
    outcome: "mastered",
  });
  assert.deepEqual(retryOutcomeFromAnswer({ studentAnswer: "a", correctAnswer: "b" }), {
    correct: false,
    outcome: "still_struggling",
  });
  const safe = studentRetryShape({
    prompt: "Which choice?",
    choices: [{ id: "a", label: "A", text: "one" }],
    correctAnswer: "a",
    officialExplanation: "hidden until after the retry",
    explanation: "also hidden",
  });
  assert.equal("correctAnswer" in safe, false);
  assert.equal("officialExplanation" in safe, false);
  assert.equal(safe.prompt, "Which choice?");
});
