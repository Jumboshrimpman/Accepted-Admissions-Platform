import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("adaptiveCurriculumForSession resolves the practice row, not the older reserve", () => {
  const route = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const fn = route.slice(
    route.indexOf("export async function adaptiveCurriculumForSession"),
    route.indexOf('router.get(\n  "/sessions/:sessionId/adaptive-curriculum"'),
  );
  const branch = fn.slice(fn.indexOf("} else if (isStaff"), fn.indexOf("if (sessionPrep && sessionPrep.mode"));
  assert.ok(branch.includes("} else if (isStaff"), "staff branch missing");
  assert.match(branch, /resolveDuringSessionAssignment\(duringRows\)/);
  assert.doesNotMatch(branch, /\.limit\(1\)/);
});
