import assert from "node:assert/strict";
import test from "node:test";
import {
  isIeltsContent,
  isSatExamFamily,
  michelleSatSkill,
  michelleSkillRank,
  planHardSatSessionSets,
  selectHardSatQuestions,
  type HardSatCandidate,
} from "./sat-set-difficulty.ts";
import { selectHardReserve } from "./sat-hard-reserve-plan.ts";

function item(overrides: Partial<HardSatCandidate> & { sourceKey: string }): HardSatCandidate {
  return {
    id: overrides.sourceKey,
    section: "rw",
    module: 2,
    questionNumber: 20,
    practiceTestNumber: 4,
    examFamily: "sat",
    sourceKind: "official_extract",
    ...overrides,
  };
}

test("only SAT and PSAT families count as SAT", () => {
  assert.equal(isSatExamFamily("sat"), true);
  assert.equal(isSatExamFamily("PSAT"), true);
  assert.equal(isSatExamFamily(null), true);
  assert.equal(isSatExamFamily("ielts"), false);
  assert.equal(isIeltsContent({ examFamily: "ielts" }), true);
  assert.equal(isIeltsContent({ subject: "IELTS Reading" }), true);
  assert.equal(isIeltsContent({ examFamily: "sat", subject: "SAT Reading & Writing" }), false);
});

test("IELTS module 2 reading items never enter an SAT hard pool", () => {
  const pool = [
    item({ sourceKey: "ielts-style-2-12", examFamily: "ielts", section: "reading", sourceKind: "original", questionNumber: 33 }),
    item({ sourceKey: "sat-pt4-rw-m2-q20" }),
  ];
  const picked = selectHardSatQuestions(pool, { targetCount: 2, sections: ["rw"] });
  assert.deepEqual(picked.map((row) => row.sourceKey), ["sat-pt4-rw-m2-q20"]);
  const planned = planHardSatSessionSets(pool, { preworkTarget: 1, inSessionMax: 1, sections: ["rw"], includeMichelleOriginalHard: true });
  const keys = [...planned.prework, ...planned.inSession].map((row) => row.sourceKey);
  assert.equal(keys.includes("ielts-style-2-12"), false);
  const reserve = selectHardReserve(
    [
      { id: "i", sourceKey: "ielts-style-2-12", examFamily: "ielts", sourceKind: "official_extract", section: "rw" },
      { id: "s", sourceKey: "sat-pt4-rw-m2-q20", examFamily: "sat", sourceKind: "official_extract", section: "rw" },
    ],
    { seed: "x", target: 5, sections: ["rw"] },
  );
  assert.deepEqual(reserve.selected.map((row) => row.sourceKey), ["sat-pt4-rw-m2-q20"]);
});

test("Michelle skill classification follows SAT stems and stored domains", () => {
  assert.equal(michelleSatSkill({ section: "rw", prompt: "Which choice completes the text with the most logical and precise word or phrase?" }), "words-in-context");
  assert.equal(michelleSatSkill({ section: "rw", prompt: "Which choice most effectively uses data from the table to complete the statement?" }), "command-of-evidence-quantitative");
  assert.equal(michelleSatSkill({ section: "rw", prompt: "Which finding, if true, would most directly support the claim?" }), "command-of-evidence-textual");
  assert.equal(michelleSatSkill({ section: "rw", prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?" }), "standard-english-conventions");
  assert.equal(michelleSatSkill({ section: "math", domain: "Problem-Solving and Data Analysis" }), "problem-solving-data-analysis");
  assert.ok(michelleSkillRank({ section: "math", domain: "Algebra" }) > michelleSkillRank({ section: "math", domain: "Advanced Math" }));
});

test("Michelle plans put evidence items ahead of conventions", () => {
  const pool = [
    item({ sourceKey: "sat-pt4-rw-m2-q26", questionNumber: 26, prompt: "conforms to the conventions of Standard English" }),
    item({ sourceKey: "sat-pt4-rw-m2-q16", questionNumber: 16, prompt: "Which choice most effectively uses data from the graph to complete the text?" }),
  ];
  const planned = planHardSatSessionSets(pool, { preworkTarget: 1, inSessionMax: 1, sections: ["rw"], includeMichelleOriginalHard: true });
  assert.equal(planned.prework[0]?.sourceKey, "sat-pt4-rw-m2-q16");
  const other = planHardSatSessionSets(pool, { preworkTarget: 1, inSessionMax: 1, sections: ["rw"] });
  assert.equal(other.prework[0]?.sourceKey, "sat-pt4-rw-m2-q26");
});
