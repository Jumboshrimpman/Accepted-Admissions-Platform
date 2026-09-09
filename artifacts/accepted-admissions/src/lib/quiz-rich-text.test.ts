import assert from "node:assert/strict";
import test from "node:test";
import { isSafeQuizImageSrc, splitQuizRichText } from "./quiz-rich-text.ts";

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

test("never surfaces sat-bank-figures HTML comments and can hide garbled OCR", () => {
  const parts = splitQuizRichText(
    `<!-- sat-bank-figures -->\n![Graph](${src})\n<!-- /sat-bank-figures -->\nX 0-=8~ - <:...4--=2_`,
    { hideGarbledText: true },
  );
  assert.deepEqual(parts, [{ type: "image", alt: "Graph", src }]);
});
