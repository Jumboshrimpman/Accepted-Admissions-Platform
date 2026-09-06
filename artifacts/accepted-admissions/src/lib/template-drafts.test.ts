import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPLATE_DRAFTS_BANK_HINT,
  TEMPLATE_DRAFTS_BUTTON_LABEL,
  TEMPLATE_DRAFTS_DESCRIPTION,
  TEMPLATE_DRAFTS_EXPERIMENTAL_LABEL,
  TEMPLATE_DRAFTS_HEADING,
} from "./template-drafts.ts";

test("template draft labels do not claim AI or College Board quality", () => {
  assert.equal(TEMPLATE_DRAFTS_BUTTON_LABEL, "Create template drafts");
  assert.equal(TEMPLATE_DRAFTS_HEADING, "Create template drafts");
  assert.equal(TEMPLATE_DRAFTS_EXPERIMENTAL_LABEL, "Experimental");
  assert.match(TEMPLATE_DRAFTS_DESCRIPTION, /generic starting points/i);
  assert.match(TEMPLATE_DRAFTS_DESCRIPTION, /hard-coded templates/i);
  assert.match(TEMPLATE_DRAFTS_DESCRIPTION, /ready/i);
  assert.match(TEMPLATE_DRAFTS_BANK_HINT, /one quiz/i);

  const copy = [
    TEMPLATE_DRAFTS_BUTTON_LABEL,
    TEMPLATE_DRAFTS_HEADING,
    TEMPLATE_DRAFTS_DESCRIPTION,
    TEMPLATE_DRAFTS_BANK_HINT,
  ].join(" ");
  assert.doesNotMatch(copy, /\bAI\b/i);
  assert.doesNotMatch(copy, /College Board/i);
  assert.doesNotMatch(copy, /official SAT/i);
});
