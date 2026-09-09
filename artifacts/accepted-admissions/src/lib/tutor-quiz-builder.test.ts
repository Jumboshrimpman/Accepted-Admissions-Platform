import assert from "node:assert/strict";
import test from "node:test";
import {
  compactFigureSrc,
  filterBankQuestionsForPicker,
  isPickerMcq,
  moveSelectedId,
  type PickerBankQuestion,
} from "./tutor-quiz-builder.ts";

function question(overrides: Partial<PickerBankQuestion> = {}): PickerBankQuestion {
  return {
    id: "q1",
    sourceKey: "sat-pt4-rw-1-1",
    section: "rw",
    prompt: "Which choice best states the main idea?",
    questionType: "mcq",
    assignable: true,
    choices: [
      { id: "a", label: "A", text: "A claim" },
      { id: "b", label: "B", text: "A list" },
    ],
    ...overrides,
  };
}

test("hides SPR and incomplete items from the picker", () => {
  assert.equal(isPickerMcq(question({ questionType: "spr" })), false);
  const visible = filterBankQuestionsForPicker(
    [
      question(),
      question({ id: "spr", questionType: "spr", prompt: "Enter 9" }),
      question({ id: "gap", assignable: false, prompt: "Figure missing" }),
    ],
    "",
  );
  assert.deepEqual(
    visible.map((item) => item.id),
    ["q1"],
  );
});

test("searches stem and source key", () => {
  const rows = [
    question(),
    question({ id: "q2", prompt: "Solve for x", sourceKey: "sat-pt4-math-2-3", section: "math" }),
  ];
  assert.equal(filterBankQuestionsForPicker(rows, "solve").length, 1);
  assert.equal(filterBankQuestionsForPicker(rows, "pt4-rw").length, 1);
});

test("reorders selected ids without wrapping", () => {
  assert.deepEqual(moveSelectedId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveSelectedId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
});

test("uses only safe figure URLs", () => {
  assert.equal(
    compactFigureSrc(
      question({ figures: [{ url: "/media/sat-bank/pack/a.png", alt: "Chart" }] }),
    ),
    "/media/sat-bank/pack/a.png",
  );
  assert.equal(
    compactFigureSrc(question({ figures: [{ url: "javascript:alert(1)" }] })),
    null,
  );
});
