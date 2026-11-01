import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { IN_SESSION_PRACTICE_TITLE } from "./in-session-practice.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { sessionPreworkDedupeSlot } from "./session-prework-dedupe.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  HARD_RESERVE_DEFAULT,
  HARD_RESERVE_MAX,
  decideHardReserveWrite,
  duringSessionAcceptsSessionWork,
  hardChallengeSetTitle,
  hardChallengeTitleIsPrework,
  resolveDuringSessionAssignment,
  selectHardReserve,
  type HardReserveCandidate,
} from "./sat-hard-reserve-plan.ts";

function item(
  index: number,
  options: { family?: string; sourceKind?: string; inHardPool?: boolean } = {},
): HardReserveCandidate {
  const family = options.family ?? "sat";
  return {
    id: `${family}-hard-${index}`,
    sourceKey: `${family}-hard-${index}`,
    examFamily: family,
    sourceKind: options.sourceKind ?? "official_extract",
    inHardPool: options.inHardPool ?? true,
  };
}

function pool(count: number): HardReserveCandidate[] {
  return Array.from({ length: count }, (_, index) => item(index + 1));
}

test("hard reserve is 5 by default and never more than 10", () => {
  const many = pool(30);
  const standard = selectHardReserve(many, { seed: "session-a" });
  assert.equal(HARD_RESERVE_DEFAULT, 5);
  assert.equal(HARD_RESERVE_MAX, 10);
  assert.equal(standard.selected.length, 5);
  assert.equal(standard.shortfall, 0);
  assert.equal(standard.target, 5);
  const capped = selectHardReserve(many, { seed: "session-a", target: 40 });
  assert.equal(capped.selected.length, 10);
  assert.equal(capped.target, 10);
  assert.equal(capped.shortfall, 0);
});

test("hard reserve stays on official SAT hard-pool items and skips PSAT", () => {
  const mixed = [
    ...pool(8),
    item(90, { family: "psat" }),
    item(91, { family: "psat", sourceKind: "official_extract" }),
    item(92, { family: "sat", sourceKind: "seed", inHardPool: true }),
    item(93, { family: "sat", sourceKind: "official_extract", inHardPool: false }),
    item(94, { family: "sat", sourceKind: "original_hard" }),
  ];
  const picked = selectHardReserve(mixed, { seed: "session-sat" });
  assert.equal(picked.selected.length, 5);
  assert.equal(picked.selected.every((row) => row.examFamily === "sat"), true);
  assert.equal(picked.selected.every((row) => row.sourceKind === "official_extract"), true);
  assert.equal(picked.selected.every((row) => row.inHardPool !== false), true);
  assert.equal(picked.selected.some((row) => row.examFamily === "psat"), false);
});

test("hard reserve does not overlap pre-work or in-session ids", () => {
  const items = pool(12);
  const prework = new Set([items[0]!.id, items[1]!.id]);
  const inSession = new Set([items[2]!.sourceKey, items[3]!.sourceKey]);
  const picked = selectHardReserve(items, {
    seed: "session-exclude",
    excludeIds: prework,
    excludeSourceKeys: inSession,
  });
  assert.equal(picked.selected.length, 5);
  for (const row of picked.selected) {
    assert.equal(prework.has(row.id), false);
    assert.equal(inSession.has(row.sourceKey), false);
  }
});

test("the same session id reproduces the reserve and a different session id does not", () => {
  const items = pool(16);
  const first = selectHardReserve(items, { seed: "session-same" });
  const again = selectHardReserve([...items].reverse(), { seed: "session-same" });
  const other = selectHardReserve(items, { seed: "session-other" });
  assert.deepEqual(
    first.selected.map((row) => row.id),
    again.selected.map((row) => row.id),
  );
  assert.notDeepEqual(
    first.selected.map((row) => row.id),
    other.selected.map((row) => row.id),
  );
});

