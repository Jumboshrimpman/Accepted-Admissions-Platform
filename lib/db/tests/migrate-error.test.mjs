import assert from "node:assert/strict";
import test from "node:test";
import { formatDatabaseError } from "../migrate.mjs";

test("migration failure prints the database cause without query parameters", () => {
  const error = new Error("Failed query: -- Spread Nov 13 (module 2) and Dec 4\nparams: secret-token, student@example.com");
  error.cause = Object.assign(new Error('time zone "ET" not recognized'), {
    code: "22023",
    detail: "Failing row contains (hidden)",
    hint: "Use a name from pg_timezone_names.",
  });

  const printed = formatDatabaseError(error);
  const details = JSON.parse(printed);

  assert.equal(details.message, "Failed query: -- Spread Nov 13 (module 2) and Dec 4");
  assert.equal(details.cause.message, 'time zone "ET" not recognized');
  assert.equal(details.cause.code, "22023");
  assert.equal(details.cause.detail, "Failing row contains (hidden)");
  assert.equal(details.cause.hint, "Use a name from pg_timezone_names.");
  assert.equal(printed.includes("secret-token"), false);
  assert.equal(printed.includes("student@example.com"), false);
  assert.equal(printed.includes("params:"), false);
});

test("migration failure follows a nested cause and keeps a direct database error", () => {
  const databaseError = Object.assign(new Error("cannot extract elements from a scalar"), {
    code: "22023",
    hint: "jsonb_array_elements requires an array",
  });
  const wrapped = new Error("Failed query: select 1");
  wrapped.cause = databaseError;

  const direct = formatDatabaseError(databaseError);
  const nested = JSON.parse(formatDatabaseError(wrapped));

  assert.match(direct, /cannot extract elements from a scalar/);
  assert.match(direct, /22023/);
  assert.equal(nested.cause.code, "22023");
  assert.equal(nested.cause.hint, "jsonb_array_elements requires an array");
});
