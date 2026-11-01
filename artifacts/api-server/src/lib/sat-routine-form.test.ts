import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  listOfficialExtractFiles,
  parseCollegeBoardPayload,
  resolveCollegeBoardRoot,
} from "./sat-bank-import.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isOfficialSatExtract, isStudentUsableQuizItem } from "./sat-bank-diagnostic-quality.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  selectRoutinePreworkFromOneForm,
  type RoutineFormQuestion,
} from "./sat-routine-form.ts";

function item(
  form: number,
  section: "rw" | "math",
  index: number,
  family = "sat",
): RoutineFormQuestion {
  const id = `${family}-pt${form}-${section}-${index}`;
  return {
    id,
    sourceKey: id,
    section,
    examFamily: family,
    practiceTestNumber: form,
    position: form * 1000 + (section === "math" ? 500 : 0) + index,
  };
}

function formItems(form: number, rw: number, math: number, family = "sat"): RoutineFormQuestion[] {
  const rows: RoutineFormQuestion[] = [];
  for (let index = 1; index <= rw; index += 1) rows.push(item(form, "rw", index, family));
  for (let index = 1; index <= math; index += 1) rows.push(item(form, "math", index, family));
  return rows;
}

function counts(selected: readonly RoutineFormQuestion[]): { rw: number; math: number } {
  return {
    rw: selected.filter((row) => row.section === "rw").length,
    math: selected.filter((row) => row.section === "math").length,
  };
}

test("routine form draw is 40 questions from one SAT form", () => {
  const pool = [
    ...formItems(4, 60, 30),
    ...formItems(5, 60, 30),
    ...formItems(1, 80, 40, "psat"),
    ...formItems(4, 20, 20, "psat"),
  ];
  const picked = selectRoutinePreworkFromOneForm(pool, { seed: "session-a" });
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.practiceTestNumber, 4);
  assert.equal(picked.recycled, false);
  assert.equal(new Set(picked.selected.map((row) => row.practiceTestNumber)).size, 1);
  assert.equal(picked.selected.every((row) => row.examFamily === "sat"), true);
  assert.equal(picked.selected.some((row) => row.examFamily === "psat"), false);
  assert.deepEqual(counts(picked.selected), { rw: 22, math: 18 });
});

test("the draw never exceeds 40", () => {
  const picked = selectRoutinePreworkFromOneForm(formItems(6, 90, 80), {
    seed: "session-cap",
    targetCount: 80,
  });
  assert.equal(picked.selected.length, 40);
});

test("the same session id reproduces the same set and a different id does not", () => {
  const pool = formItems(7, 50, 40);
  const reversed = [...pool].reverse();
  const first = selectRoutinePreworkFromOneForm(pool, { seed: "session-same" });
  const again = selectRoutinePreworkFromOneForm(reversed, { seed: "session-same" });
  const other = selectRoutinePreworkFromOneForm(pool, { seed: "session-other" });
  assert.deepEqual(
    first.selected.map((row) => row.id),
    again.selected.map((row) => row.id),
  );
  assert.notDeepEqual(
    first.selected.map((row) => row.id),
    other.selected.map((row) => row.id),
  );
});

test("a form the student has already used is skipped", () => {
  const pool = [...formItems(4, 60, 30), ...formItems(5, 60, 30), ...formItems(8, 60, 30)];
  const picked = selectRoutinePreworkFromOneForm(pool, {
    seed: "session-skip",
    usedPracticeTests: new Set([4]),
  });
  assert.equal(picked.practiceTestNumber, 5);
  assert.equal(picked.selected.every((row) => row.practiceTestNumber === 5), true);
  assert.equal(picked.recycled, false);
});

test("a short unused form is skipped for the next unused form that can fill 40", () => {
  const pool = [...formItems(4, 6, 4), ...formItems(9, 55, 30)];
  const picked = selectRoutinePreworkFromOneForm(pool, { seed: "session-short" });
  assert.equal(picked.practiceTestNumber, 9);
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => row.practiceTestNumber === 9), true);
});

test("a short math section is filled from reading and writing without passing 40", () => {
  const picked = selectRoutinePreworkFromOneForm(formItems(10, 50, 10), { seed: "session-fill" });
  assert.equal(picked.selected.length, 40);
  assert.deepEqual(counts(picked.selected), { rw: 30, math: 10 });
});

test("when every form is used, recycle the lowest practice test number", () => {
  const lowPositions = formItems(11, 40, 30).map((row, index) => ({ ...row, position: index + 1 }));
  const highPositions = formItems(4, 40, 30).map((row, index) => ({
    ...row,
    position: 10_000 + index,
  }));
  const picked = selectRoutinePreworkFromOneForm([...lowPositions, ...highPositions], {
    seed: "session-recycle",
    usedPracticeTests: new Set([4, 11]),
  });
  assert.equal(picked.recycled, true);
  assert.equal(picked.practiceTestNumber, 4);
  assert.equal(picked.selected.length, 40);
  assert.equal(picked.selected.every((row) => row.practiceTestNumber === 4), true);
  assert.equal(picked.selected.every((row) => row.examFamily === "sat"), true);
});

