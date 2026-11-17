import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Native Node test execution requires the source extension.
import { formatMichelleHardAssignmentTitle } from "./michelle-hard-assignment-title.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { isMichelleOriginalHardSourceKey } from "./michelle-sat-sections.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  allCuratedRwSourceKeys,
  assertCuratedRwBundlesComplete,
  bundleAssignedFromSourceKeys,
  CURATED_RW_IN_SESSION_QUESTIONS,
  CURATED_RW_PREWORK_QUESTIONS,
  CURATED_RW_RESERVE_QUESTIONS,
  curatedRwItemsForBundle,
  isMichelleSophiaLamasCuratedRwSourceKey,
  isOriginalCuratedRwItem,
  michelleSophiaLamasCuratedRwBankRecords,
  MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS,
  nextCuratedRwBundle,
  nextCuratedRwBundleForSession,
} from "./michelle-sophia-lamas-curated-rw.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { routinePreworkTimeLimitMinutes } from "./sat-bank-timing.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("curated SAT English bundles are 40 / 15 / 5, SAT-only, and complete", () => {
  assertCuratedRwBundlesComplete();
  for (const bundle of MICHELLE_SOPHIA_LAMAS_CURATED_BUNDLE_NUMBERS) {
    assert.equal(curatedRwItemsForBundle(bundle, "prework").length, CURATED_RW_PREWORK_QUESTIONS);
    assert.equal(curatedRwItemsForBundle(bundle, "insession").length, CURATED_RW_IN_SESSION_QUESTIONS);
    assert.equal(curatedRwItemsForBundle(bundle, "reserve").length, CURATED_RW_RESERVE_QUESTIONS);
  }
  assert.equal(routinePreworkTimeLimitMinutes(CURATED_RW_PREWORK_QUESTIONS), 50);
});

