import assert from "node:assert/strict";
import test from "node:test";
import { extractPlainTextTable, isSafeQuizImageSrc, normalizeQuizProse, splitQuizRichText } from "./quiz-rich-text.ts";

const src =
  "https://app.acceptedadmissions.org/media/sat-bank/sat-practice-test-4-digital/p10-draw1.png";

test("splits markdown images from surrounding stimulus text", () => {
  const parts = splitQuizRichText(`![Enrollment graph](${src})\n\nThe graph shows enrollment.`);
  assert.deepEqual(parts, [
    { type: "image", alt: "Enrollment graph", src },
    { type: "text", value: "The graph shows enrollment." },
  ]);
});

test("rejects javascript image URLs", () => {
  assert.equal(isSafeQuizImageSrc("javascript:alert(1)"), false);
  const parts = splitQuizRichText("![x](javascript:alert(1)) leftover");
  assert.equal(parts.some((part) => part.type === "image"), false);
  assert.ok(parts.some((part) => part.type === "text" && part.value.includes("leftover")));
});

test("allows same-origin /media figure paths", () => {
  const parts = splitQuizRichText("![Chart](/media/sat-bank/pack/a.png)");
  assert.deepEqual(parts, [{ type: "image", alt: "Chart", src: "/media/sat-bank/pack/a.png" }]);
});

test("normalizes PDF line breaks and strips leftover chart axis headers", () => {
  assert.equal(
    normalizeQuizProse("US States with the Greatest Number of\nOrganic Farms in 2016\nState\nOrganic farming is a method."),
    "US States with the Greatest Number of Organic Farms in 2016 Organic farming is a method.",
  );
  const parts = splitQuizRichText(
    "US States with the Greatest Number of\nOrganic Farms in 2016\nState\nOrganic farming is a method of growing food.",
  );
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "text");
  assert.equal(parts[0] && parts[0].type === "text" ? parts[0].preformatted : true, undefined);
  assert.match(parts[0] && parts[0].type === "text" ? parts[0].value : "", /Organic farming is a method/);
  assert.equal(parts[0] && parts[0].type === "text" ? parts[0].value.includes("\n") : true, false);
});

test("parses smashed x f(x) lines as a table instead of one prose sentence", () => {
  const parts = splitQuizRichText(
    "x f(x)\n0 29\n1 32\n2 35\nFor the linear function f, the table shows three values of x.",
  );
  assert.equal(parts.some((part) => part.type === "table"), true);
  const table = parts.find((part) => part.type === "table");
  assert.ok(table && table.type === "table");
  if (table && table.type === "table") {
    assert.deepEqual(table.headers, ["x", "f(x)"]);
    assert.deepEqual(table.rows, [["0", "29"], ["1", "32"], ["2", "35"]]);
  }
  assert.ok(parts.some((part) => part.type === "text" && /linear function/.test(part.value)));
  assert.equal(extractPlainTextTable("not a table at all").table, null);
});

test("never surfaces sat-bank-figures HTML comments and can hide garbled OCR", () => {
  const parts = splitQuizRichText(
    `<!-- sat-bank-figures -->\n![Graph](${src})\n<!-- /sat-bank-figures -->\nX 0-=8~ - <:...4--=2_`,
    { hideGarbledText: true },
  );
  assert.deepEqual(parts, [{ type: "image", alt: "Graph", src }]);
});
