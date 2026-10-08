import assert from "node:assert/strict";
import test from "node:test";
import { remainingAttemptSeconds, summarizeAttemptTimer } from "./attempt-timer.ts";

const at = (seconds: number) => new Date(seconds * 1000);

test("pause stops the clock and resume continues from the time left", () => {
  const running = summarizeAttemptTimer(
    [{ type: "started", at: at(0) }],
    at(30),
  );
  assert.equal(running.activeSeconds, 30);
  assert.equal(remainingAttemptSeconds(39, running.activeSeconds), 39 * 60 - 30);

  const paused = summarizeAttemptTimer(
    [
      { type: "started", at: at(0) },
      { type: "paused", at: at(30) },
    ],
    at(1_000),
  );
  assert.equal(paused.activeSeconds, 30);
  assert.equal(paused.pausedSeconds, 970);
  assert.equal(paused.pauseCount, 1);
  assert.equal(remainingAttemptSeconds(39, paused.activeSeconds), 39 * 60 - 30);

  const resumed = summarizeAttemptTimer(
    [
      { type: "started", at: at(0) },
      { type: "paused", at: at(30) },
      { type: "resumed", at: at(1_000) },
    ],
    at(1_010),
  );
  assert.equal(resumed.activeSeconds, 40);
  assert.equal(resumed.pausedSeconds, 970);
  assert.equal(remainingAttemptSeconds(39, resumed.activeSeconds), 39 * 60 - 40);
});
