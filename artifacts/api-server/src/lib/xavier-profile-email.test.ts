import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationSql = await readFile(
  fileURLToPath(new URL("../../../../lib/db/drizzle/0071_xavier_profile_email.sql", import.meta.url)),
  "utf8",
);
const journal = await readFile(
  fileURLToPath(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url)),
  "utf8",
);
const alignmentSource = await readFile(
  fileURLToPath(new URL("./calendar-profile.ts", import.meta.url)),
  "utf8",
);
const executable = migrationSql.replace(/^--.*$/gm, "");

test("Xavier profile email migration updates only tutor_profiles", () => {
  assert.match(executable, /UPDATE "tutor_profiles"/);
  assert.match(executable, /xavier\.rmz6@gmail\.com/);
  assert.match(executable, /xaver\.rmz6@gmail\.com/);
  assert.match(executable, /Xavier Morales/);
  assert.equal(/update\s+"users"/i.test(executable), false);
  assert.equal(/portal_access_grants/i.test(executable), false);
  assert.equal(/calendar_connections/i.test(executable), false);
  assert.equal(/portal_login_aliases/i.test(executable), false);
  assert.equal(/sessions/i.test(executable), false);
  assert.equal(/insert into/i.test(executable), false);
  assert.equal(/notify|resend|sendmail/i.test(executable), false);
  const entry = JSON.parse(journal).entries.find(
    (item: { tag: string }) => item.tag === "0071_xavier_profile_email",
  );
  assert.equal(entry.idx, 71);
  assert.ok(entry.when > 1792740000000);
});

test("Xavier calendar alignment accepts the spelled profile email", () => {
  const start = alignmentSource.indexOf("export async function xavierCalendarIdentityAlignment");
  const slice = alignmentSource.slice(start);
  assert.match(slice, /isXavierProfileEmail\(profile\.email\)/);
  assert.match(
    slice,
    /isCanonicalXavierEmail\(profile\.email\) \|\| isXavierProfileEmail\(profile\.email\)/,
  );
});
