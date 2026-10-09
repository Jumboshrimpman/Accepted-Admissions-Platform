import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkSessionTokens,
  createClerkSessionTokenCache,
  jwtExpiresAtMs,
  noteClerkUserChange,
  resetNotedClerkUserForTests,
} from "./clerk-session-token.ts";

function sessionJwt(expSeconds: number, claims: Record<string, string> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, ...claims })).toString("base64url");
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

test("a resolved null is not reconnecting, and a timeout or throw is", async () => {
  const cache = createClerkSessionTokenCache({
    now: () => 1_700_000_000_000,
    timeoutMs: 15,
    retryDelaysMs: [],
    sleep: async () => {},
  });
  assert.deepEqual(await cache.refreshOutcome(async () => null), {
    token: null,
    reconnecting: false,
  });
  assert.deepEqual(
    await cache.refreshOutcome(() => new Promise(() => {})),
    { token: null, reconnecting: true },
  );
  const rejected = await cache.refreshOutcome(async () => {
    throw new Error("clerk down");
  });
  assert.equal(rejected.token, null);
  assert.equal(rejected.reconnecting, true);
});

test("a cached token is dropped when the clerk user or session does not match", async () => {
  const now = 1_700_000_000_000;
  const tokenA = sessionJwt((now + 60_000) / 1000, { sub: "user_a", sid: "sess_a" });
  const tokenB = sessionJwt((now + 60_000) / 1000, { sub: "user_b", sid: "sess_b" });
  const cache = createClerkSessionTokenCache({
    now: () => now,
    timeoutMs: 20,
    retryDelaysMs: [],
    sleep: async () => {},
  });
  assert.equal(await cache.refresh(async () => tokenA), tokenA);

  let calls = 0;
  const otherSession = await cache.tokenForRequest(async () => {
    calls += 1;
    return tokenA;
  }, { userId: "user_a", sessionId: "sess_other" });
  assert.equal(otherSession, null);
  assert.equal(cache.peek(), null);
  assert.equal(calls, 1);

  assert.equal(await cache.refresh(async () => tokenA), tokenA);
  const otherUser = await cache.tokenForRequest(async () => {
    calls += 1;
    return tokenB;
  }, { userId: "user_b", sessionId: "sess_b" });
  assert.equal(otherUser, tokenB);
  assert.equal(calls, 2);

  const sameUser = await cache.tokenForRequest(async () => {
    calls += 1;
    return "unused";
  }, { userId: "user_b", sessionId: "sess_b" });
  assert.equal(sameUser, tokenB);
  assert.equal(calls, 2);

  const signedOut = await cache.tokenForRequest(async () => {
    calls += 1;
    return tokenB;
  }, { userId: null, sessionId: null });
  assert.equal(signedOut, null);
  assert.equal(cache.peek(), null);
  assert.equal(calls, 2);
});

test("the clerk listener clears the shared cache when the user changes or signs out", async () => {
  resetNotedClerkUserForTests();
  clerkSessionTokens.clear();
  const exp = Math.floor(Date.now() / 1000) + 120;
  const tokenA = sessionJwt(exp, { sub: "user_a", sid: "sess_a" });
  assert.equal(await clerkSessionTokens.refresh(async () => tokenA), tokenA);
  noteClerkUserChange("user_a");
  assert.equal(clerkSessionTokens.peek(), tokenA);
  noteClerkUserChange(null);
  assert.equal(clerkSessionTokens.peek(), null);
  noteClerkUserChange("user_b");
  assert.equal(clerkSessionTokens.peek(), null);
  resetNotedClerkUserForTests();
  clerkSessionTokens.clear();
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