test("curated bank records are exam_family sat original_hard module 2 and never IELTS", () => {
  const records = michelleSophiaLamasCuratedRwBankRecords();
  assert.equal(records.length, 238);
  for (const row of records) {
    assert.equal(row.examFamily, "sat");
    assert.equal(row.sourceKind, "original_hard");
    assert.equal(row.section, "rw");
    assert.equal(row.module, 2);
    assert.equal(row.difficulty, "hard");
    assert.equal(row.questionType, "mcq");
    assert.equal(row.choices.length, 4);
    assert.match(row.correctAnswer, /^[a-d]$/);
    assert.ok(row.choices.some((choice) => choice.id === row.correctAnswer && choice.text.trim()));
    assert.ok(row.prompt.trim());
    assert.equal(row.assignable, true);
    const blob = JSON.stringify(row);
    assert.doesNotMatch(blob, /ielts/i);
    assert.doesNotMatch(row.prompt, /<\/?[a-zA-Z]/);
    if (row.stimulus) assert.doesNotMatch(row.stimulus, /<\/?[a-zA-Z]/);
  }
  const keys = records.map((row) => row.sourceKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("Bundle 1 reuses two official SAT items Michelle has not already seen; later bundles are all original", () => {
  const official = curatedRwItemsForBundle(1).filter((item) => !isOriginalCuratedRwItem(item));
  assert.deepEqual(
    official.map((item) => item.officialSourceKey).sort(),
    ["sat-pt10-rw-m2-q15", "sat-pt6-rw-m2-q4"].sort(),
  );
  for (const bundle of [2, 3, 4] as const) {
    assert.ok(curatedRwItemsForBundle(bundle).every(isOriginalCuratedRwItem));
  }
  const officialInRecords = michelleSophiaLamasCuratedRwBankRecords().filter((row) =>
    row.sourceKey.startsWith("sat-pt"),
  );
  assert.equal(officialInRecords.length, 0);
});

test("tables, dual texts, and rhetorical-synthesis notes are stored as plaintext", () => {
  const records = michelleSophiaLamasCuratedRwBankRecords();
  const tables = records.filter((row) => (row.sourceFiles as { kind?: string }).kind === "CQ");
  assert.ok(tables.length >= 20);
  for (const row of tables) {
    assert.ok(row.stimulus && row.stimulus.includes("  "));
    assert.ok((row.stimulus.match(/\n/g) ?? []).length >= 2);
  }
  const dual = records.filter((row) => (row.sourceFiles as { kind?: string }).kind === "CTC");
  assert.ok(dual.length >= 8);
  for (const row of dual) {
    assert.ok(row.stimulus?.includes("Text 1"));
    assert.ok(row.stimulus?.includes("Text 2"));
  }
  const synthesis = records.filter((row) => (row.sourceFiles as { kind?: string }).kind === "RS");
  assert.ok(synthesis.length >= 8);
  for (const row of synthesis) {
    assert.ok(row.stimulus?.includes("- "));
  }
});

test("the next unused curated bundle is consumed in order, with earlier sessions reserved first", () => {
  assert.equal(nextCuratedRwBundle([]), 1);
  assert.equal(nextCuratedRwBundle([1]), 2);
  assert.equal(nextCuratedRwBundle([1, 2]), 3);
  assert.equal(nextCuratedRwBundle([1, 2, 3]), 4);
  assert.equal(nextCuratedRwBundle([1, 2, 3, 4]), null);

  const earlier = new Date("2026-11-17T17:06:00.000Z");
  const later = new Date("2026-11-17T17:09:00.000Z");
  assert.equal(
    nextCuratedRwBundleForSession({
      currentSessionId: "session-nov-23",
      currentCreatedAt: earlier,
      peers: [{ id: "session-dec-1", createdAt: later, assignedBundle: null }],
    }),
    1,
  );
  assert.equal(
    nextCuratedRwBundleForSession({
      currentSessionId: "session-dec-1",
      currentCreatedAt: later,
      peers: [{ id: "session-nov-23", createdAt: earlier, assignedBundle: null }],
    }),
    2,
  );
  assert.equal(
    nextCuratedRwBundleForSession({
      currentSessionId: "session-dec-1",
      currentCreatedAt: later,
      peers: [{ id: "session-nov-23", createdAt: earlier, assignedBundle: 1 }],
    }),
    2,
  );
});

test("a session is recognized as holding a curated bundle from original source keys only", () => {
  assert.equal(bundleAssignedFromSourceKeys(["sat-pt6-rw-m2-q4"]), null);
  assert.equal(
    bundleAssignedFromSourceKeys([
      "original-hard-michelle-sophia-lamas-rw-b1-prework-01",
      "original-hard-michelle-sophia-lamas-rw-b1-prework-02",
      "original-hard-michelle-sophia-lamas-rw-b1-prework-03",
      "sat-pt10-rw-m2-q15",
    ]),
    1,
  );
});

test("curated Sophia Lamas keys stay out of the generic Michelle original-hard picker", () => {
  assert.equal(
    isMichelleOriginalHardSourceKey("original-hard-michelle-2026-11-22-math-01"),
    true,
  );
  assert.equal(
    isMichelleSophiaLamasCuratedRwSourceKey(
      "original-hard-michelle-sophia-lamas-rw-b1-prework-01",
    ),
    true,
  );
  assert.equal(
    isMichelleOriginalHardSourceKey("original-hard-michelle-sophia-lamas-rw-b1-prework-01"),
    false,
  );
  assert.ok(allCuratedRwSourceKeys().length >= 240);
});

test("Nov 23 and Dec 1 titles keep the existing Michelle x Sophia L style", () => {
  const nov23 = {
    dateTime: new Date("2026-11-23T14:00:00.000Z"),
    timezone: "America/New_York",
    tutorName: "Sophia Lamas",
    tutorEmail: "sophia.e.lamas@gmail.com",
    sessionTitle: "Michelle’s SAT Session with Sophia",
    sections: ["rw"] as const,
  };
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov23, kind: "prework" }),
    "Nov 23 Pre-work SAT English (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov23, kind: "in-session" }),
    "Nov 23 In-session SAT English (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({ ...nov23, kind: "reserve" }),
    "Nov 23 In-session SAT English Reserve (Hard) — Michelle x Sophia L",
  );
  assert.equal(
    formatMichelleHardAssignmentTitle({
      dateTime: new Date("2026-12-01T14:00:00.000Z"),
      timezone: "America/New_York",
      kind: "prework",
      tutorName: "Sophia Lamas",
      sessionTitle: "Michelle’s SAT Session with Sophia",
      sections: ["rw"],
    }),
    "Dec 1 Pre-work SAT English (Hard) — Michelle x Sophia L",
  );
});

test("hard SAT session setup tries the curated Sophia Lamas bundles before the official picker", () => {
  const source = fs.readFileSync(path.join(here, "sat-hard-sets.ts"), "utf8");
  const start = source.indexOf("export async function ensureHardSatSessionSets(");
  const body = source.slice(start, source.indexOf("export function isTaitoOct30EuniceSession", start));
  assert.match(body, /ensureMichelleSophiaLamasCuratedRwSets/);
  assert.ok(body.indexOf("ensureMichelleSophiaLamasCuratedRwSets") < body.indexOf("ensureHardSatPrework"));
  assert.match(body, /exhausted/);
  assert.match(body, /blocked-by-attempts/);
});
