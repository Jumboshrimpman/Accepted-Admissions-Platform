import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  classifyLinkedRefresh,
  emptyLinkedRefreshCounts,
  enrichStimulusWithFigures,
  figureMarkdownLine,
  materializedQuestionContent,
  recordLinkedRefresh,
  resolveBankFigureUrl,
} from "./sat-bank-figures.ts";

const figureUrl =
  "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png";

test("resolves absolute https figure URLs and ignores path-only entries", () => {
  assert.equal(
    resolveBankFigureUrl({ url: figureUrl, path: "figures/sat-practice-test-4-digital/p10-draw1.png" }),
    figureUrl,
  );
  assert.equal(resolveBankFigureUrl({ path: "figures/local.png" }), null);
  assert.equal(resolveBankFigureUrl({ url: "/media/sat-bank/pack/a.png" }), "/media/sat-bank/pack/a.png");
  assert.equal(resolveBankFigureUrl({ url: "javascript:alert(1)" }), null);
});

test("enriches stimulus with markdown images above existing text", () => {
  const stimulus = enrichStimulusWithFigures("The graph shows enrollment.", [
    { url: figureUrl, alt: "Enrollment graph" },
  ]);
  assert.equal(
    stimulus,
    `![Enrollment graph](${figureUrl})\n\nThe graph shows enrollment.`,
  );
});

test("figure enrichment is deterministic and idempotent", () => {
  const figures = [
    { url: figureUrl, alt: "Enrollment graph" },
    { url: figureUrl, alt: "Duplicate same URL" },
  ];
  const once = enrichStimulusWithFigures("Passage text.", figures);
  const twice = enrichStimulusWithFigures(once, figures);
  assert.equal(once, twice);
  assert.equal(once?.split(figureUrl).length, 2);
});

test("skips figures that are already present in the stimulus", () => {
  const existing = `![Enrollment graph](${figureUrl})\n\nAlready attached.`;
  assert.equal(enrichStimulusWithFigures(existing, [{ url: figureUrl, alt: "Other alt" }]), existing);
});

test("linked-question rematerialize payload refreshes figures and official fields", () => {
  const stale = materializedQuestionContent({
    section: "math",
    domain: null,
    skill: null,
    questionType: "mcq",
    difficulty: null,
    stimulus: null,
    figures: [],
    prompt: "Old prompt",
    choices: [{ id: "a", label: "A", text: "1" }],
    correctAnswer: "a",
    officialExplanation: "Old explanation",
  });
  assert.equal(stale.stimulus, null);
  assert.equal(stale.reviewStatus, "approved");

  const refreshed = materializedQuestionContent({
    section: "math",
    domain: "SAT Math",
    skill: "Skill not in extract",
    questionType: "spr",
    difficulty: "hard",
    stimulus: null,
    figures: [{ url: figureUrl, alt: "Figure from page 10" }],
    prompt: "How many organic farms?",
    choices: [],
    correctAnswer: "12",
    officialExplanation: "Count the labeled bar.",
  });
  assert.equal(refreshed.prompt, "How many organic farms?");
  assert.equal(refreshed.stimulus, `![Figure from page 10](${figureUrl})`);
  assert.equal(refreshed.correctAnswer, "12");
  assert.equal(refreshed.explanation, "Count the labeled bar.");
  assert.equal(refreshed.domain, "SAT Math");
  assert.equal(refreshed.skill, "SAT Math");
  assert.equal(refreshed.difficulty, "hard");
  assert.equal(refreshed.questionType, "spr");
  assert.equal(refreshed.reviewStatus, "approved");
  assert.notEqual(refreshed.stimulus, stale.stimulus);
  assert.notEqual(refreshed.prompt, stale.prompt);
});

test("linked refresh classifies update vs insert vs skip and tallies counts", () => {
  assert.equal(classifyLinkedRefresh({ hasLinkedId: true, linkedExists: true }), "update");
  assert.equal(classifyLinkedRefresh({ hasLinkedId: true, linkedExists: false }), "insert");
  assert.equal(classifyLinkedRefresh({ hasLinkedId: false, linkedExists: false }), "skip");
  let counts = emptyLinkedRefreshCounts();
  counts = recordLinkedRefresh(counts, "update");
  counts = recordLinkedRefresh(counts, "update");
  counts = recordLinkedRefresh(counts, "skip");
  counts = recordLinkedRefresh(counts, "insert");
  counts = recordLinkedRefresh(counts, "error");
  assert.deepEqual(counts, { updated: 2, skipped: 2, errors: 1 });
});

test("figure-primary materialize uses the composite crop and letter choices", () => {
  const content = materializedQuestionContent({
    section: "math",
    questionType: "spr",
    stimulus: "<!-- sat-bank-figures -->",
    figures: [
      { url: "https://app.acceptedadmissions.org/media/sat-bank/pack/p01-draw1.png", alt: "Sphere" },
      { url: figureUrl, alt: "Question region including A–D", role: "question_region" },
    ],
    prompt: "V = i,.r3 V =3£wh V=½nr2h",
    choices: [],
    correctAnswer: "B",
    officialExplanation: "Choice B is correct because the cone volume formula applies.",
    extractGaps: { figurePrimary: true },
  });
  assert.equal(content.questionType, "mcq");
  assert.equal(content.prompt, "");
  assert.equal(content.stimulus, `![Question region including A–D](${figureUrl})`);
  assert.deepEqual(content.choices.map((choice) => choice.label), ["A", "B", "C", "D"]);
  assert.equal(content.explanation, "Choice B is correct because the cone volume formula applies.");
});

test("figure markdown line uses alt text when present", () => {
  assert.equal(
    figureMarkdownLine({ url: figureUrl, alt: "Question figure region page 10" }),
    `![Question figure region page 10](${figureUrl})`,
  );
});
