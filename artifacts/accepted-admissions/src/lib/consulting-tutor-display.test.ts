import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSULTING_TUTOR_PHOTO_CLASS,
  consultingCreditsTutorLabel,
} from "./consulting-tutor-display.ts";

test("college consulting labels use Nika and Victoria's first names only", () => {
  assert.equal(consultingCreditsTutorLabel("Nika Raiffe"), "Nika");
  assert.equal(consultingCreditsTutorLabel("Victoria Wijerathnayapa"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Victoria"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Xavier Morales"), "Xavier Morales");
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-cover/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-center/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /max-w-28/);
});
