import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import * as roster from "./public-team-roster.ts";

const {
  APPROVED_PUBLIC_TEAM_PORTRAITS,
  APPROVED_SCHOOL_LOGOS,
  EUNICE_LEGACY_PUBLIC_BIOGRAPHIES,
  EUNICE_PUBLIC_BIOGRAPHY,
  LEGACY_WIX_PUBLIC_TEAM_PORTRAITS,
  LEGACY_WIX_SCHOOL_LOGO_URLS,
  MIRRORED_PORTRAIT_RECONCILIATIONS,
  NIKA_LEGACY_PUBLIC_BIOGRAPHIES,
  NIKA_PUBLIC_BIOGRAPHY,
  PUBLIC_TUTOR_ORDER,
  publicTeamPortrait,
  rewriteLegacyWixMediaUrl,
  rewriteLegacyWixSchoolLogos,
  mergeApprovedSchoolLogos,
  XAVIER_LEGACY_PUBLIC_BIOGRAPHIES,
  XAVIER_PUBLIC_BIOGRAPHY,
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
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"], "/media/team/xavier-morales.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Eunice Chon"], "/media/team/eunice-chon.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"], "/media/team/nika-raiffe.png");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"], "/media/team/kya-brooks.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"], "/media/team/michael-pecorara.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"], "/media/team/kyle-englander.jpg");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"], "/media/team/daniel-salgado-alvarez.png");
  assert.equal(APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"], "/media/team/sama-noori.jpg");
});

test("publishes the current Xavier, Eunice, and Nika biographies and retires the stale seed copy", () => {
  assert.match(XAVIER_PUBLIC_BIOGRAPHY, /Jane Street Capital/);
  assert.match(XAVIER_PUBLIC_BIOGRAPHY, /2030 Harvard Law School/);
  assert.doesNotMatch(XAVIER_PUBLIC_BIOGRAPHY, /2029 Harvard Law School/);
  assert.doesNotMatch(XAVIER_PUBLIC_BIOGRAPHY, /Oxford until 2026/);
  assert.match(EUNICE_PUBLIC_BIOGRAPHY, /Harvard 2024 graduate/);
  assert.match(EUNICE_PUBLIC_BIOGRAPHY, /Harvard Medical School\/Massachusetts General Hospital/);
  assert.doesNotMatch(EUNICE_PUBLIC_BIOGRAPHY, /third-year at Harvard College/);
  assert.doesNotMatch(EUNICE_PUBLIC_BIOGRAPHY, /Coca-Cola Scholar/);
  assert.match(NIKA_PUBLIC_BIOGRAPHY, /Goldman Sachs Business Intelligence Group/);
  assert.match(NIKA_PUBLIC_BIOGRAPHY, /as a Research Intern on Relational Health/);
  assert.doesNotMatch(NIKA_PUBLIC_BIOGRAPHY, /sophomore studying/);
  assert.doesNotMatch(NIKA_PUBLIC_BIOGRAPHY, /Stuyvesant High School/);
  assert.doesNotMatch(NIKA_PUBLIC_BIOGRAPHY, /at a Research Intern/);
  assert.match(XAVIER_LEGACY_PUBLIC_BIOGRAPHIES[0], /2029 Harvard Law School/);
  assert.match(EUNICE_LEGACY_PUBLIC_BIOGRAPHIES[0], /third-year at Harvard College/);
  assert.match(NIKA_LEGACY_PUBLIC_BIOGRAPHIES[0], /sophomore studying/);
  assert.equal(
    MIRRORED_PORTRAIT_RECONCILIATIONS.find((profile) => profile.name === "Xavier Morales")?.biography,
    XAVIER_PUBLIC_BIOGRAPHY,
  );
  assert.equal(
    MIRRORED_PORTRAIT_RECONCILIATIONS.find((profile) => profile.name === "Eunice Chon")?.biography,
    EUNICE_PUBLIC_BIOGRAPHY,
  );
});

