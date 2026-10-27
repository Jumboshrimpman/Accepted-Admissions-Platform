import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NEEL_DHARNI_USER_ID } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { deliverNikaPayoutChange, deliverNikaPayoutWebhook, isNikaNeelPayoutPair, nikaPayoutEventForChange, scheduleNikaPayoutWebhook, type NikaPayoutLog, type NikaPayoutSession } from "./nika-payout-webhook.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NIKA_TUTOR_PROFILE_ID } from "./self-serve-availability.ts";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STUDENT = "22222222-2222-4222-8222-222222222222";
const OTHER_TUTOR = "33333333-3333-4333-8333-333333333333";
const WEBHOOK_URL = "https://payout.example.test/hooks/nika?token=query-secret";
const WEBHOOK_KEY = "super-secret-key";

function session(overrides: Partial<NikaPayoutSession> = {}): NikaPayoutSession {
  return {
    id: SESSION_ID,
    clientUserId: NEEL_DHARNI_USER_ID,
    tutorUserId: "nika-user",
    dateTime: new Date("2026-10-27T01:00:00.000Z"),
    timezone: "America/New_York",
    durationMinutes: 60,
    ...overrides,
  };
}

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NIKA_PAYOUT_WEBHOOK_URL: WEBHOOK_URL,
    NIKA_PAYOUT_WEBHOOK_KEY: WEBHOOK_KEY,
    ...overrides,
  };
}

test("only a Nika profile and Neel's user id match", () => {
  assert.equal(isNikaNeelPayoutPair(NEEL_DHARNI_USER_ID, NIKA_TUTOR_PROFILE_ID), true);
  assert.equal(isNikaNeelPayoutPair(OTHER_STUDENT, NIKA_TUTOR_PROFILE_ID), false);
  assert.equal(isNikaNeelPayoutPair(NEEL_DHARNI_USER_ID, OTHER_TUTOR), false);
  assert.equal(isNikaNeelPayoutPair("Neel Dharni", NIKA_TUTOR_PROFILE_ID), false);
  assert.equal(
    nikaPayoutEventForChange({
      beforeClientUserId: NEEL_DHARNI_USER_ID,
      beforeTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      beforeBookingStatus: "confirmed",
      beforeStartsAt: new Date("2026-10-27T01:00:00.000Z"),
      beforeDurationMinutes: 60,
      afterClientUserId: NEEL_DHARNI_USER_ID,
      afterTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      afterBookingStatus: "rescheduled",
      afterStartsAt: new Date("2026-10-28T01:00:00.000Z"),
      afterDurationMinutes: 60,
    }),
    "rescheduled",
  );
  assert.equal(
    nikaPayoutEventForChange({
      beforeClientUserId: NEEL_DHARNI_USER_ID,
      beforeTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      beforeBookingStatus: "confirmed",
      beforeStartsAt: new Date("2026-10-27T01:00:00.000Z"),
      beforeDurationMinutes: 60,
      afterClientUserId: NEEL_DHARNI_USER_ID,
      afterTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      afterBookingStatus: "cancelled",
      afterStartsAt: new Date("2026-10-27T01:00:00.000Z"),
      afterDurationMinutes: 60,
    }),
    "cancelled",
  );
  assert.equal(
    nikaPayoutEventForChange({
      beforeClientUserId: OTHER_STUDENT,
      beforeTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      beforeBookingStatus: "confirmed",
      beforeStartsAt: new Date("2026-10-27T01:00:00.000Z"),
      beforeDurationMinutes: 60,
      afterClientUserId: OTHER_STUDENT,
      afterTutorProfileId: NIKA_TUTOR_PROFILE_ID,
      afterBookingStatus: "cancelled",
      afterStartsAt: new Date("2026-10-27T01:00:00.000Z"),
      afterDurationMinutes: 60,
    }),
    null,
  );
});

