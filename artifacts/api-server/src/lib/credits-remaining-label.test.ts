import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  michelleCreditsRemainingLabel,
  neelCreditsRemainingLabel,
  singlePoolCreditsLabel,
  sophiaCreditsRemainingLabel,
} from "./credits-remaining-label.ts";

test("collapsed credit headers name separate pools", () => {
  assert.equal(singlePoolCreditsLabel(0), "0 credits remaining");
  assert.equal(singlePoolCreditsLabel(1), "1 hour credits remaining");
  assert.equal(
    neelCreditsRemainingLabel([
      { tutorKey: "xavier", name: "Xavier", hours: 2 },
      { tutorKey: "victoria", name: "Victoria", hours: 1 },
      { tutorKey: "nika", name: "Nika", hours: 0 },
    ]),
    "1 Victoria hour and 2 Xavier hours credits remaining",
  );
  assert.equal(
    sophiaCreditsRemainingLabel({ legacyHours: 10, xavierHours: 0, euniceHours: 0 }),
    "10 package hours and 0 Xavier hours credits remaining",
  );
  assert.equal(
    michelleCreditsRemainingLabel({
      legacyHours: 4,
      tagged: [
        { name: "Eunice", hours: 0 },
        { name: "Xavier", hours: 1 },
      ],
    }),
    "4 shared hours and 1 Xavier hour credits remaining",
  );
  assert.equal(
    michelleCreditsRemainingLabel({ legacyHours: 1, tagged: [{ name: "Xavier", hours: 0 }] }),
    "1 hour credits remaining",
  );
});
