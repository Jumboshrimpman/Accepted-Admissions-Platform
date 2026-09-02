import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { APPROVED_PUBLIC_TEAM_PORTRAITS, MIRRORED_PORTRAIT_RECONCILIATIONS, PUBLIC_TUTOR_ORDER } from "./public-team-roster.ts";

test("defines the complete approved public roster in display order", () => {
  assert.deepEqual(PUBLIC_TUTOR_ORDER, [
    "Rosanna Kataja",
    "Xavier Morales",
    "Eunice Chon",
    "Sophia Lamas",
    "Aurelia Finch",
    "Nika Raiffe",
    "Kya Brooks",
    "Michael Pecorara",
    "Kyle Englander",
    "Daniel Salgado-Alvarez",
    "Sama Noori",
  ]);
  assert.deepEqual(Object.keys(APPROVED_PUBLIC_TEAM_PORTRAITS), PUBLIC_TUTOR_ORDER);
});

test("keeps Kya and every following portrait attached to the correct profile", () => {
  assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"], /99fefc7159a4424fa7e6fb36ed6cbb86/);
  assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"], /ab3655c726c846819c5eec1195af49bd/);
  assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"], /1ab78bc7f16a48559bc3b46364c94bcc/);
  assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"], /72de1811814144689846123daff8471f/);
  assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"], /fb647c84910a4d97bd9a13d22f9dc124/);
});

test("reconciles only the known mirrored offset without positional image lookup", () => {
  const corrections = new Map(
    MIRRORED_PORTRAIT_RECONCILIATIONS.map((profile) => [
      profile.name,
      {
        previous: profile.previousPhotoUrl,
        approved: APPROVED_PUBLIC_TEAM_PORTRAITS[profile.name],
      },
    ]),
  );

  assert.equal(
    corrections.get("Kya Brooks")?.previous,
    APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
  );
  assert.equal(
    corrections.get("Michael Pecorara")?.previous,
    APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"],
  );
  assert.equal(
    corrections.get("Kyle Englander")?.previous,
    APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"],
  );
  assert.equal(
    corrections.get("Daniel Salgado-Alvarez")?.previous,
    APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"],
  );
  assert.equal(corrections.get("Sama Noori")?.previous, null);
  assert.notEqual(
    corrections.get("Kya Brooks")?.approved,
    corrections.get("Michael Pecorara")?.approved,
  );
});