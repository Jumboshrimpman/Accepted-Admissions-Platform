import assert from "node:assert/strict";
import test from "node:test";
import {
  createClerkSessionTokenCache,
  jwtExpiresAtMs,
} from "./clerk-session-token.ts";

function sessionJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.sig`;
}

test("session jwt expiry is read from the payload", () => {
  assert.equal(jwtExpiresAtMs(sessionJwt(1_800_000_000)), 1_800_000_000_000);
  assert.equal(jwtExpiresAtMs("not-a-jwt"), null);
});

test("a hung getToken returns the last unexpired token without waiting out every retry", async () => {
  const now = 1_700_000_000_000;
  const good = sessionJwt((now + 60_000) / 1000);
  const cache = createClerkSessionTokenCache({
    now: () => now,
    timeoutMs: 20,
    retryDelaysMs: [5],
    sleep: async () => {},
  });
  assert.equal(await cache.refresh(async () => good), good);
  let calls = 0;
  const again = await cache.refresh(async () => {
    calls += 1;
    return new Promise(() => {});
  });
  assert.equal(again, good);
  assert.equal(calls, 1);
  const forRequest = await cache.tokenForRequest(async () => {
    calls += 1;
    return "should-not-be-used";
  });
  assert.equal(forRequest, good);
  assert.equal(calls, 1);
});

test("getToken failures retry with backoff and then keep a later success", async () => {
  const now = 1_700_000_000_000;
  const good = sessionJwt((now + 120_000) / 1000);
  const sleeps: number[] = [];
  const cache = createClerkSessionTokenCache({
    now: () => now,
    timeoutMs: 20,
    retryDelaysMs: [10, 30],
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  let calls = 0;
  const token = await cache.refresh(async () => {
    calls += 1;
    if (calls < 3) throw new Error("clerk token timeout");
    return good;
  });
  assert.equal(token, good);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 30]);
});

test("an expired token is not attached after getToken rejects", async () => {
  const now = 1_700_000_000_000;
  const expired = sessionJwt((now - 60_000) / 1000);
  const cache = createClerkSessionTokenCache({
    now: () => now,
    timeoutMs: 20,
    retryDelaysMs: [],
    sleep: async () => {},
  });
  assert.equal(await cache.refresh(async () => expired), null);
  assert.equal(await cache.tokenForRequest(async () => null), null);
  assert.equal(cache.peek(), null);
});
