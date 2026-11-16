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

function tailFormItems(
  form: number,
  rwCount: number,
  mathCount: number,
  sourceKind = "official_extract",
): HardItem[] {
  const rows: HardItem[] = [];
  for (let index = 0; index < rwCount; index += 1) {
    rows.push(item(form, "rw", 15 + index, sourceKind));
  }
  for (let index = 0; index < mathCount; index += 1) {
    rows.push(item(form, "math", 18 + index, sourceKind));
  }
  return rows;
}

function questionNumber(row: HardItem): number {
  const match = /-q(\d+)$/i.exec(row.sourceKey ?? "");
  return match ? Number(match[1]) : 0;
}

function isHardTail(row: HardItem): boolean {
  const number = questionNumber(row);
  return row.section === "rw" ? number >= 15 : number >= 18;
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

test("Michelle's later pre-work takes 40 hard-tail items, widening when one form cannot fill", () => {
  const pool = [...formItems(6, 30, 25), ...formItems(7, 30, 25), ...formItems(8, 30, 25)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "91ef8c28-9455-4c9c-aa37-d19881d50666",
    usedPracticeTests: new Set([4, 5]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
  assert.equal(picked.selected.some((row) => questionNumber(row) < 15 && row.section === "rw"), false);
  assert.equal(picked.widened, true);
  assert.ok(counts(picked.selected).forms.length > 1);
});

test("early module 2 items are not treated as hard official items", () => {
  const early = [...formItems(6, 14, 17), ...formItems(7, 14, 17)];
  const tail = [...tailFormItems(8, 20, 20), ...tailFormItems(9, 20, 20)];
  const picked = selectMichelleFutureHardPrework([...early, ...tail], {
    seed: "session-skip-early-m2",
    usedPracticeTests: new Set(),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
  assert.equal(
    picked.selected.every((row) => (row.sourceKey ?? "").includes("-pt8-") || (row.sourceKey ?? "").includes("-pt9-")),
    true,
  );
});

test("a previously dipped-into form is used when leftover hard-tail items can fill after widening", () => {
  const pool = [...tailFormItems(6, 20, 15), ...tailFormItems(7, 20, 15), ...tailFormItems(8, 20, 15)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-leftover-form",
    usedPracticeTests: new Set([4, 5, 6, 7, 8, 9, 10, 11]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
  assert.equal(picked.widened, true);
  assert.equal(picked.recycled, true);
});

test("leftover hard-tail items are widened across forms when no form can fill 40", () => {
  const pool = [...tailFormItems(6, 14, 10), ...tailFormItems(7, 12, 10)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-widen",
    usedPracticeTests: new Set([4, 5, 6, 7]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, null);
  assert.equal(picked.widened, true);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
  assert.ok(counts(picked.selected).forms.length > 1);
});

test("already-used source keys and original-hard items stay out", () => {
  const excluded = item(8, "rw", 20);
  const original = item(8, "rw", 99, "original_hard");
  const pool = [...tailFormItems(8, 20, 20), ...tailFormItems(9, 20, 20), excluded, original];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-exclude",
    usedPracticeTests: new Set(),
    excludeSourceKeys: new Set([excluded.sourceKey!]),
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.some((row) => row.sourceKey === excluded.sourceKey), false);
  assert.equal(picked.selected.some((row) => row.sourceKind === "original_hard"), false);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
});

test("a short leftover hard-tail pool is not padded to 40", () => {
  const pool = [...tailFormItems(9, 10, 8), ...tailFormItems(10, 10, 8)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "session-short",
    usedPracticeTests: new Set([9, 10]),
  });
  assert.ok(picked.selected.length < 40);
  assert.equal(picked.selected.length, 36);
  assert.equal(picked.widened, true);
  assert.equal(picked.selected.every((row) => isHardTail(row)), true);
});

test("the same session id reproduces the same widened hard-tail set", () => {
  const pool = [...tailFormItems(6, 14, 10), ...tailFormItems(7, 12, 10)];
  const first = selectMichelleFutureHardPrework(pool, { seed: "session-stable" });
  const again = selectMichelleFutureHardPrework([...pool].reverse(), { seed: "session-stable" });
  assert.equal(first.selected.length, 40);
  assert.deepEqual(
    first.selected.map((row) => row.id),
    again.selected.map((row) => row.id),
  );
});

function michelleOriginal(index: number): HardItem {
  const id = `original-hard-michelle-2026-11-22-math-${String(index).padStart(2, "0")}`;
  return {
    id,
    sourceKey: id,
    section: "math",
    examFamily: "sat",
    practiceTestNumber: null,
    position: 2000 + index,
    sourceKind: "original_hard",
  };
}

test("Michelle Xavier pre-work is 40 hard-tail math items when sections are math-only", () => {
  const pool = [...tailFormItems(6, 20, 25), ...tailFormItems(7, 20, 25), ...tailFormItems(8, 20, 25)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "91ef8c28-9455-4c9c-aa37-d19881d50666",
    usedPracticeTests: new Set([4, 5, 6, 7, 8, 9, 10, 11]),
    sections: ["math"],
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => row.section === "math" && isHardTail(row)), true);
  assert.equal(picked.selected.some((row) => row.section === "rw"), false);
});

test("leftover official hard-tail math is used first, then Michelle original hard math fills the rest", () => {
  const official = tailFormItems(8, 0, 12);
  const originals = Array.from({ length: 40 }, (_value, index) => michelleOriginal(index + 1));
  const taito = {
    id: "original-hard-2026-11-27-math-35",
    sourceKey: "original-hard-2026-11-27-math-35",
    section: "math" as const,
    examFamily: "sat",
    practiceTestNumber: null,
    position: 1,
    sourceKind: "original_hard",
  };
  const picked = selectMichelleFutureHardPrework([...official, ...originals, taito], {
    seed: "session-official-first",
    usedPracticeTests: new Set([8]),
    sections: ["math"],
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.filter((row) => row.sourceKind !== "original_hard").length, 12);
  assert.equal(picked.selected.filter((row) => (row.sourceKey ?? "").startsWith("original-hard-michelle-")).length, 28);
  assert.equal(picked.selected[0]!.sourceKind !== "original_hard", true);
  assert.equal(
    picked.selected.some((row) => row.sourceKey === "original-hard-2026-11-27-math-35"),
    false,
  );
});

test("Michelle Sophia L pre-work is 40 hard-tail reading and writing items", () => {
  const pool = [...tailFormItems(6, 20, 20), ...tailFormItems(7, 20, 20), ...tailFormItems(8, 20, 20)];
  const picked = selectMichelleFutureHardPrework(pool, {
    seed: "3499bc71-7efd-479d-b386-a48f321d369d",
    sections: ["rw"],
  });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => row.section === "rw" && isHardTail(row)), true);
  assert.equal(picked.selected.some((row) => row.section === "math"), false);
});
