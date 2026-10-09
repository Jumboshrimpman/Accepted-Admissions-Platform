import assert from "node:assert/strict";
import test from "node:test";
import { attemptResultUrlIsMissingId, customFetch } from "./custom-fetch.ts";

const ATTEMPT = "d1e2452c-67f2-42ad-add7-bacaac535714";

test("collapsed attempt result urls are missing an id", () => {
  assert.equal(attemptResultUrlIsMissingId("/api/attempts/result"), true);
  assert.equal(attemptResultUrlIsMissingId("/api/attempts//result"), true);
  assert.equal(attemptResultUrlIsMissingId("/api/attempts/undefined/result"), true);
  assert.equal(attemptResultUrlIsMissingId("/api/attempts/null/result?wrongAnswersOnly=1"), true);
  assert.equal(attemptResultUrlIsMissingId(`/api/attempts/${ATTEMPT}/result`), false);
  assert.equal(attemptResultUrlIsMissingId(`/api/attempts/${ATTEMPT}`), false);
});

test("a missing attempt id never reaches fetch", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("ok");
  };
  try {
    await assert.rejects(() => customFetch("/api/attempts/result"), /Invalid attempt id/);
    await assert.rejects(() => customFetch("/api/attempts//result"), /Invalid attempt id/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
