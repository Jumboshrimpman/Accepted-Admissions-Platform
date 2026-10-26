import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  OCT23_IN_SESSION_ATTEMPT_ID,
  inSessionDeliverySkipsTimeLimit,
  serverTimeLimitReached,
} from "./in-session-time-limit.ts";
import {
  hardSatShortfallBlockedByAssignedSet,
  taitoOct30PreworkAllowsInSession,
} from "./sat-hard-sets.ts";

test("in-session work never reaches the server time limit", () => {
  assert.equal(inSessionDeliverySkipsTimeLimit("during_session"), true);
  assert.equal(inSessionDeliverySkipsTimeLimit("before_session"), false);
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "during_session",
      timeLimitMinutes: 30,
      activeSeconds: 30 * 60 + 5,
    }),
    false,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 25,
      activeSeconds: 25 * 60,
    }),
    true,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 30,
      activeSeconds: 45 * 60,
      softTimeLimit: true,
    }),
    false,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 30,
      activeSeconds: 45 * 60,
      softTimeLimit: false,
    }),
    true,
  );
  assert.equal(
    serverTimeLimitReached({
      deliveryPhase: "before_session",
      timeLimitMinutes: 60,
      activeSeconds: 59 * 60,
    }),
    false,
  );
});

test("opening a result does not wipe stored in-session scores", () => {
  const timeLimit = readFileSync(new URL("./in-session-time-limit.ts", import.meta.url), "utf8");
  const platform = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const startup = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.equal(OCT23_IN_SESSION_ATTEMPT_ID, "e38f62db-f088-435c-aa84-4c5480707f59");
  assert.doesNotMatch(timeLimit, /result:\s*null|score:\s*null|submittedAt:\s*null|analysis:\s*null/);
  assert.doesNotMatch(timeLimit, /reopenExpiredInSessionAttempt|ensureInSessionAttemptsStayOpen|shouldReopenExpiredInSessionAttempt/);
  assert.doesNotMatch(platform, /reopenExpiredInSessionAttempt|attempt\.result = null|attempt\.score = null/);
  assert.doesNotMatch(startup, /ensureInSessionAttemptsStayOpen/);
  assert.match(platform, /serverTimeLimitReached/);
  assert.match(platform, /OCT23_IN_SESSION_ATTEMPT_ID/);
  assert.match(startup, /ensureTaitoOct23RemainingHomework/);
  assert.doesNotMatch(platform, /sendEmail|nodemailer|resend/i);
});

test("shortfall auto-resolve requires one full hard set, not a sum", () => {
  const full = { fullPrework: 40, fullInSession: 20 };
  const set = (questionCount: number, everyKeyIsHard: boolean) => ({ questionCount, everyKeyIsHard });
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(40, true)],
      inSessionSets: [set(20, true)],
      ...full,
    }),
    true,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(20, true), set(20, true)],
      inSessionSets: [set(20, true)],
      ...full,
    }),
    false,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(40, false)],
      inSessionSets: [set(20, true)],
      ...full,
    }),
    false,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(40, true)],
      inSessionSets: [set(20, false)],
      ...full,
    }),
    false,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(40, true)],
      inSessionSets: [set(10, true), set(10, true)],
      ...full,
    }),
    false,
  );
  assert.equal(
    hardSatShortfallBlockedByAssignedSet({
      preworkSets: [set(30, true), set(10, false)],
      inSessionSets: [set(20, true)],
      ...full,
    }),
    false,
  );
  const hardSets = readFileSync(new URL("./sat-hard-sets.ts", import.meta.url), "utf8");
  assert.match(hardSets, /resolveHardSatShortfallAlert/);
  assert.match(hardSets, /everyKeyIsHard && set\.questionCount >= size/);
  assert.doesNotMatch(hardSets, /assignedHardSetQuestionCounts/);
  assert.doesNotMatch(hardSets, /assignedPrework >= input\.fullPrework/);
  assert.equal(taitoOct30PreworkAllowsInSession("assigned"), true);
  assert.equal(taitoOct30PreworkAllowsInSession("unchanged"), true);
  assert.equal(taitoOct30PreworkAllowsInSession("blocked-by-attempts"), true);
  assert.equal(taitoOct30PreworkAllowsInSession("shortfall"), false);
  assert.equal(taitoOct30PreworkAllowsInSession("not-hard"), false);
  assert.equal(taitoOct30PreworkAllowsInSession("unavailable"), false);
  const oct30Startup = hardSets.slice(hardSets.indexOf("export async function ensureTaitoOct30HardPrework"));
  assert.match(oct30Startup, /taitoOct30PreworkAllowsInSession\(result\.action\)/);
  assert.match(oct30Startup, /ensureHardSatInSession\(session\)/);
  assert.doesNotMatch(oct30Startup, /sendEmail|sendTransactionalEmail/);
});
