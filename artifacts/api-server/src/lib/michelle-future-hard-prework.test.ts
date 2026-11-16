import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  selectMichelleFutureHardPrework,
  type RoutineFormQuestion,
} from "./sat-routine-form.ts";

type HardItem = RoutineFormQuestion & { sourceKind?: string | null };

function item(
  form: number,
  section: "rw" | "math",
  index: number,
  sourceKind = "official_extract",
): HardItem {
  const id = `sat-pt${form}-${section}-m2-q${index}`;
  return {
    id,
    sourceKey: id,
    section,
    examFamily: "sat",
    practiceTestNumber: form,
    position: form * 1000 + (section === "math" ? 500 : 0) + index,
    sourceKind,
  };
}

function formItems(form: number, rw: number, math: number, sourceKind = "official_extract"): HardItem[] {
  const rows: HardItem[] = [];
  for (let index = 1; index <= rw; index += 1) rows.push(item(form, sectionOf("rw"), index, sourceKind));
  for (let index = 1; index <= math; index += 1) rows.push(item(form, "math", index, sourceKind));
  return rows;
}

function sectionOf(section: "rw"): "rw" {
  return section;
}

function counts(selected: readonly HardItem[]): { rw: number; math: number; forms: number[] } {
  return {
    rw: selected.filter((row) => row.section === "rw").length,
    math: selected.filter((row) => row.section === "math").length,
    forms: [...new Set(selected.map((row) => Number(row.practiceTestNumber)))].sort((a, b) => a - b),
  };
}

test("Michelle's later pre-work prefers 40 hard items from one unused form", () => {
  const pool = [...formItems(6, 30, 25), ...formItems(7, 30, 25)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "91ef8c28-9455-4c9c-aa37-d19881d50666",
    usedPracticeTests: new Set([4, 5]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, 6);
  assert.equal(picked.widened, false);
  assert.equal(picked.recycled, false);
  assert.deepEqual(counts(picked.selected), { rw: 22, math: 18, forms: [6] });
});

test("an unused form that cannot fill 40 is skipped for the next unused form", () => {
  const pool = [...formItems(6, 10, 5), ...formItems(8, 30, 25)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-skip-short",
    usedPracticeTests: new Set([4, 5]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, 8);
  assert.equal(picked.widened, false);
});

test("a previously dipped-into form is used when it still has 40 leftover hard items", () => {
  const pool = [...formItems(6, 10, 5), ...formItems(7, 30, 25)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-leftover-form",
    usedPracticeTests: new Set([4, 5, 6, 7, 8, 9, 10, 11]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, 7);
  assert.equal(picked.widened, false);
  assert.equal(picked.recycled, true);
  assert.deepEqual(counts(picked.selected), { rw: 22, math: 18, forms: [7] });
});

test("leftover hard items are widened across forms when no form can fill 40", () => {
  const pool = [...formItems(6, 14, 10), ...formItems(7, 12, 10)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-widen",
    usedPracticeTests: new Set([4, 5, 6, 7]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, null);
  assert.equal(picked.widened, true);
  assert.deepEqual(counts(picked.selected).rw, 22);
  assert.deepEqual(counts(picked.selected).math, 18);
  assert.ok(counts(picked.selected).forms.length > 1);
});

test("already-used source keys and original-hard items stay out", () => {
  const excluded = item(8, "rw", 1);
  const original = item(8, "rw", 99, "original_hard");
  const pool = [...formItems(8, 30, 25), excluded, original];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-exclude",
    usedPracticeTests: new Set(),
    excludeSourceKeys: new Set([excluded.sourceKey!]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.some((row) => row.sourceKey === excluded.sourceKey), false);
  assert.equal(picked.selected.some((row) => row.sourceKind === "original_hard"), false);
});

test("a short leftover hard pool is not padded to 40", () => {
  const pool = [...formItems(9, 10, 8), ...formItems(10, 10, 8)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-short",
    usedPracticeTests: new Set([9, 10]),
  });
  assert.ok(picked.selected.length < 40);
  assert.equal(picked.selected.length, 36);
  assert.equal(picked.widened, true);
});

test("the same session id reproduces the same widened set", () => {
  const pool = [...formItems(6, 14, 10), ...formItems(7, 12, 10)];
  const first = selectMichelleFutureHardPrework(pool, { seed: "session-stable" });
  const again = selectMichelleFutureHardPrework([...pool].reverse(), { seed: "session-stable" });
  assert.deepEqual(
    first.selected.map((row) => row.id),
    again.selected.map((row) => row.id),
  );
});
