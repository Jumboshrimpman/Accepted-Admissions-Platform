import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnPath } from "./safe-return-path.ts";

const origin = "https://accepted-admissions-platform.replit.app";

test("accepts a same-origin public route at the root base path", () => {
  assert.equal(
    safeReturnPath({ requested: "/sat", basePath: "", origin, fallback: "/portal" }),
    "/sat",
  );
});

test("accepts routes inside a non-root base path", () => {
  assert.equal(
    safeReturnPath({
      requested: "/accepted-admissions/sat?offering=five-hour",
      basePath: "/accepted-admissions",
      origin,
      fallback: "/accepted-admissions/portal",
    }),
    "/accepted-admissions/sat?offering=five-hour",
  );
});

test("rejects scheme-relative and absolute external redirects", () => {
  for (const requested of ["//attacker.example", "https://attacker.example/sat"]) {
    assert.equal(
      safeReturnPath({ requested, basePath: "", origin, fallback: "/portal" }),
      "/portal",
    );
  }
});

test("rejects paths outside a configured base path boundary", () => {
  assert.equal(
    safeReturnPath({
      requested: "/accepted-admissions-evil/sat",
      basePath: "/accepted-admissions",
      origin,
      fallback: "/accepted-admissions/portal",
    }),
    "/accepted-admissions/portal",
  );
});