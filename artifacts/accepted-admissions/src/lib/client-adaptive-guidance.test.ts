import assert from "node:assert/strict";
import test from "node:test";
import {
  clientAdaptiveGuidance,
  clientCurrentFocus,
  displaySessionFocus,
  hasExtractPlaceholder,
  toClientAdaptiveGuidance,
  usableGuidanceTheme,
} from "./client-adaptive-guidance.ts";

test("never surfaces Skill not in extract or coarse remaps as the student label", () => {
  assert.equal(hasExtractPlaceholder("Skill not in extract (31% accuracy)"), true);
  assert.equal(usableGuidanceTheme("Skill not in extract"), null);
  assert.equal(usableGuidanceTheme("SAT Math (31% accuracy)"), null);
  assert.equal(usableGuidanceTheme("Reading and Writing"), null);
  assert.equal(usableGuidanceTheme("Algebra"), "Algebra");

  const copy = clientAdaptiveGuidance({
    strengths: ["Skill not in extract (80% accuracy)"],
    weaknesses: ["Skill not in extract (31% accuracy)"],
    nextFocus: ["Skill not in extract"],
    missClusters: [{ label: "Algebra", kind: "domain", missCount: 8 }],
    sectionBreakdown: [{ section: "math", label: "Math", accuracy: 31, missCount: 11 }],
  });

  assert.equal(hasExtractPlaceholder(copy.missedSkill), false);
  assert.equal(hasExtractPlaceholder(copy.nextPractice), false);
  assert.equal(hasExtractPlaceholder(copy.strength), false);
  assert.match(copy.missedSkill, /Algebra/);
  assert.match(copy.missedSkill, /31%/);
  assert.match(copy.nextPractice, /Practice Algebra next/);
  assert.doesNotMatch(copy.missedSkill, /Skill not in extract/i);
  assert.doesNotMatch(copy.nextPractice, /SAT Math$/);
});

test("uses section coaching when Bluebook skill and domain are missing", () => {
  const copy = clientAdaptiveGuidance({
    weaknesses: ["Skill not in extract (31% accuracy)"],
    nextFocus: ["SAT Math"],
    sectionBreakdown: [{ section: "math", label: "Math", accuracy: 31, missCount: 11 }],
  });
  assert.match(copy.missedSkill, /Math is the leak/);
  assert.match(copy.nextPractice, /Practice Math next/);
  assert.equal(clientCurrentFocus({ nextFocus: ["SAT Math"] }, "fallback"), "Practice Math next.");
  assert.equal(
    displaySessionFocus("Skill not in extract", {
      missClusters: [{ label: "Algebra", kind: "domain", missCount: 8 }],
    }, "fallback"),
    "Practice Algebra next.",
  );
});

test("falls back to qualitative drill coaching without dumping placeholders", () => {
  const copy = clientAdaptiveGuidance({
    strengths: ["Skill not in extract"],
    weaknesses: ["Skill not in extract"],
    nextFocus: ["Skill not in extract"],
  });
  assert.match(copy.missedSkill, /Review the missed questions/i);
  assert.match(copy.nextPractice, /next drill/i);
  assert.match(copy.strength, /baseline/);
  assert.equal(hasExtractPlaceholder(JSON.stringify(copy)), false);
});

test("rewrites a stored payload in place for dashboard cards", () => {
  const rewritten = toClientAdaptiveGuidance({
    strengths: ["Transitions (100% · 3/3)"],
    weaknesses: ["Skill not in extract (31% accuracy)"],
    nextFocus: ["Skill not in extract"],
    missClusters: [{ label: "Information and Ideas", kind: "domain", missCount: 4 }],
  });
  assert.equal(rewritten.strengths[0], "Transitions (100% · 3/3)");
  assert.match(rewritten.weaknesses[0] ?? "", /Information and Ideas/);
  assert.match(rewritten.nextFocus[0] ?? "", /Information and Ideas/);
  assert.equal(hasExtractPlaceholder(JSON.stringify(rewritten)), false);
});
