import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const drizzleDir = fileURLToPath(new URL("../drizzle", import.meta.url));

test("journal tags match unique SQL files one-to-one", async () => {
  const journal = JSON.parse(
    await readFile(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  );
  const sqlFiles = (await readdir(drizzleDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const tags = journal.entries.map((entry) => entry.tag).sort();
  const prefixes = sqlFiles.map((name) => name.split("_")[0]);

  assert.equal(
    new Set(prefixes).size,
    prefixes.length,
    `duplicate migration numbers: ${prefixes.join(", ")}`,
  );
  assert.deepEqual(
    sqlFiles.map((name) => name.replace(/\.sql$/, "")),
    tags,
    "every SQL file must be journaled and every journal tag must have a SQL file",
  );

  const indexes = journal.entries.map((entry) => entry.idx);
  assert.equal(new Set(indexes).size, indexes.length, "journal idx values must be unique");
});
