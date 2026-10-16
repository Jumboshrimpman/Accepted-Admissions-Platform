import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSULTING_TUTOR_PHOTO_CLASS,
  PORTAL_VICTORIA_PHOTO_URL,
  consultingCreditsTutorLabel,
  portalBookingTutorPhoto,
  portalCheckoutCopy,
  portalTutorFirstName,
} from "./consulting-tutor-display.ts";

test("college consulting labels use Nika and Victoria's first names only", () => {
  assert.equal(consultingCreditsTutorLabel("Nika Raiffe"), "Nika");
  assert.equal(consultingCreditsTutorLabel("Victoria Wijerathnayapa"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Victoria"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Xavier Morales"), "Xavier Morales");
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-cover/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-center/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /max-w-28/);
  assert.equal(portalTutorFirstName("Nika Raiffe"), "Nika");
  assert.equal(portalTutorFirstName("Victoria Wijerathnayapa"), "Victoria");
  assert.equal(portalTutorFirstName("Xavier Morales"), "Xavier");
  assert.equal(portalTutorFirstName("Eunice Chon"), "Eunice");
  assert.equal(
    portalBookingTutorPhoto("Victoria Wijerathnayapa", "/media/team/victoria.jpg"),
    PORTAL_VICTORIA_PHOTO_URL,
  );
  assert.equal(
    portalBookingTutorPhoto("Xavier Morales", "/media/team/xavier-morales.jpg"),
    "/media/team/xavier-morales.jpg",
  );
  assert.equal(
    portalCheckoutCopy("College Consulting hour with Xavier Morales"),
    "College Consulting hour with Xavier",
  );
  assert.equal(
    portalCheckoutCopy("College Consulting hour with Nika"),
    "College Consulting hour with Nika",
  );
});
