import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { auditStudentQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { parseCollegeBoardPayload, resolveCollegeBoardRoot } from "./sat-bank-import.ts";
import { answerOriginalHardRw } from "./original-hard-sat-rw-answer.ts";
import {
  originalHardMathItems,
  originalHardRwItems,
  originalHardSatBankRecords,
} from "./original-hard-sat.ts";
import {
  ORIGINAL_HARD_SAT_DATES,
  hardSatSectionQuotas,
  isRenderableHardSatItem,
  planHardSatSessionSets,
  type HardSatCandidate,
} from "./sat-set-difficulty.ts";

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function candidate(record: {
  sourceKey: string;
  sourceKind: string;
  section: string;
  module: number;
  questionNumber: number;
  practiceTestNumber: number | null;
}): HardSatCandidate {
  return {
    id: record.sourceKey,
    sourceKey: record.sourceKey,
    sourceKind: record.sourceKind,
    section: record.section,
    module: record.module,
    questionNumber: record.questionNumber,
    practiceTestNumber: record.practiceTestNumber,
  };
}

async function walkJsonl(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walkJsonl(full)));
    else if (entry.name.endsWith(".jsonl") && !/sample-extract/i.test(entry.name)) found.push(full);
  }
  return found;
}

test("original hard math solves to the keyed choice and no other choice", () => {
  const items = originalHardMathItems();
  assert.equal(items.length, 90);
  let passed = 0;
  for (const item of items) {
    const solved = item.solve();
    const keyed = item.choices.find((choice) => choice.id === item.correctAnswer);
    assert.ok(keyed, item.sourceKey);
    assert.equal(keyed.text, String(solved), item.sourceKey);
    const matches = item.choices.filter((choice) => Number(choice.text) === solved);
    assert.equal(matches.length, 1, item.sourceKey);
    assert.ok(item.explanation.includes(String(solved)), item.sourceKey);
    passed += 1;
  }
  assert.equal(passed, 90);
});

