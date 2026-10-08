import assert from "node:assert/strict";
import test from "node:test";
import {
  formSubmissionSourceLabel,
  isFormSubmissionResolved,
  unresolvedFormSubmissionHref,
  unresolvedFormSubmissionLabel,
  unresolvedFormSubmissions,
} from "./form-submissions.ts";

test("form submissions without a resolver stay unresolved", () => {
  const requests = [
    { id: "sleiman", resolvedAt: null, sourcePage: "/client-request" },
    { id: "closed-before", resolvedAt: "2026-09-01T00:00:00.000Z" },
    { id: "blank", resolvedAt: "" },
  ];
  assert.equal(isFormSubmissionResolved(requests[0]!), false);
  assert.equal(isFormSubmissionResolved(requests[1]!), true);
  assert.equal(isFormSubmissionResolved(requests[2]!), false);
  assert.deepEqual(
    unresolvedFormSubmissions(requests).map((request) => request.id),
    ["sleiman", "blank"],
  );
});

test("nav indicator links to the only open submission, or the list when there are several", () => {
  assert.equal(unresolvedFormSubmissionHref([]), null);
  assert.equal(unresolvedFormSubmissionHref(undefined), null);
  assert.equal(
    unresolvedFormSubmissionHref([{ id: "sleiman", resolvedAt: null }]),
    "/admin#guidance-request-sleiman",
  );
  assert.equal(
    unresolvedFormSubmissionHref([
      { id: "newer", resolvedAt: null },
      { id: "older", resolvedAt: null },
    ]),
    "/admin#guidance-requests",
  );
  assert.equal(
    unresolvedFormSubmissionHref([{ id: "done", resolvedAt: "2026-10-08T00:00:00.000Z" }]),
    null,
  );
  assert.equal(unresolvedFormSubmissionLabel(1), "1 unresolved form submission");
  assert.equal(unresolvedFormSubmissionLabel(2), "2 unresolved form submissions");
  assert.equal(formSubmissionSourceLabel("/client-request"), "Client request");
  assert.equal(formSubmissionSourceLabel("/other-form"), "/other-form");
});
