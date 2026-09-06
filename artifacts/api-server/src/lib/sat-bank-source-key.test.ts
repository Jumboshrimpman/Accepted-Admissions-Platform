import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  bankSourceKey,
  collectionSlug,
  collectionTitle,
  defaultEstimatedSeconds,
  normalizeExamFamily,
  normalizeExamSection,
} from "./sat-bank-source-key.ts";

test("builds a stable SAT source key from exam + test + module + q#", () => {
  assert.equal(
    bankSourceKey({
      examFamily: "sat",
      practiceTestNumber: 11,
      section: "rw",
      module: 1,
      questionNumber: 3,
    }),
    "sat:11:rw:1:3",
  );
});

test("builds a PSAT source key from form code when there is no test number", () => {
  assert.equal(
    bankSourceKey({
      examFamily: "psat",
      formCode: "NMSQT",
      section: "math",
      module: 2,
      questionNumber: 10,
    }),
    "psat:nmsqt:math:2:10",
  );
});

test("normalizes exam family and section aliases", () => {
  assert.equal(normalizeExamFamily("Digital SAT"), "sat");
  assert.equal(normalizeExamFamily("PSAT/NMSQT"), "psat");
  assert.equal(normalizeExamSection("Reading and Writing"), "rw");
  assert.equal(normalizeExamSection("Mathematics"), "math");
});

test("names SAT collections from practice test number", () => {
  assert.equal(collectionSlug({ examFamily: "sat", practiceTestNumber: 11 }), "sat-practice-test-11");
  assert.equal(
    collectionTitle({ examFamily: "sat", practiceTestNumber: 11 }),
    "SAT Practice Test 11",
  );
});

test("uses official SAT pacing when extract omits estimated seconds", () => {
  assert.equal(defaultEstimatedSeconds({ section: "rw" }), 71);
  assert.equal(defaultEstimatedSeconds({ section: "math" }), 95);
  assert.equal(defaultEstimatedSeconds({ section: "math", questionType: "spr" }), 120);
  assert.equal(defaultEstimatedSeconds({ section: "rw", estimatedSeconds: 40 }), 40);
});