test("seed and migration replace only the stale Xavier, Eunice, and Nika bios", async () => {
  const platformSource = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const migrationSource = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0031_eunice_xavier_public_bios.sql", import.meta.url)),
    "utf8",
  );
  assert.match(platformSource, /biography: XAVIER_PUBLIC_BIOGRAPHY/);
  assert.match(platformSource, /biography: EUNICE_PUBLIC_BIOGRAPHY/);
  assert.match(platformSource, /biography: NIKA_PUBLIC_BIOGRAPHY/);
  assert.doesNotMatch(platformSource, /third-year at Harvard College/);
  assert.doesNotMatch(platformSource, /2029 Harvard Law School/);
  assert.doesNotMatch(platformSource, /sophomore studying/);
  assert.match(migrationSource, /Jane Street Capital/);
  assert.match(migrationSource, /2030 Harvard Law School/);
  assert.match(migrationSource, /Harvard Medical School\/Massachusetts General Hospital/);
  assert.match(migrationSource, /Goldman Sachs Business Intelligence Group/);
  assert.match(migrationSource, /as a Research Intern on Relational Health/);
  assert.doesNotMatch(migrationSource, /at a Research Intern/);
  assert.match(migrationSource, /third-year at Harvard College/);
  assert.match(migrationSource, /2029 Harvard Law School/);
  assert.match(migrationSource, /sophomore studying/);
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
  assert.equal(APPROVED_SCHOOL_LOGOS.length, 19);
  assert.deepEqual(
    APPROVED_SCHOOL_LOGOS.map((logo) => logo.name),
    [
      "Harvard University",
      "Princeton University",
      "MIT",
      "Northeastern University",
      "UC San Diego",
      "University of Maryland",
      "Harvard Law School",
      "Harvard GSAS",
      "University of Oxford",
      "Stanford University",
      "Cornell University",
      "University of Chicago",
      "Georgetown University",
      "Pomona College",
      "Boston University",
      "Washington University in St. Louis",
      "Claremont McKenna College",
      "University of Virginia",
      "Pepperdine University",
    ],
  );
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

test("merges missing approved school logos without dropping custom tiles", () => {
  const originalSeven = [
    { name: "Harvard University", src: "/media/schools/harvard.png", alt: "Harvard University logo" },
    { name: "Princeton University", src: "/media/schools/princeton.png", alt: "Princeton University logo" },
    { name: "MIT", src: "/media/schools/mit.jpg", alt: "MIT logo" },
    { name: "University of Chicago", src: "/media/schools/chicago.jpg", alt: "University of Chicago logo" },
    { name: "Georgetown University", src: "/media/schools/georgetown.png", alt: "Georgetown University logo" },
    { name: "Boston University", src: "/media/schools/boston-university.png", alt: "Boston University seal" },
    { name: "Claremont McKenna College", src: "/media/schools/claremont-mckenna.png", alt: "Claremont McKenna College seal" },
  ];
  const expanded = mergeApprovedSchoolLogos(originalSeven);
  assert.ok(expanded);
  assert.equal(expanded?.length, 19);
  assert.deepEqual(expanded, APPROVED_SCHOOL_LOGOS.map((logo) => ({ ...logo })));
  assert.equal(mergeApprovedSchoolLogos(expanded), null);

  const custom = [
    ...originalSeven,
    { name: "Custom College", src: "/media/schools/custom.png", alt: "Custom College logo" },
  ];
  const withCustom = mergeApprovedSchoolLogos(custom);
  assert.ok(withCustom);
  assert.equal(withCustom?.some((logo) => logo.name === "Custom College"), true);
  assert.equal(withCustom?.some((logo) => logo.name === "Harvard Law School"), true);
  assert.equal(withCustom?.some((logo) => logo.name === "Harvard GSAS"), true);
  assert.equal(withCustom?.[7]?.name, "Custom College");
});
