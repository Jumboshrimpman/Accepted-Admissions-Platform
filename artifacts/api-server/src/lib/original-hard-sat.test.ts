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
import { decideRetrySource } from "./sat-bank-retry.ts";
import {
  ORIGINAL_HARD_SAT_DATES,
  hardSatSectionQuotas,
  isRenderableHardSatItem,
  originalHardSatDateKeyForSession,
  planHardSatSessionSets,
  type HardSatCandidate,
} from "./sat-set-difficulty.ts";
import { TAITO_STUDENT_EMAIL, taitoSessionDateTime } from "./session-schedule.ts";

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

const STOP = new Set(
  `which what when where that this with from have were been into over after before about their there these those would could should every other only than then them they your each such some more most also does did not but and for the are was has had its his her you our who how all any can may one two per both same just like will onto upon while through between among within without under above being using used make makes made find give gives given must very across during another because choice completes conforms conventions standard english logical precise phrase transition supported strongly based author respond texts effectively information writer emphasize notes following question data best uses percent percentage points dollars dollar meters meter squared equals minus plus equation equations solution positive value number numbers radius center output input hours hour years year seconds second margin error sample price prices final included replaced similar corresponds corresponding larger smaller horizontal central angle radians radian length square exactly times three start multiply subtract result lines worth keeps loses grows current satisfies circular round total cost costs ticket tickets score scores`.split(
    /\s+/,
  ),
);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !STOP.has(word)),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
  assert.equal(items.length, 105);
  let passed = 0;
  for (const item of items) {
    const solved = item.solve();
    const keyed = item.choices.find((choice) => choice.id === item.correctAnswer);
    assert.ok(keyed, item.sourceKey);
    assert.equal(keyed.text, String(solved), item.sourceKey);
    const matches = item.choices.filter((choice) => Number(choice.text) === solved);
    assert.equal(matches.length, 1, item.sourceKey);
    assert.match(item.explanation, new RegExp(`\\b${solved}\\b`), item.sourceKey);
    assert.ok(item.difficultyNote.length >= 40, item.sourceKey);
    passed += 1;
  }
  assert.equal(passed, 105);
});

