import assert from "node:assert/strict";
import test from "node:test";
import {
  repairMichelleQuizQuestionFields,
  repairStackedMathNotation,
  shouldRepairMichelleQuizMath,
} from "./stacked-math-notation.ts";

test("repairs Michelle flattened tutor-UI smash and ignores Taito titles", () => {
  assert.equal(
    shouldRepairMichelleQuizMath({ sessionTitle: "Michelle’s SAT Session with Xavier" }),
    true,
  );
  assert.equal(
    shouldRepairMichelleQuizMath({ sessionTitle: "Taito’s SAT Session with Eunice" }),
    false,
  );
  assert.equal(
    repairStackedMathNotation("x 45 48 + = or x 45 48 + = - yields x 3 ="),
    "x + 45 = 48 or x + 45 = -48 yields x = 3",
  );
  const repaired = repairMichelleQuizQuestionFields(
    { prompt: "x 45 48 + =", explanation: "yields x 3 =" },
    true,
  );
  assert.equal(repaired.prompt, "x + 45 = 48");
  assert.equal(repaired.explanation, "yields x = 3");
});
