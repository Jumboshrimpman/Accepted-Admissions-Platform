import assert from "node:assert/strict";
import test from "node:test";
import { rewriteZod4Helpers } from "./patch-generated-zod3.mjs";

test("rewrites Orval Zod 4 looseObject to Zod 3 object().passthrough()", () => {
  const rewritten = rewriteZod4Helpers(`
export const ListAdminQuestionReportsResponse = zod.object({
  "reports": zod.array(zod.looseObject({

})).optional()
})
`);
  assert.match(rewritten, /zod\.array\(zod\.object\(\{[\s\S]*?\}\)\.passthrough\(\)\)\.optional\(\)/);
  assert.doesNotMatch(rewritten, /\blooseObject\b/);
});
