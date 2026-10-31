import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationSql = await readFile(
  fileURLToPath(
    new URL("../../../../lib/db/drizzle/0084_college_consulting_subject_tags.sql", import.meta.url),
  ),
  "utf8",
);
const journal = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url)),
    "utf8",
  ),
) as {
  entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }>;
};

test("0084 appends College Consulting only when the tag is absent", () => {
  const executable = migrationSql.replace(/^--.*$/gm, "");
  assert.match(executable, /NOT EXISTS/);
  assert.match(executable, /lower\(trim\(subject\)\) = 'college consulting'/);
  assert.match(executable, /UPDATE "tutor_profiles"/);
  assert.match(executable, /\|\| '\["College Consulting"\]'::jsonb/);
  assert.equal(/update\s+"users"/i.test(executable), false);
  assert.equal(/portal_access_grants/i.test(executable), false);
  assert.equal(/sessions/i.test(executable), false);
  assert.equal(/"title"/i.test(executable), false);
  assert.equal(/booking_eligible/i.test(executable), false);
  assert.equal(/public_approved/i.test(executable), false);
  assert.equal(/"active"\s*=/i.test(executable), true);
});

test("0084 is the journal entry after the Meet URL migration", () => {
  const entry = journal.entries.find((item) => item.tag === "0084_college_consulting_subject_tags");
  const previous = journal.entries.find((item) => item.tag === "0083_session_meet_url");
  assert.ok(previous);
  assert.deepEqual(entry, {
    idx: 84,
    version: "7",
    when: 1792880000000,
    tag: "0084_college_consulting_subject_tags",
    breakpoints: true,
  });
  assert.equal(journal.entries.at(-1)?.tag, "0084_college_consulting_subject_tags");
  assert.ok((entry?.when ?? 0) > (previous?.when ?? 0));
});
