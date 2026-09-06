import assert from "node:assert/strict";
import test from "node:test";
import {
  adminCurriculumHref,
  parseAdminCurriculumSearch,
  searchStringFromLocation,
} from "./admin-curriculum-location.ts";

test("prefers wouter useSearch over a pathname-only useLocation", () => {
  assert.equal(
    searchStringFromLocation("/admin/curriculum", "section=sessions&tab=questions"),
    "section=sessions&tab=questions",
  );
});

test("still reads query stuffed into the location string (legacy mocks)", () => {
  assert.equal(
    searchStringFromLocation("/admin/curriculum?section=people", ""),
    "section=people",
  );
});

test("falls back to the browser search string when hooks are empty", () => {
  assert.equal(
    searchStringFromLocation("/admin/curriculum", "", "?section=curriculum&tab=library"),
    "section=curriculum&tab=library",
  );
});

test("parses section, tab, and quiz from the search string", () => {
  assert.deepEqual(
    parseAdminCurriculumSearch("section=curriculum&tab=quizzes&quiz=09c1bf31-309c-4835-86c4-b86881ec8ec2"),
    {
      section: "curriculum",
      tab: "quizzes",
      quizId: "09c1bf31-309c-4835-86c4-b86881ec8ec2",
    },
  );
  assert.equal(parseAdminCurriculumSearch("section=people").section, "people");
  assert.equal(parseAdminCurriculumSearch("section=sessions").section, "sessions");
  assert.equal(parseAdminCurriculumSearch("section=programs").section, "sessions");
  assert.equal(parseAdminCurriculumSearch("section=roadmap").section, "sessions");
  assert.equal(parseAdminCurriculumSearch("section=curriculum&tab=questions").tab, "questions");
  assert.equal(parseAdminCurriculumSearch("section=curriculum&tab=library").tab, "library");
  assert.equal(parseAdminCurriculumSearch("section=curriculum&tab=submissions").tab, "submissions");
});

test("defaults unknown or missing params instead of inventing a view", () => {
  assert.deepEqual(parseAdminCurriculumSearch(""), {
    section: "curriculum",
    tab: "quizzes",
    quizId: null,
  });
  assert.equal(parseAdminCurriculumSearch("section=finance").section, "curriculum");
  assert.equal(parseAdminCurriculumSearch("tab=blocks").tab, "quizzes");
  assert.equal(parseAdminCurriculumSearch("quiz=").quizId, null);
});

test("builds deep-link hrefs that keep section, tab, and quiz in sync", () => {
  assert.equal(adminCurriculumHref({ section: "people" }), "/admin/curriculum?section=people");
  assert.equal(adminCurriculumHref({ section: "sessions" }), "/admin/curriculum?section=sessions");
  assert.equal(adminCurriculumHref({ section: "programs" }), "/admin/curriculum?section=sessions");
  assert.equal(
    adminCurriculumHref({ section: "curriculum", tab: "questions" }),
    "/admin/curriculum?section=curriculum&tab=questions",
  );
  assert.equal(
    adminCurriculumHref({ section: "curriculum", tab: "library" }),
    "/admin/curriculum?section=curriculum&tab=library",
  );
  assert.equal(
    adminCurriculumHref({ section: "curriculum", tab: "submissions" }),
    "/admin/curriculum?section=curriculum&tab=submissions",
  );
  assert.equal(
    adminCurriculumHref({
      section: "curriculum",
      tab: "quizzes",
      quiz: "09c1bf31-309c-4835-86c4-b86881ec8ec2",
    }),
    "/admin/curriculum?section=curriculum&tab=quizzes&quiz=09c1bf31-309c-4835-86c4-b86881ec8ec2",
  );
  assert.equal(
    adminCurriculumHref({ section: "people", tab: "questions", quiz: "quiz-1" }),
    "/admin/curriculum?section=people",
  );
  assert.equal(
    adminCurriculumHref({ section: "curriculum", tab: "questions", quiz: "quiz-1" }),
    "/admin/curriculum?section=curriculum&tab=questions",
  );
});
