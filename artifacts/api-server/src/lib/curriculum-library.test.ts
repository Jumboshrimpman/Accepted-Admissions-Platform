import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { libraryAssetBlockKind, libraryAssetToBlockConfig } from "./curriculum-library.ts";

test("library assets become session blocks with a shared resource link", () => {
  const config = libraryAssetToBlockConfig({
    id: "asset-1",
    title: "October SAT practice test",
    kind: "practice_test",
    description: "Full timed SAT for the October 2 session.",
    resourceUrl: "https://example.invalid/october-sat-practice.pdf",
    body: "Complete all four modules.",
  });
  assert.equal(libraryAssetBlockKind({ resourceUrl: config.url }), "external_link");
  assert.equal(config.label, "October SAT practice test");
  assert.equal(config.url, "https://example.invalid/october-sat-practice.pdf");
  assert.equal(config.libraryKind, "practice_test");
  assert.equal(config.libraryAssetId, "asset-1");
});

test("mini-sections without a URL stay on-platform callouts", () => {
  assert.equal(libraryAssetBlockKind({ resourceUrl: null }), "callout");
  assert.equal(libraryAssetBlockKind({ resourceUrl: "  " }), "callout");
});
