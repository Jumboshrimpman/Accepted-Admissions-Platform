import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONTACT_EMAIL,
  contactEmailFromBody,
  normalizeHomeContent,
  normalizeSatContent,
} from "./public-site-content.ts";

test("falls back to the admin contact email", () => {
  assert.equal(DEFAULT_CONTACT_EMAIL, "admin@acceptedadmissions.org");
  assert.equal(contactEmailFromBody(null), DEFAULT_CONTACT_EMAIL);
  assert.equal(contactEmailFromBody({ contactEmail: "not-an-email" }), DEFAULT_CONTACT_EMAIL);
  assert.equal(contactEmailFromBody({ contactEmail: "hello@acceptedadmissions.org" }), "hello@acceptedadmissions.org");
});

test("home and SAT fallbacks do not name Xavier or Eunice", () => {
  const home = normalizeHomeContent({});
  const sat = normalizeSatContent({});
  assert.match(home.body.satPathBlurb ?? "", /our SAT tutors/);
  assert.doesNotMatch(`${home.body.satPathBlurb} ${sat.body.heroLead} ${sat.body.offersIntro}`, /Xavier or Eunice/i);
});