test("payload uses an offset timestamp and the nika and neel labels", async () => {
  const seen: { url?: string; headers?: Headers; body?: string } = {};
  await deliverNikaPayoutWebhook({
    event: "booked",
    session: session(),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env(),
    now: new Date("2026-10-26T16:00:00.000Z"),
    fetchImpl: async (input, init) => {
      seen.url = String(input);
      seen.headers = new Headers(init?.headers);
      seen.body = String(init?.body);
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(seen.url, WEBHOOK_URL);
  assert.equal(seen.headers?.get("authorization"), `Bearer ${WEBHOOK_KEY}`);
  assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
    event: "booked",
    sessionId: SESSION_ID,
    startsAt: "2026-10-26T21:00:00-04:00",
    durationMinutes: 60,
    endsAt: "2026-10-26T22:00:00-04:00",
    tutor: "nika",
    student: "neel",
    sentAt: "2026-10-26T16:00:00+00:00",
  });
});

test("a custom header sends the raw key and omits Authorization", async () => {
  let authorization: string | null = "unset";
  let custom: string | null = null;
  await deliverNikaPayoutWebhook({
    event: "cancelled",
    session: session(),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env({ NIKA_PAYOUT_WEBHOOK_KEY_HEADER: "X-Payout-Key" }),
    fetchImpl: async (_input, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization");
      custom = headers.get("x-payout-key");
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(authorization, null);
  assert.equal(custom, WEBHOOK_KEY);
});

test("an unset URL does nothing", async () => {
  let calls = 0;
  const logs: NikaPayoutLog[] = [];
  await deliverNikaPayoutWebhook({
    event: "booked",
    session: session(),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: { NIKA_PAYOUT_WEBHOOK_KEY: WEBHOOK_KEY },
    log: (fields) => logs.push(fields),
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(logs, []);
});

test("other students and tutors do not post", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };
  await deliverNikaPayoutWebhook({
    event: "booked",
    session: session({ clientUserId: OTHER_STUDENT }),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env(),
    fetchImpl,
  });
  await deliverNikaPayoutWebhook({
    event: "rescheduled",
    session: session(),
    tutorProfileId: OTHER_TUTOR,
    env: env(),
    fetchImpl,
  });
  await deliverNikaPayoutChange({
    before: { ...session({ clientUserId: OTHER_STUDENT }), bookingStatus: "confirmed" },
    after: {
      ...session({ clientUserId: OTHER_STUDENT, dateTime: new Date("2026-11-01T01:00:00.000Z") }),
      bookingStatus: "rescheduled",
    },
    beforeTutorProfileId: NIKA_TUTOR_PROFILE_ID,
    afterTutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env(),
    fetchImpl,
  });
  assert.equal(calls, 0);
});

test("webhook errors are swallowed after one retry and the log has no secret", async () => {
  let calls = 0;
  const logs: NikaPayoutLog[] = [];
  await deliverNikaPayoutWebhook({
    event: "booked",
    session: session(),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env(),
    log: (fields) => logs.push(fields),
    fetchImpl: async () => {
      calls += 1;
      throw new Error(`connect ${WEBHOOK_URL} key ${WEBHOOK_KEY}`);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(logs, [{ sessionId: SESSION_ID, event: "booked", status: 0 }]);
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes(WEBHOOK_KEY), false);
  assert.equal(serialized.includes("query-secret"), false);

  calls = 0;
  logs.length = 0;
  await deliverNikaPayoutWebhook({
    event: "rescheduled",
    session: session(),
    tutorProfileId: NIKA_TUTOR_PROFILE_ID,
    env: env(),
    log: (fields) => logs.push(fields),
    fetchImpl: async () => {
      calls += 1;
      return new Response("nope", { status: calls === 1 ? 503 : 202 });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(logs, [{ sessionId: SESSION_ID, event: "rescheduled", status: 202 }]);

  let thrown = false;
  try {
    scheduleNikaPayoutWebhook({
      event: "cancelled",
      session: session(),
      tutorProfileId: NIKA_TUTOR_PROFILE_ID,
      env: env(),
      fetchImpl: async () => {
        throw new Error("down");
      },
    });
  } catch {
    thrown = true;
  }
  assert.equal(thrown, false);
});
