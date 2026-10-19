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
    shouldRepairMichelleQuizMath({
      assignmentTitle: "SAT pre-work (30–50 questions) — SAT capability test",
    }),
    true,
  );
  const perimeter = ["x", "4", "6", "18", "+ + =", "or", "x", "10", "18", "+ ="].join("\n");
  const repaired = repairStackedMathNotation(perimeter);
  assert.match(repaired, /x \+ 4 \+ 6 = 18/);
  assert.match(repaired, /x \+ 10 = 18/);
  assert.doesNotMatch(repaired, /\(6\/4\)x/);
  assert.equal(
    repairStackedMathNotation("x 45 48 + = or x 45 48 + = - yields x 3 ="),
    "x + 45 = 48 or x + 45 = -48 yields x = 3",
  );
  const fields = repairMichelleQuizQuestionFields(
    { prompt: "x 45 48 + =", explanation: "yields x 3 =" },
    true,
  );
  assert.equal(fields.prompt, "x + 45 = 48");
  assert.equal(fields.explanation, "yields x = 3");
});
