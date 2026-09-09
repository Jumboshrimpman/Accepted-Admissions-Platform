import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  adminBankSkillLabel,
  attemptResultHasPlaceholderSkill,
  isMissingExtractSkill,
  quizSubject,
  sectionSkillLabel,
  skillBreakdownFromItems,
  skillLabelForBank,
} from "./sat-bank-skill.ts";

test("quizSubject matches the SAT course labels used on materialize", () => {
  assert.equal(quizSubject("math"), "SAT Math");
  assert.equal(quizSubject("rw"), "SAT Reading & Writing");
});

test("section skill fallback uses the existing domain labels", () => {
  assert.equal(sectionSkillLabel("math"), "SAT Math");
  assert.equal(sectionSkillLabel("rw"), "Reading and Writing");
  assert.equal(sectionSkillLabel(null), "Reading and Writing");
});

test("treats empty and extract placeholders as missing skills", () => {
  assert.equal(isMissingExtractSkill(null), true);
  assert.equal(isMissingExtractSkill(""), true);
  assert.equal(isMissingExtractSkill("   "), true);
  assert.equal(isMissingExtractSkill("Skill not in extract"), true);
  assert.equal(isMissingExtractSkill("Skill not in PDF"), true);
  assert.equal(isMissingExtractSkill("Transitions"), false);
});

test("materialize fallback uses section when bank.skill is null", () => {
  assert.equal(skillLabelForBank({ skill: null, section: "math" }), "SAT Math");
  assert.equal(skillLabelForBank({ skill: "", section: "rw" }), "Reading and Writing");
  assert.equal(
    skillLabelForBank({ skill: "Skill not in extract", section: "math" }),
    "SAT Math",
  );
  assert.equal(
    skillLabelForBank({ skill: "Skill not in PDF", section: "rw" }),
    "Reading and Writing",
  );
});

test("keeps a real Bluebook skill and prefers domain over a bare section guess", () => {
  assert.equal(
    skillLabelForBank({ skill: "Transitions", section: "rw" }),
    "Transitions",
  );
  assert.equal(
    skillLabelForBank({
      skill: "Skill not in extract",
      domain: "SAT Math",
      subject: "SAT Reading & Writing",
    }),
    "SAT Math",
  );
  assert.equal(
    skillLabelForBank({
      skill: null,
      subject: "SAT Math",
    }),
    "SAT Math",
  );
  assert.equal(skillLabelForBank({ skill: null }), "General");
});

test("rebuilds by-skill breakdown after placeholder skills are remapped", () => {
  const items = [
    { skill: skillLabelForBank({ skill: "Skill not in extract", section: "rw" }), correct: true },
    { skill: skillLabelForBank({ skill: "Skill not in extract", section: "math" }), correct: false },
    { skill: skillLabelForBank({ skill: "Skill not in extract", section: "math" }), correct: true },
  ];
  const breakdown = skillBreakdownFromItems(items);
  const rw = breakdown.find((row) => row.skill === "Reading and Writing");
  const math = breakdown.find((row) => row.skill === "SAT Math");
  assert.equal(rw?.total, 1);
  assert.equal(rw?.correct, 1);
  assert.equal(math?.total, 2);
  assert.equal(math?.correct, 1);
  assert.equal(
    attemptResultHasPlaceholderSkill({
      items: [{ skill: "Skill not in extract" }],
    }),
    true,
  );
  assert.equal(
    attemptResultHasPlaceholderSkill({ items: [{ skill: "SAT Math" }] }),
    false,
  );
});

test("admin bank badge stays honest that the skill is not from the PDF", () => {
  assert.equal(adminBankSkillLabel(null, "rw"), "Reading and Writing · not in PDF");
  assert.equal(adminBankSkillLabel("Skill not in extract", "math"), "SAT Math · not in PDF");
  assert.equal(adminBankSkillLabel("Transitions", "rw"), "Transitions");
});
