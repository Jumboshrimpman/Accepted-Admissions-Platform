import assert from "node:assert/strict";
import test from "node:test";
import { formatQuizClock, SOFT_TIMER_NOTE, tickQuizSeconds } from "./quiz-soft-timer.ts";

test("a soft clock keeps counting past the limit", () => {
  assert.equal(SOFT_TIMER_NOTE, "Try your best to finish within 30 minutes. If you go over, you can keep working.");
  assert.deepEqual(formatQuizClock(30 * 60), { text: "30:00", overtime: false });
  assert.deepEqual(formatQuizClock(65), { text: "1:05", overtime: false });
  assert.deepEqual(formatQuizClock(0), { text: "0:00", overtime: false });
  assert.deepEqual(formatQuizClock(-5), { text: "Over 0:05", overtime: true });
  assert.deepEqual(formatQuizClock(-125), { text: "Over 2:05", overtime: true });
  assert.equal(tickQuizSeconds(1, false), 0);
  assert.equal(tickQuizSeconds(0, false), 0);
  assert.equal(tickQuizSeconds(0, true), -1);
  assert.equal(tickQuizSeconds(-5, true), -6);
});
