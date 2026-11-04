import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { adminSessionQuizLinks } from "./admin-session-quiz-links.ts";

test("admin session quiz links: pre-work, in-session, reserve rows with open links", () => {
  const links = adminSessionQuizLinks([
    { id: "r", title: "Hard challenge set (5) — SAT", deliveryPhase: "during_session", status: "published", questionCount: 5 },
    { id: "d", title: "Hard SAT in-session (15) — SAT", deliveryPhase: "during_session", status: "published", questionCount: 15 },
    { id: "x", title: "Old", deliveryPhase: "before_session", status: "archived", questionCount: 40 },
    { id: "p", title: "Hard SAT pre-work", deliveryPhase: "before_session", status: "published", questionCount: 40 },
  ]);
  assert.deepEqual(links.map((link: { id: string }) => link.id), ["p", "d", "r"]);
  assert.equal(links[0].openLabel, "Open pre-work");
  assert.equal(links[0].openHref, "/portal/assignments/p");
  assert.equal(links[0].questionCount, 40);
  assert.equal(links[1].openLabel, "Open in-session practice");
  assert.equal(links[2].kind, "reserve");
  assert.equal(links[2].openLabel, "Open reserve set");
  assert.match(links[0].adminHref, /^\/admin\/curriculum\?/);
  assert.match(links[0].adminHref, /quiz=p/);
});

test("admin session quiz links: empty and missing fields", () => {
  assert.deepEqual(adminSessionQuizLinks(undefined), []);
  const [only] = adminSessionQuizLinks([{ id: "a", title: null, status: null, questionCount: null }]);
  assert.equal(only.title, "Untitled quiz");
  assert.equal(only.status, "draft");
  assert.equal(only.questionCount, 0);
  assert.equal(only.openLabel, "Open quiz");
});