test("original hard reading items agree with an independent second pass", () => {
  const answerer = readFileSync(new URL("./original-hard-sat-rw-answer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(answerer, /correctAnswer/);
  const items = originalHardRwItems();
  assert.equal(items.length, 90);
  let agreed = 0;
  for (const item of items) {
    const letter = answerOriginalHardRw({
      stimulus: item.stimulus,
      prompt: item.prompt,
      choices: item.choices,
    });
    assert.equal(letter, item.correctAnswer, `${item.sourceKey} ${item.stimulus}`);
    assert.ok(item.explanation.trim().length > 20, item.sourceKey);
    agreed += 1;
  }
  assert.equal(agreed, 90);
  assert.equal(agreed / items.length, 1);
});

test("original hard items render, stay unique, and fill only the three shortfall sessions", async () => {
  const records = originalHardSatBankRecords();
  assert.equal(records.length, 180);
  assert.ok(records.every((record) => record.sourceKind === "original_hard"));
  assert.ok(records.every((record) => record.questionType === "mcq"));
  assert.equal(new Set(records.map((record) => record.sourceKey)).size, 180);

  const stems = new Set<string>();
  for (const record of records) {
    const stem = norm(`${record.stimulus ?? ""} ${record.prompt}`);
    assert.equal(stems.has(stem), false, record.sourceKey);
    stems.add(stem);
    assert.doesNotMatch(stem, /\b(?:the table|the figure|the graph|scatterplot|student-produced)\b/i);
    const facing = isRenderableHardSatItem({
      id: record.sourceKey,
      sourceKey: record.sourceKey,
      sourceKind: record.sourceKind,
      examFamily: record.examFamily,
      section: record.section,
      module: record.module,
      questionNumber: record.questionNumber,
      practiceTestNumber: record.practiceTestNumber,
      prompt: record.prompt,
      stimulus: record.stimulus,
      choices: record.choices,
      figures: record.figures,
      questionType: record.questionType,
      correctAnswer: record.correctAnswer,
      officialExplanation: record.officialExplanation,
      extractGaps: record.extractGaps,
      domain: record.domain,
      skill: record.skill,
      difficulty: record.difficulty,
    });
    if (!facing) {
      const audit = auditStudentQuizItem({
        id: record.sourceKey,
        sourceKey: record.sourceKey,
        examFamily: record.examFamily,
        section: record.section,
        module: record.module,
        questionNumber: record.questionNumber,
        prompt: record.prompt,
        stimulus: record.stimulus,
        choices: record.choices,
        figures: [],
        questionType: record.questionType,
        correctAnswer: record.correctAnswer,
        domain: record.domain,
        skill: record.skill,
      });
      assert.fail(`${record.sourceKey} ${audit.reasons.join(",")} ${record.prompt}`);
    }
  }

  const root = resolveCollegeBoardRoot(path.resolve(process.cwd(), "../../content/college-board"));
  const officialStems = new Set<string>();
  const officialKeys = new Set<string>();
  for (const file of await walkJsonl(root)) {
    const parsed = parseCollegeBoardPayload(await readFile(file, "utf8"), file);
    for (const record of parsed.records) {
      officialKeys.add(record.sourceKey);
      officialStems.add(norm(record.prompt));
      if (record.stimulus) officialStems.add(norm(record.stimulus));
      officialStems.add(norm(`${record.stimulus ?? ""} ${record.prompt}`));
    }
  }
  assert.ok(officialStems.size > 100);
  for (const record of records) {
    assert.equal(officialKeys.has(record.sourceKey), false, record.sourceKey);
    for (const text of [record.prompt, record.stimulus, `${record.stimulus ?? ""} ${record.prompt}`]) {
      const normalized = norm(text);
      if (!normalized) continue;
      assert.equal(officialStems.has(normalized), false, `${record.sourceKey}: ${normalized.slice(0, 180)}`);
    }
  }

  const pool = records.map(candidate);
  const used = new Set<string>();
  for (const dateKey of ORIGINAL_HARD_SAT_DATES) {
    const planned = planHardSatSessionSets(pool, {
      originalDateKey: dateKey,
      balance: "even",
      preworkTarget: 40,
      preworkMax: 40,
      inSessionMax: 20,
    });
    assert.equal(planned.prework.length, 40, dateKey);
    assert.equal(planned.inSession.length, 20, dateKey);
    const count = (items: readonly { section: string }[], section: string) =>
      items.filter((item) => item.section === section).length;
    assert.deepEqual(
      { rw: count(planned.prework, "rw"), math: count(planned.prework, "math") },
      { rw: 20, math: 20 },
      dateKey,
    );
    assert.deepEqual(
      { rw: count(planned.inSession, "rw"), math: count(planned.inSession, "math") },
      { rw: 10, math: 10 },
      dateKey,
    );
    const selected = [...planned.prework, ...planned.inSession];
    assert.ok(selected.every((item) => item.sourceKey.includes(dateKey)));
    for (const item of selected) {
      assert.equal(used.has(item.sourceKey), false, item.sourceKey);
      used.add(item.sourceKey);
    }
    const rw = records.filter((record) => record.sourceKey.includes(dateKey) && record.section === "rw");
    const domains = {
      craft: rw.filter((record) => record.domain === "Craft and Structure").length,
      info: rw.filter((record) => record.domain === "Information and Ideas").length,
      conventions: rw.filter((record) => record.domain === "Standard English Conventions").length,
      expression: rw.filter((record) => record.domain === "Expression of Ideas").length,
    };
    assert.deepEqual(domains, { craft: 8, info: 8, conventions: 7, expression: 7 }, dateKey);
  }
  assert.equal(used.size, 180);

  const mixed = planHardSatSessionSets(
    [
      {
        id: "official",
        sourceKey: "sat-pt4-rw-m2-q27",
        section: "rw",
        module: 2,
        questionNumber: 27,
        practiceTestNumber: 4,
      },
      candidate(records.find((record) => record.sourceKey === "original-hard-2026-11-27-rw-30")!),
    ],
    { preworkTarget: 1, preworkMax: 1, inSessionMax: 0 },
  );
  assert.equal(mixed.prework[0]?.sourceKey, "sat-pt4-rw-m2-q27");
  assert.deepEqual(hardSatSectionQuotas(40), { rw: 22, math: 18 });
  assert.deepEqual(hardSatSectionQuotas(40, "even"), { rw: 20, math: 20 });

  const boot = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(boot, /original-hard-sat|originalHardSatBankRecords|runCollegeBoardReimport/);
  const shared = readFileSync(new URL("./sat-bank-service.ts", import.meta.url), "utf8");
  const officialBoot = shared.slice(
    shared.indexOf("export async function ensureOfficialExtractsImported"),
    shared.indexOf("async function materializeBankQuestionInternal"),
  );
  assert.doesNotMatch(officialBoot, /originalHardSatBankRecords|original-hard-sat/);
  const reimportFn = shared.slice(
    shared.indexOf("export async function runCollegeBoardReimport"),
    shared.indexOf("let officialImportPromise"),
  );
  assert.match(reimportFn, /originalHardSatBankRecords/);
  assert.match(reimportFn, /if \(input\.dryRun !== false\) return report/);
  const materialize = shared.slice(
    shared.indexOf("async function materializeBankQuestionInternal"),
    shared.indexOf("export async function materializeBankQuestion"),
  );
  assert.match(materialize, /original_hard/);
  assert.match(materialize, /original-hard-sat/);
  assert.match(shared, /row\.sourceKind === "original_hard"/);
});