test("original hard reading items agree with an independent second pass", () => {
  const answerer = readFileSync(new URL("./original-hard-sat-rw-answer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(answerer, /correctAnswer/);
  const items = originalHardRwItems();
  assert.equal(items.length, 105);
  let agreed = 0;
  for (const item of items) {
    const letter = answerOriginalHardRw({
      stimulus: item.stimulus,
      prompt: item.prompt,
      choices: item.choices,
    });
    assert.equal(letter, item.correctAnswer, `${item.sourceKey} ${item.stimulus}`);
    assert.ok(item.explanation.trim().length > 20, item.sourceKey);
    assert.ok(item.difficultyNote.length >= 40, item.sourceKey);
    agreed += 1;
  }
  assert.equal(agreed, 105);
  assert.equal(agreed / items.length, 1);
});

test("original hard items render, stay unique, and fill only the three shortfall sessions", async () => {
  const records = originalHardSatBankRecords();
  const math = originalHardMathItems();
  const reading = originalHardRwItems();
  assert.equal(records.length, 210);
  assert.ok(records.every((record) => record.sourceKind === "original_hard"));
  assert.ok(records.every((record) => record.questionType === "mcq"));
  assert.equal(new Set(records.map((record) => record.sourceKey)).size, 210);
  const notes = [...math, ...reading].map((item) => item.difficultyNote);
  assert.equal(new Set(notes).size, 210);
  assert.ok(records.every((record) => String(record.sourceFiles.difficultyNote).length >= 40));

  const letters = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of [...math, ...reading]) letters[item.correctAnswer as "a" | "b" | "c" | "d"] += 1;
  assert.deepEqual(letters, { a: 52, b: 54, c: 52, d: 52 });
  console.log(`key distribution a=${letters.a} b=${letters.b} c=${letters.c} d=${letters.d}`);

  const bags = [...math, ...reading].map((item) => ({
    key: item.sourceKey,
    words: contentWords(`${item.stimulus ?? ""} ${item.prompt}`),
  }));
  let maxSimilarity = 0;
  let maxPair = "";
  for (let left = 0; left < bags.length; left += 1) {
    for (let right = left + 1; right < bags.length; right += 1) {
      const score = jaccard(bags[left]!.words, bags[right]!.words);
      if (score > maxSimilarity) {
        maxSimilarity = score;
        maxPair = `${bags[left]!.key} | ${bags[right]!.key}`;
      }
    }
  }
  console.log(`max content-word Jaccard ${maxSimilarity.toFixed(3)} on ${maxPair}`);
  assert.ok(maxSimilarity <= 0.6, `${maxSimilarity} ${maxPair}`);

  const functionStop = new Set(
    `a an the of to and or in on for with from by at as is was are were be been being that this these those it its their his her they them which what when where who how not but if than then into over after before about would could should each such some more most also does did have has had can may will just like while through between among within without under above during because both same other only very across another there here all any per`.split(
      /\s+/,
    ),
  );
  const slotWords = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 5 && !functionStop.has(word)),
    );
  const slotGroups = new Map<string, Set<string>[]>();
  for (const item of [...math, ...reading]) {
    const slot = `${item.section}-${item.questionNumber}`;
    const group = slotGroups.get(slot) ?? [];
    group.push(slotWords(`${item.stimulus ?? ""} ${item.prompt}`));
    slotGroups.set(slot, group);
  }
  assert.equal(slotGroups.size, 70);
  let slotTotal = 0;
  for (const [slot, group] of slotGroups) {
    assert.equal(group.length, 3, slot);
    const pair =
      (jaccard(group[0]!, group[1]!) + jaccard(group[0]!, group[2]!) + jaccard(group[1]!, group[2]!)) / 3;
    slotTotal += pair;
  }
  const sameSlotAverage = slotTotal / slotGroups.size;
  console.log(`same-slot average ${sameSlotAverage.toFixed(3)}`);
  assert.ok(sameSlotAverage < 0.35, `same-slot average ${sameSlotAverage}`);

  const bareTransition = /^(?:Therefore|However|Consequently|Meanwhile|For example)$/;
  for (const item of reading) {
    for (const choice of item.choices) {
      const text = choice.text ?? "";
      assert.equal(/^\s{2}/.test(text), false, `${item.sourceKey} leading double space`);
      assert.equal(/\s,/.test(text), false, `${item.sourceKey} space before comma`);
      assert.equal(bareTransition.test(text.trim()), false, `${item.sourceKey} bare transition`);
      const joined = item.stimulus.includes("___") ? item.stimulus.replace("___", text) : `${item.stimulus} ${text}`;
      assert.equal(/\s{2}/.test(joined), false, `${item.sourceKey} doubled space`);
      assert.equal(/\s,/.test(joined), false, `${item.sourceKey} rendered space-comma`);
      assert.equal(
        /(?:^|[^.!?;])\s(?:Therefore|However|Consequently|Meanwhile|For example)\b/.test(joined),
        false,
        `${item.sourceKey} mid-sentence transition`,
      );
    }
    if (/accomplish this goal/i.test(item.prompt)) {
      const goal = /wants to (?:emphasize|highlight|stress|center) ([^.]+)/i.exec(item.prompt);
      assert.ok(goal, item.sourceKey);
      const words = goal![1]!.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((word) => word.length >= 8);
      words.sort((left, right) => right.length - left.length);
      const keyed = item.choices.find((choice) => choice.id === item.correctAnswer);
      assert.ok(keyed, item.sourceKey);
      assert.equal(keyed!.text.toLowerCase().includes(words[0]!), false, `${item.sourceKey} repeats ${words[0]}`);
    }
  }

  const quiz = readFileSync(new URL("./tutor-reusable-quiz.ts", import.meta.url), "utf8");
  assert.match(quiz, /sourceKind === "original_hard"/);
  assert.match(quiz, /Original hard items cannot be added to a tutor quiz/);

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
      const prompt = norm(record.prompt);
      if (prompt) officialStems.add(prompt);
      if (record.stimulus) {
        const stimulus = norm(record.stimulus);
        if (stimulus) officialStems.add(stimulus);
      }
      const combined = norm(`${record.stimulus ?? ""} ${record.prompt}`);
      if (combined) officialStems.add(combined);
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
    for (const section of ["rw", "math"] as const) {
      const sectionRows = records.filter((record) => record.sourceKey.includes(dateKey) && record.section === section);
      assert.equal(sectionRows.length, 35, `${dateKey} ${section}`);
      const unusedNumbers = sectionRows
        .filter((record) => !selected.some((item) => item.sourceKey === record.sourceKey))
        .map((record) => record.questionNumber)
        .sort((left, right) => left - right);
      assert.deepEqual(unusedNumbers, [1, 2, 3, 4, 5], `${dateKey} ${section}`);
    }
    const selectedRw = records.filter(
      (record) => selected.some((item) => item.sourceKey === record.sourceKey) && record.section === "rw",
    );
    for (const domain of [
      "Craft and Structure",
      "Information and Ideas",
      "Standard English Conventions",
      "Expression of Ideas",
    ]) {
      assert.ok(selectedRw.some((record) => record.domain === domain), `${dateKey} ${domain}`);
    }
    const exclude = new Set<string>();
    for (const section of ["rw", "math"] as const) {
      const highest = records
        .filter((record) => record.sourceKey.includes(dateKey) && record.section === section)
        .sort((left, right) => right.questionNumber - left.questionNumber)
        .slice(0, 5);
      for (const row of highest) exclude.add(row.sourceKey);
    }
    const spared = planHardSatSessionSets(pool, {
      originalDateKey: dateKey,
      balance: "even",
      preworkTarget: 40,
      preworkMax: 40,
      inSessionMax: 20,
      excludeSourceKeys: exclude,
    });
    assert.equal(spared.prework.length, 40, `${dateKey} spares`);
    assert.equal(spared.inSession.length, 20, `${dateKey} spares`);
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

  const when = taitoSessionDateTime("2026-11-27");
  assert.equal(originalHardSatDateKeyForSession({ dateTime: when, email: "other@example.com" }), null);
  assert.equal(
    originalHardSatDateKeyForSession({ dateTime: when, email: TAITO_STUDENT_EMAIL }),
    "2026-11-27",
  );

  const retry = decideRetrySource({
    source: {
      id: "miss",
      sourceKey: "sat-pt4-rw-m2-q27",
      skill: "Inferences",
      section: "rw",
      difficulty: "H",
    },
    unusedBank: [
      {
        id: "hard",
        sourceKey: "original-hard-2026-11-27-rw-30",
        skill: "Inferences",
        section: "rw",
        module: 2,
        questionNumber: 30,
        difficulty: "H",
        sourceKind: "original_hard",
      },
      {
        id: "official",
        sourceKey: "sat-pt5-rw-m2-q20",
        skill: "Inferences",
        section: "rw",
        module: 2,
        questionNumber: 20,
        difficulty: "H",
      },
    ],
    env: {},
  });
  assert.equal(retry.kind, "bank");
  if (retry.kind === "bank") assert.equal(retry.candidate.sourceKey, "sat-pt5-rw-m2-q20");

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
  assert.match(shared, /sourceKind !== "original_hard"/);
  assert.match(shared, /slug !== "original-hard-sat"/);
  const retrySource = readFileSync(new URL("./sat-bank-retry.ts", import.meta.url), "utf8");
  assert.match(retrySource, /isOriginalHardRetry/);
});
