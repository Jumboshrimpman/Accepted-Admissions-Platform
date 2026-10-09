import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  invalidAttemptIdGate,
  isUuidAttemptId,
  rejectInvalidAttemptId,
} from "./attempt-id.ts";

const TAITO_ATTEMPT = "d1e2452c-67f2-42ad-add7-bacaac535714";

test("attempt ids must be uuids before they are queried", () => {
  assert.equal(isUuidAttemptId(TAITO_ATTEMPT), true);
  assert.equal(isUuidAttemptId("result"), false);
  assert.equal(isUuidAttemptId(""), false);
  assert.equal(isUuidAttemptId(undefined), false);
  assert.equal(isUuidAttemptId("undefined"), false);
});

test("a missing attempt id returns 400 instead of querying uuid columns", () => {
  let status = 0;
  let body: unknown;
  const rejected = rejectInvalidAttemptId(
    {
      status(code: number) {
        status = code;
        return {
          json(payload: unknown) {
            body = payload;
          },
        };
      },
    },
    "result",
  );
  assert.equal(rejected, true);
  assert.equal(status, 400);
  assert.deepEqual(body, { error: "Invalid attempt id" });

  let nextStatus = 0;
  const allowed = rejectInvalidAttemptId(
    {
      status(code: number) {
        nextStatus = code;
        return { json() {} };
      },
    },
    TAITO_ATTEMPT,
  );
  assert.equal(allowed, false);
  assert.equal(nextStatus, 0);
});

test("the attempt route gate stops /attempts/result before the handler", () => {
  const gate = invalidAttemptIdGate();
  let status = 0;
  let nextCalled = false;
  gate(
    { params: { attemptId: "result" } } as never,
    {
      status(code: number) {
        status = code;
        return { json() {} };
      },
    } as never,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(status, 400);
  assert.equal(nextCalled, false);

  let allowedStatus = 0;
  let allowedNext = false;
  gate(
    { params: { attemptId: TAITO_ATTEMPT } } as never,
    {
      status(code: number) {
        allowedStatus = code;
        return { json() {} };
      },
    } as never,
    () => {
      allowedNext = true;
    },
  );
  assert.equal(allowedStatus, 0);
  assert.equal(allowedNext, true);
});

test("nested attempt routes reject a non-uuid before the handler", async () => {
  const app = express();
  app.use("/api/attempts/:attemptId", invalidAttemptIdGate());
  app.get("/api/attempts/:attemptId", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/attempts/:attemptId/result", (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/api/attempts/result`);
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: "Invalid attempt id" });
    const nested = await fetch(`http://127.0.0.1:${port}/api/attempts/result/result`);
    assert.equal(nested.status, 400);
    const ok = await fetch(`http://127.0.0.1:${port}/api/attempts/${TAITO_ATTEMPT}/result`);
    assert.equal(ok.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