test("a second run keeps the existing reserve instead of creating another", () => {
  const title = hardChallengeSetTitle(5, "Taito’s SAT Session with Eunice");
  assert.equal(
    decideHardReserveWrite([
      { title: "During session practice — Taito’s SAT Session with Eunice", status: "draft" },
      { title, status: "draft" },
    ]),
    "keep",
  );
  assert.equal(
    decideHardReserveWrite([
      { title, status: "archived" },
      { title: "During session practice — Taito’s SAT Session with Eunice", status: "published" },
    ]),
    "create",
  );
  const source = readFileSync(new URL("./sat-hard-reserve.ts", import.meta.url), "utf8");
  const plan = readFileSync(new URL("./sat-hard-reserve-plan.ts", import.meta.url), "utf8");
  assert.match(source, /decideHardReserveWrite\(during\) === "keep"/);
  assert.doesNotMatch(source, /archiveUnattempted|update\(assignmentsTable\)/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(plan, /Math\.random/);
});

test("a short hard pool records a shortfall and does not pad", () => {
  const empty = selectHardReserve([], { seed: "session-empty" });
  assert.deepEqual(empty.selected, []);
  assert.equal(empty.shortfall, 5);
  assert.equal(empty.target, 5);
  const short = selectHardReserve(pool(3), { seed: "session-short" });
  assert.equal(short.selected.length, 3);
  assert.equal(short.shortfall, 2);
  assert.equal(new Set(short.selected.map((row) => row.id)).size, 3);
});

test("a standard session keeps a separate during-session practice row beside the reserve", () => {
  const reserve = {
    id: "reserve",
    title: hardChallengeSetTitle(5, "Sama’s SAT Session"),
    hardChallengeReserve: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    questions: ["hard-1", "hard-2", "hard-3", "hard-4", "hard-5"],
  };
  const practice = {
    id: "practice",
    title: "During session practice — Sama’s SAT Session",
    hardChallengeReserve: false,
    createdAt: "2026-11-01T00:01:00.000Z",
    questions: ["prework-unanswered"],
  };
  assert.equal(resolveDuringSessionAssignment([reserve]), null);
  assert.equal(resolveDuringSessionAssignment([reserve, practice])?.id, "practice");
  assert.equal(duringSessionAcceptsSessionWork(reserve), false);
  assert.equal(duringSessionAcceptsSessionWork(practice), true);
  assert.deepEqual(reserve.questions, ["hard-1", "hard-2", "hard-3", "hard-4", "hard-5"]);
  assert.equal(reserve.title, "Hard challenge set (5) — Sama’s SAT Session");
});

test("a hard session's in-session row is chosen and the reserve is not", () => {
  const reserve = {
    id: "reserve",
    title: hardChallengeSetTitle(5, "Taito’s SAT Session with Eunice"),
    hardChallengeReserve: true,
    createdAt: "2026-11-20T00:00:00.000Z",
  };
  const hardInSession = {
    id: "hard-in-session",
    title: "Hard SAT in-session (20) — Taito’s SAT Session with Eunice",
    hardChallengeReserve: false,
    createdAt: "2026-11-20T00:05:00.000Z",
  };
  assert.equal(resolveDuringSessionAssignment([reserve, hardInSession])?.id, "hard-in-session");
  assert.equal(resolveDuringSessionAssignment([hardInSession, reserve])?.id, "hard-in-session");
  assert.equal(duringSessionAcceptsSessionWork(hardInSession), true);
  const prep = readFileSync(new URL("./session-curriculum-prep.ts", import.meta.url), "utf8");
  const platform = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  const prepEnsure = prep.slice(
    prep.indexOf("async function ensureDuringSessionAssignment"),
    prep.indexOf("async function assignmentQuestionCount"),
  );
  const platformEnsure = platform.slice(
    platform.indexOf("async function ensureDuringSessionAssignment"),
    platform.indexOf("async function adaptiveCurriculumForSession"),
  );
  const copy = prep.slice(
    prep.indexOf("async function copyHomeworkIntoDuringSession"),
    prep.indexOf("async function ensureOriginalPracticeQuestion"),
  );
  const live = hardSets.slice(
    hardSets.indexOf("async function liveDuringAssignments"),
    hardSets.indexOf("async function markSessionNeedsHardQuestions"),
  );
  assert.match(prepEnsure, /resolveDuringSessionAssignment/);
  assert.match(platformEnsure, /resolveDuringSessionAssignment/);
  assert.match(copy, /duringSessionAcceptsSessionWork/);
  assert.match(live, /isHardChallengeReserve/);
});

test("the reserve title is not SAT pre-work and not the in-session practice quiz", () => {
  const title = hardChallengeSetTitle(5, "Taito’s SAT Session with Eunice");
  assert.match(title, /Hard/);
  assert.match(title, /\(5\)/);
  assert.equal(title.includes("SAT pre-work"), false);
  assert.equal(sessionPreworkDedupeSlot(title), null);
  assert.equal(hardChallengeTitleIsPrework(title), false);
  assert.notEqual(title, IN_SESSION_PRACTICE_TITLE);
  assert.equal(title.includes("During session practice"), false);
  assert.equal(sessionPreworkDedupeSlot("SAT pre-work (30–50 questions) — Taito"), "sat-bank-prework");
});
