import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  HealthCheckResponse,
  ListAdminQuestionReportsResponse,
} from "../../../../lib/api-zod/src/generated/api.ts";

const generatedApiPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/api-zod/src/generated/api.ts",
);

test("generated OpenAPI Zod client stays on Zod 3 helpers", () => {
  const source = readFileSync(generatedApiPath, "utf8");
  assert.doesNotMatch(
    source,
    /\blooseObject\b/,
    "Orval Zod 4 looseObject crashes API startup on catalog zod@3",
  );
});

test("importing generated api-zod schemas does not throw on module load", () => {
  assert.deepEqual(HealthCheckResponse.parse({ status: "ok" }), { status: "ok" });
  assert.deepEqual(
    ListAdminQuestionReportsResponse.parse({
      reports: [{ id: "report-1", assignmentTitle: "SAT diagnostic" }],
    }),
    { reports: [{ id: "report-1", assignmentTitle: "SAT diagnostic" }] },
  );
});
