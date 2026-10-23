import assert from "node:assert/strict";
import test from "node:test";
import {
  missedPreworkEmptyCopy,
  recommendedPracticeEmptyCopy,
  tutorNotesForSubmittedResult,
} from "./session-result-fill.ts";

const agenda = [
  "Vocab notebook: five words from diagnostic misses.",
  "Ask which of the four diagnostic passages hurt most.",
].join("\n");

test("a clean submitted result rewrites miss-only agenda lines", () => {
  const notes = tutorNotesForSubmittedResult(agenda, { submitted: true, mistakeCount: 0 });
  assert.match(notes, /five words from the diagnostic passages/i);
  assert.match(notes, /the set was clean, so re-read one paragraph for gist versus detail/i);
  assert.doesNotMatch(notes, /diagnostic misses/i);
  assert.doesNotMatch(notes, /hurt most/i);
  assert.equal(
    tutorNotesForSubmittedResult(agenda, { submitted: true, mistakeCount: 2 }),
    agenda,
  );
  assert.equal(
    tutorNotesForSubmittedResult(agenda, { submitted: false, mistakeCount: 0 }),
    agenda,
  );
});

test("submitted empty states do not wait for a result that already exists", () => {
  assert.match(missedPreworkEmptyCopy(true), /No misses on the submitted pre-work/i);
  assert.match(missedPreworkEmptyCopy(false), /after the student submits pre-work/i);
  assert.match(
    recommendedPracticeEmptyCopy({ submitted: true, mistakeCount: 0 }),
    /harder practice is the live plan/i,
  );
  assert.doesNotMatch(
    recommendedPracticeEmptyCopy({ submitted: true, mistakeCount: 0 }),
    /after a completed result/i,
  );
  assert.match(
    recommendedPracticeEmptyCopy({ submitted: false, mistakeCount: 0 }),
    /after a completed result/i,
  );
});
