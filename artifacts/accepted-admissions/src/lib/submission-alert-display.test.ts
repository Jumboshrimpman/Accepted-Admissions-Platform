import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMissClusters,
  formatSectionBreakdown,
  isFillerAnalysis,
  queueReasonPreview,
  usefulFocusLabels,
} from "./submission-alert-display.ts";

test("drops coarse section labels from the focus line", () => {
  assert.deepEqual(
    usefulFocusLabels(["SAT Math", "Math", "Reading and Writing", "Algebra", "Algebra"]),
    ["Algebra"],
  );
});

test("hides filler analysis and review-queue skill dumps", () => {
  assert.equal(
    isFillerAnalysis(
      "Start with the focus areas below and explain each missed answer before moving to another timed set.",
    ),
    true,
  );
  assert.equal(queueReasonPreview("New submission alert: missed SAT Math — Solve…"), null);
  assert.equal(queueReasonPreview("Review the punctuation choice."), "Review the punctuation choice.");
});

test("formats section and cluster lines without repeating tokens", () => {
  assert.equal(
    formatSectionBreakdown([
      { label: "Reading and Writing", accuracy: 42, missCount: 31 },
      { label: "Math", accuracy: 8, missCount: 67 },
    ]),
    "Reading and Writing 42% (31 misses) · Math 8% (67 misses)",
  );
  assert.equal(
    formatMissClusters([
      { label: "Algebra", missCount: 12 },
      { label: "Geometry and Trigonometry", missCount: 8 },
    ]),
    "Algebra 12 · Geometry and Trigonometry 8",
  );
});