test("short forms are not mixed together to reach 40", () => {
  const picked = selectRoutinePreworkFromOneForm(
    [...formItems(4, 8, 4), ...formItems(5, 10, 5)],
    { seed: "session-no-mix" },
  );
  assert.equal(picked.selected.length, 15);
  assert.equal(picked.practiceTestNumber, 5);
  assert.equal(new Set(picked.selected.map((row) => row.practiceTestNumber)).size, 1);
});

test("official SAT packs yield 40 from one form and never a PSAT item", async () => {
  const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
  const files = await listOfficialExtractFiles(root);
  const records = [];
  for (const file of files) {
    const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), path.basename(file));
    records.push(...parsed.records);
  }
  assert.ok(records.some((row) => row.examFamily === "psat"));
  const usable = records.filter((row) => isOfficialSatExtract(row) && isStudentUsableQuizItem(row));
  const pool = [
    ...usable.map((row) => ({ ...row, id: row.sourceKey })),
    ...records
      .filter((row) => row.examFamily === "psat")
      .map((row) => ({ ...row, id: row.sourceKey })),
  ];
  const forms = [4, 5, 6, 7, 8, 9, 10, 11];
  for (const practiceTestNumber of forms) {
    const used = new Set(forms.filter((form) => form !== practiceTestNumber));
    const picked = selectRoutinePreworkFromOneForm(pool, {
      seed: `form-${practiceTestNumber}`,
      usedPracticeTests: used,
    });
    assert.equal(picked.selected.length, 40, `form ${practiceTestNumber}`);
    assert.equal(picked.practiceTestNumber, practiceTestNumber);
    assert.equal(picked.recycled, false);
    assert.equal(
      picked.selected.every((row) => row.examFamily === "sat" && row.practiceTestNumber === practiceTestNumber),
      true,
      `form ${practiceTestNumber}`,
    );
    assert.equal(picked.selected.some((row) => row.id.startsWith("psat")), false);
  }
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  assert.match(hardSets, /if \(!oct30\) \{\s*return assignOfficialFormPrework/);
});

test("rw-only selection skips a form that cannot fill 40 reading items", async () => {
  const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
  const files = await listOfficialExtractFiles(root);
  const records = [];
  for (const file of files) {
    const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), path.basename(file));
    records.push(...parsed.records);
  }
  const usable = records
    .filter((row) => isOfficialSatExtract(row) && isStudentUsableQuizItem(row))
    .map((row) => ({ ...row, id: row.sourceKey }));
  const forms = [4, 5, 6, 7, 8, 9, 10, 11];
  const rwPool = usable.filter((row) => row.section === "rw");
  const rwByForm = new Map<number, number>();
  for (const row of rwPool) {
    const practiceTestNumber = row.practiceTestNumber ?? 0;
    rwByForm.set(practiceTestNumber, (rwByForm.get(practiceTestNumber) ?? 0) + 1);
  }
  assert.ok((rwByForm.get(8) ?? 0) < 40, "form 8 cannot fill a 40-item reading set");
  for (const practiceTestNumber of forms) {
    if (practiceTestNumber === 8) continue;
    assert.ok((rwByForm.get(practiceTestNumber) ?? 0) >= 40, `form ${practiceTestNumber} rw`);
  }
  const othersUsed = new Set(forms.filter((form) => form !== 8));
  const unrestricted = selectRoutinePreworkFromOneForm(usable, {
    seed: "form-8-open",
    usedPracticeTests: othersUsed,
  });
  assert.equal(unrestricted.practiceTestNumber, 8);
  assert.equal(unrestricted.selected.length, 40);
  assert.equal(unrestricted.recycled, false);
  const restricted = selectRoutinePreworkFromOneForm(rwPool, {
    seed: "form-8-open",
    usedPracticeTests: othersUsed,
    requireFullCount: true,
  });
  assert.notEqual(restricted.practiceTestNumber, 8);
  assert.equal(restricted.selected.length, 40);
  assert.equal(restricted.selected.every((row) => row.section === "rw"), true);
  assert.equal(restricted.recycled, true);
  const onlyShortUnused = selectRoutinePreworkFromOneForm(rwPool, {
    seed: "short-unused",
    usedPracticeTests: new Set([4, 5, 6, 7, 9, 10, 11]),
    requireFullCount: true,
  });
  assert.notEqual(onlyShortUnused.practiceTestNumber, 8);
  assert.equal(onlyShortUnused.selected.length, 40);
  assert.equal(onlyShortUnused.selected.every((row) => row.section === "rw"), true);
});
