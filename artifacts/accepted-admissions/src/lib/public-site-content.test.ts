import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_HOME_HERO_LEAD,
  DEFAULT_CONTACT_EMAIL,
  RETIRED_HOME_HERO_LEAD,
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
  assert.doesNotMatch(`${home.body.satPathBlurb} ${sat.body.heroLead} ${sat.body.offersIntro ?? ""}`, /Xavier or Eunice/i);
  assert.doesNotMatch(sat.body.offersIntro ?? "", /SAT booking and payment stay inside the signed-in client portal/i);
});

test("the home tagline drops SAT from one-on-one tutoring, including the stored sentence", () => {
  const fallback = normalizeHomeContent({});
  assert.equal(fallback.body.heroLead, CURRENT_HOME_HERO_LEAD);
  assert.doesNotMatch(fallback.body.heroLead ?? "", /one-on-one SAT tutoring/);
  const published = normalizeHomeContent({
    title: "A clear next step for your college goals.",
    body: { heroLead: RETIRED_HOME_HERO_LEAD },
  });
  assert.equal(published.body.heroLead, CURRENT_HOME_HERO_LEAD);
  const edited = normalizeHomeContent({
    body: { heroLead: "A custom introduction written in the admin editor." },
  });
  assert.equal(edited.body.heroLead, "A custom introduction written in the admin editor.");
});

test("public home and SAT fallbacks do not publish SAT prices", () => {
  const home = normalizeHomeContent({});
  const sat = normalizeSatContent({});
  const copy = [
    home.body.satPathBlurb,
    home.body.satServiceBlurb,
    sat.body.heroLead,
    sat.body.offersIntro,
    sat.seoDescription,
    ...(sat.body.sections ?? []),
  ].join(" ");
  assert.doesNotMatch(copy, /\$130|\$1,300|\$1\b/);
  assert.match(home.body.satPathBlurb ?? "", /sign in/i);
  assert.match(sat.body.heroLead ?? "", /sign in/i);
});
