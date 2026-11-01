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
  const meetIndex = journal.entries.findIndex((item) => item.tag === "0083_session_meet_url");
  const consultingIndex = journal.entries.findIndex(
    (item) => item.tag === "0084_college_consulting_subject_tags",
  );
  const linkedinIndex = journal.entries.findIndex(
    (item) => item.tag === "0085_clear_eunice_linkedin_url",
  );
  assert.equal(consultingIndex, meetIndex + 1);
  assert.equal(linkedinIndex, consultingIndex + 1);
  assert.ok((entry?.when ?? 0) > (previous?.when ?? 0));
});

test("0087 adds the hard challenge reserve column after the prework reminder migration", async () => {
  const reserveSql = await readFile(
    fileURLToPath(
      new URL("../../../../lib/db/drizzle/0087_assignment_hard_challenge_reserve.sql", import.meta.url),
    ),
    "utf8",
  );
  const executable = reserveSql.replace(/^--.*$/gm, "");
  assert.match(executable, /ADD COLUMN IF NOT EXISTS "hard_challenge_reserve"/);
  assert.match(executable, /DEFAULT false NOT NULL/);
  assert.match(executable, /"delivery_phase" = 'during_session'/);
  assert.match(executable, /Hard challenge set \(/);
  const entry = journal.entries.find((item) => item.tag === "0087_assignment_hard_challenge_reserve");
  assert.deepEqual(entry, {
    idx: 87,
    version: "7",
    when: 1792883000000,
    tag: "0087_assignment_hard_challenge_reserve",
    breakpoints: true,
  });
  const reminder = journal.entries.find((item) => item.tag === "0086_prework_reminder_sends");
  assert.deepEqual(reminder, {
    idx: 86,
    version: "7",
    when: 1792882000000,
    tag: "0086_prework_reminder_sends",
    breakpoints: true,
  });
  const reserveIndex = journal.entries.findIndex(
    (item) => item.tag === "0087_assignment_hard_challenge_reserve",
  );
  const reminderIndex = journal.entries.findIndex(
    (item) => item.tag === "0086_prework_reminder_sends",
  );
  assert.equal(reserveIndex, reminderIndex + 1);
  assert.ok((entry?.when ?? 0) > (reminder?.when ?? 0));
});
