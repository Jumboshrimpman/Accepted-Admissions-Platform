import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import * as roster from "./public-team-roster.ts";

const {
  APPROVED_PUBLIC_TEAM_PORTRAITS,
  APPROVED_SCHOOL_LOGOS,
  LEGACY_WIX_PUBLIC_TEAM_PORTRAITS,
  LEGACY_WIX_SCHOOL_LOGO_URLS,
  MIRRORED_PORTRAIT_RECONCILIATIONS,
  PUBLIC_TUTOR_ORDER,
  publicTeamPortrait,
  rewriteLegacyWixMediaUrl,
  rewriteLegacyWixSchoolLogos,
} = roster;

const publicDir = fileURLToPath(
  new URL("../../../accepted-admissions/public", import.meta.url),
);

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
  assert.deepEqual(Object.keys(LEGACY_WIX_PUBLIC_TEAM_PORTRAITS), PUBLIC_TUTOR_ORDER);
});

test("serves first-party portraits instead of Wix CDN URLs", () => {
  for (const name of PUBLIC_TUTOR_ORDER) {
    assert.match(APPROVED_PUBLIC_TEAM_PORTRAITS[name], /^\/media\/team\//);
    assert.match(LEGACY_WIX_PUBLIC_TEAM_PORTRAITS[name], /^https:\/\/static\.wixstatic\.com\//);
    assert.equal(
      existsSync(path.join(publicDir, APPROVED_PUBLIC_TEAM_PORTRAITS[name])),
      true,
      `missing portrait file for ${name}`,
    );
  }
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"], "/media/team/kya-brooks.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"], "/media/team/michael-pecorara.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"], "/media/team/kyle-englander.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"], "/media/team/daniel-salgado-alvarez.png");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"], "/media/team/sama-noori.jpg");
});

test("locks Kya's public portrait even when the stored value is blank or drifted", () => {
  const approved = APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"];
  assert.equal(publicTeamPortrait("Kya Brooks", null), approved);
  assert.equal(publicTeamPortrait("Kya Brooks", "https://example.com/wrong.jpg"), approved);
  assert.equal(
    publicTeamPortrait("Michael Pecorara", "https://example.com/michael.jpg"),
    "https://example.com/michael.jpg",
  );
  assert.equal(
    publicTeamPortrait("Michael Pecorara", LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"]),
    APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
  );
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
    LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
  );
  assert.equal(
    corrections.get("Michael Pecorara")?.previous,
    LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Kyle Englander"],
  );
  assert.equal(
    corrections.get("Kyle Englander")?.previous,
    LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"],
  );
  assert.equal(
    corrections.get("Daniel Salgado-Alvarez")?.previous,
    LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Sama Noori"],
  );
  assert.equal(corrections.get("Sama Noori")?.previous, null);
  assert.notEqual(
    corrections.get("Kya Brooks")?.approved,
    corrections.get("Michael Pecorara")?.approved,
  );
});

test("rewrites known Wix school logos to local assets", () => {
  assert.equal(APPROVED_SCHOOL_LOGOS.length, 7);
  for (const logo of APPROVED_SCHOOL_LOGOS) {
    assert.match(logo.src, /^\/media\/schools\//);
    assert.equal(
      existsSync(path.join(publicDir, logo.src)),
      true,
      `missing school logo file for ${logo.name}`,
    );
  }
  const rewritten = rewriteLegacyWixSchoolLogos(
    Object.entries(LEGACY_WIX_SCHOOL_LOGO_URLS).map(([src], index) => ({
      name: `School ${index}`,
      src,
      alt: `Alt ${index}`,
    })),
  );
  assert.ok(rewritten);
  assert.deepEqual(
    rewritten?.map((logo) => logo.src),
    Object.values(LEGACY_WIX_SCHOOL_LOGO_URLS),
  );
  assert.equal(
    rewriteLegacyWixMediaUrl(LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Rosanna Kataja"]),
    APPROVED_PUBLIC_TEAM_PORTRAITS["Rosanna Kataja"],
  );
  assert.equal(rewriteLegacyWixSchoolLogos([{ name: "Custom", src: "/media/schools/custom.png", alt: "Custom" }]), null);
});
